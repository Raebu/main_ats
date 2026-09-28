import{NextResponse}from"next/server";const API=process.env.TALENT_API_URL||"http://localhost:4100";

function requestProtocol(req:Request){
 const forwarded=(req.headers.get("x-forwarded-proto")||"").split(",")[0]?.trim().toLowerCase();
 if(forwarded)return forwarded;
 return new URL(req.url).protocol.replace(":","");
}
function requestOrigin(req:Request){
 const proto=requestProtocol(req);
 const forwardedHost=(req.headers.get("x-forwarded-host")||"").split(",")[0]?.trim();
 const host=forwardedHost||req.headers.get("host")||new URL(req.url).host;
 return proto+"://"+host;
}
function redirect(req:Request,path:string){return NextResponse.redirect(new URL(path,requestOrigin(req)),303);}
function secureCookie(req:Request){return requestProtocol(req)==="https";}

export async function POST(req:Request){
 const form=await req.formData();
 const response=await fetch(API+"/v1/identity/login",{method:"POST",headers:{"content-type":"application/json","user-agent":req.headers.get("user-agent")||""},body:JSON.stringify({email:String(form.get("email")||""),password:String(form.get("password")||"")})});
 const body=await response.json();
 if(!response.ok)return redirect(req,"/login?error=1");
 const secure=secureCookie(req);
 if(body.mfaRequired){
  const out=redirect(req,"/login/mfa");
  out.cookies.set("raeburn_mfa_pending",body.preAuthToken,{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:300});
  return out;
 }
 const out=redirect(req,"/");
 out.cookies.set("raeburn_talent_token",body.accessToken,{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:body.expiresIn||900});
 if(body.refreshToken)out.cookies.set("raeburn_talent_refresh",body.refreshToken,{httpOnly:true,secure,sameSite:"strict",path:"/",maxAge:body.refreshExpiresIn||2592000});
 return out;
}
