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
const SCHEDULER=process.env.SCHEDULER_URL||"http://localhost:4127";
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
 const[jobRes,workflowRes,interviewRes,assessmentRes,offerRes,candidateRes]=await Promise.all([
   fetch(JOBS+"/v1/jobs/"+application.job_id,{headers}),
   fetch(WORKFLOW+"/v1/workflow/"+application.id,{headers}),
   fetch(INTERVIEWS+"/v1/interviews?applicationId="+application.id,{headers}),
   fetch(ASSESSMENTS+"/v1/assessments?applicationId="+application.id,{headers}),
   fetch(OFFERS+"/v1/offers?applicationId="+application.id,{headers}),
   fetch(CANDIDATES+"/v1/candidates/"+session.candidate_id,{headers})
 ]);
 const offers:any[]=offerRes.ok?await offerRes.json():[];
 const offerViews=await Promise.all(offers.filter((o:any)=>["ISSUED","ACCEPTED","DECLINED","EXPIRED"].includes(o.status)).map(async(o:any)=>{const d=await fetch(OFFERS+"/v1/offers/"+o.id+"/documents",{headers});return{...o,documents:d.ok?await d.json():[]};}));
 const interviewRows:any[]=interviewRes.ok?await interviewRes.json():[],assessmentRows:any[]=assessmentRes.ok?await assessmentRes.json():[];
 const safeInterviews=interviewRows.map(i=>({id:i.id,round:i.round,status:i.status,starts_at:i.starts_at,ends_at:i.ends_at,meeting_url:i.meeting_url,reschedule_status:i.reschedule_status}));
 const safeAssessments=assessmentRows.map(a=>({id:a.id,type:a.type,title:a.title,instructions:a.instructions,status:a.status,due_at:a.due_at,extension_status:a.extension_status,candidate_feedback:a.candidate_feedback,feedback_visible_at:a.feedback_visible_at,template_version:a.template_version}));
 const safeOffers=offerViews.map((o:any)=>({id:o.id,status:o.status,version:o.version,compensation:o.compensation,equity:o.equity,conditions:o.conditions,start_date:o.start_date,probation:o.probation,benefits:o.benefits,expires_at:o.expires_at,accepted_at:o.accepted_at,declined_at:o.declined_at,decline_reason:o.decline_reason,documents:(o.documents||[]).map((d:any)=>({id:d.id,document_type:d.document_type,version:d.version,title:d.title,content:d.content,content_hash:d.content_hash}))}));
 const preferences=(await pool.query("select * from candidate_experience_preferences where tenant_id=$1 and candidate_id=$2",[session.tenant_id,session.candidate_id])).rows[0]||null;
 const alerts=(await pool.query("select id,query,location,department,frequency,locale,status,created_at from candidate_job_alerts where tenant_id=$1 and candidate_id=$2 order by created_at desc",[session.tenant_id,session.candidate_id])).rows;
 const savedJobs=(await pool.query("select job_id,saved_at from candidate_saved_jobs where tenant_id=$1 and candidate_id=$2 order by saved_at desc",[session.tenant_id,session.candidate_id])).rows;
 return c.json({application:map(application),candidate:candidateRes.ok?await candidateRes.json():null,job:jobRes.ok?await jobRes.json():null,workflow:workflowRes.ok?await workflowRes.json():null,interviews:safeInterviews,assessments:safeAssessments,offers:safeOffers,preferences,alerts,savedJobs,sessionExpiresAt:session.expires_at});
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


app.patch("/v1/applications/portal/profile",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const body:any=await c.req.json(),h={"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id};
 const contact:any={};for(const k of["name","telephone","location","linkedIn","portfolio"])if(body[k]!==undefined)contact[k]=body[k];
 if(Object.keys(contact).length){const r=await fetch(CANDIDATES+"/v1/candidates/"+session.candidate_id,{method:"PATCH",headers:h,body:JSON.stringify(contact)});if(!r.ok)return c.json(await r.json(),r.status as any);}
 const profile:any={};for(const k of["employmentHistory","education","skills","qualifications","certifications","languages","salaryExpectation","noticePeriod","workEligibility","mobility","workPreferences","preferredBusinessAreas","preferredRoleTypes"])if(body[k]!==undefined)profile[k]=body[k];
 if(Object.keys(profile).length){const r=await fetch(CANDIDATES+"/v1/candidates/"+session.candidate_id+"/profile",{method:"PATCH",headers:h,body:JSON.stringify(profile)});if(!r.ok)return c.json(await r.json(),r.status as any);}
 return c.json({ok:true});
});

app.put("/v1/applications/portal/preferences",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const b=(await c.req.json()) as any;
 const previous=(await pool.query("select * from candidate_experience_preferences where tenant_id=$1 and candidate_id=$2",[session.tenant_id,session.candidate_id])).rows[0]||null;
 const accessibility=b.accessibilityPreferences||{},communication=b.communicationPreferences||{},alternative=b.alternativeApplicationPreferences||{};
 const{rows}=await pool.query(`insert into candidate_experience_preferences(tenant_id,candidate_id,locale,accessibility_preferences,communication_preferences,alternative_application_preferences,talent_pool_consent,recruitment_marketing_consent,keep_in_touch_consent,consent_updated_at)
 values($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,now())
 on conflict(tenant_id,candidate_id) do update set locale=excluded.locale,accessibility_preferences=excluded.accessibility_preferences,communication_preferences=excluded.communication_preferences,alternative_application_preferences=excluded.alternative_application_preferences,talent_pool_consent=excluded.talent_pool_consent,recruitment_marketing_consent=excluded.recruitment_marketing_consent,keep_in_touch_consent=excluded.keep_in_touch_consent,consent_updated_at=now(),updated_at=now() returning *`,[session.tenant_id,session.candidate_id,b.locale||"en-GB",JSON.stringify(accessibility),JSON.stringify(communication),JSON.stringify(alternative),!!b.talentPoolConsent,!!b.recruitmentMarketingConsent,!!b.keepInTouchConsent]);
 const h={"content-type":"application/json","x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID(),"x-actor":"candidate:"+session.candidate_id};
 async function scheduleCampaign(campaignType:string,runAt:Date,recurrence:null|"WEEKLY"=null,maxRuns:number|null=null){const existing=(await pool.query("select * from candidate_campaign_schedules where tenant_id=$1 and candidate_id=$2 and campaign_type=$3",[session.tenant_id,session.candidate_id,campaignType])).rows[0];if(existing?.status==="ACTIVE")return;const r=await fetch(SCHEDULER+"/v1/scheduled-actions",{method:"POST",headers:h,body:JSON.stringify({actionType:campaignType,runAt:runAt.toISOString(),payload:{candidateId:session.candidate_id,applicationId:session.application_id},recurrence,timezone:"Europe/London",maxRuns})});if(r.ok){const v:any=await r.json();await pool.query("insert into candidate_campaign_schedules(tenant_id,candidate_id,campaign_type,scheduled_action_id,status) values($1,$2,$3,$4,'ACTIVE') on conflict(tenant_id,candidate_id,campaign_type) do update set scheduled_action_id=excluded.scheduled_action_id,status='ACTIVE',updated_at=now()",[session.tenant_id,session.candidate_id,campaignType,v.id]);}}
 async function cancelCampaign(campaignType:string){const existing=(await pool.query("select * from candidate_campaign_schedules where tenant_id=$1 and candidate_id=$2 and campaign_type=$3 and status='ACTIVE'",[session.tenant_id,session.candidate_id,campaignType])).rows[0];if(!existing)return;await fetch(SCHEDULER+"/v1/scheduled-actions/"+existing.scheduled_action_id,{method:"PATCH",headers:h,body:JSON.stringify({status:"CANCELLED"})}).catch(()=>{});await pool.query("update candidate_campaign_schedules set status='CANCELLED',updated_at=now() where tenant_id=$1 and candidate_id=$2 and campaign_type=$3",[session.tenant_id,session.candidate_id,campaignType]);}
 const now=Date.now();if(b.keepInTouchConsent&&!previous?.keep_in_touch_consent){await scheduleCampaign("candidate_keep_in_touch",new Date(now+30*86400000),"WEEKLY",6);await scheduleCampaign("candidate_reengagement",new Date(now+90*86400000));}else if(!b.keepInTouchConsent&&previous?.keep_in_touch_consent){await cancelCampaign("candidate_keep_in_touch");await cancelCampaign("candidate_reengagement");}
 if(b.recruitmentMarketingConsent&&!previous?.recruitment_marketing_consent)await scheduleCampaign("candidate_application_anniversary",new Date(now+365*86400000));else if(!b.recruitmentMarketingConsent&&previous?.recruitment_marketing_consent)await cancelCampaign("candidate_application_anniversary");
 return c.json(rows[0]);
});

app.post("/v1/applications/portal/job-alerts",async c=>{
 const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);
 const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);
 const candidateRes=await fetch(CANDIDATES+"/v1/candidates/"+session.candidate_id,{headers:{"x-tenant-id":session.tenant_id,"x-correlation-id":randomUUID()}});if(!candidateRes.ok)return c.json({code:"CANDIDATE_UNAVAILABLE",message:"Candidate profile unavailable"},502);const candidate:any=await candidateRes.json();
 const b=(await c.req.json()) as any,id=randomUUID();await pool.query("insert into candidate_job_alerts(id,tenant_id,candidate_id,email,query,location,department,frequency,locale) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,session.tenant_id,session.candidate_id,candidate.email,b.query||null,b.location||null,b.department||null,b.frequency||"WEEKLY",b.locale||"en-GB"]);return c.json({id,status:"ACTIVE"},201);
});
app.delete("/v1/applications/portal/job-alerts/:id",async c=>{const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({ok:true});const session=await portalSession(token);if(!session)return c.json({ok:true});await pool.query("update candidate_job_alerts set status='UNSUBSCRIBED',updated_at=now() where tenant_id=$1 and candidate_id=$2 and id=$3",[session.tenant_id,session.candidate_id,c.req.param("id")]);return c.json({ok:true});});

app.post("/v1/applications/job-alerts",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json()) as any;if(!b.email||!String(b.email).includes("@"))return c.json({code:"EMAIL_REQUIRED",message:"A valid email address is required"},400);const id=randomUUID();await pool.query("insert into candidate_job_alerts(id,tenant_id,email,query,location,department,frequency,locale) values($1,$2,$3,$4,$5,$6,$7,$8)",[id,x.tenantId,String(b.email).toLowerCase(),b.query||null,b.location||null,b.department||null,b.frequency||"WEEKLY",b.locale||"en-GB"]);return c.json({id,status:"ACTIVE"},201);});

app.post("/v1/applications/portal/saved-jobs/:jobId",async c=>{const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);await pool.query("insert into candidate_saved_jobs(tenant_id,candidate_id,job_id) values($1,$2,$3) on conflict do nothing",[session.tenant_id,session.candidate_id,c.req.param("jobId")]);return c.json({saved:true});});
app.delete("/v1/applications/portal/saved-jobs/:jobId",async c=>{const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({ok:true});const session=await portalSession(token);if(!session)return c.json({ok:true});await pool.query("delete from candidate_saved_jobs where tenant_id=$1 and candidate_id=$2 and job_id=$3",[session.tenant_id,session.candidate_id,c.req.param("jobId")]);return c.json({saved:false});});

app.post("/v1/applications/portal/feedback",async c=>{const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({code:"UNAUTHENTICATED",message:"Candidate session required"},401);const session=await portalSession(token);if(!session)return c.json({code:"UNAUTHENTICATED",message:"Candidate session expired or invalid"},401);const b=(await c.req.json()) as any,rating=Number(b.rating);if(!Number.isInteger(rating)||rating<1||rating>5)return c.json({code:"INVALID_RATING",message:"Rating must be between 1 and 5"},400);const id=randomUUID();await pool.query("insert into candidate_experience_feedback(id,tenant_id,candidate_id,application_id,kind,rating,comments,permission_to_contact) values($1,$2,$3,$4,$5,$6,$7,$8)",[id,session.tenant_id,session.candidate_id,session.application_id,b.kind||"APPLICATION",rating,b.comments||null,!!b.permissionToContact]);return c.json({id,received:true},201);});

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
