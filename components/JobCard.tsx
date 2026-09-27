import Link from "next/link";
import type { Job } from "@prisma/client";

export default function JobCard({ job, gateway = "mainstream" }: { job: Job; gateway?: string }) {
  return <article className="card jobcard">
    <div className="meta">
      {job.department && <span className="tag">{job.department}</span>}
      {job.operatingHome && <span className="tag">{job.operatingHome}</span>}
    </div>
    <h3>{job.title}</h3>
    <div className="muted">{job.location}</div>
    <p>{job.summary}</p>
    <div><Link className="button" href={`/careers/jobs/${job.slug}?gateway=${gateway}`}>View opportunity</Link></div>
  </article>;
}
