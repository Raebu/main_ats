"use client";

import { FormEvent, useState } from "react";
import { readAttributionClient } from "@/components/AttributionCapture";

type Question = { id: string; prompt: string; required: boolean };

export default function ApplicationForm({ jobId, jobTitle, questions }: { jobId: string; jobTitle: string; questions: Question[] }) {
  const [state, setState] = useState<"idle"|"sending"|"done"|"error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = new FormData(event.currentTarget);
    form.set("jobId", jobId);
    const attribution = readAttributionClient();
    Object.entries(attribution).forEach(([key,value]) => form.set(key,value));
    form.set("application_touch", attribution.source || attribution.utm_source || "direct");

    const response = await fetch("/api/applications", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(body.error || "We could not submit your application. Please review the form and try again.");
      return;
    }
    setState("done");
    setMessage("Your application has been received. We have sent it to the Raeburn hiring team.");
    event.currentTarget.reset();
  }

  if (state === "done") return <div className="notice success"><strong>Application received.</strong><p>{message}</p></div>;

  return <form className="form" onSubmit={submit}>
    <div className="notice"><strong>Applying for {jobTitle}</strong><p className="muted">Your information is used for recruitment and handled under the Raeburn recruitment privacy process.</p></div>
    <div className="field"><label htmlFor="name">Name *</label><input id="name" name="name" required /></div>
    <div className="field"><label htmlFor="email">Email *</label><input id="email" name="email" type="email" required /></div>
    <div className="field"><label htmlFor="telephone">Telephone</label><input id="telephone" name="telephone" /></div>
    <div className="field"><label htmlFor="location">Location</label><input id="location" name="location" /></div>
    <div className="field"><label htmlFor="cv">CV *</label><input id="cv" name="cv" type="file" accept=".pdf,.doc,.docx" required /></div>
    <div className="field"><label htmlFor="linkedin">LinkedIn</label><input id="linkedin" name="linkedin" type="url" /></div>
    <div className="field"><label htmlFor="portfolio">Portfolio / GitHub / website</label><input id="portfolio" name="portfolio" type="url" /></div>
    <div className="field"><label htmlFor="rightToWork">Right to work</label><select id="rightToWork" name="rightToWork"><option value="">Select</option><option>Yes</option><option>Requires sponsorship</option><option>Prefer to discuss</option></select></div>
    <div className="field"><label htmlFor="availability">Availability</label><input id="availability" name="availability" placeholder="e.g. 4 weeks" /></div>
    {questions.map((q,index)=><div className="field" key={q.id}><label htmlFor={`q-${q.id}`}>{q.prompt}{q.required ? " *" : ""}</label><textarea id={`q-${q.id}`} name={`question_${q.id}`} required={q.required} /></div>)}
    <div className="field"><label htmlFor="coverNote">Optional cover note</label><textarea id="coverNote" name="coverNote" /></div>
    <div className="field"><label><input type="checkbox" name="adjustmentRequested" value="true" /> I would like to request a reasonable adjustment or alternative recruitment format.</label></div>
    <div className="field"><label htmlFor="adjustmentDetails">Adjustment details (optional)</label><textarea id="adjustmentDetails" name="adjustmentDetails" /></div>
    <div className="field"><label><input type="checkbox" name="privacyAccepted" value="true" required /> I have read the recruitment privacy information and consent to my application data being processed for recruitment. *</label></div>
    {state === "error" && <div className="notice">{message}</div>}
    <button className="button" type="submit" disabled={state==="sending"}>{state==="sending" ? "Submitting…" : "Submit application"}</button>
  </form>;
}
