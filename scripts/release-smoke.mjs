const base=(process.env.SMOKE_BASE_URL||"").replace(/\/$/,"");
if(!base)throw new Error("SMOKE_BASE_URL is required");
for(const path of ["/health","/v1/jobs/public"]){
  const response=await fetch(base+path,{headers:{"x-tenant-id":"tenant_raeburn_group"}});
  if(!response.ok)throw new Error(path+" failed "+response.status);
}
console.log(JSON.stringify({ok:true,base}));