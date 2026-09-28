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
  interviewRescheduleRequested:"interview.reschedule_requested.v1",
  interviewRescheduleDecided:"interview.reschedule_decided.v1",
  assessmentAssigned:"assessment.assigned.v1",
  assessmentSubmitted:"assessment.submitted.v1",
  assessmentFeedbackPublished:"assessment.feedback_published.v1",
  assessmentExtensionRequested:"assessment.extension_requested.v1",
  assessmentExtensionDecided:"assessment.extension_decided.v1",
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


export const PlatformEvents={
  deadLetter:"platform.dead_letter.v1",
  replayRequested:"platform.replay_requested.v1"
} as const;

const IdentifierPayload=z.object({
  id:z.string().optional(),
  applicationId:z.string().optional(),
  candidateId:z.string().optional(),
  jobId:z.string().optional()
}).passthrough();

export const EventSchemaRegistry:Record<string,z.ZodTypeAny>={
  ...Object.fromEntries(Object.values(Events).map(type=>[type,IdentifierPayload])),
  [PlatformEvents.deadLetter]:z.object({
    originalEventId:z.string().optional(),
    originalEventType:z.string().optional(),
    consumer:z.string(),
    subject:z.string(),
    error:z.string(),
    deliveries:z.number().int().positive()
  }).passthrough(),
  [PlatformEvents.replayRequested]:z.object({
    originalEventId:z.string(),
    requestedBy:z.string().optional()
  }).passthrough()
};

export function eventSchemaFor(eventType:string){
  if(EventSchemaRegistry[eventType])return EventSchemaRegistry[eventType];
  if(/^scheduler\.[a-z0-9_.-]+\.due\.v1$/i.test(eventType))return IdentifierPayload;
  return null;
}

export function validateDomainEvent(input:unknown):DomainEvent{
  const event=EventEnvelope.parse(input),schema=eventSchemaFor(event.eventType);
  if(!schema&&process.env.ALLOW_UNREGISTERED_EVENTS!=="true")throw new Error("Unregistered event type: "+event.eventType);
  if(schema)schema.parse(event.payload);
  const suffix=event.eventType.match(/\.v(\d+)$/);
  if(suffix&&Number(suffix[1])!==event.eventVersion)throw new Error("Event type/version mismatch: "+event.eventType+" vs "+event.eventVersion);
  return event;
}
