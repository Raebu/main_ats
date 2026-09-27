import { db } from "@/lib/db";

export default async function ApplicationsPage(){
  const rows=await db.application.findMany({include:{candidate:true,job:true},orderBy:{createdAt:"desc"},take:250});
  return <>
    <h1>Applications</h1>
    <div className="tablewrap"><table className="table"><thead><tr><th>Candidate</th><th>Role</th><th>Stage</th><th>Source</th><th>Gateway</th><th>Applied</th></tr></thead><tbody>
      {rows.map(a=><tr key={a.id}><td><a href={`/admin/applications/${a.id}`}><strong>{a.candidate.name}</strong></a><div className="muted">{a.candidate.email}</div></td><td>{a.job.title}</td><td><span className="stage">{a.stage}</span></td><td>{a.acquisitionSource||"direct"}</td><td>{a.gateway||"mainstream"}</td><td>{a.createdAt.toLocaleDateString("en-GB")}</td></tr>)}
    </tbody></table></div>
  </>;
}
