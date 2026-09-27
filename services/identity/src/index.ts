import{createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID,timingSafeEqual}from"node:crypto";
import bcrypt from"bcryptjs";
import{serve}from"@hono/node-server";
import{Hono}from"hono";
import{SignJWT,jwtVerify,createRemoteJWKSet,exportJWK,importPKCS8,importSPKI}from"jose";
import{generateAuthenticationOptions,generateRegistrationOptions,verifyAuthenticationResponse,verifyRegistrationResponse}from"@simplewebauthn/server";
import{z}from"zod";
import{health,pool}from"@raeburn/service-kit";

const app=new Hono();
const secret=()=>new TextEncoder().encode(process.env.AUTH_SECRET||"change-me");
const tenant=()=>process.env.DEFAULT_TENANT_ID||"tenant_raeburn_group";
const mfaKey=()=>createHmac("sha256",process.env.MFA_ENCRYPTION_KEY||process.env.AUTH_SECRET||"change-me").update("mfa:"+tenant()).digest();
const sha=(v:string)=>createHash("sha256").update(v).digest("hex");
const b64=(b:Buffer)=>b.toString("base64url");
const rpId=()=>process.env.WEBAUTHN_RP_ID||"talent.theraeburngroup.com";
const rpOrigin=()=>process.env.WEBAUTHN_ORIGIN||"https://talent.theraeburngroup.com";
const keyId=()=>process.env.AUTH_KEY_ID||"talent-primary";
async function jwtKey(mode:"sign"|"verify"){
 const privatePem=process.env.AUTH_PRIVATE_KEY_PEM?.replace(/\\n/g,"\n"),publicPem=process.env.AUTH_PUBLIC_KEY_PEM?.replace(/\\n/g,"\n");
 if(mode==="sign"&&privatePem)return{key:await importPKCS8(privatePem,"RS256"),alg:"RS256"};
 if(mode==="verify"&&publicPem)return{key:await importSPKI(publicPem,"RS256"),alg:"RS256"};
 return{key:secret(),alg:"HS256"};
}
async function signClaims(claims:any,expires:string){
 const k=await jwtKey("sign");
 return new SignJWT(claims).setProtectedHeader({alg:k.alg,kid:keyId(),typ:"JWT"}).setIssuedAt().setExpirationTime(expires).sign(k.key as any);
}
async function verifyClaims(token:string){
 const k=await jwtKey("verify");
 return (await jwtVerify(token,k.key as any,{algorithms:[k.alg]})).payload as any;
}
async function securityEvent(input:{userId?:string|null,email?:string|null,eventType:string,ipHash?:string|null,userAgentHash?:string|null,detail?:any}){
 await pool.query("insert into auth_security_events(id,tenant_id,user_id,email,event_type,ip_hash,user_agent_hash,detail) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",[randomUUID(),tenant(),input.userId||null,input.email||null,input.eventType,input.ipHash||null,input.userAgentHash||null,JSON.stringify(input.detail||{})]);
}
async function bootstrapDisabled(){return Boolean((await pool.query("select disabled_at from bootstrap_state where tenant_id=$1",[tenant()])).rows[0]?.disabled_at);}
function metaHashes(meta:{userAgent?:string;ip?:string}){return{ipHash:meta.ip?sha(meta.ip):null,userAgentHash:meta.userAgent?sha(meta.userAgent):null};}


const ROLE_DEFAULTS:Record<string,string[]>={
 PLATFORM_ADMIN:["*"],
 RECRUITMENT_ADMIN:["jobs:read","jobs:write","candidates:read","candidates:write","applications:read","workflow:read","workflow:write","documents:read","communications:read","distribution:read","organisations:read","organisations:write","notifications:read","notifications:write","privacy:read","privacy:write","interviews:read","interviews:write","assessments:read","assessments:write","offers:read","offers:write","talent-pools:read","talent-pools:write","campaigns:read","campaigns:write","attribution:read","attribution:write","analytics:read","search:read","intelligence:use","audit:read","identity:write","integrations:read","integrations:write","config:read","config:write","scheduler:read","scheduler:write","onboarding:read","onboarding:write"],
 RECRUITER:["jobs:read","jobs:write","candidates:read","candidates:write","applications:read","workflow:read","workflow:write","documents:read","communications:read","distribution:read","notifications:read","interviews:read","interviews:write","assessments:read","assessments:write","offers:read","offers:write","talent-pools:read","talent-pools:write","analytics:read","search:read","intelligence:use","onboarding:read","onboarding:write"],
 HIRING_MANAGER:["jobs:read","candidates:read","applications:read","workflow:read","workflow:write","documents:read","communications:read","interviews:read","interviews:write","assessments:read","assessments:write","offers:read","analytics:read","search:read","onboarding:read"],
 VIEWER:["jobs:read","candidates:read","applications:read","workflow:read","communications:read","interviews:read","assessments:read","offers:read","talent-pools:read","analytics:read","search:read","onboarding:read"]
};

const Login=z.object({email:z.string().email(),password:z.string().min(1)});
const CreateUser=z.object({email:z.string().email(),displayName:z.string().min(2),password:z.string().min(12),role:z.enum(["PLATFORM_ADMIN","RECRUITMENT_ADMIN","RECRUITER","HIRING_MANAGER","VIEWER"]),organisationId:z.string().default("org_raeburn_group"),permissions:z.array(z.string()).optional()});

function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",mfaKey(),iv),enc=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]),tag=cipher.getAuthTag();return Buffer.concat([iv,tag,enc]).toString("base64url");}
function decrypt(value:string){const b=Buffer.from(value,"base64url"),iv=b.subarray(0,12),tag=b.subarray(12,28),data=b.subarray(28),dec=createDecipheriv("aes-256-gcm",mfaKey(),iv);dec.setAuthTag(tag);return Buffer.concat([dec.update(data),dec.final()]).toString("utf8");}
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf:Buffer){let bits="",out="";for(const n of buf)bits+=n.toString(2).padStart(8,"0");for(let i=0;i<bits.length;i+=5)out+=alphabet[parseInt(bits.slice(i,i+5).padEnd(5,"0"),2)];return out;}
function base32Decode(s:string){let bits="";for(const c of s.replace(/=+$/,"").toUpperCase()){const n=alphabet.indexOf(c);if(n<0)continue;bits+=n.toString(2).padStart(5,"0");}const out=[];for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(out);}
function totp(secretB32:string,offset=0){const counter=Math.floor(Date.now()/30000)+offset,b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));const h=createHmac("sha1",base32Decode(secretB32)).update(b).digest(),o=h[h.length-1]&15,n=(h.readUInt32BE(o)&0x7fffffff)%1000000;return String(n).padStart(6,"0");}
function verifyTotp(secretB32:string,code:string){for(const o of[-1,0,1]){const expected=Buffer.from(totp(secretB32,o)),actual=Buffer.from(code.padStart(6,"0"));if(expected.length===actual.length&&timingSafeEqual(expected,actual))return true;}return false;}

async function memberships(userId:string){return(await pool.query("select role,permissions,organisation_id from memberships where tenant_id=$1 and user_id=$2",[tenant(),userId])).rows;}
async function issueSession(user:{id:string;email:string;displayName:string},m:any[],meta:{userAgent?:string;ip?:string}={}){
 const sid=randomUUID(),permissions=[...new Set(m.flatMap((x:any)=>Array.isArray(x.permissions)?x.permissions:[]))],roles=m.map((x:any)=>x.role),organisationIds=[...new Set(m.map((x:any)=>x.organisation_id).filter(Boolean))];
 const hashes=metaHashes(meta);
 await pool.query("insert into auth_sessions(id,tenant_id,user_id,expires_at,user_agent_hash,ip_hash) values($1,$2,$3,now()+interval '30 days',$4,$5)",[sid,tenant(),user.id,hashes.userAgentHash,hashes.ipHash]);
 const accessToken=await signClaims({sub:user.id,email:user.email,displayName:user.displayName,tenantId:tenant(),roles,permissions,organisationIds,sid,tokenType:"access"},"15m");
 const rawRefresh="rtr_"+b64(randomBytes(48)),refreshId=randomUUID();
 await pool.query("insert into refresh_tokens(id,tenant_id,user_id,session_id,token_hash,expires_at) values($1,$2,$3,$4,$5,now()+interval '30 days')",[refreshId,tenant(),user.id,sid,sha(rawRefresh)]);
 return{accessToken,refreshToken:rawRefresh,expiresIn:900,refreshExpiresIn:2592000,sessionId:sid};
}
async function verifyRequest(auth?:string){
 const token=auth?.replace(/^Bearer\s+/i,"");if(!token)return null;
 try{const payload:any=await verifyClaims(token);if(payload.tokenType!=="access"&&payload.sub!=="bootstrap-admin")return null;if(payload.sub==="bootstrap-admin")return (await bootstrapDisabled())?null:payload;if(!payload.sid)return null;
 const s=(await pool.query("select 1 from auth_sessions where tenant_id=$1 and id=$2 and user_id=$3 and revoked_at is null and expires_at>now()",[tenant(),payload.sid,payload.sub])).rowCount;if(!s)return null;
 await pool.query("update auth_sessions set last_seen_at=now() where id=$1",[payload.sid]);return payload;}catch{return null;}
}
function clientMeta(c:any){return{userAgent:c.req.header("user-agent")||undefined,ip:c.req.header("cf-connecting-ip")||c.req.header("x-forwarded-for")?.split(",")[0]?.trim()||undefined};}

app.get("/health",async c=>c.json(await health("identity")));

app.post("/v1/identity/login",async c=>{
 const b=Login.parse(await c.req.json()),email=b.email.toLowerCase(),meta=clientMeta(c),hashes=metaHashes(meta);
 const recentFailures=Number((await pool.query("select count(*) from auth_security_events where tenant_id=$1 and email=$2 and event_type='LOGIN_FAILED' and created_at>now()-interval '15 minutes'",[tenant(),email])).rows[0]?.count||0);
 if(recentFailures>=8){await securityEvent({email,eventType:"LOGIN_BLOCKED",...hashes});return c.json({code:"LOGIN_TEMPORARILY_BLOCKED",message:"Too many failed sign-in attempts. Try again later."},429);}
 const row=(await pool.query("select id,email,display_name,password_hash,status,locked_until from users where tenant_id=$1 and email=$2",[tenant(),email])).rows[0];
 if(row?.locked_until&&new Date(row.locked_until)>new Date())return c.json({code:"ACCOUNT_TEMPORARILY_LOCKED",message:"Account temporarily locked"},423);
 if(row&&row.status==="ACTIVE"&&row.password_hash&&await bcrypt.compare(b.password,row.password_hash)){
  const m=await memberships(row.id),mfa=(await pool.query("select * from mfa_methods where tenant_id=$1 and user_id=$2 and method='TOTP' and enabled=true",[tenant(),row.id])).rows[0];
  await pool.query("update users set failed_login_count=0,locked_until=null where id=$1",[row.id]);
  const known=(await pool.query("select 1 from auth_sessions where tenant_id=$1 and user_id=$2 and (ip_hash=$3 or user_agent_hash=$4) limit 1",[tenant(),row.id,hashes.ipHash,hashes.userAgentHash])).rowCount;
  if(!known)await securityEvent({userId:row.id,email,eventType:"NEW_DEVICE_LOGIN",...hashes,detail:{requiresReview:false}});
  if(mfa){const preAuthToken=await signClaims({sub:row.id,email:row.email,displayName:row.display_name,tenantId:tenant(),scope:"mfa-pending",tokenType:"preauth"},"5m");return c.json({mfaRequired:true,preAuthToken});}
  await pool.query("update users set last_login_at=now() where id=$1",[row.id]);const session=await issueSession({id:row.id,email:row.email,displayName:row.display_name},m,meta);
  await securityEvent({userId:row.id,email,eventType:"LOGIN_SUCCEEDED",...hashes});return c.json({...session,user:{id:row.id,email:row.email,displayName:row.display_name,roles:m.map((x:any)=>x.role)}});
 }
 await securityEvent({userId:row?.id||null,email,eventType:"LOGIN_FAILED",...hashes});
 if(row){const n=Number(row.failed_login_count||0)+1;await pool.query("update users set failed_login_count=$2,locked_until=case when $2>=8 then now()+interval '15 minutes' else locked_until end where id=$1",[row.id,n]);}
 const bootstrapEmail=(process.env.BOOTSTRAP_ADMIN_EMAIL||"careers@theraeburngroup.com").toLowerCase();
 if(!(await bootstrapDisabled())&&email===bootstrapEmail&&b.password===process.env.BOOTSTRAP_ADMIN_PASSWORD){const token=await signClaims({sub:"bootstrap-admin",email:b.email,displayName:"Bootstrap Administrator",tenantId:tenant(),roles:["PLATFORM_ADMIN"],permissions:["*"],organisationIds:["*"],tokenType:"access"},"30m");return c.json({accessToken:token,expiresIn:1800,user:{id:"bootstrap-admin",email:b.email,displayName:"Bootstrap Administrator",roles:["PLATFORM_ADMIN"]}});}
 return c.json({code:"INVALID_CREDENTIALS",message:"Invalid credentials"},401);
});

app.post("/v1/identity/mfa/login",async c=>{const b=z.object({preAuthToken:z.string(),code:z.string().regex(/^\d{6}$/)}).parse(await c.req.json());try{const payload:any=await verifyClaims(b.preAuthToken);if(payload.scope!=="mfa-pending"||!payload.sub)return c.json({code:"INVALID_MFA_SESSION",message:"MFA session invalid"},401);const mfa=(await pool.query("select * from mfa_methods where tenant_id=$1 and user_id=$2 and method='TOTP' and enabled=true",[tenant(),payload.sub])).rows[0];if(!mfa||!verifyTotp(decrypt(mfa.secret_encrypted),b.code))return c.json({code:"INVALID_MFA_CODE",message:"Invalid verification code"},401);const user=(await pool.query("select id,email,display_name,status from users where tenant_id=$1 and id=$2",[tenant(),payload.sub])).rows[0];if(!user||user.status!=="ACTIVE")return c.json({code:"ACCOUNT_DISABLED",message:"Account unavailable"},403);const m=await memberships(user.id);await pool.query("update users set last_login_at=now() where id=$1",[user.id]);const session=await issueSession({id:user.id,email:user.email,displayName:user.display_name},m,clientMeta(c));return c.json({...session,user:{id:user.id,email:user.email,displayName:user.display_name,roles:m.map((x:any)=>x.role)}});}catch{return c.json({code:"INVALID_MFA_SESSION",message:"MFA session invalid or expired"},401);}});

app.get("/v1/identity/introspect",async c=>{const payload=await verifyRequest(c.req.header("authorization"));return payload?c.json({active:true,...payload}):c.json({active:false},401);});

app.get("/v1/identity/sessions",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||payload.sub==="bootstrap-admin")return c.json([]);return c.json((await pool.query("select id,created_at,expires_at,last_seen_at,user_agent_hash,ip_hash,case when revoked_at is null then 'ACTIVE' else 'REVOKED' end status from auth_sessions where tenant_id=$1 and user_id=$2 order by created_at desc",[tenant(),payload.sub])).rows);});
app.delete("/v1/identity/sessions/:id",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload)return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);await pool.query("update auth_sessions set revoked_at=now() where tenant_id=$1 and id=$2 and user_id=$3",[tenant(),c.req.param("id"),payload.sub]);return c.json({ok:true});});
app.post("/v1/identity/sessions/revoke-all",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload)return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);const{rowCount}=await pool.query("update auth_sessions set revoked_at=now() where tenant_id=$1 and user_id=$2 and revoked_at is null",[tenant(),payload.sub]);return c.json({revoked:rowCount||0});});

app.post("/v1/identity/mfa/setup",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||payload.sub==="bootstrap-admin")return c.json({code:"FORBIDDEN",message:"Create a normal administrator before configuring MFA"},403);const raw=randomBytes(20),secretB32=base32Encode(raw),id=randomUUID();await pool.query("insert into mfa_methods(id,tenant_id,user_id,method,secret_encrypted,enabled) values($1,$2,$3,'TOTP',$4,false) on conflict(tenant_id,user_id,method) do update set secret_encrypted=excluded.secret_encrypted,enabled=false,verified_at=null",[id,tenant(),payload.sub,encrypt(secretB32)]);const issuer=encodeURIComponent("Raeburn Talent"),label=encodeURIComponent("Raeburn Talent:"+payload.email);return c.json({secret:secretB32,otpauthUri:"otpauth://totp/"+label+"?secret="+secretB32+"&issuer="+issuer+"&algorithm=SHA1&digits=6&period=30"});});
app.post("/v1/identity/mfa/verify-setup",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload)return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);const code=z.string().regex(/^\d{6}$/).parse((await c.req.json()).code),mfa=(await pool.query("select * from mfa_methods where tenant_id=$1 and user_id=$2 and method='TOTP'",[tenant(),payload.sub])).rows[0];if(!mfa||!verifyTotp(decrypt(mfa.secret_encrypted),code))return c.json({code:"INVALID_MFA_CODE",message:"Verification code is invalid"},400);await pool.query("update mfa_methods set enabled=true,verified_at=now() where id=$1",[mfa.id]);return c.json({enabled:true});});
app.delete("/v1/identity/mfa",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload)return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);await pool.query("update mfa_methods set enabled=false where tenant_id=$1 and user_id=$2 and method='TOTP'",[tenant(),payload.sub]);return c.json({enabled:false});});

app.get("/v1/identity/providers",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload)return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);return c.json((await pool.query("select provider,status,config,updated_at from identity_providers where tenant_id=$1 order by provider",[tenant()])).rows);});
app.put("/v1/identity/providers/:provider",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||!(payload.permissions||[]).some((p:string)=>p==="*"||p==="identity:write"))return c.json({code:"FORBIDDEN",message:"Insufficient permission"},403);const b=(await c.req.json()) as any,id=randomUUID();await pool.query("insert into identity_providers(id,tenant_id,provider,status,config) values($1,$2,$3,$4,$5::jsonb) on conflict(tenant_id,provider) do update set status=excluded.status,config=excluded.config,updated_at=now()",[id,tenant(),c.req.param("provider"),b.status||"DISABLED",JSON.stringify(b.config||{})]);return c.json({provider:c.req.param("provider"),status:b.status||"DISABLED"});});

app.get("/v1/identity/users",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||!(payload.permissions||[]).some((p:string)=>p==="*"||p==="identity:write"))return c.json({code:"FORBIDDEN",message:"Insufficient permission"},403);const{rows}=await pool.query("select u.id,u.email,u.display_name,u.status,u.created_at,u.last_login_at,m.role,m.permissions,m.organisation_id,coalesce((select bool_or(enabled) from mfa_methods mm where mm.tenant_id=u.tenant_id and mm.user_id=u.id),false) mfa_enabled from users u left join memberships m on m.user_id=u.id and m.tenant_id=u.tenant_id where u.tenant_id=$1 order by u.display_name",[tenant()]);return c.json(rows);});
app.post("/v1/identity/users",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||!(payload.permissions||[]).some((p:string)=>p==="*"||p==="identity:write"))return c.json({code:"FORBIDDEN",message:"Insufficient permission"},403);const b=CreateUser.parse(await c.req.json()),id=randomUUID(),email=b.email.toLowerCase(),permissions=b.permissions||ROLE_DEFAULTS[b.role]||[],hash=await bcrypt.hash(b.password,12);const client=await pool.connect();try{await client.query("begin");await client.query("insert into users(id,tenant_id,email,display_name,password_hash,status) values($1,$2,$3,$4,$5,'ACTIVE')",[id,tenant(),email,b.displayName,hash]);await client.query("insert into memberships(user_id,tenant_id,organisation_id,role,permissions) values($1,$2,$3,$4,$5::jsonb)",[id,tenant(),b.organisationId,b.role,JSON.stringify(permissions)]);await client.query("commit");}catch(err){await client.query("rollback");throw err;}finally{client.release();}return c.json({id,email,displayName:b.displayName,role:b.role,organisationId:b.organisationId,permissions},201);});
app.patch("/v1/identity/users/:id/status",async c=>{const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||!(payload.permissions||[]).some((p:string)=>p==="*"||p==="identity:write"))return c.json({code:"FORBIDDEN",message:"Insufficient permission"},403);const status=z.enum(["ACTIVE","DISABLED"]).parse((await c.req.json()).status),{rows}=await pool.query("update users set status=$3 where tenant_id=$1 and id=$2 returning id,email,status",[tenant(),c.req.param("id"),status]);if(status==="DISABLED")await pool.query("update auth_sessions set revoked_at=now() where tenant_id=$1 and user_id=$2 and revoked_at is null",[tenant(),c.req.param("id")]);return rows[0]?c.json(rows[0]):c.json({code:"NOT_FOUND",message:"User not found"},404);});



app.get("/v1/identity/jwks.json",async c=>{
 const publicPem=process.env.AUTH_PUBLIC_KEY_PEM?.replace(/\\n/g,"\n");
 if(!publicPem)return c.json({keys:[]});
 const jwk:any=await exportJWK(await importSPKI(publicPem,"RS256"));jwk.use="sig";jwk.alg="RS256";jwk.kid=keyId();return c.json({keys:[jwk]});
});

app.post("/v1/identity/refresh",async c=>{
 const b=z.object({refreshToken:z.string().min(20)}).parse(await c.req.json()),tokenHash=sha(b.refreshToken),meta=clientMeta(c);
 const row=(await pool.query("select r.*,u.email,u.display_name,u.status from refresh_tokens r join users u on u.id=r.user_id and u.tenant_id=r.tenant_id where r.tenant_id=$1 and r.token_hash=$2 and r.revoked_at is null and r.used_at is null and r.expires_at>now()",[tenant(),tokenHash])).rows[0];
 if(!row||row.status!=="ACTIVE"){await securityEvent({email:row?.email||null,eventType:"REFRESH_REJECTED",...metaHashes(meta)});return c.json({code:"INVALID_REFRESH_TOKEN",message:"Refresh token is invalid or expired"},401);}
 await pool.query("update refresh_tokens set used_at=now(),revoked_at=now() where id=$1",[row.id]);
 const m=await memberships(row.user_id),session=await issueSession({id:row.user_id,email:row.email,displayName:row.display_name},m,meta);
 await pool.query("update auth_sessions set revoked_at=now() where tenant_id=$1 and id=$2",[tenant(),row.session_id]);
 await pool.query("update refresh_tokens set rotated_from_id=$2 where tenant_id=$1 and token_hash=$3",[tenant(),row.id,sha(session.refreshToken)]);
 return c.json(session);
});

app.post("/v1/identity/password-reset/request",async c=>{
 const b=z.object({email:z.string().email()}).parse(await c.req.json()),email=b.email.toLowerCase(),user=(await pool.query("select id from users where tenant_id=$1 and email=$2 and status='ACTIVE'",[tenant(),email])).rows[0];
 if(user){const raw="rst_"+b64(randomBytes(36)),id=randomUUID();await pool.query("update password_reset_tokens set used_at=now() where tenant_id=$1 and user_id=$2 and used_at is null",[tenant(),user.id]);await pool.query("insert into password_reset_tokens(id,tenant_id,user_id,token_hash,expires_at) values($1,$2,$3,$4,now()+interval '30 minutes')",[id,tenant(),user.id,sha(raw)]);
   const callback=process.env.PASSWORD_RESET_WEBHOOK_URL;if(callback)fetch(callback,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tenantId:tenant(),email,resetToken:raw,expiresIn:1800})}).catch(()=>{});
   if(process.env.NODE_ENV!=="production"&&!callback)return c.json({accepted:true,developmentResetToken:raw});
 }
 return c.json({accepted:true});
});
app.post("/v1/identity/password-reset/confirm",async c=>{
 const b=z.object({token:z.string().min(20),password:z.string().min(12)}).parse(await c.req.json()),row=(await pool.query("select * from password_reset_tokens where tenant_id=$1 and token_hash=$2 and used_at is null and expires_at>now()",[tenant(),sha(b.token)])).rows[0];
 if(!row)return c.json({code:"INVALID_RESET_TOKEN",message:"Reset token is invalid or expired"},400);
 const hash=await bcrypt.hash(b.password,12);await pool.query("update users set password_hash=$3,password_changed_at=now(),failed_login_count=0,locked_until=null where tenant_id=$1 and id=$2",[tenant(),row.user_id,hash]);await pool.query("update password_reset_tokens set used_at=now() where id=$1",[row.id]);await pool.query("update auth_sessions set revoked_at=now() where tenant_id=$1 and user_id=$2 and revoked_at is null",[tenant(),row.user_id]);await pool.query("update refresh_tokens set revoked_at=now() where tenant_id=$1 and user_id=$2 and revoked_at is null",[tenant(),row.user_id]);await securityEvent({userId:row.user_id,eventType:"PASSWORD_RESET"});return c.json({ok:true});
});

app.post("/v1/identity/reauth",async c=>{
 const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||payload.sub==="bootstrap-admin")return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);
 const b=z.object({password:z.string().min(1),totp:z.string().regex(/^\d{6}$/).optional()}).parse(await c.req.json()),user=(await pool.query("select id,email,password_hash from users where tenant_id=$1 and id=$2",[tenant(),payload.sub])).rows[0];
 if(!user?.password_hash||!(await bcrypt.compare(b.password,user.password_hash)))return c.json({code:"REAUTH_FAILED",message:"Credentials not accepted"},401);
 const mfa=(await pool.query("select * from mfa_methods where tenant_id=$1 and user_id=$2 and method='TOTP' and enabled=true",[tenant(),payload.sub])).rows[0];if(mfa&&(!b.totp||!verifyTotp(decrypt(mfa.secret_encrypted),b.totp)))return c.json({code:"MFA_REQUIRED",message:"Valid MFA code required"},401);
 const token=await signClaims({sub:payload.sub,tenantId:tenant(),sid:payload.sid,scope:"privileged",tokenType:"reauth"},"5m");await securityEvent({userId:payload.sub,email:user.email,eventType:"PRIVILEGED_REAUTH"});return c.json({reauthToken:token,expiresIn:300});
});
app.post("/v1/identity/reauth/introspect",async c=>{const token=c.req.header("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return c.json({active:false},401);try{const p:any=await verifyClaims(token);if(p.scope!=="privileged"||p.tokenType!=="reauth")throw new Error("scope");return c.json({active:true,...p});}catch{return c.json({active:false},401);}});

app.post("/v1/identity/bootstrap/disable",async c=>{
 const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||payload.sub==="bootstrap-admin"||!(payload.permissions||[]).includes("*"))return c.json({code:"FORBIDDEN",message:"A real platform administrator must disable bootstrap access"},403);
 await pool.query("insert into bootstrap_state(tenant_id,disabled_at,disabled_by) values($1,now(),$2) on conflict(tenant_id) do update set disabled_at=now(),disabled_by=excluded.disabled_by",[tenant(),payload.sub]);await securityEvent({userId:payload.sub,email:payload.email,eventType:"BOOTSTRAP_DISABLED"});return c.json({disabled:true});
});

app.post("/v1/identity/passkeys/register/options",async c=>{
 const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload||payload.sub==="bootstrap-admin")return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);
 const existing=(await pool.query("select credential_id,transports from webauthn_credentials where tenant_id=$1 and user_id=$2",[tenant(),payload.sub])).rows;
 const options=await generateRegistrationOptions({rpName:"Raeburn Talent",rpID:rpId(),userName:payload.email,userDisplayName:payload.displayName||payload.email,userID:new TextEncoder().encode(payload.sub),attestationType:"none",authenticatorSelection:{residentKey:"preferred",userVerification:"preferred"},excludeCredentials:existing.map((x:any)=>({id:x.credential_id,transports:x.transports||[]}))});
 await pool.query("insert into webauthn_challenges(id,tenant_id,user_id,purpose,challenge,expires_at) values($1,$2,$3,'REGISTER',$4,now()+interval '5 minutes')",[randomUUID(),tenant(),payload.sub,options.challenge]);return c.json(options);
});
app.post("/v1/identity/passkeys/register/verify",async c=>{
 const payload:any=await verifyRequest(c.req.header("authorization"));if(!payload)return c.json({code:"UNAUTHENTICATED",message:"Authentication required"},401);const body:any=await c.req.json();
 const ch=(await pool.query("select * from webauthn_challenges where tenant_id=$1 and user_id=$2 and purpose='REGISTER' and used_at is null and expires_at>now() order by created_at desc limit 1",[tenant(),payload.sub])).rows[0];if(!ch)return c.json({code:"CHALLENGE_EXPIRED",message:"Registration challenge expired"},400);
 const verification:any=await verifyRegistrationResponse({response:body,expectedChallenge:ch.challenge,expectedOrigin:rpOrigin(),expectedRPID:rpId(),requireUserVerification:false});
 if(!verification.verified||!verification.registrationInfo)return c.json({verified:false},400);const cred=verification.registrationInfo.credential;
 await pool.query("insert into webauthn_credentials(id,tenant_id,user_id,credential_id,public_key,counter,transports,device_type,backed_up) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) on conflict(tenant_id,credential_id) do update set public_key=excluded.public_key,counter=excluded.counter,transports=excluded.transports",[randomUUID(),tenant(),payload.sub,cred.id,Buffer.from(cred.publicKey).toString("base64url"),cred.counter,JSON.stringify(cred.transports||[]),verification.registrationInfo.credentialDeviceType||null,verification.registrationInfo.credentialBackedUp||false]);await pool.query("update webauthn_challenges set used_at=now() where id=$1",[ch.id]);await securityEvent({userId:payload.sub,email:payload.email,eventType:"PASSKEY_REGISTERED"});return c.json({verified:true,credentialId:cred.id});
});
app.post("/v1/identity/passkeys/auth/options",async c=>{
 const b=z.object({email:z.string().email()}).parse(await c.req.json()),user=(await pool.query("select id,email from users where tenant_id=$1 and email=$2 and status='ACTIVE'",[tenant(),b.email.toLowerCase()])).rows[0];if(!user)return c.json({code:"NOT_FOUND",message:"No passkey account found"},404);
 const creds=(await pool.query("select credential_id,transports from webauthn_credentials where tenant_id=$1 and user_id=$2",[tenant(),user.id])).rows;if(!creds.length)return c.json({code:"NO_PASSKEY",message:"No passkey registered"},404);
 const options=await generateAuthenticationOptions({rpID:rpId(),userVerification:"preferred",allowCredentials:creds.map((x:any)=>({id:x.credential_id,transports:x.transports||[]}))});await pool.query("insert into webauthn_challenges(id,tenant_id,user_id,purpose,challenge,metadata,expires_at) values($1,$2,$3,'AUTH',$4,$5::jsonb,now()+interval '5 minutes')",[randomUUID(),tenant(),user.id,options.challenge,JSON.stringify({email:user.email})]);return c.json(options);
});
app.post("/v1/identity/passkeys/auth/verify",async c=>{
 const body:any=await c.req.json(),credentialId=body.id,ch=(await pool.query("select * from webauthn_challenges where tenant_id=$1 and purpose='AUTH' and used_at is null and expires_at>now() order by created_at desc limit 1",[tenant()])).rows[0];if(!ch)return c.json({code:"CHALLENGE_EXPIRED",message:"Authentication challenge expired"},400);
 const cred=(await pool.query("select * from webauthn_credentials where tenant_id=$1 and user_id=$2 and credential_id=$3",[tenant(),ch.user_id,credentialId])).rows[0];if(!cred)return c.json({code:"CREDENTIAL_NOT_FOUND",message:"Passkey not recognised"},401);
 const verification:any=await verifyAuthenticationResponse({response:body,expectedChallenge:ch.challenge,expectedOrigin:rpOrigin(),expectedRPID:rpId(),credential:{id:cred.credential_id,publicKey:Buffer.from(cred.public_key,"base64url"),counter:Number(cred.counter),transports:cred.transports||[]},requireUserVerification:false});
 if(!verification.verified)return c.json({verified:false},401);await pool.query("update webauthn_credentials set counter=$3,last_used_at=now() where tenant_id=$1 and credential_id=$2",[tenant(),cred.credential_id,verification.authenticationInfo.newCounter]);await pool.query("update webauthn_challenges set used_at=now() where id=$1",[ch.id]);
 const user=(await pool.query("select id,email,display_name from users where tenant_id=$1 and id=$2",[tenant(),ch.user_id])).rows[0],m=await memberships(user.id),session=await issueSession({id:user.id,email:user.email,displayName:user.display_name},m,clientMeta(c));await securityEvent({userId:user.id,email:user.email,eventType:"PASSKEY_LOGIN",...metaHashes(clientMeta(c))});return c.json({verified:true,...session,user:{id:user.id,email:user.email,displayName:user.display_name,roles:m.map((x:any)=>x.role)}});
});

app.get("/v1/identity/sso/:provider/start",async c=>{
 const provider=c.req.param("provider"),row=(await pool.query("select * from identity_providers where tenant_id=$1 and provider=$2 and status='ENABLED'",[tenant(),provider])).rows[0];if(!row)return c.json({code:"SSO_NOT_CONFIGURED",message:"SSO provider is not enabled"},404);
 const cfg=row.config||{},discovery=await (await fetch(String(cfg.issuer).replace(/\/$/,"")+"/.well-known/openid-configuration")).json() as any,verifier=b64(randomBytes(48)),challenge=b64(createHash("sha256").update(verifier).digest()),state=b64(randomBytes(32)),nonce=b64(randomBytes(24)),redirectUri=cfg.redirectUri||rpOrigin()+"/api/auth/sso/"+provider+"/callback";
 await pool.query("insert into oidc_states(id,tenant_id,provider,state_hash,nonce,code_verifier,return_to,expires_at) values($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')",[randomUUID(),tenant(),provider,sha(state),nonce,verifier,c.req.query("returnTo")||"/",]);
 const u=new URL(discovery.authorization_endpoint);u.searchParams.set("client_id",cfg.clientId);u.searchParams.set("redirect_uri",redirectUri);u.searchParams.set("response_type","code");u.searchParams.set("scope",cfg.scopes||"openid email profile");u.searchParams.set("state",state);u.searchParams.set("nonce",nonce);u.searchParams.set("code_challenge",challenge);u.searchParams.set("code_challenge_method","S256");return c.json({authorizationUrl:u.toString(),provider});
});
app.post("/v1/identity/sso/:provider/callback",async c=>{
 const provider=c.req.param("provider"),b=z.object({code:z.string(),state:z.string()}).parse(await c.req.json()),state=(await pool.query("select * from oidc_states where tenant_id=$1 and provider=$2 and state_hash=$3 and expires_at>now()",[tenant(),provider,sha(b.state)])).rows[0];if(!state)return c.json({code:"INVALID_SSO_STATE",message:"SSO state is invalid or expired"},400);
 const row=(await pool.query("select * from identity_providers where tenant_id=$1 and provider=$2 and status='ENABLED'",[tenant(),provider])).rows[0],cfg=row?.config||{},discovery=await (await fetch(String(cfg.issuer).replace(/\/$/,"")+"/.well-known/openid-configuration")).json() as any,redirectUri=cfg.redirectUri||rpOrigin()+"/api/auth/sso/"+provider+"/callback",secretValue=cfg.clientSecretEnv?process.env[cfg.clientSecretEnv]:undefined;
 const form=new URLSearchParams({grant_type:"authorization_code",code:b.code,redirect_uri:redirectUri,client_id:cfg.clientId,code_verifier:state.code_verifier});if(secretValue)form.set("client_secret",secretValue);
 const tokenResp=await fetch(discovery.token_endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form});if(!tokenResp.ok)return c.json({code:"SSO_TOKEN_EXCHANGE_FAILED",message:"Identity provider rejected the authorization code"},401);const tokens:any=await tokenResp.json();
 const jwks=createRemoteJWKSet(new URL(discovery.jwks_uri)),verified:any=(await jwtVerify(tokens.id_token,jwks,{issuer:discovery.issuer,audience:cfg.clientId})).payload;if(verified.nonce!==state.nonce)return c.json({code:"SSO_NONCE_MISMATCH",message:"SSO nonce did not match"},401);
 const email=String(verified.email||verified.preferred_username||"").toLowerCase();if(!email)return c.json({code:"SSO_EMAIL_REQUIRED",message:"Provider did not supply an email address"},400);const domain=email.split("@")[1],allowed=Array.isArray(cfg.allowedDomains)?cfg.allowedDomains:[];if(allowed.length&&!allowed.includes(domain))return c.json({code:"SSO_DOMAIN_FORBIDDEN",message:"Email domain is not allowed"},403);
 let user=(await pool.query("select * from users where tenant_id=$1 and email=$2",[tenant(),email])).rows[0];if(!user){const id=randomUUID();await pool.query("insert into users(id,tenant_id,email,display_name,status) values($1,$2,$3,$4,'ACTIVE')",[id,tenant(),email,String(verified.name||email)]);await pool.query("insert into memberships(user_id,tenant_id,organisation_id,role,permissions) values($1,$2,$3,$4,$5::jsonb)",[id,tenant(),cfg.defaultOrganisationId||"org_raeburn_group",cfg.defaultRole||"VIEWER",JSON.stringify(ROLE_DEFAULTS[cfg.defaultRole||"VIEWER"]||[])]);user={id,email,display_name:String(verified.name||email)};}
 const m=await memberships(user.id),session=await issueSession({id:user.id,email:user.email,displayName:user.display_name},m,clientMeta(c));await pool.query("delete from oidc_states where id=$1",[state.id]);await securityEvent({userId:user.id,email,eventType:"SSO_LOGIN",detail:{provider}});return c.json({...session,returnTo:state.return_to||"/",user:{id:user.id,email:user.email,displayName:user.display_name,roles:m.map((x:any)=>x.role)}});
});

app.get("/v1/identity/security-events",async c=>{const p:any=await verifyRequest(c.req.header("authorization"));if(!p||!(p.permissions||[]).some((x:string)=>x==="*"||x==="identity:write"))return c.json({code:"FORBIDDEN",message:"Insufficient permission"},403);return c.json((await pool.query("select id,user_id,email,event_type,ip_hash,user_agent_hash,detail,created_at from auth_security_events where tenant_id=$1 order by created_at desc limit 500",[tenant()])).rows);});

app.post("/v1/identity/service-identities",async c=>{const p:any=await verifyRequest(c.req.header("authorization"));if(!p||(p.permissions||[]).indexOf("*")<0)return c.json({code:"FORBIDDEN",message:"Platform administrator required"},403);const b=z.object({name:z.string().min(2),scopes:z.array(z.string()).default([]),expiresAt:z.string().datetime().optional()}).parse(await c.req.json()),sid=randomUUID(),kid=randomUUID(),raw="svc_"+b64(randomBytes(48));await pool.query("insert into service_identities(id,tenant_id,name,scopes) values($1,$2,$3,$4::jsonb)",[sid,tenant(),b.name,JSON.stringify(b.scopes)]);await pool.query("insert into service_credentials(id,tenant_id,service_id,key_hash,expires_at) values($1,$2,$3,$4,$5)",[kid,tenant(),sid,sha(raw),b.expiresAt||null]);return c.json({id:sid,name:b.name,scopes:b.scopes,serviceKey:raw,warning:"Shown once. Store it in the production secret manager."},201);});
app.post("/v1/identity/service-introspect",async c=>{const raw=c.req.header("x-service-key")||"";if(!raw.startsWith("svc_"))return c.json({active:false},401);const row=(await pool.query("select i.id,i.name,i.scopes from service_credentials k join service_identities i on i.id=k.service_id and i.tenant_id=k.tenant_id where k.tenant_id=$1 and k.key_hash=$2 and k.revoked_at is null and (k.expires_at is null or k.expires_at>now()) and i.status='ACTIVE'",[tenant(),sha(raw)])).rows[0];if(!row)return c.json({active:false},401);await pool.query("update service_credentials set last_used_at=now() where tenant_id=$1 and key_hash=$2",[tenant(),sha(raw)]);return c.json({active:true,serviceId:row.id,name:row.name,scopes:row.scopes,tenantId:tenant()});});

serve({fetch:app.fetch,port:Number(process.env.PORT||4109)});