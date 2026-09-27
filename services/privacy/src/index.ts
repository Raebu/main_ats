import{randomUUID}from"node:crypto";
import{serve}from"@hono/node-server";
import{Hono}from"hono";
import{z}from"zod";
import{context,health,pool}from"@raeburn/service-kit";

const app=new Hono();
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
  return h;
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
  await pool.query("insert into privacy_requests(id,tenant_id,candidate_id,type) values($1,$2,$3,$4)",[id,x.tenantId,b.candidateId,b.type]);
  return c.json({id,status:"OPEN"},201);
});

app.post("/v1/privacy/requests/:id/execute",async c=>{
  const x=context(c.req.raw.headers),id=c.req.param("id");
  const request=(await pool.query("select * from privacy_requests where tenant_id=$1 and id=$2",[x.tenantId,id])).rows[0];
  if(!request)return c.json({code:"NOT_FOUND",message:"Privacy request not found"},404);
  if(request.status==="COMPLETED")return c.json(request);

  await pool.query("update privacy_requests set status='IN_PROGRESS',started_at=now(),last_error=null where tenant_id=$1 and id=$2",[x.tenantId,id]);

  try{
    const before=await snapshot(x.tenantId,x.correlationId,request.candidate_id);
    if(request.type==="DSAR"){
      await pool.query("update privacy_requests set status='COMPLETED',completed_at=now(),result=$3::jsonb where tenant_id=$1 and id=$2",[x.tenantId,id,JSON.stringify({type:"DSAR",data:before})]);
      return c.json({id,status:"COMPLETED",result:{type:"DSAR",data:before}});
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
    await pool.query("update privacy_requests set status='COMPLETED',completed_at=now(),result=$3::jsonb where tenant_id=$1 and id=$2",[x.tenantId,id,JSON.stringify(result)]);
    return c.json({id,status:"COMPLETED",result});
  }catch(err){
    const message=err instanceof Error?err.message:String(err);
    await pool.query("update privacy_requests set status='FAILED',last_error=$3 where tenant_id=$1 and id=$2",[x.tenantId,id,message]);
    return c.json({id,status:"FAILED",error:message},502);
  }
});

serve({fetch:app.fetch,port:Number(process.env.PORT||4113)});