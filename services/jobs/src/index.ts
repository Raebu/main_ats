import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { JobContract } from "@raeburn/contracts";
import { createEvent, Events } from "@raeburn/events";
import { context, health, pool, withTransaction, writeOutbox } from "@raeburn/service-kit";

const app=new Hono();

app.get("/health",async c=>c.json(await health("jobs")));

app.get("/v1/jobs",async c=>{
 const ctx=context(c.req.raw.headers); const status=c.req.query("status");
 const values:any[]=[ctx.tenantId]; let sql="select * from jobs where tenant_id=$1";
 if(status){values.push(status);sql+=" and status=$2";} sql+=" order by created_at desc";
 const {rows}=await pool.query(sql,values); return c.json(rows.map(mapJob));
});
app.get("/v1/jobs/:id",async c=>{
 const ctx=context(c.req.raw.headers);
 const {rows}=await pool.query("select * from jobs where tenant_id=$1 and id=$2",[ctx.tenantId,c.req.param("id")]);
 if(!rows[0]) return c.json({code:"NOT_FOUND",message:"Job not found",correlationId:ctx.correlationId},404);
 return c.json(mapJob(rows[0]));
});
app.post("/v1/jobs",async c=>{
 const ctx=context(c.req.raw.headers); const body=JobContract.omit({id:true,version:true,status:true}).parse(await c.req.json());
 const id=randomUUID(); const job={...body,id,tenantId:ctx.tenantId,status:"DRAFT",version:1};
 await withTransaction(async client=>{
   await client.query(`insert into jobs(id,tenant_id,reference,slug,title,hiring_organisation_id,operating_organisation_id,department,location,workplace_type,employment_type,engagement,summary,description,requirements,benefits,status,audiences,version)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'DRAFT',$17::jsonb,1)`,
   [id,ctx.tenantId,body.reference,body.slug,body.title,body.hiringOrganisationId,body.operatingOrganisationId||null,body.department||null,body.location,body.workplaceType,body.employmentType,body.engagement||null,body.summary,body.description,body.requirements,body.benefits||null,JSON.stringify(body.audiences)]);
   await writeOutbox(client,createEvent({eventType:Events.jobCreated,eventVersion:1,producer:"jobs",correlationId:ctx.correlationId,tenantId:ctx.tenantId,payload:job}));
 });
 return c.json(job,201);
});
app.post("/v1/jobs/:id/publish",async c=>{
 const ctx=context(c.req.raw.headers); const id=c.req.param("id");
 const result=await withTransaction(async client=>{
   const {rows}=await client.query("update jobs set status='PUBLISHED',date_posted=coalesce(date_posted,now()),version=version+1,updated_at=now() where tenant_id=$1 and id=$2 and status in ('DRAFT','READY','PAUSED') returning *",[ctx.tenantId,id]);
   if(!rows[0]) return null; const job=mapJob(rows[0]);
   await writeOutbox(client,createEvent({eventType:Events.jobPublished,eventVersion:1,producer:"jobs",correlationId:ctx.correlationId,tenantId:ctx.tenantId,payload:job}));
   return job;
 });
 if(!result)return c.json({code:"INVALID_STATE",message:"Job cannot be published",correlationId:ctx.correlationId},409);
 return c.json(result);
});

serve({fetch:app.fetch,port:Number(process.env.PORT||4101)});
function mapJob(r:any){return {id:r.id,tenantId:r.tenant_id,reference:r.reference,slug:r.slug,title:r.title,hiringOrganisationId:r.hiring_organisation_id,operatingOrganisationId:r.operating_organisation_id,department:r.department,location:r.location,workplaceType:r.workplace_type,employmentType:r.employment_type,engagement:r.engagement,summary:r.summary,description:r.description,requirements:r.requirements,benefits:r.benefits,status:r.status,audiences:r.audiences,datePosted:r.date_posted?.toISOString?.()||r.date_posted,validThrough:r.valid_through?.toISOString?.()||r.valid_through,version:r.version};}
