# Stage 11 completion evidence

Stage 11 — Administration, reporting, design system and platform completeness

Completion definition: **an administrator can configure and operate the platform without engineering intervention**.

## Administration

| Requirement | Evidence |
| --- | --- |
| Workflow templates | Talent Admin administration workspace; workflow template create, activate/deactivate and versioned service endpoints |
| Scorecards | Interview template administration with create and activate/deactivate lifecycle |
| Communication templates | Communication template create and activate/deactivate lifecycle |
| Job templates | Job template create and activate/deactivate lifecycle |
| Retention | Scoped retention-policy administration with enable/disable controls |
| Gateways | Careers gateway administration with enable/disable controls |
| Feature flags | Flag targeting, rollout, kill switch, expiry and enable/disable controls |
| Notifications | Tenant notification policy administration with digest, severity, grouping and enable/disable controls |
| Source taxonomy | SOURCE registry administration with activation lifecycle |
| Rejection/hiring reasons | Decision reason taxonomy with REJECT/HIRE types and activation lifecycle |
| Custom fields | CUSTOM_FIELD registry administration with activation lifecycle |
| API clients | Scoped API client creation and revocation |
| Webhooks | Subscription creation plus pause/resume lifecycle |

Configuration resolution visibly reports inherited versus overridden scope. Version history and rollback are available through the configuration explorer. Feature experiment telemetry exposes observed evaluation/exposure rates without claiming causal winners. Stale or expired flags can be previewed and then explicitly disabled/kill-switched by an administrator.

## Reporting

The analytics service and Talent Admin reporting workspace provide:

- XLSX, PDF and CSV output;
- report definitions with role restrictions;
- executive and board summaries;
- hiring-manager reports;
- scheduled daily, weekly and monthly reports with pause/resume;
- PII-aware export and schedule requests, with FULL PII granted only to callers holding `analytics:pii` or wildcard permission and otherwise automatically downgraded to REDACTED;
- expiring hashed download tokens, configurable from 1 to 168 hours;
- generated export inventory and download counts;
- HTTP JSON BI/data-warehouse connectors with push-now and pause/activate lifecycle;
- redacted-only BI pushes at the service boundary.

## Design system

`@raeburn/ui` includes forms, tables, drawers, modals, toasts/notifications and charts. The platform also provides:

- the in-product `/design-system` reference page;
- a real Storybook workspace under `.storybook/`;
- component stories for the Stage 11 primitives;
- `npm run storybook` for local review;
- `npm run storybook:build` for a deterministic static catalogue;
- a CI requirement that the Storybook build succeeds.

## Data quality

The data-quality audit and dashboard cover:

- duplicate candidates by normalised email, phone and LinkedIn identity;
- duplicate vacancies/jobs;
- phone normalisation;
- location normalisation;
- job-title normalisation;
- skills outside the configured skills taxonomy;
- stale candidate checks;
- orphaned application references;
- application event reconciliation;
- issue severity and summary counts;
- safe operator remediation for normalisation-only fixes with an audit record.

Potentially destructive duplicate resolution remains a human-reviewed workflow rather than an automatic merge.

## Completion gate

`npm run stage11:completion-gate` verifies the Stage 11 implementation contract and reporting-format tests. CI additionally builds Storybook, type-checks the monorepo, runs unit/contracts, builds both frontends, and retains the Stage 10 integration/browser/security gates.

Stage 11 must not be marked complete if Storybook, governed reporting, data-quality coverage, configuration rollback/inheritance, administration lifecycle controls, or the required migrations are removed.
