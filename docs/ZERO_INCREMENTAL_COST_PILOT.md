# Zero-incremental-cost pilot boundary

The existing DigitalOcean **staging** estate may be used for private engineering
demonstrations while no new infrastructure spend is authorised. It is not a
production environment and it must not be described as one to candidates,
customers or regulators.

## What this permits

- Staff-only demonstrations using synthetic, non-personal data.
- Verification through the existing `*-staging-talent` endpoints.
- Deployment through the normal staging release gate, smoke test and DAST
  baseline.

## What this does not permit

- Candidate, client or employee personal data; CVs; real vacancies; or customer
  tenant onboarding.
- Mapping `api-talent`, `talent` or `careers` production names to the staging
  runtime.
- Calling the environment a beta, production service, or commercial launch.
- Disabling malware scanning, audit controls, security tests or release gates to
  reduce cost.

## Exit criteria

External pilot or production activation requires a separate, reviewed change
after production dependencies are funded and available: isolated data stores,
persistent JetStream, private R2, malware scanning, backups/PITR, production
SMTP, monitoring, Cloudflare DNS/WAF and the required governance approvals.
The production Terraform workflow stays manually dispatched and requires its
explicit apply confirmation.

## Credit route

DigitalOcean's Startups programme advertises time-limited infrastructure credits
for selected startups. Credit amount and eligibility are determined by
DigitalOcean; an application should be reviewed and submitted by an authorised
company representative. Credits can reduce a future production bill, but do
not turn an unfunded staging environment into a compliant production service.
