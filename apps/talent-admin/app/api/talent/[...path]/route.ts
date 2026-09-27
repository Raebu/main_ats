import{cookies}from"next/headers";import{NextResponse}from"next/server";
const API=process.env.TALENT_API_URL||"http://localhost:4100";
async function refresh(jar:any){
 const token=jar.get("raeburn_talent_refresh")?.value;if(!token)return null;
 const r=await fetch(API+"/v1/identity/refresh",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({refreshToken:token})});if(!r.ok)return null;return r.json();
}
async function forward(req:Request,ctx:{params:Promise<{path:string[]}>}){
 const jar=await cookies(),{path}=await ctx.params,url=new URL(req.url),target=API+"/v1/"+path.join("/")+(url.search||"");
 let token=jar.get("raeburn_talent_token")?.value,session:any=null;
 if(!token){session=await refresh(jar);token=session?.accessToken;}
 if(!token)return NextResponse.json({error:"Unauthenticated"},{status:401});
 const makeHeaders=()=>{const h=new Headers(req.headers);h.set("authorization","Bearer "+token);h.delete("host");return h;};
 const method=req.method,body=!["GET","HEAD"].includes(method)?await req.arrayBuffer():undefined;
 const call=()=>fetch(target,{method,headers:makeHeaders(),...(body?{body}:{})} as any);
 let r=await call();
 if(r.status===401&&!session){session=await refresh(jar);if(session?.accessToken){token=session.accessToken;r=await call();}}
 const out=new NextResponse(r.body,{status:r.status,headers:r.headers});
 if(session?.accessToken){out.cookies.set("raeburn_talent_token",session.accessToken,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:session.expiresIn||900});if(session.refreshToken)out.cookies.set("raeburn_talent_refresh",session.refreshToken,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:session.refreshExpiresIn||2592000});}
 if(r.status===401&&session===null){out.cookies.delete("raeburn_talent_token");out.cookies.delete("raeburn_talent_refresh");}
 return out;
}
export const GET=forward;export const POST=forward;export const PATCH=forward;export const PUT=forward;export const DELETE=forward;
