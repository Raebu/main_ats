import{NextResponse}from"next/server";const API=process.env.TALENT_API_URL||"http://localhost:4100";

function secureCookie(req:Request){
 const forwarded=(req.headers.get("x-forwarded-proto")||"").split(",")[0]?.trim().toLowerCase();
 if(forwarded)return forwarded==="https";
 return new URL(req.url).protocol==="https:";
}

export async function POST(req:Request){
 const form=await req.formData();
 const response=await fetch(API+"/v1/identity/login",{method:"POST",headers:{"content-type":"application/json","user-agent":req.headers.get("user-agent")||""},body:JSON.stringify({email:String(form.get("email")||""),password:String(form.get("password")||"")})});
 const body=await response.json();
 if(!response.ok)return NextResponse.redirect(new URL("/login?error=1",req.url),303);
 const secure=secureCookie(req);
 if(body.mfaRequired){
  const out=NextResponse.redirect(new URL("/login/mfa",req.url),303);
  out.cookies.set("raeburn_mfa_pending",body.preAuthToken,{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:300});
  return out;
 }
 const out=NextResponse.redirect(new URL("/",req.url),303);
 out.cookies.set("raeburn_talent_token",body.accessToken,{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:body.expiresIn||900});
 if(body.refreshToken)out.cookies.set("raeburn_talent_refresh",body.refreshToken,{httpOnly:true,secure,sameSite:"strict",path:"/",maxAge:body.refreshExpiresIn||2592000});
 return out;
}
