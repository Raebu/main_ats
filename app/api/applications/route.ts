import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeAttribution } from "@/lib/attribution";
import { notifyNewApplication, sendMail } from "@/lib/email";
import { storeCandidateFile } from "@/lib/storage";

export const runtime = "nodejs";

const schema = z.object({
  jobId: z.string().min(1),
  name: z.string().min(2).max(150),
  email: z.string().email(),
  telephone: z.string().max(80).optional(),
  location: z.string().max(160).optional(),
  linkedin: z.string().url().optional().or(z.literal("")),
  portfolio: z.string().url().optional().or(z.literal("")),
  rightToWork: z.string().max(120).optional(),
  availability: z.string().max(200).optional(),
  coverNote: z.string().max(10000).optional(),
  adjustmentDetails: z.string().max(5000).optional()
});

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    if (form.get("privacyAccepted") !== "true") return NextResponse.json({ error: "Privacy acceptance is required." }, { status: 400 });
    const raw = Object.fromEntries([...form.entries()].filter(([,v]) => typeof v === "string")) as Record<string,string>;
    const data = schema.parse(raw);
    const job = await db.job.findFirst({ where: { id: data.jobId, status: "PUBLISHED" }, include: { questions: true } });
    if (!job) return NextResponse.json({ error: "This vacancy is not accepting applications." }, { status: 404 });

    const cv = form.get("cv");
    if (!(cv instanceof File) || cv.size === 0) return NextResponse.json({ error: "A CV is required." }, { status: 400 });
    if (cv.size > 10 * 1024 * 1024) return NextResponse.json({ error: "CV must be 10MB or smaller." }, { status: 400 });

    const candidate = await db.candidate.upsert({
      where: { email: data.email.toLowerCase() },
      update: { name: data.name, telephone: data.telephone || null, location: data.location || null, linkedIn: data.linkedin || null, portfolio: data.portfolio || null },
      create: { email: data.email.toLowerCase(), name: data.name, telephone: data.telephone || null, location: data.location || null, linkedIn: data.linkedin || null, portfolio: data.portfolio || null }
    });

    const attribution = normalizeAttribution(raw);
    const application = await db.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        coverNote: data.coverNote || null,
        rightToWork: data.rightToWork || null,
        availability: data.availability || null,
        adjustmentRequested: form.get("adjustmentRequested") === "true",
        adjustmentDetails: data.adjustmentDetails || null,
        privacyAcceptedAt: new Date(),
        ...attribution,
        stageHistory: { create: { toStage: "NEW", changedBy: "candidate" } },
        answers: {
          create: job.questions.flatMap(q => {
            const answer = String(form.get(`question_${q.id}`) || "").trim();
            if (!answer) return [];
            return [{ questionId: q.id, answer }];
          })
        }
      }
    });

    const storageUrl = await storeCandidateFile(cv, candidate.id);
    await db.candidateDocument.create({ data: { candidateId: candidate.id, type: "CV", fileName: cv.name, storageUrl } });

    const ack = await sendMail(candidate.email, `Application received — ${job.title}`, `Thank you for applying for ${job.title} at The Raeburn Group. We have received your application and will be in touch if we would like to progress it.`);
    await db.communication.create({ data: { applicationId: application.id, direction: "OUTBOUND", subject: `Application received — ${job.title}`, body: "Application acknowledgement", status: ack.status } });
    await notifyNewApplication({ candidateName:candidate.name,candidateEmail:candidate.email,jobTitle:job.title,applicationId:application.id,source:application.acquisitionSource,gateway:application.gateway,campaign:application.campaign });

    await db.auditLog.create({ data: { action:"application.created",entityType:"Application",entityId:application.id,metadata:{jobId:job.id,candidateId:candidate.id} } });
    return NextResponse.json({ ok: true, applicationId: application.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Please check the application fields and try again.", details: error.issues }, { status: 400 });
    if (error instanceof Error && error.message.includes("Unique constraint")) return NextResponse.json({ error: "You have already applied for this vacancy using this email address." }, { status: 409 });
    console.error(error);
    return NextResponse.json({ error: "Application submission failed." }, { status: 500 });
  }
}
