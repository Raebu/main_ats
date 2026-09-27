"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AssessmentManager({
  applicationId,
  assessments
}: {
  applicationId: string;
  assessments: any[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<any[]>([]);
  const [detail, setDetail] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    for (const assessment of assessments) {
      const [submissionsRes, extensionsRes, reviewsRes] = await Promise.all([
        fetch("/api/talent/assessments/" + assessment.id + "/submissions"),
        fetch("/api/talent/assessments/" + assessment.id + "/extensions"),
        fetch("/api/talent/assessments/" + assessment.id + "/reviews")
      ]);
      setDetail(current => ({
        ...current,
        [assessment.id]: {
          submissions: submissionsRes.ok ? await submissionsRes.json() : [],
          extensions: extensionsRes.ok ? await extensionsRes.json() : [],
          reviews: reviewsRes.ok ? await reviewsRes.json() : []
        }
      }));
    }
  }

  useEffect(() => {
    fetch("/api/talent/assessments/templates")
      .then(r => (r.ok ? r.json() : []))
      .then(setTemplates);
    refresh();
    // assessment ids/statuses intentionally drive refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessments.map(a => a.id + ":" + a.status).join(",")]);

  async function call(path: string, method: string, body?: any) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/talent" + path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.message || "Action failed.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const due = String(form.get("dueAt") || "");
    await call("/assessments", "POST", {
      applicationId,
      templateId: String(form.get("templateId")),
      type: "WORK_SAMPLE",
      title: String(form.get("title")),
      dueAt: due ? new Date(due).toISOString() : undefined,
      blindReview: form.get("blindReview") === "on"
    });
  }

  async function review(id: string, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await call("/assessments/" + id + "/reviews", "POST", {
      scores: { overall: Number(form.get("overall")) },
      feedback: String(form.get("internalFeedback") || ""),
      candidateFeedback: String(form.get("candidateFeedback") || ""),
      publishFeedback: form.get("publishFeedback") === "on"
    });
  }

  async function extension(
    assessmentId: string,
    extensionId: string,
    status: "APPROVED" | "DECLINED",
    requested?: string
  ) {
    await call(
      "/assessments/" + assessmentId + "/extensions/" + extensionId,
      "PATCH",
      {
        status,
        dueAt:
          status === "APPROVED" && requested
            ? new Date(requested).toISOString()
            : undefined
      }
    );
  }

  return (
    <div className="card">
      <h3>Assessments</h3>

      {assessments.map(assessment => {
        const data = detail[assessment.id] || {
          submissions: [],
          extensions: [],
          reviews: []
        };
        const pending = data.extensions.find(
          (item: any) => item.status === "REQUESTED"
        );

        return (
          <div className="subCard" key={assessment.id}>
            <strong>
              {assessment.title} · {assessment.status}
            </strong>

            {assessment.due_at && (
              <p>Due {new Date(assessment.due_at).toLocaleString("en-GB")}</p>
            )}

            {assessment.template_version && (
              <small>Template version {assessment.template_version}</small>
            )}

            {pending && (
              <div className="notice">
                <p>
                  <strong>Extension requested:</strong> {pending.reason}
                </p>
                <label>
                  Approved deadline
                  <input
                    id={"extension_due_" + assessment.id}
                    type="datetime-local"
                    defaultValue={
                      pending.requested_due_at
                        ? new Date(pending.requested_due_at)
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() => {
                    const element = document.getElementById(
                      "extension_due_" + assessment.id
                    ) as HTMLInputElement | null;
                    extension(
                      assessment.id,
                      pending.id,
                      "APPROVED",
                      element?.value || pending.requested_due_at
                    );
                  }}
                >
                  Approve extension
                </button>{" "}
                <button
                  disabled={busy}
                  onClick={() =>
                    extension(assessment.id, pending.id, "DECLINED")
                  }
                >
                  Decline
                </button>
              </div>
            )}

            {data.submissions.map((submission: any) => (
              <div key={submission.id}>
                <h4>Candidate submission</h4>
                <pre>{JSON.stringify(submission.content, null, 2)}</pre>
              </div>
            ))}

            {assessment.status === "SUBMITTED" && (
              <form onSubmit={e => review(assessment.id, e)}>
                <label>
                  Overall score 1–5
                  <input
                    name="overall"
                    type="number"
                    min="1"
                    max="5"
                    required
                  />
                </label>
                <label>
                  Internal review
                  <textarea name="internalFeedback" />
                </label>
                <label>
                  Candidate feedback
                  <textarea name="candidateFeedback" required />
                </label>
                <label className="check">
                  <input name="publishFeedback" type="checkbox" /> Publish
                  feedback to candidate now
                </label>
                <button disabled={busy}>Save review</button>
              </form>
            )}
          </div>
        );
      })}

      <form className="subCard" onSubmit={create}>
        <h4>Assign assessment</h4>
        <select name="templateId" required>
          <option value="">Select template</option>
          {templates.map(template => (
            <option key={template.id} value={template.id}>
              {template.name} · v{template.version}
            </option>
          ))}
        </select>
        <input name="title" required placeholder="Assessment title" />
        <input name="dueAt" type="datetime-local" />
        <label className="check">
          <input name="blindReview" type="checkbox" /> Blind review
        </label>
        <button disabled={busy}>Assign assessment</button>
      </form>

      {message && <p role="alert">{message}</p>}
    </div>
  );
}
