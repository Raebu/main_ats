# Raeburn Talent

**Raeburn Talent** is The Raeburn Group's first-party recruitment platform: a distributed, tenant-aware ATS, recruitment CRM, careers platform, distribution engine, attribution platform and future recruitment-intelligence product.

> **Architecture status:** the repository was initially bootstrapped as a single modular Next.js application to get the first recruitment slice working quickly. That implementation is now transitional. The locked target architecture is a **microservices monorepo** with independently deployable services, service-owned data, versioned APIs/events and asynchronous domain integration.

## Core principle

**One job → one canonical record → many recruitment channels → one application system → complete source attribution.**

Raeburn Talent is independent of the corporate website. `theraeburngroup.com` consumes Talent APIs; it does not own ATS business logic or recruitment data.

The first Raeburn deployment is designed so the platform can later become a commercial Raeburn Automation Labs product without a ground-up rebuild.

## Target topology

```text
PUBLIC INTERNET
    │
Cloudflare DNS / WAF / CDN
    │
    ├── theraeburngroup.com
    │     Corporate + Careers UI (Vercel / Next.js)
    │
    └── talent.theraeburngroup.com
          ATS Admin UI (Vercel / Next.js)
                │
        TALENT API GATEWAY
                │
       Identity / Authorisation
                │
      ┌─────────┼──────────┐
      │         │          │
 CORE DOMAIN  PLATFORM   INTELLIGENCE
 SERVICES     SERVICES    SERVICES
      │         │          │
 Jobs        Distribution Search
 Candidates  Communications Analytics
 Applications Documents    AI / Copilot
 Workflow    Notifications Recommendations
 Interviews  Campaigns
 Offers      Integrations
 TalentPools Webhooks
      │         │
      └────┬────┘
           │
      EVENT PLATFORM
   Queue / Event Bus / Scheduler
           │
      DATA PLATFORM
```

The frontends stay deliberately thin. Business logic belongs behind the API gateway in domain services.

## Public surfaces

- `https://theraeburngroup.com/careers`
- `https://theraeburngroup.com/careers/jobs`
- `https://theraeburngroup.com/careers/jobs/[slug]`
- `https://theraeburngroup.com/careers/disability-confident`
- `https://theraeburngroup.com/careers/women`
- `https://theraeburngroup.com/careers/forces-veterans`
- `https://theraeburngroup.com/careers/returners`
- `https://theraeburngroup.com/careers/early-careers`
- `https://theraeburngroup.com/careers/founders`
- ATS: `https://talent.theraeburngroup.com`
- API: `https://api.talent.theraeburngroup.com/v1/*`
- Webhooks: `https://hooks.talent.theraeburngroup.com/*`

Future Raeburn businesses can consume the same Jobs/Careers APIs without duplicating vacancies or ATS logic.

# Architectural rules

These are platform rules, not suggestions.

1. Raeburn Talent is independent of the corporate website.
2. Each microservice owns its data.
3. Services communicate through APIs and events, never cross-service SQL.
4. Every domain event is versioned.
5. Transactional Outbox is used for reliable event publication.
6. Consumers must be idempotent.
7. One canonical vacancy feeds every channel.
8. Candidate and Application remain separate domain entities.
9. Attribution is first-class from first touch through hire.
10. Job-board providers are adapters, not Jobs Service logic.
11. Documents and sensitive data are isolated.
12. AI is advisory and removable from the critical application path.
13. The system is tenant-aware from the beginning.
14. Human and service identities are separate.
15. No service database is publicly reachable.
16. Long-running downstream work must not block an application submission.
17. All important changes are auditable using correlation IDs.
18. The monorepo contains separate deployables, not one distributed monolith.

# Repository architecture

We use a **microservices monorepo**: separate deployables with shared contracts.

```text
main_ats/
├── apps/
│   ├── careers-web/
│   └── talent-admin/
├── services/
│   ├── api-gateway/
│   ├── identity/
│   ├── organisations/
│   ├── jobs/
│   ├── candidates/
│   ├── applications/
│   ├── attribution/
│   ├── workflow/
│   ├── interviews/
│   ├── assessments/
│   ├── offers/
│   ├── talent-pools/
│   ├── documents/
│   ├── privacy/
│   ├── distribution/
│   ├── communications/
│   ├── notifications/
│   ├── integrations/
│   ├── webhooks/
│   ├── search/
│   ├── analytics/
│   ├── audit/
│   ├── intelligence/
│   ├── configuration/
│   ├── feature-flags/
│   └── scheduler/
├── connectors/
│   ├── google-jobs/
│   ├── indeed/
│   ├── linkedin/
│   ├── adzuna/
│   ├── jooble/
│   ├── xml-feed/
│   ├── gmail/
│   └── google-calendar/
├── packages/
│   ├── contracts/
│   ├── events/
│   ├── auth/
│   ├── observability/
│   ├── ui/
│   └── config/
├── infrastructure/
│   ├── cloudflare/
│   ├── vercel/
│   ├── databases/
│   ├── queues/
│   └── monitoring/
└── docs/
```

The current root-level Next.js implementation is transitional and will be progressively moved into these boundaries without discarding working product behaviour.

# Service boundaries

## API Gateway

Public entry point for all platform APIs.

Responsibilities: authentication, authorisation, rate limiting, request validation, API versioning, service routing, correlation IDs, tenant context, request logging, CORS and abuse protection.

The gateway does **not** own recruitment business logic.

Examples:

```text
GET  /v1/jobs           → Jobs Service
POST /v1/applications   → Application Service
GET  /v1/candidates/:id → Candidate Service
```

## Identity & Access Service

Owns internal human and service identity.

Initial RBAC:
- Platform Admin
- Group Admin
- Recruiter
- Hiring Manager
- Interviewer
- Viewer

Future ABAC can restrict access by organisation and sensitive-data class. Service-to-service authentication is distinct from human sessions.

## Organisation Service

Models The Raeburn Group and future tenants, including organisations, brands, departments, teams, locations, legal entities, careers configuration and hiring configuration.

Jobs refer to organisation IDs rather than hard-coded subsidiaries.

## Jobs Service

Authoritative vacancy domain.

Owns jobs, job versions, requirements, questions, locations, compensation, audiences and status history.

Lifecycle:

`DRAFT → READY → PUBLISHED → PAUSED → CLOSED → ARCHIVED`

Emits versioned events such as `job.created.v1`, `job.updated.v1`, `job.published.v1` and `job.closed.v1`.

## Candidate Service

Owns the **person**, not an application.

Owns candidate identity, contact details, profile links, preferences, tags, history and deduplication.

## Application Service

Owns the relationship **Candidate ↔ Vacancy**.

Submission must return quickly. Email, analytics, AI, search indexing and external integrations are downstream asynchronous work.

A successful submission atomically writes:

```text
application
+
outbox event
```

## Attribution Service

Multi-touch recruitment attribution is its own domain.

Captures visitor/session, first touch, last touch, application touch, campaign, gateway, referrer, UTM fields, referral, job and conversions through final hire.

Original source history is never overwritten.

## Workflow Service

Owns pipelines, stages, transitions, stage history, workflow rules, tasks and SLAs.

Default flow:

`Applied → Screening → Review → Shortlisted → Interview → Final Interview → Offer → Hired`

Exit states: Rejected, Withdrawn, On Hold, Talent Pool.

## Interview Service

Owns interviews, rounds, participants, availability, meetings, scorecards and feedback. Calendar provider logic lives in Integration/Connector services.

## Assessment Service

Owns screening questions, work samples, technical exercises, presentations, portfolio reviews and structured assessments.

Assessment results are evidence for human decision-makers, not opaque automatic hiring decisions.

## Offer Service

Owns offer versions, compensation, equity, conditions, approvals, acceptance and withdrawal.

## Talent Pool Service

Owns reusable candidate communities such as AI & Engineering, Commercial, Finance, Compliance, Design, Operations, Leadership and Future Founders.

## Document Service

All candidate documents are private.

Handles validation, size limits, malware/security scanning, storage keys, signed uploads and authorised temporary access.

There are **no public CV URLs**. Cloudflare R2 is a preferred object-storage option.

## Privacy & Compliance Service

Owns privacy notice versions, consent records, retention rules, DSARs, deletion requests, anonymisation, legal holds and processing records.

Reasonable-adjustment information is separately permissioned.

## Distribution Service

Consumes `job.published.v1` and manages destinations, publications, attempts, external references, statuses and retries.

Targets include Raeburn gateways, Google Jobs, external boards and standard feeds.

## Job-board connectors

Provider logic is isolated behind a common contract:

```text
publish(job)
update(job)
close(job)
status(job)
```

Connectors can include Google Jobs, Indeed, LinkedIn, Adzuna, Jooble, XML/JSON feeds and future specialist boards.

## Careers Gateway Service

Controls which live jobs appear in MAINSTREAM, DISABILITY_CONFIDENT, WOMEN, FORCES, RETURNERS, EARLY_CAREERS and FOUNDERS gateways.

Surrounding editorial content remains a frontend concern.

## Communications Service

Owns candidate/recruiter outbound communications. Initially email; future channels may include SMS, WhatsApp, push and internal messaging.

Communication failure must never make the underlying application fail.

## Notification Service

Owns internal operational notifications such as applications awaiting review, overdue interview feedback, failed job distribution and candidate replies.

## Integration Service

Third-party providers are isolated from core domains. Initial integrations: Gmail, Google Calendar and Google Drive. Future integrations may include Slack, Teams, Zoom, Meet, HRIS, payroll and identity providers.

## Webhook Service

Webhook ingress verifies signatures, deduplicates, timestamps, stores receipt, emits internal events and returns quickly.

## Search Service

Maintains a dedicated search representation for keyword, Boolean, filters, facets and future semantic search.

## Talent Intelligence / AI Service

AI is outside the critical hiring transaction path.

Potential capabilities include CV summarisation, evidence extraction, interview-question generation, communication drafting, note summarisation, candidate rediscovery and recruiter assistance.

If AI fails, candidates can still apply and recruiters can still hire.

## Analytics Service

Consumes events and tracks views, applications, conversion, source, gateway, campaign, shortlist rate, interview rate, offer rate, hire rate and time to hire.

## Audit Service

Important actions produce immutable audit information: who, what, when, where, resource, before, after and correlation ID.

# Event backbone

Canonical envelope:

```json
{
  "event_id": "evt_...",
  "event_type": "application.created",
  "event_version": 1,
  "occurred_at": "2026-09-27T14:00:00Z",
  "producer": "applications",
  "correlation_id": "corr_...",
  "causation_id": "evt_...",
  "tenant_id": "tenant_001",
  "payload": {}
}
```

Canonical events include:
- `job.created.v1`
- `job.updated.v1`
- `job.published.v1`
- `job.closed.v1`
- `candidate.created.v1`
- `candidate.updated.v1`
- `application.created.v1`
- `application.withdrawn.v1`
- `workflow.stage_changed.v1`
- `interview.scheduled.v1`
- `interview.completed.v1`
- `offer.created.v1`
- `offer.accepted.v1`
- `candidate.hired.v1`
- `document.uploaded.v1`
- `document.processed.v1`
- `distribution.requested.v1`
- `distribution.published.v1`
- `distribution.failed.v1`
- `communication.sent.v1`
- `communication.failed.v1`

# Application transaction

```text
Candidate submits
      │
      ▼
API Gateway
      │
      ▼
Application Service
      │
      ├── Candidate Service
      ├── Jobs Service validation
      ├── Attribution Service
      └── store application + outbox event
                         │
                         ▼
                 application.created.v1
                         │
                      EVENT BUS
                         │
         ┌───────────────┼────────────────┐
         ▼               ▼                ▼
      Workflow      Communications     Analytics
         │               │                │
      NEW stage      emails async     conversion
                                         │
                                         ▼
                                       Search
```

The application succeeds even if Analytics, Search, AI or Communications are unavailable.

# Publish Everywhere

```text
Recruiter → Jobs Service → job.published.v1 → Event Bus
                                           ├── Careers Gateway
                                           ├── Distribution
                                           │   ├── Google Jobs
                                           │   ├── Indeed
                                           │   ├── LinkedIn
                                           │   ├── Aggregators
                                           │   └── Feeds
                                           ├── Search
                                           ├── Analytics
                                           └── Audit
```

One canonical job remains authoritative everywhere.

# Database-per-service

Services never query each other's tables.

```text
Jobs Service          → Jobs DB
Candidate Service     → Candidate DB
Applications          → Application DB
Workflow              → Workflow DB
Distribution          → Distribution DB
Communications        → Communications DB
Interviews            → Interview DB
Privacy               → Privacy DB
Analytics             → Analytics store
Search                → Search index
```

Multiple services may initially share one managed PostgreSQL cluster for cost reasons, but use separate databases/schemas, credentials and service ownership.

Cross-domain communication is API or events — never cross-service SQL.

# Reliability

## Transactional Outbox

State-changing services write domain changes and outbox events atomically.

## Idempotent consumers

Events may be delivered more than once. Consumers must process duplicates safely.

## Queues and dead-letter handling

Asynchronous integrations use queues, workers, retries and dead-letter queues. Failures are visible operational state, not silent data loss.

# Observability

Every deployable receives structured logs, metrics, distributed traces, health checks, error reporting and correlation IDs.

A user journey crossing multiple services must be traceable with one `correlation_id`.

# Security model

Externally reachable:
- API Gateway
- public Jobs API
- application submission
- webhook ingress
- signed-upload initiation

Internal only:
- candidate management
- workflow administration
- offers
- privacy operations
- analytics administration
- AI
- audit administration

No database is public. Service credentials follow least privilege.

# Multi-tenancy

Appropriate records carry `tenant_id`.

Initial model:

```text
Raeburn Talent
├── Tenant 001 — The Raeburn Group
├── Tenant 002 — future customer
└── Tenant 003 — future customer
```

The architecture does not assume Raeburn will remain the only customer.

# Configuration and feature flags

Tenant/company configuration includes branding, domains, email identities, career gateways, pipelines, application questions, retention policies, distribution destinations and feature flags.

Example flags:

```text
google_distribution = true
ai_screening_assist = false
talent_pools = true
whatsapp = false
semantic_search = false
```

# Scheduler / automation

Scheduled actions emit events. Examples: close job at deadline, interview reminders, offer expiry, publication checks, retention review, candidate follow-up and feed refresh.

# Infrastructure direction

## Cloudflare
DNS, WAF, CDN, R2, Workers, Queues where appropriate, and edge/webhook workloads.

## Vercel
Corporate/careers frontend and Talent admin frontend.

## Managed compute
Longer-running services and workers.

## PostgreSQL
Transactional service databases.

## Private object storage
Candidate and recruitment documents.

Interfaces should remain portable.

# CI/CD

GitHub Actions is the default automation platform.

Each service is independently deployable. A change to `connectors/indeed` should not force Candidate Service to redeploy.

Target pipeline:

`Change → Lint → Unit tests → Contract tests → Integration tests → Security checks → Build → Staging → Smoke tests → Production`

Path-filtered workflows should rebuild only affected services/packages where practical.

# Versioning

APIs use paths such as `/v1/jobs`, `/v1/applications`, `/v1/candidates/:id`.

Events use versioned names such as `job.published.v1`, `application.created.v1`, `candidate.updated.v1`.

Shared contracts live under `packages/contracts` and `packages/events`.

Breaking changes require a new version.

# First production slice

We do **not** wait for every future service before recruiting.

Immediate services:

```text
API Gateway
├── Identity
├── Organisation
├── Jobs
├── Candidates
├── Applications
├── Attribution
├── Workflow
├── Documents
├── Communications
└── Distribution
```

Plus:
- Event Bus
- Queues
- PostgreSQL
- private object storage
- Careers frontend
- ATS frontend

Initial distribution:
- Raeburn mainstream
- Disability Confident
- Women
- Forces & Veterans
- Google Jobs
- standard XML feed
- standard JSON feed

External board adapters are added progressively.

# Existing implementation status

Before the microservices architecture was locked, this repository gained an initial end-to-end recruitment slice including canonical jobs, specialist careers gateways, application form, CV/document references, candidate records, application records, attribution, email hooks, ATS dashboard, application detail, stage transitions, audit logging and seeded founding vacancies.

That code is **not discarded**. It is the behavioural reference implementation while functionality moves into the new service boundaries.

No new cross-domain coupling should be added to the transitional root application.

# Migration sequence

1. Introduce monorepo workspace/tooling.
2. Create shared API/event contracts.
3. Create API Gateway.
4. Extract Identity and Organisation boundaries.
5. Extract Jobs Service and Jobs datastore.
6. Extract Candidate Service.
7. Extract Application Service with Transactional Outbox.
8. Extract Attribution Service.
9. Extract Workflow Service.
10. Extract Document Service.
11. Extract Communications Service.
12. Extract Distribution Service and feed/connectors.
13. Move public UI to `apps/careers-web`.
14. Move ATS UI to `apps/talent-admin`.
15. Add queue/event infrastructure.
16. Add distributed observability.
17. Add privacy/compliance automation.
18. Add interviews, offers and talent pools.
19. Add Search and Analytics.
20. Add Talent Intelligence as an optional asynchronous layer.

This is progressive decomposition, not a stop-and-rewrite programme.

# Founding vacancies

The repository contains seed records for:

1. Founding Commercial / Business Development Lead
2. Founding Engineer / Technical Lead
3. Bid, Funding & Partnerships Lead
4. Brand, Communications & Growth Lead
5. Founding Product / UX Designer
6. Finance & Commercial Operations Lead
7. Compliance / Risk Lead
8. Enterprise Account Executive

They remain drafts until approved job descriptions are loaded.

# Non-negotiable hiring principle

Raeburn Talent may help recruiters summarise information, retrieve evidence and prepare questions.

It must **not** silently turn automated or opaque model output into a hiring decision.

Human decision-makers remain responsible for selection and hiring.

## Current phase

**Microservices foundation / first production slice**

Immediate engineering priorities:
- monorepo workspace conversion
- shared contracts/events package
- API gateway
- tenant context
- Jobs extraction
- Candidate extraction
- Application extraction
- Transactional Outbox
- event/queue foundation
- path-aware GitHub Actions
- Vercel/Cloudflare deployment boundaries
- progressive migration of the existing working flow
