const API=(process.env.SYNTHETIC_API_URL||process.env.TALENT_API_URL||"http://localhost:4100").replace(/\/$/,"");
const tenant=process.env.SYNTHETIC_TENANT_ID||"tenant_raeburn_group";
const started=Date.now(),timeout=Number(process.env.SYNTHETIC_TIMEOUT_MS||15000);
async function request(path,init={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(API+path,{...init,signal:controller.signal,headers:{"x-tenant-id":tenant,...(init.headers||{})}});}
  finally{clearTimeout(timer);}
}
const health=await request("/health");if(!health.ok)throw new Error("gateway health failed: "+health.status);
const jobs=await request("/v1/jobs/public");if(!jobs.ok)throw new Error("public jobs failed: "+jobs.status);
const list=await jobs.json(),items=Array.isArray(list)?list:(list.jobs||[]);
if(!items.length){console.log(JSON.stringify({ok:true,mode:"read-only",reason:"no published vacancies",durationMs:Date.now()-started}));process.exit(0);}
const job=process.env.SYNTHETIC_JOB_ID?items.find(j=>j.id===process.env.SYNTHETIC_JOB_ID):items[0];
if(!job)throw new Error("configured synthetic job is not published");
if(process.env.SYNTHETIC_SUBMIT!=="true"){console.log(JSON.stringify({ok:true,mode:"read-only",jobId:job.id,durationMs:Date.now()-started}));process.exit(0);}
const suffix=Date.now();
const body={tenantId:tenant,jobId:job.id,candidate:{name:"Synthetic Monitor",email:"synthetic+"+suffix+"@example.invalid"},privacyNoticeVersion:"synthetic-monitor",privacyAcceptedAt:new Date().toISOString(),answers:[],attribution:{acquisitionSource:"synthetic-monitor",utmSource:"synthetic-monitor"}};
const response=await request("/v1/applications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const result=await response.json().catch(()=>({}));
if(!response.ok)throw new Error("synthetic application failed: "+response.status+" "+JSON.stringify(result));
console.log(JSON.stringify({ok:true,mode:"submit",applicationId:result.id,jobId:job.id,durationMs:Date.now()-started}));
