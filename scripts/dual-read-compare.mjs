import{createHash}from"node:crypto";
const legacy=process.env.LEGACY_SNAPSHOT_URL,secret=process.env.MIGRATION_READ_SECRET,api=process.env.PRODUCTION_API_URL,token=process.env.PRODUCTION_ADMIN_TOKEN,tenant=process.env.PRODUCTION_TENANT_ID||"tenant_raeburn_group";
if(!legacy||!secret||!api||!token)throw new Error("LEGACY_SNAPSHOT_URL, MIGRATION_READ_SECRET, PRODUCTION_API_URL and PRODUCTION_ADMIN_TOKEN are required");
const lr=await fetch(legacy,{headers:{authorization:"Bearer "+secret}});if(!lr.ok)throw new Error("legacy snapshot "+lr.status);const l=await lr.json();
async function get(path){const r=await fetch(api.replace(/\/$/,"")+path,{headers:{authorization:"Bearer "+token,"x-tenant-id":tenant}});if(!r.ok)throw new Error(path+" "+r.status);return r.json();}
const[jobs,candidates,applications]=await Promise.all([get("/v1/jobs"),get("/v1/candidates?limit=100000"),get("/v1/applications")]);
const target={jobs:jobs.length,candidates:candidates.length,applications:applications.length},delta=Object.fromEntries(Object.keys(l.counts).map(k=>[k,target[k]-Number(l.counts[k]||0)]));
const legacyJobs=new Set((l.jobs||[]).map(x=>x.reference||x.slug)),targetJobs=new Set(jobs.map(x=>x.reference||x.slug)),missingJobs=[...legacyJobs].filter(x=>!targetJobs.has(x));
const digest=createHash("sha256").update(JSON.stringify({legacy:l.counts,target,delta,missingJobs})).digest("hex");
const ok=Object.values(delta).every(v=>v===0)&&missingJobs.length===0;console.log(JSON.stringify({ok,legacy:l.counts,target,delta,missingJobs,digest,checkedAt:new Date().toISOString()},null,2));if(!ok)process.exit(1);
