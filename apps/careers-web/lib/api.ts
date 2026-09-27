const API=process.env.TALENT_API_URL||"http://localhost:4100";const tenant=process.env.TALENT_TENANT_ID||"tenant_raeburn_group";
const headers={"x-tenant-id":tenant};
export async function jobs(){const r=await fetch(API+"/v1/jobs/public",{headers,cache:"no-store"});if(!r.ok)throw new Error("Jobs unavailable");return r.json();}
export async function jobBySlug(slug:string){const r=await fetch(API+"/v1/jobs/public/"+encodeURIComponent(slug),{headers,cache:"no-store"});if(!r.ok)return null;return r.json();}
export async function jobsForGateway(gateway:string){const rows:any[]=await jobs();if(gateway==="mainstream")return rows;return rows.filter(j=>(j.audiences||[]).includes(gateway));}