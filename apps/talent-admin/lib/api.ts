import{cookies}from"next/headers";
const API=process.env.TALENT_API_URL||"http://localhost:4100";
export async function api(path:string,init:RequestInit={}){
 const token=(await cookies()).get("raeburn_talent_token")?.value;
 const headers=new Headers(init.headers);
 if(token)headers.set("authorization","Bearer "+token);
 const r=await fetch(API+path,{...init,headers,cache:"no-store"});
 if(!r.ok)return null;
 return r.json();
}