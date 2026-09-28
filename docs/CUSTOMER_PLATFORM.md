# Raeburn Talent customer platform

Platform administrators can provision a tenant, apply customer branding, configure entitlements and a subscription, meter usage, maintain billing records, add verified custom domains, issue/revoke scoped customer API keys, manage onboarding/offboarding, request regional deployments, configure SLA policy and operate support cases.

Customer API keys are returned once and stored only as hashes. Custom domains require DNS ownership proof. Regional deployment records are requests until infrastructure confirms ACTIVE status. Billing records support provider identifiers so an external billing provider can remain the source of truth.

Tenant deletion/offboarding must follow retention, legal-hold and export requirements before data removal. A tenant must not be marked OFFBOARDED while unresolved legal or contractual retention obligations remain.
