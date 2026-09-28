import{randomUUID}from"node:crypto";
import bcrypt from"bcryptjs";
import pg from"pg";

const API=(process.env.TALENT_API_URL||"http://127.0.0.1:4100").replace(/\/$/,"");
const tenant="tenant_raeburn_group",foreignTenant="tenant_stage10_isolation";
const identityUrl=process.env.IDENTITY_TEST_DATABASE_URL||"postgresql://postgres:postgres@localhost:6432/identity";
const jobsUrl=process.env.JOBS_TEST_DATABASE_URL||"postgresql://postgres:postgres@localhost:6432/jobs";
const identity=new pg.Client({connectionString:identityUrl}),jobs=new pg.Client({connectionString:jobsUrl});
const stamp=Date.now(),userId=randomUUID(),foreignJobId=randomUUID(),email="stage10-viewer-"+stamp+"@example.invalid",password="Stage10-Viewer-"+stamp+"!";

async function request(path,init={}){
 const r=await fetch(API+path,{...init,headers:{"content-type":"application/json",...(init.headers||{})}});
 const body=await r.json().catch(()=>null);return{r,body};
}
await identity.connect();await jobs.connect();
try{
 const passwordHash=await bcrypt.hash(password,10);
 await identity.query("insert into users(id,tenant_id,email,display_name,password_hash,status) values($1,$2,$3,$4,$5,'ACTIVE')",[userId,tenant,email,"Stage 10 Viewer",passwordHash]);
 await identity.query("insert into memberships(user_id,tenant_id,organisation_id,role,permissions) values($1,$2,'org_raeburn_group','VIEWER',$3::jsonb)",[userId,tenant,JSON.stringify(["jobs:read"])]);
 await jobs.query(`insert into jobs(id,tenant_id,reference,slug,title,hiring_organisation_id,location,workplace_type,employment_type,summary,description,requirements,status,audiences,version,date_posted)
 values($1,$2,$3,$4,'Foreign tenant sentinel','org_foreign','Remote','REMOTE','PERMANENT','Isolation sentinel','Must never be visible cross tenant','None','PUBLISHED','["MAINSTREAM"]'::jsonb,1,now())`,
 [foreignJobId,foreignTenant,"ISO-"+stamp,"foreign-tenant-"+stamp]);

 const login=await request("/v1/identity/login",{method:"POST",body:JSON.stringify({email,password})});
 if(!login.r.ok||!login.body?.accessToken)throw new Error("viewer login failed: "+login.r.status+" "+JSON.stringify(login.body));
 const auth={authorization:"Bearer "+login.body.accessToken,"x-tenant-id":foreignTenant};

 const allowed=await request("/v1/jobs",{headers:auth});
 if(!allowed.r.ok)throw new Error("viewer jobs read failed: "+allowed.r.status+" "+JSON.stringify(allowed.body));
 if((Array.isArray(allowed.body)?allowed.body:[]).some(j=>j.id===foreignJobId))throw new Error("authenticated tenant isolation failed: foreign tenant job visible");

 const denied=await request("/v1/jobs",{method:"POST",headers:auth,body:JSON.stringify({})});
 if(denied.r.status!==403)throw new Error("RBAC write denial expected 403, received "+denied.r.status+" "+JSON.stringify(denied.body));

 const publicSpoof=await request("/v1/jobs/public",{headers:{"x-tenant-id":foreignTenant}});
 if(!publicSpoof.r.ok)throw new Error("public jobs request failed: "+publicSpoof.r.status);
 if((Array.isArray(publicSpoof.body)?publicSpoof.body:[]).some(j=>j.id===foreignJobId))throw new Error("public tenant spoofing exposed foreign tenant data");

 const unauth=await request("/v1/candidates");
 if(unauth.r.status!==401)throw new Error("protected route should reject unauthenticated access");

 console.log(JSON.stringify({ok:true,rbac:true,authenticatedTenantIsolation:true,publicTenantIsolation:true,protectedRoutes:true}));
}finally{
 await identity.query("delete from auth_sessions where user_id=$1",[userId]).catch(()=>{});
 await identity.query("delete from refresh_tokens where user_id=$1",[userId]).catch(()=>{});
 await identity.query("delete from memberships where user_id=$1",[userId]).catch(()=>{});
 await identity.query("delete from users where id=$1",[userId]).catch(()=>{});
 await jobs.query("delete from jobs where id=$1",[foreignJobId]).catch(()=>{});
 await identity.end();await jobs.end();
}
