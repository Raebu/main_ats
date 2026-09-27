import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { health, pool } from "@raeburn/service-kit";

const app = new Hono();
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "change-me");
const tenant = () => process.env.DEFAULT_TENANT_ID || "tenant_raeburn_group";

const ROLE_DEFAULTS: Record<string,string[]> = {
  PLATFORM_ADMIN:["*"],
  RECRUITMENT_ADMIN:[
    "jobs:read","jobs:write","candidates:read","candidates:write","applications:read",
    "workflow:read","workflow:write","documents:read","communications:read","distribution:read",
    "organisations:read","notifications:read","privacy:read","privacy:write","interviews:read",
    "interviews:write","assessments:read","assessments:write","offers:read","offers:write",
    "talent-pools:read","talent-pools:write","campaigns:read","campaigns:write","analytics:read",
    "search:read","intelligence:use","audit:read","identity:write"
  ],
  RECRUITER:[
    "jobs:read","jobs:write","candidates:read","candidates:write","applications:read",
    "workflow:read","workflow:write","documents:read","communications:read","distribution:read",
    "notifications:read","interviews:read","interviews:write","assessments:read","assessments:write",
    "offers:read","offers:write","talent-pools:read","talent-pools:write","analytics:read","search:read",
    "intelligence:use"
  ],
  HIRING_MANAGER:[
    "jobs:read","candidates:read","applications:read","workflow:read","workflow:write",
    "documents:read","communications:read","interviews:read","interviews:write",
    "assessments:read","assessments:write","offers:read","analytics:read","search:read"
  ],
  VIEWER:[
    "jobs:read","candidates:read","applications:read","workflow:read","communications:read",
    "interviews:read","assessments:read","offers:read","talent-pools:read","analytics:read","search:read"
  ]
};

const Login = z.object({email:z.string().email(),password:z.string().min(1)});
const CreateUser = z.object({
  email:z.string().email(),
  displayName:z.string().min(2),
  password:z.string().min(12),
  role:z.enum(["PLATFORM_ADMIN","RECRUITMENT_ADMIN","RECRUITER","HIRING_MANAGER","VIEWER"]),
  organisationId:z.string().default("org_raeburn_group"),
  permissions:z.array(z.string()).optional()
});

async function issueToken(user:{id:string;email:string;displayName:string}, memberships:any[]) {
  const permissions = [...new Set(memberships.flatMap(m => Array.isArray(m.permissions) ? m.permissions : []))];
  const roles = memberships.map(m=>m.role);
  return new SignJWT({
    sub:user.id,
    email:user.email,
    displayName:user.displayName,
    tenantId:tenant(),
    roles,
    permissions
  }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(secret());
}

async function verifyRequest(auth?:string) {
  const token = auth?.replace(/^Bearer\s+/i,"");
  if (!token) return null;
  try { return (await jwtVerify(token, secret())).payload; } catch { return null; }
}

app.get("/health", async c => c.json(await health("identity")));

app.post("/v1/identity/login", async c => {
  const b = Login.parse(await c.req.json());
  const email = b.email.toLowerCase();

  const result = await pool.query(
    "select id,email,display_name,password_hash,status from users where tenant_id=$1 and email=$2",
    [tenant(), email]
  );
  const row = result.rows[0];

  if (row && row.status === "ACTIVE" && row.password_hash && await bcrypt.compare(b.password,row.password_hash)) {
    const memberships = (await pool.query(
      "select role,permissions,organisation_id from memberships where tenant_id=$1 and user_id=$2",
      [tenant(), row.id]
    )).rows;
    await pool.query("update users set last_login_at=now() where id=$1",[row.id]);
    const token = await issueToken({id:row.id,email:row.email,displayName:row.display_name},memberships);
    return c.json({accessToken:token,expiresIn:43200,user:{id:row.id,email:row.email,displayName:row.display_name,roles:memberships.map(m=>m.role)}});
  }

  const bootstrapEmail=(process.env.BOOTSTRAP_ADMIN_EMAIL||"careers@theraeburngroup.com").toLowerCase();
  if(email===bootstrapEmail && b.password===process.env.BOOTSTRAP_ADMIN_PASSWORD){
    const id="bootstrap-admin";
    const token=await new SignJWT({
      sub:id,email:b.email,displayName:"Bootstrap Administrator",tenantId:tenant(),
      roles:["PLATFORM_ADMIN"],permissions:["*"]
    }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(secret());
    return c.json({accessToken:token,expiresIn:43200,user:{id,email:b.email,displayName:"Bootstrap Administrator",roles:["PLATFORM_ADMIN"]}});
  }

  return c.json({code:"INVALID_CREDENTIALS",message:"Invalid credentials"},401);
});

app.get("/v1/identity/introspect", async c => {
  const payload = await verifyRequest(c.req.header("authorization"));
  return payload ? c.json({active:true,...payload}) : c.json({active:false},401);
});

app.get("/v1/identity/users", async c => {
  const payload:any = await verifyRequest(c.req.header("authorization"));
  if(!payload || !(payload.permissions||[]).includes("*") && !(payload.permissions||[]).includes("identity:write"))
    return c.json({code:"FORBIDDEN",message:"Insufficient permission"},403);
  const {rows}=await pool.query(
    "select u.id,u.email,u.display_name,u.status,u.created_at,u.last_login_at,m.role,m.permissions,m.organisation_id from users u left join memberships m on m.user_id=u.id and m.tenant_id=u.tenant_id where u.tenant_id=$1 order by u.display_name",
    [tenant()]
  );
  return c.json(rows);
});

app.post("/v1/identity/users", async c => {
  const payload:any = await verifyRequest(c.req.header("authorization"));
  if(!payload || !(payload.permissions||[]).includes("*") && !(payload.permissions||[]).includes("identity:write"))
    return c.json({code:"FORBIDDEN",message:"Insufficient permission"},403);

  const b=CreateUser.parse(await c.req.json()),id=randomUUID(),email=b.email.toLowerCase();
  const permissions=b.permissions||ROLE_DEFAULTS[b.role]||[];
  const hash=await bcrypt.hash(b.password,12);
  try{
    await pool.query("begin");
    await pool.query(
      "insert into users(id,tenant_id,email,display_name,password_hash,status) values($1,$2,$3,$4,$5,'ACTIVE')",
      [id,tenant(),email,b.displayName,hash]
    );
    await pool.query(
      "insert into memberships(user_id,tenant_id,organisation_id,role,permissions) values($1,$2,$3,$4,$5::jsonb)",
      [id,tenant(),b.organisationId,b.role,JSON.stringify(permissions)]
    );
    await pool.query("commit");
  }catch(err){
    await pool.query("rollback");
    throw err;
  }
  return c.json({id,email,displayName:b.displayName,role:b.role,organisationId:b.organisationId,permissions},201);
});

app.patch("/v1/identity/users/:id/status", async c => {
  const payload:any = await verifyRequest(c.req.header("authorization"));
  if(!payload || !(payload.permissions||[]).includes("*") && !(payload.permissions||[]).includes("identity:write"))
    return c.json({code:"FORBIDDEN",message:"Insufficient permission"},403);
  const status=z.enum(["ACTIVE","DISABLED"]).parse((await c.req.json()).status);
  const {rows}=await pool.query("update users set status=$3 where tenant_id=$1 and id=$2 returning id,email,status",[tenant(),c.req.param("id"),status]);
  return rows[0]?c.json(rows[0]):c.json({code:"NOT_FOUND",message:"User not found"},404);
});

serve({fetch:app.fetch,port:Number(process.env.PORT||4109)});