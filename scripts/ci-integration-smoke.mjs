const API=(process.env.TALENT_API_URL||"http://127.0.0.1:4100").replace(/\/$/,"");
const JOBS=(process.env.JOBS_URL||"http://127.0.0.1:4101").replace(/\/$/,"");
const DISTRIBUTION=(process.env.DISTRIBUTION_URL||"http://127.0.0.1:4108").replace(/\/$/,"");
const tenant="tenant_raeburn_group";

async function call(base,path,init={}){
  const response=await fetch(base+path,{...init,headers:{"content-type":"application/json","x-tenant-id":tenant,...(init.headers||{})}});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error((init.method||"GET")+" "+path+" -> "+response.status+" "+JSON.stringify(body));
  return body;
}

await call(API,"/health",{method:"GET",headers:{}});
const stamp=Date.now();
const job=await call(JOBS,"/v1/jobs",{method:"POST",headers:{"x-organisation-ids":"*"},body:JSON.stringify({
  reference:"CI-"+stamp,slug:"ci-stage10-"+stamp,title:"Stage 10 Integration Vacancy",
  hiringOrganisationId:"org_raeburn_group",location:"Eastleigh, UK",workplaceType:"HYBRID",employmentType:"PERMANENT",
  summary:"Disposable CI vacancy",description:"Created by Stage 10 integration testing.",
  requirements:"Integration test requirements.",benefits:"Test benefits",audiences:["MAINSTREAM"]
})});
await call(JOBS,"/v1/jobs/"+job.id+"/publish",{method:"POST",headers:{"x-organisation-ids":"*"},body:"{}"});

const published=await call(API,"/v1/jobs/public",{method:"GET",headers:{}});
const jobs=Array.isArray(published)?published:(published.jobs||[]);
if(!jobs.some(j=>j.id===job.id))throw new Error("published vacancy missing from public API");

const requiredBuiltIns=["raeburn-mainstream","google-jobs","json-feed","xml-feed","csv-feed"];
let publications=[];
for(let attempt=0;attempt<80;attempt++){
  publications=await call(DISTRIBUTION,"/v1/distribution/jobs/"+job.id,{method:"GET",headers:{}});
  if(requiredBuiltIns.every(destination=>publications.some(p=>p.destination===destination&&p.status==="LIVE")))break;
  await new Promise(resolve=>setTimeout(resolve,250));
}
for(const destination of requiredBuiltIns){
  if(!publications.some(p=>p.destination===destination&&p.status==="LIVE"))throw new Error("distribution worker did not finish built-in publication: "+destination);
}
const jsonFeed=await call(DISTRIBUTION,"/v1/distribution/feeds/json",{method:"GET",headers:{}});
if(!(Array.isArray(jsonFeed)?jsonFeed:[]).some(j=>j.id===job.id))throw new Error("JSON distribution feed missing published vacancy");


const application=await call(API,"/v1/applications",{method:"POST",body:JSON.stringify({
  tenantId:tenant,jobId:job.id,candidate:{name:"Stage Ten Synthetic",email:"stage10+"+stamp+"@example.invalid"},
  answers:[],privacyNoticeVersion:"ci-stage10",privacyAcceptedAt:new Date().toISOString(),
  attribution:{acquisitionSource:"stage10-integration",utmSource:"github-actions"}
})});
if(!application.id||!application.candidateId||!application.candidatePortalToken||!application.documentUploadToken){
  throw new Error("application response missing Stage 10 identifiers/tokens");
}

const portal=await call(API,"/v1/applications/portal/session",{method:"GET",headers:{authorization:"Bearer "+application.candidatePortalToken}});
if(portal.application?.id!==application.id)throw new Error("candidate portal session does not resolve submitted application");

const privacy=await call(API,"/v1/applications/portal/privacy-request",{
  method:"POST",
  headers:{authorization:"Bearer "+application.candidatePortalToken},
  body:JSON.stringify({type:"DSAR"})
});
if(!privacy.id||privacy.identityVerified!==true)throw new Error("portal DSAR was not created and identity-verified");

await call(JOBS,"/v1/jobs/"+job.id+"/close",{method:"POST",headers:{"x-organisation-ids":"*"},body:"{}"});
console.log(JSON.stringify({
  ok:true,jobId:job.id,applicationId:application.id,candidateId:application.candidateId,
  privacyRequestId:privacy.id,
  distributionDestinations:publications.map(p=>({destination:p.destination,status:p.status}))
}));