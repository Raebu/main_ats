import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import StageControl from "@/components/StageControl";

export default async function ApplicationPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const a=await db.application.findUnique({where:{id},include:{candidate:{include:{documents:true,notes:true}},job:true,answers:{include:{question:true}},stageHistory:{orderBy:{createdAt:"desc"}},communications:{orderBy:{createdAt:"desc"}}}});
  if(!a) notFound();
  return <>
    <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"start"}}><div><h1>{a.candidate.name}</h1><p className="muted">{a.job.title}</p></div><StageControl applicationId={a.id} current={a.stage}/></div>
    <div className="grid">
      <div className="card"><h3>Candidate</h3><p>{a.candidate.email}<br/>{a.candidate.telephone||"—"}<br/>{a.candidate.location||"—"}</p>{a.candidate.linkedIn&&<p><a href={a.candidate.linkedIn}>LinkedIn</a></p>}{a.candidate.portfolio&&<p><a href={a.candidate.portfolio}>Portfolio</a></p>}</div>
      <div className="card"><h3>Attribution</h3><p><strong>Source:</strong> {a.acquisitionSource||"direct"}<br/><strong>Gateway:</strong> {a.gateway||"mainstream"}<br/><strong>Campaign:</strong> {a.campaign||"—"}<br/><strong>First touch:</strong> {a.firstTouch||"—"}<br/><strong>Application touch:</strong> {a.applicationTouch||"—"}</p></div>
      <div className="card"><h3>Documents</h3>{a.candidate.documents.map(d=><p key={d.id}>{d.type}: {d.fileName}</p>)}</div>
    </div>
    <div className="card" style={{marginTop:18}}><h3>Application</h3><p><strong>Right to work:</strong> {a.rightToWork||"—"}</p><p><strong>Availability:</strong> {a.availability||"—"}</p><p style={{whiteSpace:"pre-wrap"}}>{a.coverNote||"No cover note."}</p>{a.answers.map(x=><div key={x.id}><strong>{x.question.prompt}</strong><p style={{whiteSpace:"pre-wrap"}}>{x.answer}</p></div>)}</div>
    {a.adjustmentRequested&&<div className="notice" style={{marginTop:18}}><strong>Restricted adjustment information</strong><p>{a.adjustmentDetails||"Candidate requested an adjustment; contact them to discuss."}</p></div>}
    <div className="card" style={{marginTop:18}}><h3>Stage history</h3>{a.stageHistory.map(h=><p key={h.id}>{h.createdAt.toLocaleString("en-GB")}: {h.fromStage||"—"} → {h.toStage}</p>)}</div>
  </>;
}
