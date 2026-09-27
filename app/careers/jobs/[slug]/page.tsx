import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { jobBySlug } from "@/lib/jobs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const job = await jobBySlug(slug);
  if (!job) return { title: "Opportunity" };
  return { title: job.title, description: job.summary };
}

export default async function JobPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const { slug } = await params;
  const query = await searchParams;
  const job = await jobBySlug(slug);
  if (!job || job.status !== "PUBLISHED") notFound();
  const gateway = typeof query.gateway === "string" ? query.gateway : "mainstream";

  const base = process.env.APP_URL || "https://theraeburngroup.com";
  const jsonLd = {
    "@context":"https://schema.org",
    "@type":"JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.datePosted?.toISOString().slice(0,10),
    validThrough: job.validThrough?.toISOString(),
    employmentType: job.employmentType,
    hiringOrganization: { "@type":"Organization", name: job.employer, sameAs:"https://theraeburngroup.com" },
    jobLocationType: job.workplaceType.toLowerCase().includes("remote") ? "TELECOMMUTE" : undefined,
    applicantLocationRequirements: { "@type":"Country", name:"GB" },
    directApply: job.directApply,
    url: `${base}/careers/jobs/${job.slug}`,
    identifier: { "@type":"PropertyValue", name: job.employer, value: job.reference }
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd)}} />
    <section className="hero"><div className="shell">
      <div className="meta"><span className="pill">{job.reference}</span>{job.department && <span className="pill">{job.department}</span>}</div>
      <h1>{job.title}</h1>
      <p>{job.summary}</p>
      <div className="pillrow"><span className="pill">{job.location}</span>{job.operatingHome && <span className="pill">{job.operatingHome}</span>}{job.engagement && <span className="pill">{job.engagement}</span>}</div>
    </div></section>
    <section className="section"><div className="shell">
      <div className="prose">
        <h2>The opportunity</h2><p style={{whiteSpace:"pre-wrap"}}>{job.description}</p>
        <h2>What we’re looking for</h2><p style={{whiteSpace:"pre-wrap"}}>{job.requirements}</p>
        {job.benefits && <><h2>What we offer</h2><p style={{whiteSpace:"pre-wrap"}}>{job.benefits}</p></>}
        <p><Link className="button" href={`/careers/jobs/${job.slug}/apply?gateway=${encodeURIComponent(gateway)}`}>Apply now</Link></p>
      </div>
    </div></section>
  </>;
}
