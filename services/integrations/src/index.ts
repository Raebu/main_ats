import{serve}from"@hono/node-server";import{Hono}from"hono";import{context,health,pool}from"@raeburn/service-kit";
const app=new Hono();
const builtIns=[
 {provider:"google-jobs",status:"READY",mode:"structured-data",message:"Published vacancies expose JobPosting structured data on canonical careers pages."},
 {provider:"json-feed",status:"READY",mode:"feed",message:"Public JSON vacancy feed is available."},
 {provider:"xml-feed",status:"READY",mode:"feed",message:"Public XML vacancy feed is available."},
 {provider:"csv-feed",status:"READY",mode:"feed",message:"Public CSV vacancy feed is available."},
 {provider:"indeed",status:"NOT_CONFIGURED",mode:"partner",message:"Requires approved provider integration or feed arrangement before publication can be confirmed."},
 {provider:"linkedin",status:"NOT_CONFIGURED",mode:"partner",message:"Requires approved provider integration before publication can be confirmed."},
 {provider:"adzuna",status:"NOT_CONFIGURED",mode:"partner",message:"Requires provider credentials/integration before publication can be confirmed."},
 {provider:"jooble",status:"NOT_CONFIGURED",mode:"partner",message:"Requires provider credentials/integration before publication can be confirmed."}
];
app.get("/health",async c=>c.json(await health("integrations")));
app.get("/v1/integrations",async c=>{const x=context(c.req.raw.headers);const configured=(await pool.query("select provider,status,config,updated_at from integration_connections where tenant_id=$1",[x.tenantId])).rows;const byProvider=new Map(configured.map((r:any)=>[r.provider,r]));return c.json(builtIns.map(base=>({...base,...(byProvider.get(base.provider)||{})})).concat(configured.filter((r:any)=>!builtIns.some(b=>b.provider===r.provider))));});
serve({fetch:app.fetch,port:Number(process.env.PORT||4123)});