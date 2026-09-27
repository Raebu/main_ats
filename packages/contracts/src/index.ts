import { z } from "zod";

export const TenantId = z.string().min(1);
export const CorrelationId = z.string().min(1);
export const JobStatus = z.enum(["DRAFT","READY","PUBLISHED","PAUSED","CLOSED","ARCHIVED"]);
export const WorkflowStage = z.enum(["APPLIED","SCREENING","REVIEW","SHORTLIST","INTERVIEW","FINAL_INTERVIEW","OFFER","HIRED","REJECTED","WITHDRAWN","ON_HOLD","TALENT_POOL"]);

export const JobContract = z.object({
  id:z.string(), tenantId:TenantId, reference:z.string(), slug:z.string(), title:z.string(),
  hiringOrganisationId:z.string(), operatingOrganisationId:z.string().nullable().optional(),
  department:z.string().nullable().optional(), location:z.string(), workplaceType:z.string(),
  employmentType:z.string(), engagement:z.string().nullable().optional(), summary:z.string(),
  description:z.string(), requirements:z.string(), benefits:z.string().nullable().optional(),
  status:JobStatus, audiences:z.array(z.string()), datePosted:z.string().datetime().nullable().optional(),
  validThrough:z.string().datetime().nullable().optional(), version:z.number().int().positive()
});
export type Job = z.infer<typeof JobContract>;

export const CandidateContract = z.object({
  id:z.string(), tenantId:TenantId, email:z.string().email(), name:z.string(), telephone:z.string().nullable().optional(),
  location:z.string().nullable().optional(), linkedIn:z.string().nullable().optional(), portfolio:z.string().nullable().optional()
});
export type Candidate = z.infer<typeof CandidateContract>;

export const AttributionContract = z.object({
  firstTouch:z.string().nullable().optional(), lastTouch:z.string().nullable().optional(),
  applicationTouch:z.string().nullable().optional(), acquisitionSource:z.string().nullable().optional(),
  gateway:z.string().nullable().optional(), campaign:z.string().nullable().optional(),
  utmSource:z.string().nullable().optional(), utmMedium:z.string().nullable().optional(),
  utmCampaign:z.string().nullable().optional(), utmContent:z.string().nullable().optional(),
  utmTerm:z.string().nullable().optional(), referrer:z.string().nullable().optional(),
  referralCode:z.string().nullable().optional()
});

export const CreateApplicationContract = z.object({
  tenantId:TenantId, jobId:z.string(), candidate:z.object({
    name:z.string().min(2), email:z.string().email(), telephone:z.string().optional(),
    location:z.string().optional(), linkedIn:z.string().optional(), portfolio:z.string().optional()
  }),
  rightToWork:z.string().optional(), availability:z.string().optional(), coverNote:z.string().optional(),
  answers:z.array(z.object({questionId:z.string(),answer:z.string()})).default([]),
  privacyNoticeVersion:z.string(), privacyAcceptedAt:z.string().datetime(),
  attribution:AttributionContract.default({})
});
export type CreateApplication = z.infer<typeof CreateApplicationContract>;

export const ServiceErrorContract=z.object({code:z.string(),message:z.string(),correlationId:z.string().optional()});
