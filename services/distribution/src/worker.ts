import{randomUUID}from"node:crypto";
import type{DomainEvent}from"@raeburn/events";
import type{ConnectorJob,JobBoardConnector}from"@raeburn/connectors";
import{consumeDurable,pool}from"@raeburn/service-kit";
import{indeedConnector}from"@raeburn/connector-indeed";
import{linkedinConnector}from"@raeburn/connector-linkedin";
import{adzunaConnector}from"@raeburn/connector-adzuna";
import{joobleConnector}from"@raeburn/connector-jooble";
import{reedConnector}from"@raeburn/connector-reed";
import{totaljobsConnector}from"@raeburn/connector-totaljobs";
import{cvLibraryConnector}from"@raeburn/connector-cv-library";
import{glassdoorConnector}from"@raeburn/connector-glassdoor";
import{findAJobConnector}from"@raeburn/connector-find-a-job";
import{universityConnector}from"@raeburn/connector-university";
import{specialistConnector}from"@raeburn/connector-specialist";

const CAREERS=process.env.CAREERS_BASE_URL||"https://theraeburngroup.com";
const adapters:Record<string,JobBoardConnector>={indeed:indeedConnector,linkedin:linkedinConnector,adzuna:adzunaConnector,jooble:joobleConnector,reed:reedConnector,totaljobs:totaljobsConnector,"cv-library":cvLibraryConnector,glassdoor:glassdoorConnector,"find-a-job":findAJobConnector,university:universityConnector,specialist:specialistConnector};
const builtIn=new Set(["raeburn-mainstream","google-jobs","json-feed","xml-feed","csv-feed"]);
const wait=(seconds:number)=>Math.max(60,Math.min(21600,seconds));

function jobFrom(payload:any,destination:string,copy:any={}):ConnectorJob{
 const overrides=copy||{};
 return{id:String(payload.id),reference:String(payload.reference||payload.id),slug:String(payload.slug||payload.id),
 title:String(overrides.title||payload.title||""),description:String(overrides.description||payload.description||""),
 summary:String(overrides.summary||payload.summary||""),requirements:String(payload.requirements||""),location:String(payload.location||""),
 employmentType:String(payload.employmentType||payload.employment_type||"FULL_TIME"),datePosted:payload.publishedAt||payload.datePosted||null,
 validThrough:payload.closesAt||payload.validThrough||null,hiringOrganisation:payload.organisationName||"The Raeburn Group",
 canonicalUrl:CAREERS+"/careers/jobs/"+String(payload.slug||payload.id),salaryMin:payload.salaryMin??null,salaryMax:payload.salaryMax??null,
 salaryCurrency:payload.salaryCurrency||"GBP",providerCopy:{[destination]:overrides}};
}
async function recordAttempt(pub:any,action:"publish"|"update"|"close",result:any,error?:string){
 const id=randomUUID(),attemptNo=Number(pub.attempt_count||0)+1;
 await pool.query("insert into publication_attempts(id,tenant_id,publication_id,job_id,destination,action,status,attempt_no,response,error,completed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,now())",[id,pub.tenant_id,pub.id,pub.job_id,pub.destination,action,result?.status||"failed",attemptNo,JSON.stringify(result?.receipt||{}),error||result?.message||null]);
 return attemptNo;
}
async function execute(pub:any,action:"publish"|"update"|"close"){
 if(builtIn.has(pub.destination)||String(pub.destination).startsWith("gateway:")){
  const status=action==="close"?"CLOSED":"LIVE",attemptNo=await recordAttempt(pub,action,{status:status.toLowerCase(),receipt:{mode:"first-party"}});
  await pool.query("update publications set status=$2,attempt_count=$3,last_attempt_at=now(),last_success_at=now(),last_error=null,next_attempt_at=null,receipt=$4::jsonb,updated_at=now() where id=$1",[pub.id,status,attemptNo,JSON.stringify({mode:"first-party"})]);return;
 }
 const adapter=adapters[pub.destination];if(!adapter)return;
 const job=jobFrom(pub.job_snapshot,pub.destination,pub.provider_config?.copy||{});
 let result:any;try{result=await adapter[action](job);}catch(err){result={status:"failed",message:err instanceof Error?err.message:String(err)};}
 const attemptNo=await recordAttempt(pub,action,result);
 if(result.status==="published"||result.status==="updated"||result.status==="closed"){
  await pool.query("update publications set status=$2,attempt_count=$3,external_reference=coalesce($4,external_reference),last_attempt_at=now(),last_success_at=now(),last_error=null,rejection_reason=null,next_attempt_at=null,receipt=$5::jsonb,updated_at=now() where id=$1",[pub.id,result.status==="closed"?"CLOSED":"LIVE",attemptNo,result.externalReference||null,JSON.stringify(result.receipt||{})]);return;
 }
 if(result.status==="not_configured"){
  await pool.query("update publications set status='NOT_CONFIGURED',attempt_count=$2,last_attempt_at=now(),last_error=$3,next_attempt_at=null,updated_at=now() where id=$1",[pub.id,attemptNo,result.message||"Provider is not configured"]);return;
 }
 const cfg=pub.provider_config||{},max=Number(cfg.maxAttempts||5),base=Number(cfg.baseRetrySeconds||60),message=result.message||"Provider publication failed";
 if(attemptNo>=max){await pool.query("update publications set status='DLQ',attempt_count=$2,last_attempt_at=now(),last_error=$3,rejection_reason=$3,next_attempt_at=null,updated_at=now() where id=$1",[pub.id,attemptNo,message]);await pool.query("insert into publication_dlq(id,tenant_id,publication_id,job_id,destination,payload,reason,attempts) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8)",[randomUUID(),pub.tenant_id,pub.id,pub.job_id,pub.destination,JSON.stringify(pub.job_snapshot||{}),message,attemptNo]);}
 else{const delay=wait(base*Math.pow(2,attemptNo-1));await pool.query("update publications set status='RETRYING',attempt_count=$2,last_attempt_at=now(),last_error=$3,rejection_reason=$3,next_attempt_at=now()+($4||' seconds')::interval,updated_at=now() where id=$1",[pub.id,attemptNo,message,String(delay)]);}
}
async function upsert(tenantId:string,job:any,destination:string,action:"publish"|"update"|"close"){
 const setting=(await pool.query("select * from provider_settings where tenant_id=$1 and provider=$2",[tenantId,destination])).rows[0]||{};
 const cfg={mapping:setting.mapping||{},copy:setting.copy_overrides||{},maxAttempts:setting.max_attempts||5,baseRetrySeconds:setting.base_retry_seconds||60};
 const {rows}=await pool.query("insert into publications(id,tenant_id,job_id,destination,status,provider_config,job_snapshot,cost_pence,currency) values($1,$2,$3,$4,'PENDING',$5::jsonb,$6::jsonb,$7,$8) on conflict(tenant_id,job_id,destination) do update set provider_config=excluded.provider_config,job_snapshot=excluded.job_snapshot,cost_pence=excluded.cost_pence,currency=excluded.currency,status='PENDING',updated_at=now() returning *",[randomUUID(),tenantId,job.id,destination,JSON.stringify(cfg),JSON.stringify(job),setting.cost_pence||0,setting.currency||"GBP"]);
 await execute(rows[0],action);
}
async function consume(subject:string){await consumeDurable(subject,"distribution-"+subject,async(e:DomainEvent)=>{if((await pool.query("select 1 from processed_events where event_id=$1",[e.eventId])).rowCount)return;const job:any=e.payload,action=subject==="job.closed.v1"?"close":subject==="job.updated.v1"?"update":"publish";const enabled=(await pool.query("select provider from provider_settings where tenant_id=$1 and enabled=true",[e.tenantId])).rows.map((r:any)=>r.provider);const destinations=action==="close"?(await pool.query("select destination from publications where tenant_id=$1 and job_id=$2",[e.tenantId,job.id])).rows.map((r:any)=>r.destination):["raeburn-mainstream",...(job.audiences||[]).map((a:string)=>"gateway:"+a.toLowerCase()),"google-jobs","json-feed","xml-feed","csv-feed",...enabled];for(const dest of[...new Set(destinations)])await upsert(e.tenantId,job,String(dest),action);await pool.query("insert into processed_events(event_id) values($1) on conflict do nothing",[e.eventId]);});}
async function retryDue(){const{rows}=await pool.query("select * from publications where status='RETRYING' and next_attempt_at<=now() order by next_attempt_at limit 50 for update skip locked");for(const pub of rows)await execute(pub,"publish");}
setInterval(()=>retryDue().catch(console.error),30000);
void consume("job.published.v1");void consume("job.updated.v1");void consume("job.closed.v1");