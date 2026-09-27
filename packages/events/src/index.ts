import { randomUUID } from "node:crypto";
import { z } from "zod";

export const EventEnvelope = z.object({
  eventId:z.string(),
  eventType:z.string(),
  eventVersion:z.number().int().positive(),
  occurredAt:z.string().datetime(),
  producer:z.string(),
  correlationId:z.string(),
  causationId:z.string().nullable().optional(),
  tenantId:z.string(),
  payload:z.unknown()
});
export type DomainEvent = z.infer<typeof EventEnvelope>;

export function createEvent(input:Omit<DomainEvent,"eventId"|"occurredAt">):DomainEvent{
  return EventEnvelope.parse({...input,eventId:randomUUID(),occurredAt:new Date().toISOString()});
}

export const Events={
  jobCreated:"job.created.v1",
  jobUpdated:"job.updated.v1",
  jobPublished:"job.published.v1",
  jobClosed:"job.closed.v1",
  candidateCreated:"candidate.created.v1",
  candidateUpdated:"candidate.updated.v1",
  applicationCreated:"application.created.v1",
  applicationWithdrawn:"application.withdrawn.v1",
  workflowStageChanged:"workflow.stage_changed.v1",
  interviewRequested:"interview.requested.v1",
  interviewScheduled:"interview.scheduled.v1",
  interviewCompleted:"interview.completed.v1",
  interviewFeedbackReminder:"interview.feedback_reminder.v1",
  assessmentAssigned:"assessment.assigned.v1",
  assessmentSubmitted:"assessment.submitted.v1",
  assessmentFeedbackPublished:"assessment.feedback_published.v1",
  offerCreated:"offer.created.v1",
  offerIssued:"offer.issued.v1",
  offerAccepted:"offer.accepted.v1",
  offerDeclined:"offer.declined.v1",
  offerExpired:"offer.expired.v1",
  candidateHired:"candidate.hired.v1",
  onboardingCreated:"onboarding.created.v1",
  onboardingTaskCompleted:"onboarding.task_completed.v1",
  onboardingHandoffRequested:"onboarding.handoff_requested.v1",
  talentPoolCreated:"talent_pool.created.v1",
  candidateAddedToPool:"candidate.added_to_pool.v1",
  candidateRemovedFromPool:"candidate.removed_from_pool.v1",
  documentUploaded:"document.uploaded.v1",
  documentProcessed:"document.processed.v1",
  distributionRequested:"distribution.requested.v1",
  distributionPublished:"distribution.published.v1",
  distributionFailed:"distribution.failed.v1",
  communicationSent:"communication.sent.v1",
  communicationFailed:"communication.failed.v1"
} as const;
