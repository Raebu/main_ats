import { randomUUID } from "node:crypto";
import { JSONCodec } from "nats";
import nodemailer from "nodemailer";
import type { DomainEvent } from "@raeburn/events";
import { createEvent, Events } from "@raeburn/events";
import { eventBus, pool, withTransaction, writeOutbox } from "@raeburn/service-kit";

const bus = await eventBus();
const codec = JSONCodec<DomainEvent>();
const tx = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});

const APPLICATIONS = process.env.APPLICATIONS_URL || "http://localhost:4103";
const CANDIDATES = process.env.CANDIDATES_URL || "http://localhost:4102";
const JOBS = process.env.JOBS_URL || "http://localhost:4101";

async function hydrate(tenantId: string, correlationId: string, applicationId: string) {
  const headers = { "x-tenant-id": tenantId, "x-correlation-id": correlationId };
  const aRes = await fetch(APPLICATIONS + "/v1/applications/" + applicationId, { headers });
  if (!aRes.ok) return null;
  const application: any = await aRes.json();
  const [cRes, jRes] = await Promise.all([
    fetch(CANDIDATES + "/v1/candidates/" + application.candidateId, { headers }),
    fetch(JOBS + "/v1/jobs/" + application.jobId, { headers })
  ]);
  return {
    application,
    candidate: cRes.ok ? await cRes.json() : null,
    job: jRes.ok ? await jRes.json() : null
  };
}

async function sendMessage(
  e: DomainEvent,
  applicationId: string | null,
  recipient: string,
  subject: string,
  body: string
) {
  let providerId: string | undefined;
  let status = "SKIPPED";

  if (process.env.SMTP_HOST) {
    const result = await tx.sendMail({
      from: process.env.SMTP_FROM || "Raeburn Talent <careers@theraeburngroup.com>",
      to: recipient,
      subject,
      text: body,
      disableFileAccess: true,
      disableUrlAccess: true
    });
    providerId = result.messageId;
    status = "SENT";
  }

  await withTransaction(async client => {
    const id = randomUUID();
    await client.query(
      "insert into messages(id,tenant_id,application_id,recipient,subject,body,status,provider_message_id,sent_at) values($1,$2,$3,$4,$5,$6,$7,$8,case when $7='SENT' then now() else null end)",
      [id, e.tenantId, applicationId, recipient, subject, body, status, providerId || null]
    );
    await writeOutbox(
      client,
      createEvent({
        eventType: Events.communicationSent,
        eventVersion: 1,
        producer: "communications",
        correlationId: e.correlationId,
        causationId: e.eventId,
        tenantId: e.tenantId,
        payload: { id, applicationId, recipient, subject, status, providerMessageId: providerId || null }
      })
    );
  });
}

async function handle(subject: string) {
  const sub = bus.subscribe(subject);

  for await (const msg of sub) {
    const e = codec.decode(msg.data);
    if ((await pool.query("select 1 from processed_events where event_id=$1", [e.eventId])).rowCount) continue;

    try {
      const p: any = e.payload || {};
      let applicationId = p.applicationId || p.application_id || p.id;

      if (subject === "job.published.v1") {
        const r=await fetch(APPLICATIONS+"/v1/applications/job-alerts/match",{method:"POST",headers:{"content-type":"application/json","x-tenant-id":e.tenantId,"x-correlation-id":e.correlationId},body:JSON.stringify(p)}),alerts:any[]=r.ok?await r.json():[];
        for(const alert of alerts){if(alert.candidateId){const cr=await fetch(CANDIDATES+"/v1/candidates/"+alert.candidateId,{headers:{"x-tenant-id":e.tenantId,"x-correlation-id":e.correlationId}}),candidate:any=cr.ok?await cr.json():null;if(candidate?.doNotContact)continue;}await sendMessage(e,null,alert.email,"New Raeburn opportunity — "+(p.title||"Careers"),"A new opportunity matches your Raeburn job alert: "+(p.title||"Open role")+(p.location?" · "+p.location:"")+". Explore the role at "+(process.env.CAREERS_BASE_URL||"https://theraeburngroup.com")+"/careers/jobs/"+p.slug+".");}
      } else if (subject === "application.created.v1") {
        applicationId = p.id;
        const recipient = p.candidate?.email;
        if (recipient) {
          await sendMessage(
            e,
            applicationId,
            recipient,
            "Application received — " + (p.job?.title || "Raeburn opportunity"),
            "Thank you for applying for " + (p.job?.title || "this opportunity") +
              " at The Raeburn Group. We have received your application and will keep you updated."
          );
        }
      } else if (subject === "interview.feedback_reminder.v1" && p.reviewerId && String(p.reviewerId).includes("@")) {
        await sendMessage(e,p.applicationId,String(p.reviewerId),"Interview feedback reminder — Raeburn Talent","Your independent interview scorecard is due. Please submit your evidence before panel feedback is opened.");
      } else if (["scheduler.candidate_keep_in_touch.due.v1","scheduler.candidate_reengagement.due.v1","scheduler.candidate_application_anniversary.due.v1"].includes(subject)) {
        if (!applicationId) {
          await pool.query("insert into processed_events(event_id) values($1) on conflict do nothing", [e.eventId]);
          continue;
        }
        const h = await hydrate(e.tenantId, e.correlationId, applicationId);
        const recipient = h?.candidate?.email;
        if (recipient && !h?.candidate?.doNotContact) {
          if (subject === "scheduler.candidate_keep_in_touch.due.v1") await sendMessage(e,applicationId,recipient,"Relevant opportunities at The Raeburn Group","You asked us to keep in touch about recruitment opportunities. Explore current Raeburn roles through Careers, or update your communication preferences in My Raeburn.");
          if (subject === "scheduler.candidate_reengagement.due.v1") await sendMessage(e,applicationId,recipient,"Still open to opportunities with Raeburn?","We are checking in because you chose to hear about future opportunities. If your interests have changed, update your profile and preferences in My Raeburn.");
          if (subject === "scheduler.candidate_application_anniversary.due.v1") await sendMessage(e,applicationId,recipient,"Your Raeburn recruitment preferences","It has been around a year since this application. Please review your profile, job alerts and recruitment communication preferences in My Raeburn so we only retain and use information in ways you still expect.");
        }
      } else {
        if (!applicationId) {
          await pool.query("insert into processed_events(event_id) values($1) on conflict do nothing", [e.eventId]);
          continue;
        }

        const h = await hydrate(e.tenantId, e.correlationId, applicationId);
        const recipient = h?.candidate?.email;

        if (recipient && subject === "interview.scheduled.v1") {
          const when = p.starts_at || p.startsAt;
          await sendMessage(
            e,
            applicationId,
            recipient,
            "Interview scheduled — " + (h?.job?.title || "Raeburn opportunity"),
            "Your interview for " + (h?.job?.title || "this opportunity") +
              " has been scheduled" +
              (when ? " for " + new Date(when).toLocaleString("en-GB") : "") +
              ". We will provide any joining details separately."
          );
        }

        if (recipient && subject === "assessment.assigned.v1") {
          await sendMessage(e,applicationId,recipient,"Assessment assigned — "+(h?.job?.title||"Raeburn opportunity"),"An assessment has been assigned to your application. Sign in to your candidate portal to review the instructions and deadline.");
        }

        if (recipient && subject === "offer.issued.v1") {
          await sendMessage(
            e,
            applicationId,
            recipient,
            "Offer update — " + (h?.job?.title || "Raeburn opportunity"),
            "An offer has been issued for your application for " +
              (h?.job?.title || "this opportunity") +
              ". Please review the offer information provided by the recruitment team."
          );
        }

        if (recipient && subject === "offer.expired.v1") {
          await sendMessage(e,applicationId,recipient,"Offer expired — "+(h?.job?.title||"Raeburn opportunity"),"The offer associated with your application has expired. Please contact the recruitment team if you believe this is unexpected.");
        }

        if (recipient && subject === "candidate.hired.v1") {
          await sendMessage(
            e,
            applicationId,
            recipient,
            "Welcome to The Raeburn Group",
            "We are delighted to confirm that your recruitment process has reached the hired stage. The team will contact you with onboarding information."
          );
        }
      }

      await pool.query("insert into processed_events(event_id) values($1) on conflict do nothing", [e.eventId]);
    } catch (err) {
      console.error("communication failed", e.eventId, err);
      await withTransaction(async client => {
        await writeOutbox(
          client,
          createEvent({
            eventType: Events.communicationFailed,
            eventVersion: 1,
            producer: "communications",
            correlationId: e.correlationId,
            causationId: e.eventId,
            tenantId: e.tenantId,
            payload: {
              sourceEvent: e.eventType,
              error: err instanceof Error ? err.message : String(err)
            }
          })
        );
      });
    }
  }
}

for (const subject of [
  "job.published.v1",
  "application.created.v1",
  "interview.scheduled.v1",
  "interview.feedback_reminder.v1",
  "assessment.assigned.v1",
  "offer.issued.v1",
  "offer.expired.v1",
  "candidate.hired.v1",
  "scheduler.candidate_keep_in_touch.due.v1",
  "scheduler.candidate_reengagement.due.v1",
  "scheduler.candidate_application_anniversary.due.v1"
]) {
  handle(subject);
}
