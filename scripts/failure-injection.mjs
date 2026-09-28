const api=(process.env.TALENT_API_URL||"http://127.0.0.1:4100").replace(/\/$/,"");
const malformed=await fetch(api+"/v1/applications",{method:"POST",headers:{"content-type":"application/json","x-tenant-id":"tenant_raeburn_group"},body:"{"});
if(malformed.status<400||malformed.status>=500)throw new Error("malformed request was not safely rejected: "+malformed.status);
const health=await fetch(api+"/health");if(!health.ok)throw new Error("gateway unhealthy after failure injection");
console.log(JSON.stringify({ok:true,malformed:malformed.status}));