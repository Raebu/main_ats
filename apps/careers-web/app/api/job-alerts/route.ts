import{NextResponse}from"next/server";import{careersRequestHeaders}from"../../../lib/api";
const API=process.env.TALENT_API_URL||"http://localhost:4100";
export async function POST(req:Request){const body=await req.json();const r=await fetch(API+"/v1/applications/job-alerts",{method:"POST",headers:await careersRequestHeaders({"content-type":"application/json"}),body:JSON.stringify(body)});return NextResponse.json(await r.json(),{status:r.status});}
