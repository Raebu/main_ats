import{NextResponse}from"next/server";import{careersRequestHeaders}from"../../../../lib/api";
const API=process.env.TALENT_API_URL||"http://localhost:4100";
export async function POST(req:Request){const body=await req.text();const r=await fetch(API+"/v1/privacy/consents/public",{method:"POST",headers:await careersRequestHeaders({"content-type":"application/json"}),body});return new NextResponse(r.body,{status:r.status,headers:{"content-type":r.headers.get("content-type")||"application/json"}});}
