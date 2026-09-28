import{createHash,randomUUID}from"node:crypto";
import{serve}from"@hono/node-server";
import{Hono}from"hono";
import{z}from"zod";
import{context,health,pool,serviceAuthHeaders,tenantDecrypt,tenantEncrypt,installServiceRuntime}from"@raeburn/service-kit";

const app=new Hono();installServiceRuntime(app,"privacy");
const sha=(v:string)=>createHash("sha256").update(v).digest("hex");
async function privacyAudit(tenantId:string,candidateId:string|null,action:string,detail:any,actor:string|null){
 await pool.query("insert into privacy_audit(id,tenant_id,candidate_id,action,detail,actor) values($1,$2,$3,$4,$5::jsonb,$6)",[randomUUID(),tenantId,candidateId,action,JSON.stringify(detail||{}),actor]);
}

const URLS={
  candidates:process.env.CANDIDATES_URL||"http://localhost:4102",
  applications:process.env.APPLICATIONS_URL||"http://localhost:4103",
  workflow:process.env.WORKFLOW_URL||"http://localhost:4105",
  documents:process.env.DOCUMENTS_URL||"http://localhost:4106",
  communications:process.env.COMMUNICATIONS_URL||"http://localhost:4107",
  interviews:process.env.INTERVIEWS_URL||"http://localhost:4114",
  offers:process.env.OFFERS_URL||"http://localhost:4116",
  talentPools:process.env.TALENT_POOLS_URL||"http://localhost:4117"
};

function headers(tenantId:string,correlationId:string,body=false){
  const h:Record<string,string>={"x-tenant-id":tenantId,"x-correlation-id":correlationId};
  if(body)h["content-type"]="application/json";
  return serviceAuthHeaders(h);
}
async function json(url:string,init:RequestInit={}){
  const r=await fetch(url,init);
  if(!r.ok)throw new Error((await r.json().catch(()=>({message:r.statusText}))).message||("HTTP "+r.status));
  return r.status===204?null:r.json();
}
async function snapshot(tenantId:string,correlationId:string,candidateId:string){
  const h=headers(tenantId,correlationId);
  const[candidate,applications,documents,memberships]=await Promise.all([
    json(URLS.candidates+"/v1/candidates/"+candidateId,{headers:h}),
    json(URLS.applications+"/v1/applications?candidateId="+encodeURIComponent(candidateId),{headers:h}),
    json(URLS.documents+"/v1/documents/candidate/"+candidateId,{headers:h}),
    json(URLS.talentPools+"/v1/talent-pools/memberships/"+candidateId,{headers:h})
  ]);
  const applicationData=await Promise.all((applications as any[]).map(async a=>({
    application:a,
    workflow:await json(URLS.workflow+"/v1/workflow/"+a.id,{headers:h}).catch(()=>null),
    workflowHistory:await json(URLS.workflow+"/v1/workflow/"+a.id+"/history",{headers:h}).catch(()=>[]),
    communications:await json(URLS.communications+"/v1/communications/application/"+a.id,{headers:h}).catch(()=>[]),
    interviews:await json(URLS.interviews+"/v1/interviews?applicationId="+a.id,{headers:h}).catch(()=>[]),
    offers:await json(URLS.offers+"/v1/offers?applicationId="+a.id,{headers:h}).catch(()=>[])
  })));
  return{candidate,applications:applicationData,documents,memberships,capturedAt:new Date().toISOString()};
}

app.get("/health",async c=>c.json(await health("privacy")));

app.get("/v1/privacy/requests",async c=>{
  const x=context(c.req.raw.headers);
  return c.json((await pool.query("select * from privacy_requests where tenant_id=$1 order by created_at desc",[x.tenantId])).rows);
});

app.get("/v1/privacy/requests/:id",async c=>{
  const x=context(c.req.raw.headers),{rows}=await pool.query("select * from privacy_requests where tenant_id=$1 and id=$2",[x.tenantId,c.req.param("id")]);
  return rows[0]?c.json(rows[0]):c.json({code:"NOT_FOUND",message:"Privacy request not found"},404);
});

app.post("/v1/privacy/consents",async c=>{
  const x=context(c.req.raw.headers),b=z.object({candidateId:z.string(),noticeVersion:z.string(),acceptedAt:z.string().datetime()}).parse(await c.req.json()),id=randomUUID();
  await pool.query("insert into consent_records(id,tenant_id,candidate_id,notice_version,accepted_at) values($1,$2,$3,$4,$5)",[id,x.tenantId,b.candidateId,b.noticeVersion,b.acceptedAt]);
  return c.json({id},201);
});

app.post("/v1/privacy/requests",async c=>{
  const x=context(c.req.raw.headers),b=z.object({candidateId:z.string(),type:z.enum(["DSAR","DELETE","ANONYMISE"])}).parse(await c.req.json()),id=randomUUID();
  await pool.query("insert into privacy_requests(id,tenant_id,candidate_id,type,requested_by) values($1,$2,$3,$4,$5)",[id,x.tenantId,b.candidateId,b.type,c.req.header("x-actor")||null]);
  await privacyAudit(x.tenantId,b.candidateId,"PRIVACY_REQUEST_CREATED",{requestId:id,type:b.type},c.req.header("x-actor")||null);
  return c.json({id,status:"OPEN",requiresIdentityVerification:true,requiresApproval:true},201);
});

app.post("/v1/privacy/requests/:id/execute",async c=>{
  const x=context(c.req.raw.headers),id=c.req.param("id");
  const request=(await pool.query("select * from privacy_requests where tenant_id=$1 and id=$2",[x.tenantId,id])).rows[0];
  if(!request)return c.json({code:"NOT_FOUND",message:"Privacy request not found"},404);
  if(request.status==="COMPLETED")return c.json(request);
  if(!request.identity_verified_at)return c.json({code:"IDENTITY_VERIFICATION_REQUIRED",message:"Identity must be verified before this privacy request can be fulfilled"},409);
  if(!request.approved_at)return c.json({code:"PRIVACY_APPROVAL_REQUIRED",message:"Privacy request requires approval before fulfilment"},409);
  if(request.rejected_at)return c.json({code:"PRIVACY_REQUEST_REJECTED",message:"Privacy request was rejected",reason:request.rejection_reason},409);

  await pool.query("update privacy_requests set status='IN_PROGRESS',started_at=now(),last_error=null where tenant_id=$1 and id=$2",[x.tenantId,id]);

  try{
    const before=await snapshot(x.tenantId,x.correlationId,request.candidate_id);
    if(request.type==="DSAR"){
      const result={type:"DSAR",data:before};const encrypted=tenantEncrypt(x.tenantId,JSON.stringify(result));
      await pool.query("update privacy_requests set status='COMPLETED',completed_at=now(),result=null,result_encrypted=$3,result_expires_at=now()+interval '30 days' where tenant_id=$1 and id=$2",[x.tenantId,id,encrypted]);
      await privacyAudit(x.tenantId,request.candidate_id,"DSAR_COMPLETED",{requestId:id},c.req.header("x-actor")||null);
      return c.json({id,status:"COMPLETED",result});
    }

    const h=headers(x.tenantId,x.correlationId,true);
    const actions:any[]=[];

    for(const item of before.applications as any[]){
      const applicationId=item.application.id;
      actions.push(await json(URLS.communications+"/v1/communications/application/"+applicationId+"/redact",{method:"POST",headers:h}));
    }

    for(const membership of before.memberships as any[]){
      actions.push(await json(URLS.talentPools+"/v1/talent-pools/"+membership.pool_id+"/members/"+request.candidate_id,{method:"DELETE",headers:headers(x.tenantId,x.correlationId)}));
    }

    actions.push(await json(URLS.documents+"/v1/documents/candidate/"+request.candidate_id,{method:"DELETE",headers:headers(x.tenantId,x.correlationId)}));
    actions.push(await json(URLS.applications+"/v1/applications/candidate/"+request.candidate_id+"/anonymise",{method:"POST",headers:h}));
    actions.push(await json(URLS.candidates+"/v1/candidates/"+request.candidate_id+"/anonymise",{method:"POST",headers:h}));

    const result={type:request.type,executedAt:new Date().toISOString(),before,actions};
    await pool.query("update privacy_requests set status='COMPLETED',completed_at=now(),result=null,result_encrypted=$3,result_expires_at=now()+interval '30 days' where tenant_id=$1 and id=$2",[x.tenantId,id,tenantEncrypt(x.tenantId,JSON.stringify(result))]);
    await privacyAudit(x.tenantId,request.candidate_id,request.type+"_COMPLETED",{requestId:id,actionCount:actions.length},c.req.header("x-actor")||null);
    return c.json({id,status:"COMPLETED",result});
  }catch(err){
    const message=err instanceof Error?err.message:String(err);
    await pool.query("update privacy_requests set status='FAILED',last_error=$3 where tenant_id=$1 and id=$2",[x.tenantId,id,message]);
    return c.json({id,status:"FAILED",error:message},502);
  }
});

app.get("/v1/privacy/retention-policies",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from retention_policies where tenant_id=$1 order by scope_type,scope_id,data_category",[x.tenantId])).rows);});
app.put("/v1/privacy/retention-policies/:scopeType/:scopeId/:category",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json()) as any,id=randomUUID();await pool.query("insert into retention_policies(id,tenant_id,scope_type,scope_id,data_category,retention_days,action,enabled) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(tenant_id,scope_type,scope_id,data_category) do update set retention_days=excluded.retention_days,action=excluded.action,enabled=excluded.enabled,updated_at=now()",[id,x.tenantId,c.req.param("scopeType").toUpperCase(),c.req.param("scopeId"),c.req.param("category"),Number(b.retentionDays),b.action||"ANONYMISE",b.enabled!==false]);return c.json({ok:true});});
app.get("/v1/privacy/legal-holds",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from legal_holds where tenant_id=$1 and released_at is null order by placed_at desc",[x.tenantId])).rows);});
app.post("/v1/privacy/legal-holds",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json()) as any,id=randomUUID();await pool.query("insert into legal_holds(id,tenant_id,candidate_id,reason,placed_by) values($1,$2,$3,$4,$5)",[id,x.tenantId,b.candidateId,String(b.reason),c.req.header("x-actor")||null]);return c.json({id},201);});
app.post("/v1/privacy/legal-holds/:id/release",async c=>{const x=context(c.req.raw.headers);const{rows}=await pool.query("update legal_holds set released_by=$3,released_at=now() where tenant_id=$1 and id=$2 and released_at is null returning *",[x.tenantId,c.req.param("id"),c.req.header("x-actor")||null]);return rows[0]?c.json(rows[0]):c.json({code:"NOT_FOUND",message:"Active legal hold not found"},404);});

app.get("/v1/privacy/notices/current",async c=>{const x=context(c.req.raw.headers);const row=(await pool.query("select id,version,title,content,effective_at,published_at from privacy_notices where tenant_id=$1 and status='PUBLISHED' and effective_at<=now() order by effective_at desc limit 1",[x.tenantId])).rows[0];return row?c.json(row):c.json({code:"NOT_FOUND",message:"No published privacy notice"},404);});
app.get("/v1/privacy/notices",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from privacy_notices where tenant_id=$1 order by effective_at desc",[x.tenantId])).rows);});
app.post("/v1/privacy/notices",async c=>{const x=context(c.req.raw.headers),b=z.object({version:z.string(),title:z.string(),content:z.string().min(20),effectiveAt:z.string().datetime(),status:z.enum(["DRAFT","PUBLISHED"]).default("DRAFT"),supersedesId:z.string().optional()}).parse(await c.req.json()),id=randomUUID();await pool.query("insert into privacy_notices(id,tenant_id,version,title,content,content_hash,effective_at,status,published_at,supersedes_id) values($1,$2,$3,$4,$5,$6,$7,$8,case when $8='PUBLISHED' then now() else null end,$9)",[id,x.tenantId,b.version,b.title,b.content,sha(b.content),b.effectiveAt,b.status,b.supersedesId||null]);await privacyAudit(x.tenantId,null,"PRIVACY_NOTICE_CREATED",{id,version:b.version,status:b.status},c.req.header("x-actor")||null);return c.json({id,...b},201);});
app.post("/v1/privacy/notices/:id/publish",async c=>{const x=context(c.req.raw.headers);const{rows}=await pool.query("update privacy_notices set status='PUBLISHED',published_at=now() where tenant_id=$1 and id=$2 returning *",[x.tenantId,c.req.param("id")]);if(!rows[0])return c.json({code:"NOT_FOUND",message:"Notice not found"},404);await privacyAudit(x.tenantId,null,"PRIVACY_NOTICE_PUBLISHED",{id:c.req.param("id"),version:rows[0].version},c.req.header("x-actor")||null);return c.json(rows[0]);});

app.post("/v1/privacy/consents/public",async c=>{const x=context(c.req.raw.headers),b=z.object({subjectType:z.enum(["VISITOR","CANDIDATE"]),subjectId:z.string().optional(),purpose:z.enum(["ANALYTICS","RECRUITMENT_MARKETING","TALENT_POOL"]),action:z.enum(["GRANTED","WITHDRAWN"]),noticeVersion:z.string().optional(),source:z.string().default("CAREERS"),metadata:z.record(z.string(),z.unknown()).optional()}).parse(await c.req.json()),id=randomUUID();await pool.query("insert into consent_events(id,tenant_id,subject_type,subject_id,purpose,action,notice_version,source,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",[id,x.tenantId,b.subjectType,b.subjectId||null,b.purpose,b.action,b.noticeVersion||null,b.source,JSON.stringify(b.metadata||{})]);return c.json({id,recorded:true},201);});
app.get("/v1/privacy/consents/:subjectType/:subjectId",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select distinct on(purpose) purpose,action,notice_version,source,metadata,occurred_at from consent_events where tenant_id=$1 and subject_type=$2 and subject_id=$3 order by purpose,occurred_at desc",[x.tenantId,c.req.param("subjectType"),c.req.param("subjectId")])).rows);});

app.post("/v1/privacy/requests/:id/verify-identity",async c=>{const x=context(c.req.raw.headers),id=c.req.param("id"),b=z.object({method:z.enum(["PORTAL_SESSION","DOCUMENT_CHECK","MANUAL_VERIFICATION","SSO"]),evidence:z.string().optional()}).parse(await c.req.json()),actor=c.req.header("x-actor")||null,req=(await pool.query("select * from privacy_requests where tenant_id=$1 and id=$2",[x.tenantId,id])).rows[0];if(!req)return c.json({code:"NOT_FOUND",message:"Privacy request not found"},404);await pool.query("insert into privacy_request_verifications(id,tenant_id,request_id,method,evidence_hash,verified_by) values($1,$2,$3,$4,$5,$6)",[randomUUID(),x.tenantId,id,b.method,b.evidence?sha(b.evidence):null,actor]);await pool.query("update privacy_requests set identity_verified_at=now(),identity_verified_by=$3,status=case when status='OPEN' then 'VERIFIED' else status end where tenant_id=$1 and id=$2",[x.tenantId,id,actor]);await privacyAudit(x.tenantId,req.candidate_id,"IDENTITY_VERIFIED",{requestId:id,method:b.method},actor);return c.json({id,status:"VERIFIED"});});
app.post("/v1/privacy/requests/:id/approve",async c=>{const x=context(c.req.raw.headers),id=c.req.param("id"),b=z.object({decision:z.enum(["APPROVED","REJECTED"]),reason:z.string().optional()}).parse(await c.req.json()),actor=c.req.header("x-actor")||null,req=(await pool.query("select * from privacy_requests where tenant_id=$1 and id=$2",[x.tenantId,id])).rows[0];if(!req)return c.json({code:"NOT_FOUND",message:"Privacy request not found"},404);if(!req.identity_verified_at)return c.json({code:"IDENTITY_VERIFICATION_REQUIRED",message:"Verify identity before approval"},409);await pool.query("insert into privacy_request_approvals(id,tenant_id,request_id,decision,reason,decided_by) values($1,$2,$3,$4,$5,$6)",[randomUUID(),x.tenantId,id,b.decision,b.reason||null,actor]);if(b.decision==="APPROVED")await pool.query("update privacy_requests set status='APPROVED',approved_at=now(),approved_by=$3,rejected_at=null,rejected_by=null,rejection_reason=null where tenant_id=$1 and id=$2",[x.tenantId,id,actor]);else await pool.query("update privacy_requests set status='REJECTED',rejected_at=now(),rejected_by=$3,rejection_reason=$4 where tenant_id=$1 and id=$2",[x.tenantId,id,actor,b.reason||"Not approved"]);await privacyAudit(x.tenantId,req.candidate_id,"PRIVACY_REQUEST_"+b.decision,{requestId:id,reason:b.reason||null},actor);return c.json({id,status:b.decision});});

app.get("/v1/privacy/requests/:id/export",async c=>{const x=context(c.req.raw.headers),id=c.req.param("id"),format=(c.req.query("format")||"json").toLowerCase(),req=(await pool.query("select * from privacy_requests where tenant_id=$1 and id=$2",[x.tenantId,id])).rows[0];if(!req||req.status!=="COMPLETED"||!req.result_encrypted)return c.json({code:"EXPORT_NOT_READY",message:"Completed privacy export not available"},404);if(req.result_expires_at&&new Date(req.result_expires_at)<new Date())return c.json({code:"EXPORT_EXPIRED",message:"Privacy export has expired"},410);const data=JSON.parse(tenantDecrypt(x.tenantId,req.result_encrypted));await pool.query("insert into privacy_exports(id,tenant_id,request_id,format,created_by,expires_at) values($1,$2,$3,$4,$5,now()+interval '15 minutes')",[randomUUID(),x.tenantId,id,format,c.req.header("x-actor")||null]);await privacyAudit(x.tenantId,req.candidate_id,"DSAR_EXPORTED",{requestId:id,format},c.req.header("x-actor")||null);if(format==="html"){const escaped=JSON.stringify(data,null,2).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");return c.html("<!doctype html><html><head><meta charset='utf-8'><title>Raeburn Talent privacy export</title></head><body><h1>Your Raeburn Talent recruitment data</h1><p>Export generated "+new Date().toISOString()+"</p><pre>"+escaped+"</pre></body></html>");}return c.json({requestId:id,generatedAt:new Date().toISOString(),data});});

function registryRoutes(path:string,table:string,required:string[]){
 app.get(path,async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from "+table+" where tenant_id=$1 order by created_at desc",[x.tenantId])).rows);});
}
registryRoutes("/v1/privacy/lawful-bases","lawful_bases",[]);
registryRoutes("/v1/privacy/legitimate-interests","legitimate_interest_assessments",[]);
registryRoutes("/v1/privacy/processing-activities","processing_activities",[]);
registryRoutes("/v1/privacy/subprocessors","subprocessors",[]);
registryRoutes("/v1/privacy/data-map","data_map_records",[]);
registryRoutes("/v1/privacy/data-residency","data_residency_records",[]);

app.post("/v1/privacy/lawful-bases",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json())as any,id=randomUUID();await pool.query("insert into lawful_bases(id,tenant_id,purpose,data_categories,lawful_basis,special_category_condition,article_reference,notes) values($1,$2,$3,$4::jsonb,$5,$6,$7,$8)",[id,x.tenantId,String(b.purpose),JSON.stringify(b.dataCategories||[]),String(b.lawfulBasis),b.specialCategoryCondition||null,b.articleReference||null,b.notes||null]);return c.json({id},201);});
app.post("/v1/privacy/legitimate-interests",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json())as any,id=randomUUID();await pool.query("insert into legitimate_interest_assessments(id,tenant_id,purpose,status,purpose_test,necessity_test,balancing_test,safeguards,approved_by,approved_at,review_due_at) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,case when $4='APPROVED' then now() else null end,$10)",[id,x.tenantId,String(b.purpose),b.status||"DRAFT",String(b.purposeTest),String(b.necessityTest),String(b.balancingTest),JSON.stringify(b.safeguards||[]),b.status==="APPROVED"?(c.req.header("x-actor")||null):null,b.reviewDueAt||null]);return c.json({id},201);});
app.post("/v1/privacy/processing-activities",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json())as any,id=randomUUID();await pool.query("insert into processing_activities(id,tenant_id,name,purpose,lawful_basis_id,data_subjects,data_categories,recipients,retention,systems,international_transfers,security_measures,owner) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13)",[id,x.tenantId,String(b.name),String(b.purpose),b.lawfulBasisId||null,JSON.stringify(b.dataSubjects||[]),JSON.stringify(b.dataCategories||[]),JSON.stringify(b.recipients||[]),b.retention||null,JSON.stringify(b.systems||[]),JSON.stringify(b.internationalTransfers||[]),JSON.stringify(b.securityMeasures||[]),b.owner||null]);return c.json({id},201);});
app.post("/v1/privacy/subprocessors",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json())as any,id=randomUUID();await pool.query("insert into subprocessors(id,tenant_id,name,purpose,country,data_categories,transfer_mechanism,dpa_reference,status,review_due_at) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)",[id,x.tenantId,String(b.name),String(b.purpose),b.country||null,JSON.stringify(b.dataCategories||[]),b.transferMechanism||null,b.dpaReference||null,b.status||"ACTIVE",b.reviewDueAt||null]);return c.json({id},201);});
app.post("/v1/privacy/data-map",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json())as any,id=randomUUID();await pool.query("insert into data_map_records(id,tenant_id,system,data_category,source,destination,storage_location,classification,encrypted,owner,retention_policy_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[id,x.tenantId,String(b.system),String(b.dataCategory),b.source||null,b.destination||null,b.storageLocation||null,b.classification||"PERSONAL",b.encrypted!==false,b.owner||null,b.retentionPolicyId||null]);return c.json({id},201);});
app.post("/v1/privacy/data-residency",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json())as any,id=randomUUID();await pool.query("insert into data_residency_records(id,tenant_id,system,provider,region,country,transfer_mechanism,approved,reviewed_by,reviewed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,case when $8 then now() else null end) on conflict(tenant_id,system,region) do update set provider=excluded.provider,country=excluded.country,transfer_mechanism=excluded.transfer_mechanism,approved=excluded.approved,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at",[id,x.tenantId,String(b.system),b.provider||null,String(b.region),String(b.country),b.transferMechanism||null,!!b.approved,b.approved?(c.req.header("x-actor")||null):null]);return c.json({id},201);});


app.get("/v1/privacy/compliance-signoffs",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from compliance_signoffs where tenant_id=$1 order by created_at desc",[x.tenantId])).rows);});
app.post("/v1/privacy/compliance-signoffs",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json())as any,id=randomUUID();await pool.query("insert into compliance_signoffs(id,tenant_id,area,version,status,reviewer_name,reviewer_role,reviewer_organisation,evidence_reference,notes,decided_at,review_due_at,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $5 in ('APPROVED','REJECTED') then now() else null end,$11,$12) on conflict(tenant_id,area,version) do update set status=excluded.status,reviewer_name=excluded.reviewer_name,reviewer_role=excluded.reviewer_role,reviewer_organisation=excluded.reviewer_organisation,evidence_reference=excluded.evidence_reference,notes=excluded.notes,decided_at=excluded.decided_at,review_due_at=excluded.review_due_at",[id,x.tenantId,String(b.area),String(b.version),b.status||"PENDING",b.reviewerName||null,b.reviewerRole||null,b.reviewerOrganisation||null,b.evidenceReference||null,b.notes||null,b.reviewDueAt||null,c.req.header("x-actor")||null]);await privacyAudit(x.tenantId,null,"COMPLIANCE_SIGNOFF_RECORDED",{area:b.area,version:b.version,status:b.status||"PENDING",reviewerRole:b.reviewerRole||null},c.req.header("x-actor")||null);return c.json({id,status:b.status||"PENDING"},201);});
app.get("/v1/privacy/audit",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from privacy_audit where tenant_id=$1 order by created_at desc limit 500",[x.tenantId])).rows);});

app.get("/v1/privacy/complaints",async c=>{const x=context(c.req.raw.headers),status=c.req.query("status"),values:any[]=[x.tenantId];let sql="select * from privacy_complaints where tenant_id=$1";if(status){values.push(status.toUpperCase());sql+=" and status=$"+values.length;}sql+=" order by received_at desc limit 500";return c.json((await pool.query(sql,values)).rows);});
app.post("/v1/privacy/complaints",async c=>{const x=context(c.req.raw.headers),b=z.object({subjectType:z.string().default("CANDIDATE"),subjectId:z.string().optional(),candidateId:z.string().optional(),requestId:z.string().optional(),category:z.string().min(2),summary:z.string().min(5),channel:z.string().optional(),reviewDueAt:z.string().datetime().optional()}).parse(await c.req.json()),id=randomUUID(),actor=c.req.header("x-actor")||null;await pool.query("insert into privacy_complaints(id,tenant_id,subject_type,subject_id,candidate_id,request_id,category,summary,channel,review_due_at,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[id,x.tenantId,b.subjectType.toUpperCase(),b.subjectId||null,b.candidateId||null,b.requestId||null,b.category,b.summary,b.channel||null,b.reviewDueAt||null,actor]);await privacyAudit(x.tenantId,b.candidateId||null,"PRIVACY_COMPLAINT_CREATED",{complaintId:id,category:b.category,requestId:b.requestId||null},actor);return c.json({id,status:"OPEN"},201);});
app.post("/v1/privacy/complaints/:id/acknowledge",async c=>{const x=context(c.req.raw.headers),actor=c.req.header("x-actor")||null;const{rows}=await pool.query("update privacy_complaints set status=case when status='OPEN' then 'ACKNOWLEDGED' else status end,acknowledged_at=coalesce(acknowledged_at,now()),owner=coalesce(owner,$3),updated_at=now() where tenant_id=$1 and id=$2 returning *",[x.tenantId,c.req.param("id"),actor]);if(!rows[0])return c.json({code:"NOT_FOUND",message:"Privacy complaint not found"},404);await privacyAudit(x.tenantId,rows[0].candidate_id,"PRIVACY_COMPLAINT_ACKNOWLEDGED",{complaintId:rows[0].id},actor);return c.json(rows[0]);});
app.post("/v1/privacy/complaints/:id/resolve",async c=>{const x=context(c.req.raw.headers),b=z.object({outcome:z.string().min(2),reason:z.string().min(5)}).parse(await c.req.json()),actor=c.req.header("x-actor")||null;const{rows}=await pool.query("update privacy_complaints set status='RESOLVED',outcome=$3,outcome_reason=$4,resolved_at=now(),owner=coalesce(owner,$5),updated_at=now() where tenant_id=$1 and id=$2 returning *",[x.tenantId,c.req.param("id"),b.outcome,b.reason,actor]);if(!rows[0])return c.json({code:"NOT_FOUND",message:"Privacy complaint not found"},404);await privacyAudit(x.tenantId,rows[0].candidate_id,"PRIVACY_COMPLAINT_RESOLVED",{complaintId:rows[0].id,outcome:b.outcome},actor);return c.json(rows[0]);});

serve({fetch:app.fetch,port:Number(process.env.PORT||4113)});