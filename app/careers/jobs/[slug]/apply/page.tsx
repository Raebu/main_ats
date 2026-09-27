import { notFound } from "next/navigation";
import ApplicationForm from "@/components/ApplicationForm";
import { jobBySlug } from "@/lib/jobs";

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await jobBySlug(slug);
  if (!job || job.status !== "PUBLISHED") notFound();
  return <section className="section"><div className="shell">
    <h1>Apply</h1>
    <ApplicationForm jobId={job.id} jobTitle={job.title} questions={job.questions} />
  </div></section>;
}
