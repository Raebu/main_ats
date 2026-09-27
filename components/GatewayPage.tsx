import JobCard from "@/components/JobCard";
import { gatewayCopy, publishedJobs } from "@/lib/jobs";

export default async function GatewayPage({ gateway }: { gateway: string }) {
  const copy = gatewayCopy[gateway] || gatewayCopy.mainstream;
  const jobs = await publishedJobs(gateway);
  return <>
    <section className="hero"><div className="shell">
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
      <div className="pillrow">{copy.bullets.map(x => <span className="pill" key={x}>{x}</span>)}</div>
    </div></section>
    <section className="section"><div className="shell">
      <h2>Current opportunities</h2>
      {jobs.length ? <div className="grid">{jobs.map(job => <JobCard key={job.id} job={job} gateway={gateway} />)}</div> : <div className="notice">There are no published opportunities in this gateway right now.</div>}
    </div></section>
  </>;
}
