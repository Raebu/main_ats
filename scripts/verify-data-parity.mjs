import pg from"pg";
const legacy=process.env.LEGACY_DATABASE_URL,api=process.env.PRODUCTION_API_URL,token=process.env.PRODUCTION_ADMIN_TOKEN,tenant=process.env.PRODUCTION_TENANT_ID||"tenant_raeburn_group";
if(!legacy||!api||!token)throw new Error("LEGACY_DATABASE_URL, PRODUCTION_API_URL and PRODUCTION_ADMIN_TOKEN are required");
const client=new pg.Client({connectionString:legacy});await client.connect();
const legacyCounts={jobs:Number((await client.query('select count(*) n from "Job"')).rows[0].n),candidates:Number((await client.query('select count(*) n from "Candidate"')).rows[0].n),applications:Number((await client.query('select count(*) n from "Application"')).rows[0].n)};
await client.end();
async function get(path){const r=await fetch(api.replace(/\/$/,"")+path,{headers:{authorization:"Bearer "+token,"x-tenant-id":tenant}});if(!r.ok)throw new Error(path+" returned "+r.status);return r.json();}
const[jobs,candidates,applications]=await Promise.all([get("/v1/jobs"),get("/v1/candidates?limit=100000"),get("/v1/applications")]);
const targetCounts={jobs:jobs.length,candidates:candidates.length,applications:applications.length};
const delta=Object.fromEntries(Object.keys(legacyCounts).map(k=>[k,targetCounts[k]-legacyCounts[k]]));
const ok=Object.values(delta).every(v=>v===0);
console.log(JSON.stringify({ok,legacyCounts,targetCounts,delta,checkedAt:new Date().toISOString()},null,2));
if(!ok)process.exit(1);
