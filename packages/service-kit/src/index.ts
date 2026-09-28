import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { connect, JSONCodec, consumerOpts, RetentionPolicy, StorageType, DiscardPolicy, type JetStreamClient, type JetStreamManager, type NatsConnection } from "nats";
import pg from "pg";
import { createEvent, PlatformEvents, validateDomainEvent, type DomainEvent } from "@raeburn/events";

export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const codec=JSONCodec<DomainEvent>();
let nc:NatsConnection|undefined;
let js:JetStreamClient|undefined;
let jsm:JetStreamManager|undefined;
let eventInfrastructure:Promise<void>|undefined;
const EVENT_STREAM=process.env.NATS_EVENT_STREAM||"TALENT_EVENTS";
const SERVICE=process.env.SERVICE_NAME||"raeburn-service";
const metricCounters=new Map<string,number>();
const metricDurations=new Map<string,{count:number,sum:number}>();
let telemetryStarted=false;

export function secretValue(name:string){
  const direct=process.env[name];
  if(direct)return direct;
  const file=process.env[name+"_FILE"];
  if(!file)return undefined;
  try{return readFileSync(file,"utf8").trimEnd();}catch(error){
    if(process.env.NODE_ENV==="production")throw new Error("Unable to read required secret file for "+name,{cause:error});
    return undefined;
  }
}

export function requireSecret(name:string,developmentFallback?:string){
  const value=secretValue(name);
  if(value)return value;
  if(process.env.NODE_ENV!=="production"&&developmentFallback!==undefined)return developmentFallback;
  throw new Error("Required secret is not configured: "+name+" (set "+name+" or "+name+"_FILE)");
}

export async function eventBus(){
  if(!nc) nc=await connect({
    servers:process.env.NATS_URL||"nats://localhost:4222",
    name:SERVICE,
    reconnect:true,maxReconnectAttempts:-1,reconnectTimeWait:1000,pingInterval:20000,maxPingOut:3
  });
  return nc;
}
async function jetStreamManager(){if(!jsm)jsm=await (await eventBus()).jetstreamManager();return jsm;}
async function jetStream(){if(!js)js=(await eventBus()).jetstream();return js;}
export async function ensureEventInfrastructure(){
  if(!eventInfrastructure)eventInfrastructure=(async()=>{
    const manager=await jetStreamManager();
    try{await manager.streams.info(EVENT_STREAM);}
    catch{
      await manager.streams.add({
        name:EVENT_STREAM,subjects:[">"],retention:RetentionPolicy.Limits,storage:StorageType.File,
        discard:DiscardPolicy.Old,max_age:Number(process.env.NATS_EVENT_MAX_AGE_NS||2592000000000000),
        duplicate_window:Number(process.env.NATS_DUPLICATE_WINDOW_NS||120000000000)
      });
    }
  })().catch(error=>{eventInfrastructure=undefined;throw error;});
  return eventInfrastructure;
}
export async function publish(event:DomainEvent){
  const valid=validateDomainEvent(event);
  await ensureEventInfrastructure();
  const client=await jetStream();
  await client.publish(valid.eventType,codec.encode(valid),{msgID:valid.eventId});
  metricInc("raeburn_events_published_total",{event_type:valid.eventType});
}
function durableName(value:string){return value.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,120);}
function safeError(error:unknown){const raw=error instanceof Error?error.message:String(error);return raw.replace(/[\r\n\t]/g," ").slice(0,1000);}
export async function consumeDurable(
  subject:string,
  consumer:string,
  handler:(event:DomainEvent)=>Promise<void>,
  options:{maxDeliver?:number;ackWaitMs?:number;baseRetryMs?:number;queue?:string}={}
){
  await ensureEventInfrastructure();
  const client=await jetStream(),opts=consumerOpts(),durable=durableName(consumer),maxDeliver=options.maxDeliver||8;
  opts.durable(durable);opts.manualAck();opts.ackExplicit();opts.deliverAll();opts.maxDeliver(maxDeliver);opts.ackWait(options.ackWaitMs||30000);
  opts.queue(durableName(options.queue||durable));
  const sub=await client.subscribe(subject,opts);
  log("info","durable consumer started",{subject,consumer:durable});
  for await(const msg of sub){
    let event:DomainEvent|undefined;
    try{
      event=validateDomainEvent(codec.decode(msg.data));
      const started=Date.now();
      await handler(event);
      msg.ack();
      metricInc("raeburn_events_consumed_total",{subject,consumer:durable});
      metricObserve("raeburn_event_handler_duration_ms",Date.now()-started,{consumer:durable});
    }catch(error){
      const deliveries=Number((msg as any).info?.deliveryCount||1),message=safeError(error);
      metricInc("raeburn_event_handler_failures_total",{subject,consumer:durable});
      log("error","event handler failed",{subject,consumer:durable,eventId:event?.eventId,deliveries,error:message});
      if(deliveries>=maxDeliver){
        try{await publish(createEvent({
          eventType:PlatformEvents.deadLetter,eventVersion:1,producer:SERVICE,
          correlationId:event?.correlationId||randomUUID(),causationId:event?.eventId,
          tenantId:event?.tenantId||process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group",
          payload:{originalEventId:event?.eventId,originalEventType:event?.eventType,consumer:durable,subject,error:message,deliveries}
        }));}catch(dlqError){log("error","failed to publish dead-letter event",{consumer:durable,error:safeError(dlqError)});}
        msg.term();
      }else{
        const delay=Math.min(60000,(options.baseRetryMs||500)*Math.pow(2,Math.max(0,deliveries-1)));
        msg.nak(delay);
      }
    }
  }
}
export function serviceAuthRequired(){return process.env.NODE_ENV==="production"||process.env.REQUIRE_SERVICE_AUTH==="true";}
export function serviceAuthHeaders(base:Record<string,string>={}){
  const secret=secretValue("SERVICE_AUTH_SECRET");if(!secret){if(serviceAuthRequired())throw new Error("SERVICE_AUTH_SECRET is required for production service authentication");return base;}
  const service=process.env.SERVICE_NAME||"raeburn-service",timestamp=String(Date.now()),tenantId=base["x-tenant-id"]||process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group",correlationId=base["x-correlation-id"]||randomUUID();
  const signature=createHmac("sha256",secret).update([service,timestamp,tenantId,correlationId].join("|")).digest("base64url");
  return{...base,"x-tenant-id":tenantId,"x-correlation-id":correlationId,"x-service-name":service,"x-service-timestamp":timestamp,"x-service-signature":signature};
}
export function verifyServiceAuth(headers:Headers){
  if(!serviceAuthRequired())return true;
  const secret=secretValue("SERVICE_AUTH_SECRET"),service=headers.get("x-service-name"),timestamp=headers.get("x-service-timestamp"),signature=headers.get("x-service-signature"),tenantId=headers.get("x-tenant-id")||process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group",correlationId=headers.get("x-correlation-id")||"";
  if(!secret||!service||!timestamp||!signature)return false;
  const age=Math.abs(Date.now()-Number(timestamp));if(!Number.isFinite(age)||age>120000)return false;
  const expected=createHmac("sha256",secret).update([service,timestamp,tenantId,correlationId].join("|")).digest("base64url"),a=Buffer.from(expected),b=Buffer.from(signature);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export function context(headers:Headers){
  if(!verifyServiceAuth(headers))throw new Error("SERVICE_AUTH_REQUIRED");
  return {
    correlationId:headers.get("x-correlation-id")||randomUUID(),
    tenantId:headers.get("x-tenant-id")||process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group"
  };
}
export async function health(service:string){return {service,status:"alive",time:new Date().toISOString()};}
export async function withTransaction<T>(fn:(client:pg.PoolClient)=>Promise<T>){
  const client=await pool.connect();
  try{await client.query("begin");const result=await fn(client);await client.query("commit");return result;}
  catch(error){await client.query("rollback");throw error;}finally{client.release();}
}
export async function writeOutbox(client:pg.PoolClient,event:DomainEvent){
  await client.query(
    "insert into outbox_events(id,event_type,payload,created_at) values($1,$2,$3::jsonb,now())",
    [event.eventId,event.eventType,JSON.stringify(event)]
  );
}
export async function ensureOutbox(){
  await pool.query(`create table if not exists outbox_events(
    id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),
    published_at timestamptz,retry_count int not null default 0,last_error text,
    lease_owner text,lease_until timestamptz
  )`);
  await pool.query("alter table outbox_events add column if not exists lease_owner text");
  await pool.query("alter table outbox_events add column if not exists lease_until timestamptz");
  await pool.query("create index if not exists outbox_ready_idx on outbox_events(created_at) where published_at is null");
}
export async function flushOutbox(limit=100){
  await ensureOutbox();
  const owner=SERVICE+":"+process.pid+":"+randomUUID();
  const rows=await withTransaction(async client=>{
    const claimed=await client.query(`select id,payload from outbox_events
      where published_at is null and (lease_until is null or lease_until<now())
      order by created_at asc limit $1 for update skip locked`,[limit]);
    if(claimed.rowCount)await client.query(
      "update outbox_events set lease_owner=$1,lease_until=now()+interval '60 seconds' where id=any($2::text[])",
      [owner,claimed.rows.map(r=>r.id)]
    );
    return claimed.rows;
  });
  for(const row of rows){
    try{
      await publish(row.payload);
      await pool.query("update outbox_events set published_at=now(),lease_owner=null,lease_until=null,last_error=null where id=$1 and lease_owner=$2",[row.id,owner]);
      metricInc("raeburn_outbox_published_total");
    }catch(error){
      await pool.query("update outbox_events set retry_count=retry_count+1,last_error=$3,lease_owner=null,lease_until=null where id=$1 and lease_owner=$2",[row.id,owner,safeError(error)]);
      metricInc("raeburn_outbox_failures_total");
    }
  }
  return rows.length;
}

export function log(level:"debug"|"info"|"warn"|"error",message:string,fields:Record<string,unknown>={}){
  const record={timestamp:new Date().toISOString(),level,service:process.env.SERVICE_NAME||"raeburn-service",message,...fields};
  const line=JSON.stringify(record);
  if(level==="error")console.error(line);else if(level==="warn")console.warn(line);else console.log(line);
}
export async function readiness(service:string){
  const checks:Record<string,string>={database:"unknown",nats:"unknown"};
  try{await pool.query("select 1");checks.database="ready";}catch{checks.database="down";}
  try{const bus=await eventBus();checks.nats=bus.isClosed()?"down":"ready";}catch{checks.nats="down";}
  return{service,status:Object.values(checks).every(x=>x==="ready")?"ready":"not_ready",checks,time:new Date().toISOString()};
}
export async function withRetry<T>(fn:()=>Promise<T>,options:{attempts?:number;baseMs?:number;maxMs?:number}={}){
  const attempts=options.attempts||3,base=options.baseMs||100,max=options.maxMs||2000;
  let last:unknown;
  for(let i=0;i<attempts;i++){try{return await fn();}catch(e){last=e;if(i===attempts-1)break;const delay=Math.min(max,base*Math.pow(2,i))+Math.floor(Math.random()*base);await new Promise(r=>setTimeout(r,delay));}}
  throw last;
}
export function redact(value:Record<string,unknown>){
  const sensitive=/password|secret|token|authorization|email|telephone|phone|cv|resume|cover.?note|address|name|message|body|documenturl/i;
  const walk=(input:unknown,key=""):unknown=>{
    if(sensitive.test(key))return "[REDACTED]";
    if(Array.isArray(input))return input.map(v=>walk(v,key));
    if(input&&typeof input==="object")return Object.fromEntries(Object.entries(input as Record<string,unknown>).map(([k,v])=>[k,walk(v,k)]));
    return input;
  };
  return walk(value) as Record<string,unknown>;
}


function tenantDataKey(tenantId:string){
  const master=secretValue("TENANT_ENCRYPTION_MASTER_KEY")||(process.env.NODE_ENV!=="production"?secretValue("AUTH_SECRET")||"development-only-change-me":undefined);if(!master)throw new Error("TENANT_ENCRYPTION_MASTER_KEY is required in production");
  return createHmac("sha256",master).update("raeburn-talent:"+tenantId).digest();
}
export function tenantEncrypt(tenantId:string,value:string){
  const key=tenantDataKey(tenantId),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv),data=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]),tag=cipher.getAuthTag();
  return Buffer.concat([Buffer.from([1]),iv,tag,data]).toString("base64url");
}
export function tenantDecrypt(tenantId:string,value:string){
  const raw=Buffer.from(value,"base64url");if(raw[0]!==1)throw new Error("Unsupported encrypted payload version");
  const iv=raw.subarray(1,13),tag=raw.subarray(13,29),data=raw.subarray(29),decipher=createDecipheriv("aes-256-gcm",tenantDataKey(tenantId),iv);decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString("utf8");
}
export function organisationScope(headers:Headers){
  const requested=headers.get("x-organisation-id");
  const allowed=(headers.get("x-organisation-ids")||"").split(",").map(x=>x.trim()).filter(Boolean);
  return{requested,allowed,canAccess:(organisationId:string|null|undefined)=>!organisationId||allowed.includes("*")||allowed.includes(organisationId)};
}


export function metricInc(name:string,labels:Record<string,string|number>={},value=1){
  const suffix=Object.keys(labels).length?"{"+Object.entries(labels).sort().map(([k,v])=>k+'="'+String(v).replace(/["\\\n]/g,"_")+'"').join(",")+"}":"";
  const key=name+suffix;metricCounters.set(key,(metricCounters.get(key)||0)+value);
}
export function metricObserve(name:string,value:number,labels:Record<string,string|number>={}){
  const suffix=Object.keys(labels).length?"{"+Object.entries(labels).sort().map(([k,v])=>k+'="'+String(v).replace(/["\\\n]/g,"_")+'"').join(",")+"}":"";
  const key=name+suffix,current=metricDurations.get(key)||{count:0,sum:0};current.count++;current.sum+=value;metricDurations.set(key,current);
}
export function observeHttp(service:string){
  return async(c:any,next:any)=>{
    const start=Date.now();try{await next();}finally{
      const route=(c.req.routePath||new URL(c.req.url).pathname).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,":id");
      metricInc("raeburn_http_requests_total",{service,method:c.req.method,status:c.res?.status||200,route});
      metricObserve("raeburn_http_request_duration_ms",Date.now()-start,{service,method:c.req.method,route});
    }
  };
}
export async function metricsText(service=SERVICE){
  let dbLatency=-1,outbox=-1;
  try{const started=Date.now();await pool.query("select 1");dbLatency=Date.now()-started;}catch{}
  try{outbox=Number((await pool.query("select count(*)::int n from outbox_events where published_at is null")).rows[0]?.n||0);}catch{}
  const lines=[
    "# TYPE raeburn_service_up gauge",`raeburn_service_up{service="${service}"} 1`,
    "# TYPE raeburn_database_latency_ms gauge",`raeburn_database_latency_ms{service="${service}"} ${dbLatency}`,
    "# TYPE raeburn_outbox_backlog gauge",`raeburn_outbox_backlog{service="${service}"} ${outbox}`,
    "# TYPE raeburn_process_uptime_seconds gauge",`raeburn_process_uptime_seconds{service="${service}"} ${Math.floor(process.uptime())}`
  ];
  for(const[k,v]of metricCounters)lines.push(k+" "+v);
  for(const[k,v]of metricDurations){lines.push(k+"_count "+v.count);lines.push(k+"_sum "+v.sum);}
  return lines.join("\n")+"\n";
}
export async function startTelemetry(){
  if(telemetryStarted||process.env.OTEL_ENABLED==="false")return;telemetryStarted=true;
  try{
    process.env.OTEL_SERVICE_NAME=process.env.OTEL_SERVICE_NAME||SERVICE;
    const [{NodeSDK},{OTLPTraceExporter},{getNodeAutoInstrumentations}]=await Promise.all([
      import("@opentelemetry/sdk-node"),import("@opentelemetry/exporter-trace-otlp-http"),import("@opentelemetry/auto-instrumentations-node")
    ]);
    const endpoint=process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const sdk=new NodeSDK({
      traceExporter:endpoint?new OTLPTraceExporter({url:endpoint.replace(/\/$/,"")+"/v1/traces"}):undefined,
      instrumentations:[getNodeAutoInstrumentations({"@opentelemetry/instrumentation-fs":{enabled:false}})]
    });
    await Promise.resolve(sdk.start());
    log("info","OpenTelemetry initialised",{endpoint:endpoint?"configured":"local/no-exporter"});
  }catch(error){telemetryStarted=false;log("warn","OpenTelemetry initialisation failed",{error:safeError(error)});}
}
export async function eventPlatformStatus(){
  await ensureEventInfrastructure();const manager=await jetStreamManager(),info=await manager.streams.info(EVENT_STREAM);
  return{stream:EVENT_STREAM,messages:info.state.messages,bytes:info.state.bytes,firstSeq:info.state.first_seq,lastSeq:info.state.last_seq,consumerCount:info.state.consumer_count};
}
let shuttingDown=false;
export function installGracefulShutdown(service=SERVICE){
  const stop=async(signal:string)=>{
    if(shuttingDown)return;shuttingDown=true;log("info","graceful shutdown started",{service,signal});
    try{if(nc&&!nc.isClosed())await nc.drain();}catch(error){log("warn","NATS drain failed",{error:safeError(error)});}
    try{await pool.end();}catch(error){log("warn","database pool close failed",{error:safeError(error)});}
  };
  process.once("SIGTERM",()=>void stop("SIGTERM"));
  process.once("SIGINT",()=>void stop("SIGINT"));
}
installGracefulShutdown();
void startTelemetry();

export async function processEventOnce(event:DomainEvent,handler:(client:pg.PoolClient)=>Promise<void>){
  await pool.query(`create table if not exists event_inbox(
    event_id text primary key,event_type text not null,correlation_id text not null,
    first_seen_at timestamptz not null default now(),processed_at timestamptz
  )`);
  return withTransaction(async client=>{
    const claimed=await client.query("insert into event_inbox(event_id,event_type,correlation_id) values($1,$2,$3) on conflict do nothing returning event_id",[event.eventId,event.eventType,event.correlationId]);
    if(!claimed.rowCount)return false;
    await handler(client);
    await client.query("update event_inbox set processed_at=now() where event_id=$1",[event.eventId]);
    return true;
  });
}
export function minimiseEventPayload(payload:unknown){
  if(!payload||typeof payload!=="object")return{};
  const allow=new Set(["id","applicationId","application_id","jobId","job_id","candidateId","candidate_id","fromStage","toStage","stage","status","gateway","destination","source","audiences","attribution","campaignId","campaign_id","startsAt","starts_at","expiresAt","expires_at","reason","kind"]);
  const source=payload as Record<string,unknown>,out:Record<string,unknown>={};
  for(const[k,v]of Object.entries(source))if(allow.has(k))out[k]=v;
  return out;
}


type CircuitState={failures:number;openUntil:number;halfOpen:boolean};
const circuits=new Map<string,CircuitState>();
export async function withCircuitBreaker<T>(name:string,fn:()=>Promise<T>,options:{failureThreshold?:number;cooldownMs?:number}={}){
  const threshold=options.failureThreshold||5,cooldown=options.cooldownMs||30000,now=Date.now(),state=circuits.get(name)||{failures:0,openUntil:0,halfOpen:false};
  if(state.openUntil>now){metricInc("raeburn_circuit_open_rejections_total",{circuit:name});throw new Error("CIRCUIT_OPEN:"+name);}
  if(state.openUntil&&state.openUntil<=now){state.halfOpen=true;state.openUntil=0;}
  try{const result=await fn();circuits.set(name,{failures:0,openUntil:0,halfOpen:false});return result;}
  catch(error){const failures=state.failures+1,openUntil=failures>=threshold?Date.now()+cooldown:0;circuits.set(name,{failures,openUntil,halfOpen:false});metricInc("raeburn_circuit_failures_total",{circuit:name});if(openUntil)metricInc("raeburn_circuit_open_total",{circuit:name});throw error;}
}
export async function resilientFetch(url:string|URL,init:RequestInit={},options:{attempts?:number;timeoutMs?:number;circuit?:string;idempotent?:boolean}={}){
  const target=typeof url==="string"?url:url.toString(),method=String(init.method||"GET").toUpperCase(),safe=["GET","HEAD","OPTIONS"].includes(method)||options.idempotent===true;
  const host=(()=>{try{return new URL(target).host;}catch{return"unknown";}})(),circuit=options.circuit||"http:"+host;
  return withCircuitBreaker(circuit,()=>withRetry(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.timeoutMs||10000);
    try{
      const response=await fetch(target,{...init,signal:init.signal||controller.signal});
      if(response.status===429||response.status>=500){if(safe)throw new Error("upstream "+response.status+" from "+host);}
      return response;
    }finally{clearTimeout(timer);}
  },{attempts:safe?(options.attempts||3):1,baseMs:250,maxMs:5000}));
}
export async function withWorkerLease<T>(name:string,fn:()=>Promise<T>){
  const client=await pool.connect(),key=SERVICE+":"+name;
  try{
    const locked=(await client.query("select pg_try_advisory_lock(hashtext($1)::bigint) locked",[key])).rows[0]?.locked===true;
    if(!locked){metricInc("raeburn_worker_lease_contention_total",{worker:name});return undefined;}
    try{return await fn();}finally{await client.query("select pg_advisory_unlock(hashtext($1)::bigint)",[key]);}
  }finally{client.release();}
}
