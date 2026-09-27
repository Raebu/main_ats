import { randomUUID } from "node:crypto";
import { connect, JSONCodec, type NatsConnection } from "nats";
import pg from "pg";
import type { DomainEvent } from "@raeburn/events";

export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const codec=JSONCodec<DomainEvent>();
let nc:NatsConnection|undefined;

export async function eventBus(){
  if(!nc) nc=await connect({servers:process.env.NATS_URL||"nats://localhost:4222",name:process.env.SERVICE_NAME||"raeburn-service"});
  return nc;
}
export async function publish(event:DomainEvent){
  const bus=await eventBus();
  bus.publish(event.eventType,codec.encode(event));
}
export function context(headers:Headers){
  return {
    correlationId:headers.get("x-correlation-id")||randomUUID(),
    tenantId:headers.get("x-tenant-id")||process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group"
  };
}
export async function health(service:string){
  await pool.query("select 1");
  return {service,status:"healthy",time:new Date().toISOString()};
}
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
    published_at timestamptz,retry_count int not null default 0,last_error text
  )`);
}
export async function flushOutbox(limit=100){
  const rows=await pool.query("select id,payload from outbox_events where published_at is null order by created_at asc limit $1",[limit]);
  for(const row of rows.rows){
    try{await publish(row.payload);await pool.query("update outbox_events set published_at=now() where id=$1",[row.id]);}
    catch(error){await pool.query("update outbox_events set retry_count=retry_count+1,last_error=$2 where id=$1",[row.id,error instanceof Error?error.message:String(error)]);}
  }
  return rows.rowCount||0;
}
