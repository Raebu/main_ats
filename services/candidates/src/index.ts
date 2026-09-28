import{randomUUID}from"node:crypto";
import{serve}from"@hono/node-server";
import{Hono}from"hono";
import{z}from"zod";
import{createEvent,Events}from"@raeburn/events";
import{context,health,pool,withTransaction,writeOutbox,installServiceRuntime}from"@raeburn/service-kit";

const app=new Hono();installServiceRuntime(app,"candidates");
const CandidateInput=z.object({email:z.string().email(),name:z.string().min(2),telephone:z.string().optional(),location:z.string().optional(),linkedIn:z.string().optional(),portfolio:z.string().optional()});
const StructuredProfile=z.object({
 profile:z.record(z.string(),z.unknown()).optional(),tags:z.array(z.string()).optional(),customFields:z.record(z.string(),z.unknown()).optional(),
 ownerUserId:z.string().nullable().optional(),relationshipStatus:z.string().optional(),doNotContact:z.boolean().optional(),suppressionReason:z.string().nullable().optional(),
 employmentHistory:z.array(z.record(z.string(),z.unknown())).optional(),education:z.array(z.record(z.string(),z.unknown())).optional(),
 skills:z.array(z.union([z.string(),z.record(z.string(),z.unknown())])).optional(),qualifications:z.array(z.record(z.string(),z.unknown())).optional(),
 certifications:z.array(z.record(z.string(),z.unknown())).optional(),languages:z.array(z.record(z.string(),z.unknown())).optional(),
 salaryExpectation:z.record(z.string(),z.unknown()).optional(),noticePeriod:z.string().nullable().optional(),workEligibility:z.record(z.string(),z.unknown()).optional(),
 mobility:z.record(z.string(),z.unknown()).optional(),workPreferences:z.record(z.string(),z.unknown()).optional(),
 preferredBusinessAreas:z.array(z.string()).optional(),preferredRoleTypes:z.array(z.string()).optional(),engagementScore:z.number().min(0).max(100).optional()
});

app.get("/health",async c=>c.json(await health("candidates")));

app.get("/v1/candidates",async c=>{
 const x=context(c.req.raw.headers),limit=Math.min(Number(c.req.query("limit")||100),250),offset=Math.max(Number(c.req.query("offset")||0),0);
 return c.json((await pool.query("select * from candidates where tenant_id=$1 order by updated_at desc limit $2 offset $3",[x.tenantId,limit,offset])).rows.map(map));
});

app.get("/v1/candidates/:id",async c=>{
 const x=context(c.req.raw.headers),{rows}=await pool.query("select * from candidates where tenant_id=$1 and id=$2",[x.tenantId,c.req.param("id")]);
 if(!rows[0])return c.json({code:"NOT_FOUND",message:"Candidate not found",correlationId:x.correlationId},404);
 return c.json(map(rows[0]));
});

app.post("/v1/candidates/resolve",async c=>{
 const x=context(c.req.raw.headers),body=CandidateInput.parse(await c.req.json()),email=body.email.toLowerCase();
 const existing=await pool.query("select * from candidates where tenant_id=$1 and email=$2",[x.tenantId,email]);
 if(existing.rows[0])return c.json(map(existing.rows[0]));
 const id=randomUUID(),result=await withTransaction(async client=>{
  const{rows}=await client.query("insert into candidates(id,tenant_id,email,name,telephone,location,linkedin,portfolio) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",[id,x.tenantId,email,body.name,body.telephone||null,body.location||null,body.linkedIn||null,body.portfolio||null]);
  const candidate=map(rows[0]);
  await writeOutbox(client,createEvent({eventType:Events.candidateCreated,eventVersion:1,producer:"candidates",correlationId:x.correlationId,tenantId:x.tenantId,payload:candidate}));
  return candidate;
 });
 return c.json(result,201);
});

app.patch("/v1/candidates/:id",async c=>{
 const x=context(c.req.raw.headers),id=c.req.param("id"),b=CandidateInput.partial().omit({email:true}).parse(await c.req.json()),current=await pool.query("select * from candidates where tenant_id=$1 and id=$2",[x.tenantId,id]);
 if(!current.rows[0])return c.json({code:"NOT_FOUND",message:"Candidate not found"},404);
 const next={...map(current.rows[0]),...b};
 await withTransaction(async client=>{
  await client.query("update candidates set name=$3,telephone=$4,location=$5,linkedin=$6,portfolio=$7,updated_at=now() where tenant_id=$1 and id=$2",[x.tenantId,id,next.name,next.telephone||null,next.location||null,next.linkedIn||null,next.portfolio||null]);
  await client.query("insert into candidate_timeline(id,tenant_id,candidate_id,event_type,title,detail,actor) values($1,$2,$3,'CONTACT_UPDATED','Candidate details updated',$4::jsonb,$5)",[randomUUID(),x.tenantId,id,JSON.stringify(b),c.req.header("x-actor")||"system"]);
  await writeOutbox(client,createEvent({eventType:Events.candidateUpdated,eventVersion:1,producer:"candidates",correlationId:x.correlationId,tenantId:x.tenantId,payload:next}));
 });
 return c.json(next);
});

app.post("/v1/candidates/:id/anonymise",async c=>{
 const x=context(c.req.raw.headers),id=c.req.param("id"),anonEmail="anonymised+"+id+"@privacy.invalid";
 const result=await withTransaction(async client=>{
  const{rows}=await client.query("update candidates set email=$3,name='Anonymised Candidate',telephone=null,location=null,linkedin=null,portfolio=null,employment_history='[]'::jsonb,education='[]'::jsonb,skills='[]'::jsonb,qualifications='[]'::jsonb,certifications='[]'::jsonb,languages='[]'::jsonb,salary_expectation='{}'::jsonb,notice_period=null,work_eligibility='{}'::jsonb,mobility='{}'::jsonb,work_preferences='{}'::jsonb,preferred_business_areas='[]'::jsonb,preferred_role_types='[]'::jsonb,updated_at=now() where tenant_id=$1 and id=$2 returning *",[x.tenantId,id,anonEmail]);
  if(!rows[0])return null;
  const candidate=map(rows[0]);
  await writeOutbox(client,createEvent({eventType:Events.candidateUpdated,eventVersion:1,producer:"candidates",correlationId:x.correlationId,tenantId:x.tenantId,payload:{...candidate,privacyAction:"ANONYMISED"}}));
  return candidate;
 });
 return result?c.json(result):c.json({code:"NOT_FOUND",message:"Candidate not found"},404);
});

app.get("/v1/candidates/:id/timeline",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from candidate_timeline where tenant_id=$1 and candidate_id=$2 order by occurred_at desc limit 500",[x.tenantId,c.req.param("id")])).rows);});
app.get("/v1/candidates/:id/sources",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from candidate_sources where tenant_id=$1 and candidate_id=$2 order by first_seen_at",[x.tenantId,c.req.param("id")])).rows);});

app.patch("/v1/candidates/:id/profile",async c=>{
 const x=context(c.req.raw.headers),id=c.req.param("id"),b=StructuredProfile.parse(await c.req.json());
 const cur=(await pool.query("select * from candidates where tenant_id=$1 and id=$2",[x.tenantId,id])).rows[0];
 if(!cur)return c.json({code:"NOT_FOUND",message:"Candidate not found"},404);
 const profile=b.profile??cur.profile,tags=b.tags??cur.tags,customFields=b.customFields??cur.custom_fields,owner=b.ownerUserId===undefined?cur.owner_user_id:b.ownerUserId,relationship=b.relationshipStatus??cur.relationship_status,dnc=b.doNotContact??cur.do_not_contact,reason=b.suppressionReason===undefined?cur.suppression_reason:b.suppressionReason;
 const result=await withTransaction(async client=>{
  const{rows}=await client.query(`update candidates set
   profile=$3::jsonb,tags=$4::jsonb,custom_fields=$5::jsonb,owner_user_id=$6,relationship_status=$7,do_not_contact=$8,suppression_reason=$9,
   employment_history=coalesce($10::jsonb,employment_history),education=coalesce($11::jsonb,education),skills=coalesce($12::jsonb,skills),
   qualifications=coalesce($13::jsonb,qualifications),certifications=coalesce($14::jsonb,certifications),languages=coalesce($15::jsonb,languages),
   salary_expectation=coalesce($16::jsonb,salary_expectation),notice_period=case when $17::text is null then notice_period else $17 end,
   work_eligibility=coalesce($18::jsonb,work_eligibility),mobility=coalesce($19::jsonb,mobility),work_preferences=coalesce($20::jsonb,work_preferences),
   preferred_business_areas=coalesce($21::jsonb,preferred_business_areas),preferred_role_types=coalesce($22::jsonb,preferred_role_types),
   engagement_score=coalesce($23,engagement_score),freshness_at=now(),updated_at=now()
   where tenant_id=$1 and id=$2 returning *`,[
    x.tenantId,id,JSON.stringify(profile),JSON.stringify(tags),JSON.stringify(customFields),owner,relationship,dnc,reason,
    b.employmentHistory?JSON.stringify(b.employmentHistory):null,b.education?JSON.stringify(b.education):null,b.skills?JSON.stringify(b.skills):null,
    b.qualifications?JSON.stringify(b.qualifications):null,b.certifications?JSON.stringify(b.certifications):null,b.languages?JSON.stringify(b.languages):null,
    b.salaryExpectation?JSON.stringify(b.salaryExpectation):null,b.noticePeriod===undefined?null:b.noticePeriod,
    b.workEligibility?JSON.stringify(b.workEligibility):null,b.mobility?JSON.stringify(b.mobility):null,b.workPreferences?JSON.stringify(b.workPreferences):null,
    b.preferredBusinessAreas?JSON.stringify(b.preferredBusinessAreas):null,b.preferredRoleTypes?JSON.stringify(b.preferredRoleTypes):null,b.engagementScore??null
  ]);
  await client.query("insert into candidate_timeline(id,tenant_id,candidate_id,event_type,title,detail,actor) values($1,$2,$3,'PROFILE_UPDATED','Candidate profile updated',$4::jsonb,$5)",[randomUUID(),x.tenantId,id,JSON.stringify(b),c.req.header("x-actor")||"system"]);
  const candidate=map(rows[0]);
  await writeOutbox(client,createEvent({eventType:Events.candidateUpdated,eventVersion:1,producer:"candidates",correlationId:x.correlationId,tenantId:x.tenantId,payload:candidate}));
  return candidate;
 });
 return c.json(result);
});

app.get("/v1/candidates/:id/duplicates",async c=>{
 const x=context(c.req.raw.headers),id=c.req.param("id"),candidate=(await pool.query("select * from candidates where tenant_id=$1 and id=$2",[x.tenantId,id])).rows[0];
 if(!candidate)return c.json({code:"NOT_FOUND",message:"Candidate not found"},404);
 const phone=String(candidate.telephone||"").replace(/[^0-9+]/g,""),linkedin=String(candidate.linkedin||"").toLowerCase().replace(/\/$/,"");
 const{rows}=await pool.query(`select * from candidates where tenant_id=$1 and id<>$2 and relationship_status<>'MERGED' and
 (lower(email)=lower($3) or ($4<>'' and regexp_replace(coalesce(telephone,''),'[^0-9+]','','g')=$4) or ($5<>'' and lower(regexp_replace(coalesce(linkedin,''),'/$',''))=$5))
 order by updated_at desc limit 20`,[x.tenantId,id,candidate.email,phone,linkedin]);
 return c.json(rows.map((r:any)=>({candidate:map(r),signals:{email:String(r.email||"").toLowerCase()===String(candidate.email||"").toLowerCase(),telephone:!!phone&&String(r.telephone||"").replace(/[^0-9+]/g,"")===phone,linkedIn:!!linkedin&&String(r.linkedin||"").toLowerCase().replace(/\/$/,"")===linkedin}})));
});

app.post("/v1/candidates/:id/sources",async c=>{const x=context(c.req.raw.headers),candidateId=c.req.param("id"),b=z.object({source:z.string().min(1),detail:z.record(z.string(),z.unknown()).default({})}).parse(await c.req.json()),id=randomUUID();await pool.query("insert into candidate_sources(id,tenant_id,candidate_id,source,detail) values($1,$2,$3,$4,$5::jsonb) on conflict(tenant_id,candidate_id,source) do update set last_seen_at=now(),detail=excluded.detail",[id,x.tenantId,candidateId,b.source,JSON.stringify(b.detail)]);return c.json({candidateId,source:b.source},201);});
app.post("/v1/candidates/:id/timeline",async c=>{const x=context(c.req.raw.headers),candidateId=c.req.param("id"),b=z.object({eventType:z.string(),title:z.string(),detail:z.record(z.string(),z.unknown()).default({})}).parse(await c.req.json()),id=randomUUID();await pool.query("insert into candidate_timeline(id,tenant_id,candidate_id,event_type,title,detail,actor) values($1,$2,$3,$4,$5,$6::jsonb,$7)",[id,x.tenantId,candidateId,b.eventType,b.title,JSON.stringify(b.detail),c.req.header("x-actor")||"system"]);return c.json({id},201);});

app.post("/v1/candidates/:id/merge",async c=>{
 const x=context(c.req.raw.headers),primaryId=c.req.param("id"),b=z.object({mergedCandidateId:z.string()}).parse(await c.req.json());
 if(primaryId===b.mergedCandidateId)return c.json({code:"INVALID_MERGE",message:"Cannot merge candidate into itself"},409);
 const result=await withTransaction(async client=>{
  const primary=(await client.query("select * from candidates where tenant_id=$1 and id=$2 for update",[x.tenantId,primaryId])).rows[0],merged=(await client.query("select * from candidates where tenant_id=$1 and id=$2 for update",[x.tenantId,b.mergedCandidateId])).rows[0];
  if(!primary||!merged)return null;
  const tags=[...new Set([...(primary.tags||[]),...(merged.tags||[])])],profile={...(merged.profile||{}),...(primary.profile||{})};
  await client.query("update candidates set tags=$3::jsonb,profile=$4::jsonb,updated_at=now() where tenant_id=$1 and id=$2",[x.tenantId,primaryId,JSON.stringify(tags),JSON.stringify(profile)]);
  await client.query("insert into candidate_merges(id,tenant_id,primary_candidate_id,merged_candidate_id,actor) values($1,$2,$3,$4,$5)",[randomUUID(),x.tenantId,primaryId,b.mergedCandidateId,c.req.header("x-actor")||"system"]);
  await client.query("update candidates set relationship_status='MERGED',do_not_contact=true,suppression_reason='Merged into ' || $3,updated_at=now() where tenant_id=$1 and id=$2",[x.tenantId,b.mergedCandidateId,primaryId]);
  return{primaryCandidateId:primaryId,mergedCandidateId:b.mergedCandidateId};
 });
 return result?c.json(result):c.json({code:"NOT_FOUND",message:"Candidate not found"},404);
});


const ENGAGEMENT_WEIGHTS:Record<string,number>={APPLICATION:20,INTERVIEW:25,REPLY:20,EMAIL_CLICK:8,EMAIL_OPEN:3,PROFILE_UPDATE:5,TALENT_POOL_CONSENT:15,EVENT_ATTENDANCE:15,RECRUITER_CONTACT:4};
function freshnessFrom(date:any){if(!date)return 0;const days=Math.max(0,(Date.now()-new Date(date).getTime())/86400000);return days<=30?100:days<=90?80:days<=180?50:days<=365?20:0;}
async function recalcIntelligence(tenantId:string,candidateId:string){
 const candidate=(await pool.query("select * from candidates where tenant_id=$1 and id=$2",[tenantId,candidateId])).rows[0];if(!candidate)return null;
 const events=(await pool.query("select kind,weight,occurred_at from candidate_engagements where tenant_id=$1 and candidate_id=$2 order by occurred_at desc limit 200",[tenantId,candidateId])).rows;
 const lastActivity=events[0]?.occurred_at||candidate.last_candidate_activity_at||candidate.last_contact_at||candidate.freshness_at||candidate.updated_at||candidate.created_at;
 const ageDays=Math.max(0,(Date.now()-new Date(lastActivity).getTime())/86400000),decay=Math.max(.2,1-ageDays/365);
 const raw=Math.min(100,events.reduce((sum:number,e:any)=>sum+Number(e.weight||ENGAGEMENT_WEIGHTS[e.kind]||0),0)),engagement=Math.round(raw*decay),freshness=freshnessFrom(lastActivity);
 const{rows}=await pool.query("update candidates set engagement_score=$3,freshness_score=$4,last_candidate_activity_at=$5,freshness_at=$5 where tenant_id=$1 and id=$2 returning *",[tenantId,candidateId,engagement,freshness,lastActivity]);
 return{candidate:map(rows[0]),engagement:{score:engagement,rawScore:raw,decay:Number(decay.toFixed(3)),lastActivity,events:events.slice(0,25)},freshness:{score:freshness,lastActivity,ageDays:Math.floor(ageDays),bands:{fresh:"0-30 days",warm:"31-90 days",cool:"91-180 days",stale:"181-365 days",dormant:"365+ days"}}};
}
app.get("/v1/candidates/:id/intelligence",async c=>{const x=context(c.req.raw.headers),result=await recalcIntelligence(x.tenantId,c.req.param("id"));return result?c.json(result):c.json({code:"NOT_FOUND",message:"Candidate not found"},404);});
app.post("/v1/candidates/:id/engagements",async c=>{const x=context(c.req.raw.headers),candidateId=c.req.param("id"),b=z.object({kind:z.string().min(2),source:z.string().optional(),weight:z.number().min(0).max(100).optional(),detail:z.record(z.string(),z.unknown()).default({}),occurredAt:z.string().datetime().optional()}).parse(await c.req.json()),exists=(await pool.query("select 1 from candidates where tenant_id=$1 and id=$2",[x.tenantId,candidateId])).rowCount;if(!exists)return c.json({code:"NOT_FOUND",message:"Candidate not found"},404);const id=randomUUID(),weight=b.weight??ENGAGEMENT_WEIGHTS[b.kind]??5;await pool.query("insert into candidate_engagements(id,tenant_id,candidate_id,kind,weight,source,detail,occurred_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,coalesce($8::timestamptz,now()))",[id,x.tenantId,candidateId,b.kind,weight,b.source||null,JSON.stringify(b.detail),b.occurredAt||null]);await pool.query("insert into candidate_timeline(id,tenant_id,candidate_id,event_type,title,detail,actor,occurred_at) values($1,$2,$3,'ENGAGEMENT',$4,$5::jsonb,$6,coalesce($7::timestamptz,now()))",[randomUUID(),x.tenantId,candidateId,"Candidate engagement: "+b.kind,JSON.stringify({kind:b.kind,weight,source:b.source||null,...b.detail}),c.req.header("x-actor")||"system",b.occurredAt||null]);const result=await recalcIntelligence(x.tenantId,candidateId);return c.json({id,...result},201);});
app.get("/v1/candidates/:id/engagements",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from candidate_engagements where tenant_id=$1 and candidate_id=$2 order by occurred_at desc limit 250",[x.tenantId,c.req.param("id")])).rows);});
app.post("/v1/candidates/intelligence/recalculate",async c=>{const x=context(c.req.raw.headers),ids=(await pool.query("select id from candidates where tenant_id=$1 and relationship_status<>'MERGED' order by updated_at desc limit 1000",[x.tenantId])).rows;let updated=0;for(const row of ids){if(await recalcIntelligence(x.tenantId,row.id))updated++;}return c.json({updated});});

app.get("/v1/candidates/:id/blind",async c=>{const x=context(c.req.raw.headers),{rows}=await pool.query("select * from candidates where tenant_id=$1 and id=$2",[x.tenantId,c.req.param("id")]);if(!rows[0])return c.json({code:"NOT_FOUND",message:"Candidate not found"},404);const v=map(rows[0]);return c.json({id:v.id,location:v.location,profile:v.profile,tags:v.tags,employmentHistory:v.employmentHistory,education:v.education,skills:v.skills,qualifications:v.qualifications,certifications:v.certifications,languages:v.languages,workEligibility:v.workEligibility,mobility:v.mobility,workPreferences:v.workPreferences,preferredBusinessAreas:v.preferredBusinessAreas,preferredRoleTypes:v.preferredRoleTypes,identityHidden:true,hiddenFields:["name","email","telephone","linkedIn","portfolio"]});});

serve({fetch:app.fetch,port:Number(process.env.PORT||4102)});

function map(r:any){return{
 id:r.id,tenantId:r.tenant_id,email:r.email,name:r.name,telephone:r.telephone,location:r.location,linkedIn:r.linkedin,portfolio:r.portfolio,
 profile:r.profile||{},tags:r.tags||[],customFields:r.custom_fields||{},ownerUserId:r.owner_user_id,doNotContact:r.do_not_contact,
 suppressionReason:r.suppression_reason,relationshipStatus:r.relationship_status,freshnessAt:r.freshness_at,lastContactAt:r.last_contact_at,
 employmentHistory:r.employment_history||[],education:r.education||[],skills:r.skills||[],qualifications:r.qualifications||[],certifications:r.certifications||[],
 languages:r.languages||[],salaryExpectation:r.salary_expectation||{},noticePeriod:r.notice_period,workEligibility:r.work_eligibility||{},mobility:r.mobility||{},
 workPreferences:r.work_preferences||{},preferredBusinessAreas:r.preferred_business_areas||[],preferredRoleTypes:r.preferred_role_types||[],
 engagementScore:Number(r.engagement_score||0),freshnessScore:Number(r.freshness_score||0),lastCandidateActivityAt:r.last_candidate_activity_at
};}