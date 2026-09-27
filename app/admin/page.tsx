import { db } from "@/lib/db";

export default async function Dashboard(){
  const [openJobs,totalApplications,newApps,interviews,offers,hires,needsReview]=await Promise.all([
    db.job.count({where:{status:"PUBLISHED"}}),
    db.application.count(),
    db.application.count({where:{stage:"NEW"}}),
    db.application.count({where:{stage:{in:["INTERVIEW","FINAL_INTERVIEW"]}}}),
    db.application.count({where:{stage:"OFFER"}}),
    db.application.count({where:{stage:"HIRED"}}),
    db.application.findMany({where:{stage:{in:["NEW","SCREENING","REVIEW"]}},include:{candidate:true,job:true},orderBy:{createdAt:"asc"},take:12})
  ]);
  return <>
    <h1>Recruitment dashboard</h1>
    <div className="stats">
      <div className="stat"><span className="muted">Open vacancies</span><strong>{openJobs}</strong></div>
      <div className="stat"><span className="muted">Applications</span><strong>{totalApplications}</strong></div>
      <div className="stat"><span className="muted">New</span><strong>{newApps}</strong></div>
      <div className="stat"><span className="muted">Interviews / offers</span><strong>{interviews+offers}</strong></div>
    </div>
    <h2 style={{marginTop:34}}>Needs attention</h2>
    <div className="tablewrap"><table className="table"><thead><tr><th>Candidate</th><th>Role</th><th>Stage</th><th>Age</th></tr></thead><tbody>
      {needsReview.map(a=><tr key={a.id}><td><a href={`/admin/applications/${a.id}`}><strong>{a.candidate.name}</strong></a></td><td>{a.job.title}</td><td><span className="stage">{a.stage}</span></td><td>{Math.max(0,Math.floor((Date.now()-a.createdAt.getTime())/86400000))}d</td></tr>)}
      {!needsReview.length && <tr><td colSpan={4}>Nothing waiting for review.</td></tr>}
    </tbody></table></div>
    <p className="muted">{hires} hires recorded.</p>
  </>;
}
