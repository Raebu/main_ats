import{createHash,randomUUID}from"node:crypto";import{serve}from"@hono/node-server";import{Hono}from"hono";import{requiredPermission,hasPermission}from"@raeburn/policy";import{serviceAuthHeaders}from"@raeburn/service-kit";
const app=new Hono(),IDENTITY=process.env.IDENTITY_URL||"http://localhost:4109",AUDIT=process.env.AUDIT_URL||"http://localhost:4111";
const rate=new Map<string,{count:number;reset:number}>();
const maxBody=Number(process.env.MAX_REQUEST_BYTES||12*1024*1024);
const allowedOrigins=(process.env.CORS_ORIGINS||"https://theraeburngroup.com,https://talent.theraeburngroup.com").split(",").map(x=>x.trim()).filter(Boolean);
function rateAllowed(key:string,limit:number){const now=Date.now(),existing=rate.get(key);if(!existing||existing.reset<=now){rate.set(key,{count:1,reset:now+60000});return true;}existing.count++;return existing.count<=limit;}

const routes=[
 ["/v1/jobs",process.env.JOBS_URL||"http://localhost:4101"],["/v1/candidates",process.env.CANDIDATES_URL||"http://localhost:4102"],["/v1/applications",process.env.APPLICATIONS_URL||"http://localhost:4103"],["/v1/attribution",process.env.ATTRIBUTION_URL||"http://localhost:4104"],["/v1/workflow",process.env.WORKFLOW_URL||"http://localhost:4105"],["/v1/documents",process.env.DOCUMENTS_URL||"http://localhost:4106"],["/v1/communications",process.env.COMMUNICATIONS_URL||"http://localhost:4107"],["/v1/distribution",process.env.DISTRIBUTION_URL||"http://localhost:4108"],["/v1/identity",IDENTITY],["/v1/organisations",process.env.ORGANISATIONS_URL||"http://localhost:4110"],["/v1/audit",process.env.AUDIT_URL||"http://localhost:4111"],["/v1/notifications",process.env.NOTIFICATIONS_URL||"http://localhost:4112"],["/v1/privacy",process.env.PRIVACY_URL||"http://localhost:4113"],["/v1/interviews",process.env.INTERVIEWS_URL||"http://localhost:4114"],["/v1/assessments",process.env.ASSESSMENTS_URL||"http://localhost:4115"],["/v1/offers",process.env.OFFERS_URL||"http://localhost:4116"],["/v1/talent-pools",process.env.TALENT_POOLS_URL||"http://localhost:4117"],["/v1/careers-gateways",process.env.CAREERS_GATEWAY_URL||"http://localhost:4118"],["/v1/config",process.env.CONFIGURATION_URL||"http://localhost:4119"],["/v1/flags",process.env.FEATURE_FLAGS_URL||"http://localhost:4120"],["/v1/campaigns",process.env.CAMPAIGNS_URL||"http://localhost:4121"],["/v1/hooks",process.env.WEBHOOKS_URL||"http://localhost:4122"],["/v1/integrations",process.env.INTEGRATIONS_URL||"http://localhost:4123"],["/v1/analytics",process.env.ANALYTICS_URL||"http://localhost:4124"],["/v1/search",process.env.SEARCH_URL||"http://localhost:4125"],["/v1/intelligence",process.env.INTELLIGENCE_URL||"http://localhost:4126"],["/v1/scheduled-actions",process.env.SCHEDULER_URL||"http://localhost:4127"],["/v1/onboarding",process.env.ONBOARDING_URL||"http://localhost:4128"]
] as const;

const isPublic=(method:string,path:string)=>
 (method==="GET"&&path.startsWith("/v1/jobs/public"))||
 (method==="GET"&&path.startsWith("/v1/distribution/feeds/"))||
 (method==="POST"&&(path==="/v1/applications"||path==="/v1/applications/job-alerts"||path==="/v1/applications/job-alerts/unsubscribe"))||(path.startsWith("/v1/applications/portal/"))||
 (method==="POST"&&path==="/v1/attribution/touchpoints")||
 (path.startsWith("/v1/campaigns/public/")&&["GET","POST"].includes(method))||
 (path.startsWith("/v1/organisations/vendor-portal/")&&["GET","POST"].includes(method))||
 (method==="POST"&&path==="/v1/documents/upload")||
 (method==="POST"&&/^\/v1\/documents\/[^/]+\/complete$/.test(path))||
 ((path==="/v1/identity/login"||path==="/v1/identity/refresh"||path==="/v1/identity/password-reset/request"||path==="/v1/identity/password-reset/confirm"||path==="/v1/identity/passkeys/auth/options"||path==="/v1/identity/passkeys/auth/verify"||/^\/v1\/identity\/sso\/[^/]+\/(start|callback)$/.test(path))&&["GET","POST"].includes(method))||
 (method==="GET"&&path==="/v1/identity/jwks.json")||
 (method==="GET"&&path==="/v1/privacy/notices/current")||
 (method==="POST"&&path==="/v1/privacy/consents/public");


app.use("*",async(c,next)=>{const started=Date.now(),origin=c.req.header("origin");c.header("x-content-type-options","nosniff");c.header("x-frame-options","DENY");c.header("referrer-policy","strict-origin-when-cross-origin");c.header("permissions-policy","camera=(), microphone=(), geolocation=()");c.header("content-security-policy","default-src 'none'; frame-ancestors 'none'");if(origin&&allowedOrigins.includes(origin)){c.header("access-control-allow-origin",origin);c.header("access-control-allow-credentials","true");c.header("vary","Origin");}if(c.req.method==="OPTIONS"){c.header("access-control-allow-methods","GET,POST,PATCH,PUT,DELETE,OPTIONS");c.header("access-control-allow-headers","authorization,content-type,x-correlation-id,x-tenant-id,x-organisation-id,x-reauth-token");return c.body(null,204);}const len=Number(c.req.header("content-length")||0);if(len>maxBody)return c.json({code:"PAYLOAD_TOO_LARGE",message:"Request exceeds maximum allowed size"},413);const ip=c.req.header("cf-connecting-ip")||c.req.header("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";const requestPath=new URL(c.req.url).pathname,publicRoute=isPublic(c.req.method,requestPath);
 const sensitiveAuth=requestPath==="/v1/identity/login"||requestPath==="/v1/identity/password-reset/request"||requestPath==="/v1/identity/passkeys/auth/options";
 const limit=sensitiveAuth?Number(process.env.LOGIN_RATE_LIMIT_PER_MINUTE||10):(publicRoute?Number(process.env.PUBLIC_RATE_LIMIT_PER_MINUTE||120):Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE||600));if(!rateAllowed(ip+":"+new URL(c.req.url).pathname,limit))return c.json({code:"RATE_LIMITED",message:"Too many requests"},429);await next();c.header("server-timing","gateway;dur="+(Date.now()-started));});
app.get("/health",c=>c.json({service:"api-gateway",status:"healthy",time:new Date().toISOString()}));
app.get("/health/services",async c=>{const auth=c.req.header("authorization");if(!auth)return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);const verify=await fetch(IDENTITY+"/v1/identity/introspect",{headers:{authorization:auth}});if(!verify.ok)return c.json({code:"UNAUTHENTICATED",message:"Invalid or expired session"},401);const checks=await Promise.all(routes.map(async([prefix,base])=>{try{const r=await fetch(base+"/health",{signal:AbortSignal.timeout(2500)});const body=await r.json().catch(()=>({}));return{route:prefix,status:r.ok?"healthy":"degraded",service:(body as any).service||base};}catch{return{route:prefix,status:"down",service:base};}}));return c.json({service:"api-gateway",status:checks.every(x=>x.status==="healthy")?"healthy":"degraded",checks,time:new Date().toISOString()});});

app.all("/v1/*",async c=>{
 const requestStarted=Date.now(),url=new URL(c.req.url),correlationId=c.req.header("x-correlation-id")||randomUUID();
 const defaultTenant=process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group";
 let tenantId=isPublic(c.req.method,url.pathname)?defaultTenant:(c.req.header("x-tenant-id")||defaultTenant);
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
   if(!hasPermission(permissions,needed))
     return c.json({code:"FORBIDDEN",message:"Permission required: "+needed,correlationId},403);
 }

 const privileged=/^\/v1\/identity\/(providers|users\/[^/]+\/status|bootstrap\/disable|service-identities)/.test(url.pathname)||
   /^\/v1\/privacy\/(requests\/[^/]+\/(approve|execute)|retention-policies|legal-holds)/.test(url.pathname)||
   ((url.pathname==="/v1/intelligence/prompts"||url.pathname.startsWith("/v1/intelligence/governance/"))&&!["GET","HEAD"].includes(c.req.method));
 if(privileged&&claims){
   const reauth=c.req.header("x-reauth-token");if(!reauth)return c.json({code:"REAUTH_REQUIRED",message:"Recent privileged re-authentication is required",correlationId},401);
   const rr=await fetch(IDENTITY+"/v1/identity/reauth/introspect",{method:"POST",headers:{authorization:"Bearer "+reauth}});
   if(!rr.ok)return c.json({code:"REAUTH_REQUIRED",message:"Privileged re-authentication expired or invalid",correlationId},401);
   const rp:any=await rr.json();if(rp.sub!==claims.sub||rp.sid!==claims.sid)return c.json({code:"REAUTH_MISMATCH",message:"Re-authentication does not match this session",correlationId},403);
 }
 const match=routes.find(([prefix])=>url.pathname.startsWith(prefix));
 if(!match)return c.json({code:"ROUTE_NOT_FOUND",message:"No service route",correlationId},404);
 const target=new URL(url.pathname+url.search,match[1]);
 const headers=new Headers(c.req.raw.headers);
 for(const h of["x-actor","x-actor-email","x-organisation-ids","x-service-name","x-service-timestamp","x-service-signature"])headers.delete(h);
 headers.set("x-correlation-id",correlationId);
 headers.set("x-tenant-id",tenantId);
 if(claims?.sub)headers.set("x-actor",String(claims.sub));
 if(claims?.email)headers.set("x-actor-email",String(claims.email));
 if(Array.isArray(claims?.organisationIds))headers.set("x-organisation-ids",claims.organisationIds.join(","));
 const requestedOrg=c.req.header("x-organisation-id");
 if(requestedOrg&&claims&&!((claims.organisationIds||[]).includes("*")||(claims.organisationIds||[]).includes(requestedOrg)))return c.json({code:"ORGANISATION_FORBIDDEN",message:"Access to this organisation is not permitted",correlationId},403);
 if(requestedOrg)headers.set("x-organisation-id",requestedOrg);
 headers.delete("host");
 const signedHeaders=new Headers(serviceAuthHeaders(Object.fromEntries(headers.entries())));
 const init:any={method:c.req.method,headers:signedHeaders,body:["GET","HEAD"].includes(c.req.method)?undefined:c.req.raw.body};
 if(init.body)init.duplex="half";
 const response=await fetch(target,{...init,signal:AbortSignal.timeout(Number(process.env.UPSTREAM_TIMEOUT_MS||15000))});
 const outHeaders=new Headers(response.headers);
 outHeaders.set("x-correlation-id",correlationId);
 const sensitiveRead=c.req.method==="GET"&&[/^\/v1\/candidates/,/^\/v1\/documents/,/^\/v1\/privacy/,/^\/v1\/offers/,/^\/v1\/intelligence/,/^\/v1\/audit/].some(re=>re.test(url.pathname));
 if(claims&&(!["GET","HEAD","OPTIONS"].includes(c.req.method)||sensitiveRead)){
   const ip=c.req.header("cf-connecting-ip")||c.req.header("x-forwarded-for")?.split(",")[0]?.trim()||"unknown",ipHash=createHash("sha256").update(ip).digest("hex");
   fetch(AUDIT+"/internal/requests",{method:"POST",headers:serviceAuthHeaders({"content-type":"application/json","x-tenant-id":tenantId,"x-correlation-id":correlationId}),body:JSON.stringify({tenantId,actor:claims.sub||null,actorEmail:claims.email||null,method:c.req.method,path:url.pathname,status:response.status,durationMs:Date.now()-requestStarted,correlationId,ipHash,userAgent:c.req.header("user-agent")||null,organisationIds:claims.organisationIds||[],sensitiveRead})}).catch(()=>{});
 }
 return new Response(response.body,{status:response.status,headers:outHeaders});
});

serve({fetch:app.fetch,port:Number(process.env.PORT||4100)});