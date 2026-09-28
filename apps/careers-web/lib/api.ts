import{headers}from"next/headers";
const API=process.env.TALENT_API_URL||"http://localhost:4100",defaultTenant=process.env.TALENT_TENANT_ID||"tenant_raeburn_group";
export async function tenantContext(){const h=await headers(),host=(h.get("x-forwarded-host")||h.get("host")||"").split(",")[0].trim().toLowerCase().replace(/:\d+$/,"");if(!host)return{tenantId:defaultTenant,brand:null};try{const r=await fetch(API+"/v1/platform/public/resolve-domain?host="+encodeURIComponent(host),{cache:"no-store"});if(r.ok){const d:any=await r.json();return{tenantId:d.tenant_id||defaultTenant,brand:d.brand||null,name:d.name||null,region:d.region||null};}}catch{}return{tenantId:defaultTenant,brand:null};}
async function tenantHeaders(){const x=await tenantContext();return{"x-tenant-id":x.tenantId};}
export async function jobs(){const r=await fetch(API+"/v1/jobs/public",{headers:await tenantHeaders(),cache:"no-store"});if(!r.ok)throw new Error("Jobs unavailable");return r.json();}
export async function jobBySlug(slug:string){const r=await fetch(API+"/v1/jobs/public/"+encodeURIComponent(slug),{headers:await tenantHeaders(),cache:"no-store"});if(!r.ok)return null;return r.json();}
export async function jobsForGateway(gateway:string){const rows:any[]=await jobs();if(gateway==="mainstream")return rows;return rows.filter(j=>(j.audiences||[]).includes(gateway));}
export async function campaign(slug:string){const r=await fetch(API+"/v1/campaigns/public/"+encodeURIComponent(slug),{headers:await tenantHeaders(),cache:"no-store"});if(!r.ok)return null;return r.json();}
