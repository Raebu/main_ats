import nodemailer from "nodemailer";

function transporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

export async function sendMail(to: string, subject: string, text: string) {
  const tx = transporter();
  if (!tx) return { status: "skipped" as const };
  const result = await tx.sendMail({
    from: process.env.SMTP_FROM || "Raeburn Talent <careers@theraeburngroup.com>",
    to,
    subject,
    text
  });
  return { status: "sent" as const, messageId: result.messageId };
}

export async function notifyNewApplication(input: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  applicationId: string;
  source?: string | null;
  gateway?: string | null;
  campaign?: string | null;
}) {
  const to = process.env.HIRING_NOTIFICATION_TO || process.env.ADMIN_EMAIL;
  if (!to) return { status: "skipped" as const };
  const base = process.env.APP_URL || "http://localhost:3000";
  return sendMail(
    to,
    `New application — ${input.jobTitle}`,
    [
      "NEW APPLICATION",
      "",
      input.jobTitle,
      `${input.candidateName} <${input.candidateEmail}>`,
      "",
      `Source: ${input.source || "direct"}`,
      `Gateway: ${input.gateway || "mainstream"}`,
      `Campaign: ${input.campaign || "—"}`,
      "",
      `View application: ${base}/admin/applications/${input.applicationId}`
    ].join("\n")
  );
}
