import { db } from "@/lib/db";

export default async function CandidatesPage(){
  const candidates=await db.candidate.findMany({include:{_count:{select:{applications:true}}},orderBy:{updatedAt:"desc"},take:250});
  return <><h1>Candidates</h1><div className="tablewrap"><table className="table"><thead><tr><th>Name</th><th>Email</th><th>Location</th><th>Applications</th><th>Updated</th></tr></thead><tbody>
  {candidates.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.email}</td><td>{c.location||"—"}</td><td>{c._count.applications}</td><td>{c.updatedAt.toLocaleDateString("en-GB")}</td></tr>)}
  </tbody></table></div></>;
}
