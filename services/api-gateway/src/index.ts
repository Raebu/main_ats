import{randomUUID}from"node:crypto";import{serve}from"@hono/node-server";import{Hono}from"hono";
const app=new Hono(),IDENTITY=process.env.IDENTITY_URL||"http://localhost:4109";
const routes=[
 ["/v1/jobs",process.env.JOBS_URL||"http://localhost:4101"],["/v1/candidates",process.env.CANDIDATES_URL||"http://localhost:4102"],["/v1/applications",process.env.APPLICATIONS_URL||"http://localhost:4103"],["/v1/attribution",process.env.ATTRIBUTION_URL||"http://localhost:4104"],["/v1/workflow",process.env.WORKFLOW_URL||"http://localhost:4105"],["/v1/documents",process.env.DOCUMENTS_URL||"http://localhost:4106"],["/v1/communications",process.env.COMMUNICATIONS_URL||"http://localhost:4107"],["/v1/distribution",process.env.DISTRIBUTION_URL||"http://localhost:4108"],["/v1/identity",IDENTITY],["/v1/organisations",process.env.ORGANISATIONS_URL||"http://localhost:4110"],["/v1/audit",process.env.AUDIT_URL||"http://localhost:4111"],["/v1/notifications",process.env.NOTIFICATIONS_URL||"http://localhost:4112"],["/v1/privacy",process.env.PRIVACY_URL||"http://localhost:4113"],["/v1/interviews",process.env.INTERVIEWS_URL||"http://localhost:4114"],["/v1/assessments",process.env.ASSESSMENTS_URL||"http://localhost:4115"],["/v1/offers",process.env.OFFERS_URL||"http://localhost:4116"],["/v1/talent-pools",process.env.TALENT_POOLS_URL||"http://localhost:4117"],["/v1/careers-gateways",process.env.CAREERS_GATEWAY_URL||"http://localhost:4118"],["/v1/config",process.env.CONFIGURATION_URL||"http://localhost:4119"],["/v1/flags",process.env.FEATURE_FLAGS_URL||"http://localhost:4120"],["/v1/campaigns",process.env.CAMPAIGNS_URL||"http://localhost:4121"],["/v1/hooks",process.env.WEBHOOKS_URL||"http://localhost:4122"],["/v1/integrations",process.env.INTEGRATIONS_URL||"http://localhost:4123"],["/v1/analytics",process.env.ANALYTICS_URL||"http://localhost:4124"],["/v1/search",process.env.SEARCH_URL||"http://localhost:4125"],["/v1/intelligence",process.env.INTELLIGENCE_URL||"http://localhost:4126"],["/v1/scheduled-actions",process.env.SCHEDULER_URL||"http://localhost:4127"],["/v1/onboarding",process.env.ONBOARDING_URL||"http://localhost:4128"]
] as const;

const isPublic=(method:string,path:string)=>
 (method==="GET"&&path.startsWith("/v1/jobs/public"))||
 (method==="GET"&&path.startsWith("/v1/distribution/feeds/"))||
 (method==="POST"&&path==="/v1/applications")||
 (method==="POST"&&path==="/v1/attribution/touchpoints")||
 (method==="POST"&&path==="/v1/documents/upload")||
 (method==="POST"&&/^\/v1\/documents\/[^/]+\/complete$/.test(path))||
 (method==="POST"&&path==="/v1/identity/login");

function requiredPermission(method:string,path:string){
 const write=!["GET","HEAD"].includes(method);
 const rules:[RegExp,string,string?][]=[
  [/^\/v1\/jobs/,"jobs:read","jobs:write"],
  [/^\/v1\/candidates/,"candidates:read","candidates:write"],
  [/^\/v1\/applications/,"applications:read"],
  [/^\/v1\/workflow/,"workflow:read","workflow:write"],
  [/^\/v1\/documents/,"documents:read"],
  [/^\/v1\/communications/,"communications:read"],
  [/^\/v1\/distribution/,"distribution:read","distribution:write"],
  [/^\/v1\/identity/,"identity:write","identity:write"],
  [/^\/v1\/organisations/,"organisations:read","organisations:write"],
  [/^\/v1\/audit/,"audit:read"],
  [/^\/v1\/notifications/,"notifications:read","notifications:write"],
  [/^\/v1\/privacy/,"privacy:read","privacy:write"],
  [/^\/v1\/interviews/,"interviews:read","interviews:write"],
  [/^\/v1\/assessments/,"assessments:read","assessments:write"],
  [/^\/v1\/offers/,"offers:read","offers:write"],
  [/^\/v1\/talent-pools/,"talent-pools:read","talent-pools:write"],
  [/^\/v1\/careers-gateways/,"jobs:read","jobs:write"],
  [/^\/v1\/config/,"config:read","config:write"],
  [/^\/v1\/flags/,"config:read","config:write"],
  [/^\/v1\/campaigns/,"campaigns:read","campaigns:write"],
  [/^\/v1\/hooks/,"integrations:write","integrations:write"],
  [/^\/v1\/integrations/,"integrations:read","integrations:write"],
  [/^\/v1\/analytics/,"analytics:read"],
  [/^\/v1\/search/,"search:read"],
  [/^\/v1\/intelligence/,"intelligence:use","intelligence:use"],
  [/^\/v1\/scheduled-actions/,"scheduler:read","scheduler:write"],[/^\/v1\/onboarding/,"onboarding:read","onboarding:write"]
 ];
 for(const [re,read,writePerm] of rules)if(re.test(path))return write?(writePerm||read):read;
 return "platform:access";
}

app.use("*",async(c,next)=>{const started=Date.now();await next();c.header("server-timing","gateway;dur="+(Date.now()-started));});
app.get("/health",c=>c.json({service:"api-gateway",status:"healthy",time:new Date().toISOString()}));
app.get("/health/services",async c=>{const auth=c.req.header("authorization");if(!auth)return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);const verify=await fetch(IDENTITY+"/v1/identity/introspect",{headers:{authorization:auth}});if(!verify.ok)return c.json({code:"UNAUTHENTICATED",message:"Invalid or expired session"},401);const checks=await Promise.all(routes.map(async([prefix,base])=>{try{const r=await fetch(base+"/health",{signal:AbortSignal.timeout(2500)});const body=await r.json().catch(()=>({}));return{route:prefix,status:r.ok?"healthy":"degraded",service:(body as any).service||base};}catch{return{route:prefix,status:"down",service:base};}}));return c.json({service:"api-gateway",status:checks.every(x=>x.status==="healthy")?"healthy":"degraded",checks,time:new Date().toISOString()});});

app.all("/v1/*",async c=>{
 const url=new URL(c.req.url),correlationId=c.req.header("x-correlation-id")||randomUUID();
 let tenantId=c.req.header("x-tenant-id")||process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group";
 let claims:any=null;

 if(!isPublic(c.req.method,url.pathname)){
   const auth=c.req.header("authorization");
   if(!auth)return c.json({code:"UNAUTHENTICATED",message:"Authentication required",correlationId},401);
   const verify=await fetch(IDENTITY+"/v1/identity/introspect",{headers:{authorization:auth}});
   if(!verify.ok)return c.json({code:"UNAUTHENTICATED",message:"Invalid or expired session",correlationId},401);
   claims=await verify.json();
   tenantId=claims.tenantId||tenantId;
   const permissions:string[]=Array.isArray(claims.permissions)?claims.permissions:[];
   const needed=requiredPermission(c.req.method,url.pathname);
   if(!permissions.includes("*")&&!permissions.includes(needed))
     return c.json({code:"FORBIDDEN",message:"Permission required: "+needed,correlationId},403);
 }

 const match=routes.find(([prefix])=>url.pathname.startsWith(prefix));
 if(!match)return c.json({code:"ROUTE_NOT_FOUND",message:"No service route",correlationId},404);
 const target=new URL(url.pathname+url.search,match[1]);
 const headers=new Headers(c.req.raw.headers);
 headers.set("x-correlation-id",correlationId);
 headers.set("x-tenant-id",tenantId);
 if(claims?.sub)headers.set("x-actor",String(claims.sub));
 if(claims?.email)headers.set("x-actor-email",String(claims.email));
 headers.delete("host");
 const init:any={method:c.req.method,headers,body:["GET","HEAD"].includes(c.req.method)?undefined:c.req.raw.body};
 if(init.body)init.duplex="half";
 const response=await fetch(target,init);
 const outHeaders=new Headers(response.headers);
 outHeaders.set("x-correlation-id",correlationId);
 return new Response(response.body,{status:response.status,headers:outHeaders});
});

serve({fetch:app.fetch,port:Number(process.env.PORT||4100)});