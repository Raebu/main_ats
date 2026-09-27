import{createHash,randomBytes,randomUUID}from"node:crypto";
import{serve}from"@hono/node-server";
import{Hono}from"hono";
import{SignJWT}from"jose";
import{CreateApplicationContract}from"@raeburn/contracts";
import{createEvent,Events}from"@raeburn/events";
import{context,health,pool,withTransaction,writeOutbox}from"@raeburn/service-kit";

const app=new Hono();
const CANDIDATES=process.env.CANDIDATES_URL||"http://localhost:4102";
const JOBS=process.env.JOBS_URL||"http://localhost:4101";
const ATTRIBUTION=process.env.ATTRIBUTION_URL||"http://localhost:4104";
const WORKFLOW=process.env.WORKFLOW_URL||"http://localhost:4105";
const PRIVACY=process.env.PRIVACY_URL||"http://localhost:4113";
const INTERVIEWS=process.env.INTERVIEWS_URL||"http://localhost:4114";
const ASSESSMENTS=process.env.ASSESSMENTS_URL||"http://localhost:4115";
const OFFERS=process.env.OFFERS_URL||"http://localhost:4116";
const uploadSecret=()=>new TextEncoder().encode(process.env.APPLICATION_UPLOAD_SECRET||process.env.AUTH_SECRET||"change-me");
const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");

app.get("/health",async c=>c.json(await health("applications")));

app.get("/v1/applications",async c=>{
 const x=context(c.req.raw.headers),jobId=c.req.query("jobId"),candidateId=c.req.query("candidateId"),values:any[]=[x.tenantId];
 let sql="select * from applications where tenant_id=$1";
 if(jobId){values.push(jobId);sql+=" and job_id=$"+values.length;}
 if(candidateId){values.push(candidateId);sql+=" and candidate_id=$"+values.length;}
 sql+=" order by created_at desc limit 250";
 return c.json((await pool.query(sql,values)).rows.map(map));
});

app.post("/v1/applications",async c=>{
 const x=context(c.req.raw.headers),body=CreateApplicationContract.parse(await c.req.json());
 const headers={"content-type":"application/json","x-tenant-id":x.tenantId,"x-correlation-id":x.correlationId};
 const jobRes=await fetch(JOBS+"/v1/jobs/"+body.jobId,{headers});
 if(!jobRes.ok)return c.json({code:"JOB_NOT_AVAILABLE",message:"Vacancy not available",correlationId:x.correlationId},409);
 const job:any=await jobRes.json();
 if(job.status!=="PUBLISHED")return c.json({code:"JOB_NOT_PUBLISHED",message:"Vacancy is not accepting applications",correlationId:x.correlationId},409);
 const candRes=await fetch(CANDIDATES+"/v1/candidates/resolve",{method:"POST",headers,body:JSON.stringify(body.candidate)});
 if(!candRes.ok)return c.json({code:"CANDIDATE_RESOLUTION_FAILED",message:"Could not resolve candidate",correlationId:x.correlationId},502);
 const candidate:any=await candRes.json(),id=randomUUID(),portalToken=randomBytes(32).toString("base64url"),sessionId=randomUUID();
 const application=await withTransaction(async client=>{
   const{rows}=await client.query("insert into applications(id,tenant_id,job_id,candidate_id,right_to_work,availability,cover_note,privacy_notice_version,privacy_accepted_at,attribution,answers) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb) returning *",[id,x.tenantId,body.jobId,candidate.id,body.rightToWork||null,body.availability||null,body.coverNote||null,body.privacyNoticeVersion,body.privacyAcceptedAt,JSON.stringify(body.attribution),JSON.stringify(body.answers)]);
   await client.query("insert into candidate_portal_sessions(id,tenant_id,application_id,candidate_id,token_hash,expires_at) values($1,$2,$3,$4,$5,now()+interval '30 days')",[sessionId,x.tenantId,id,candidate.id,tokenHash(portalToken)]);
   const value=map(rows[0]);
   await writeOutbox(client,createEvent({eventType:Events.applicationCreated,eventVersion:1,producer:"applications",correlationId:x.correlationId,tenantId:x.tenantId,payload:{...value,candidate,job}}));
   return value;
 });
 fetch(ATTRIBUTION+"/v1/attribution/conversions",{method:"POST",headers,body:JSON.stringify({applicationId:id,jobId:body.jobId,candidateId:candidate.id,...body.attribution})}).catch(()=>{});
 const documentUploadToken=await new SignJWT({tenantId:x.tenantId,applicationId:id,candidateId:candidate.id,scope:"candidate-document-upload"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("15m").sign(uploadSecret());
 return c.json({...application,documentUploadToken,candidatePortalToken:portalToken,candidatePortalExpiresIn:2592000},201);
});

async function portalSession(token:string){
 const hash=tokenHash(token);
 const {rows}=await pool.query("select * from candidate_portal_sessions where token_hash=$1 and revoked_at is null and expires_at>now()",[hash]);
 if(rows[0])await pool.query("update candidate_portal_sessions set last_used_at=now() where id=$1",[rows[0].id]);
 return rows[0]||null;
}

app.get("/v1/applications/portal/session",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);
 if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const application=(await pool.query("select * from applications where tenant_id=$1 and id=$2",[session.tenant_id,session.application_id])).rows[0];
 if(!application)return c.json({code:"NOT_FOUND",message:"Application not found"},404);
 const headers={"x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID()};
 const[jobRes,workflowRes,interviewRes,assessmentRes,offerRes]=await Promise.all([
   fetch(JOBS+"/v1/jobs/"+application.job_id,{headers}),
   fetch(WORKFLOW+"/v1/workflow/"+application.id,{headers}),
   fetch(INTERVIEWS+"/v1/interviews?applicationId="+application.id,{headers}),
   fetch(ASSESSMENTS+"/v1/assessments?applicationId="+application.id,{headers}),
   fetch(OFFERS+"/v1/offers?applicationId="+application.id,{headers})
 ]);
 const offers:any[]=offerRes.ok?await offerRes.json():[];
 const offerViews=await Promise.all(offers.filter((o:any)=>["ISSUED","ACCEPTED","DECLINED","EXPIRED"].includes(o.status)).map(async(o:any)=>{const d=await fetch(OFFERS+"/v1/offers/"+o.id+"/documents",{headers});return{...o,documents:d.ok?await d.json():[]};}));
 return c.json({application:map(application),job:jobRes.ok?await jobRes.json():null,workflow:workflowRes.ok?await workflowRes.json():null,interviews:interviewRes.ok?await interviewRes.json():[],assessments:assessmentRes.ok?await assessmentRes.json():[],offers:offerViews,sessionExpiresAt:session.expires_at});
});

app.post("/v1/applications/portal/withdraw",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);
 if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const r=await fetch(WORKFLOW+"/v1/workflow/"+session.application_id+"/stage",{method:"PATCH",headers:{"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id},body:JSON.stringify({stage:"WITHDRAWN"})});
 if(!r.ok)return c.json(await r.json().catch(()=>({code:"WITHDRAW_FAILED",message:"Could not withdraw application"})),r.status as any);
 return c.json({ok:true,applicationId:session.application_id,status:"WITHDRAWN"});
});

app.post("/v1/applications/portal/privacy-request",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);
 if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const body:any=await c.req.json();
 const r=await fetch(PRIVACY+"/v1/privacy/requests",{method:"POST",headers:{"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id},body:JSON.stringify({candidateId:session.candidate_id,type:body.type})});
 return c.json(await r.json(),r.status as any);
});


app.post("/v1/applications/portal/interviews/:id/reschedule",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const h={"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id};
 const list=await fetch(INTERVIEWS+"/v1/interviews?applicationId="+session.application_id,{headers:h}),items:any[]=list.ok?await list.json():[];if(!items.some(i=>i.id===c.req.param("id")))return c.json({code:"FORBIDDEN",message:"Interview does not belong to this application"},403);
 const r=await fetch(INTERVIEWS+"/v1/interviews/"+c.req.param("id")+"/reschedule-request",{method:"POST",headers:h,body:JSON.stringify(await c.req.json())});return c.json(await r.json(),r.status as any);
});

app.post("/v1/applications/portal/assessments/:id/submit",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const h={"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id};
 const list=await fetch(ASSESSMENTS+"/v1/assessments?applicationId="+session.application_id,{headers:h}),items:any[]=list.ok?await list.json():[];if(!items.some(i=>i.id===c.req.param("id")))return c.json({code:"FORBIDDEN",message:"Assessment does not belong to this application"},403);
 const r=await fetch(ASSESSMENTS+"/v1/assessments/"+c.req.param("id")+"/submit",{method:"POST",headers:h,body:JSON.stringify(await c.req.json())});return c.json(await r.json(),r.status as any);
});

app.post("/v1/applications/portal/assessments/:id/extension",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const h={"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id};
 const list=await fetch(ASSESSMENTS+"/v1/assessments?applicationId="+session.application_id,{headers:h}),items:any[]=list.ok?await list.json():[];if(!items.some(i=>i.id===c.req.param("id")))return c.json({code:"FORBIDDEN",message:"Assessment does not belong to this application"},403);
 const r=await fetch(ASSESSMENTS+"/v1/assessments/"+c.req.param("id")+"/extensions",{method:"POST",headers:h,body:JSON.stringify(await c.req.json())});return c.json(await r.json(),r.status as any);
});

app.post("/v1/applications/portal/offers/:id/accept",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const h={"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id};
 const list=await fetch(OFFERS+"/v1/offers?applicationId="+session.application_id,{headers:h}),items:any[]=list.ok?await list.json():[];if(!items.some(i=>i.id===c.req.param("id")))return c.json({code:"FORBIDDEN",message:"Offer does not belong to this application"},403);
 const r=await fetch(OFFERS+"/v1/offers/"+c.req.param("id")+"/accept",{method:"POST",headers:h,body:JSON.stringify(await c.req.json())});return c.json(await r.json(),r.status as any);
});

app.post("/v1/applications/portal/offers/:id/decline",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const h={"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id};
 const list=await fetch(OFFERS+"/v1/offers?applicationId="+session.application_id,{headers:h}),items:any[]=list.ok?await list.json():[];if(!items.some(i=>i.id===c.req.param("id")))return c.json({code:"FORBIDDEN",message:"Offer does not belong to this application"},403);
 const r=await fetch(OFFERS+"/v1/offers/"+c.req.param("id")+"/decline",{method:"POST",headers:h,body:JSON.stringify(await c.req.json())});return c.json(await r.json(),r.status as any);
});

app.post("/v1/applications/portal/revoke",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)return c.json({ok:true});
 await pool.query("update candidate_portal_sessions set revoked_at=now() where token_hash=$1",[tokenHash(token)]);
 return c.json({ok:true});
});

app.get("/v1/applications/:id",async c=>{const x=context(c.req.raw.headers),{rows}=await pool.query("select * from applications where tenant_id=$1 and id=$2",[x.tenantId,c.req.param("id")]);if(!rows[0])return c.json({code:"NOT_FOUND",message:"Application not found",correlationId:x.correlationId},404);return c.json(map(rows[0]));});
app.post("/v1/applications/candidate/:candidateId/anonymise",async c=>{const x=context(c.req.raw.headers),candidateId=c.req.param("candidateId");const{rows}=await pool.query("update applications set right_to_work=null,availability=null,cover_note=null,answers='[]'::jsonb,attribution='{}'::jsonb,updated_at=now() where tenant_id=$1 and candidate_id=$2 returning id",[x.tenantId,candidateId]);await pool.query("update candidate_portal_sessions set revoked_at=now() where tenant_id=$1 and candidate_id=$2 and revoked_at is null",[x.tenantId,candidateId]);return c.json({candidateId,applicationsAnonymised:rows.length,applicationIds:rows.map(r=>r.id)});});

serve({fetch:app.fetch,port:Number(process.env.PORT||4103)});

function map(r:any){return{id:r.id,tenantId:r.tenant_id,jobId:r.job_id,candidateId:r.candidate_id,rightToWork:r.right_to_work,availability:r.availability,coverNote:r.cover_note,privacyNoticeVersion:r.privacy_notice_version,privacyAcceptedAt:r.privacy_accepted_at,attribution:r.attribution,answers:r.answers,createdAt:r.created_at};}
