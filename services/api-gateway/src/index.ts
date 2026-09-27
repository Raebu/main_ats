import{randomUUID}from"node:crypto";import{serve}from"@hono/node-server";import{Hono}from"hono";
const app=new Hono();
const routes=[
 ["/v1/jobs",process.env.JOBS_URL||"http://localhost:4101"],
 ["/v1/candidates",process.env.CANDIDATES_URL||"http://localhost:4102"],
 ["/v1/applications",process.env.APPLICATIONS_URL||"http://localhost:4103"],
 ["/v1/attribution",process.env.ATTRIBUTION_URL||"http://localhost:4104"],
 ["/v1/workflow",process.env.WORKFLOW_URL||"http://localhost:4105"],
 ["/v1/documents",process.env.DOCUMENTS_URL||"http://localhost:4106"],
 ["/v1/communications",process.env.COMMUNICATIONS_URL||"http://localhost:4107"],
 ["/v1/distribution",process.env.DISTRIBUTION_URL||"http://localhost:4108"],
 ["/v1/identity",process.env.IDENTITY_URL||"http://localhost:4109"],
 ["/v1/organisations",process.env.ORGANISATIONS_URL||"http://localhost:4110"],
 ["/v1/audit",process.env.AUDIT_URL||"http://localhost:4111"],
 ["/v1/notifications",process.env.NOTIFICATIONS_URL||"http://localhost:4112"],
 ["/v1/privacy",process.env.PRIVACY_URL||"http://localhost:4113"],
 ["/v1/interviews",process.env.INTERVIEWS_URL||"http://localhost:4114"],
 ["/v1/assessments",process.env.ASSESSMENTS_URL||"http://localhost:4115"],
 ["/v1/offers",process.env.OFFERS_URL||"http://localhost:4116"],
 ["/v1/talent-pools",process.env.TALENT_POOLS_URL||"http://localhost:4117"],
 ["/v1/careers-gateways",process.env.CAREERS_GATEWAY_URL||"http://localhost:4118"],
 ["/v1/config",process.env.CONFIGURATION_URL||"http://localhost:4119"],
 ["/v1/flags",process.env.FEATURE_FLAGS_URL||"http://localhost:4120"],
 ["/v1/campaigns",process.env.CAMPAIGNS_URL||"http://localhost:4121"],
 ["/v1/hooks",process.env.WEBHOOKS_URL||"http://localhost:4122"],
 ["/v1/integrations",process.env.INTEGRATIONS_URL||"http://localhost:4123"],
 ["/v1/analytics",process.env.ANALYTICS_URL||"http://localhost:4124"],
 ["/v1/search",process.env.SEARCH_URL||"http://localhost:4125"],
 ["/v1/intelligence",process.env.INTELLIGENCE_URL||"http://localhost:4126"],
 ["/v1/scheduled-actions",process.env.SCHEDULER_URL||"http://localhost:4127"]
] as const;
app.use("*",async(c,next)=>{const started=Date.now();await next();c.header("server-timing",`gateway;dur=${Date.now()-started}`);});
app.get("/health",c=>c.json({service:"api-gateway",status:"healthy",time:new Date().toISOString()}));
app.all("/v1/*",async c=>{
 const url=new URL(c.req.url),match=routes.find(([prefix])=>url.pathname.startsWith(prefix));
 if(!match)return c.json({code:"ROUTE_NOT_FOUND",message:"No service route"},404);
 const correlationId=c.req.header("x-correlation-id")||randomUUID();
 const tenantId=c.req.header("x-tenant-id")||process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group";
 const target=new URL(url.pathname+url.search,match[1]);
 const headers=new Headers(c.req.raw.headers);
 headers.set("x-correlation-id",correlationId);headers.set("x-tenant-id",tenantId);headers.delete("host");
 const response=await fetch(target,{method:c.req.method,headers,body:["GET","HEAD"].includes(c.req.method)?undefined:c.req.raw.body,duplex:"half" as any});
 const outHeaders=new Headers(response.headers);outHeaders.set("x-correlation-id",correlationId);
 return new Response(response.body,{status:response.status,headers:outHeaders});
});
serve({fetch:app.fetch,port:Number(process.env.PORT||4100)});