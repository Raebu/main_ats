# Stage 8 — Security, Privacy, Fairness & Compliance

Stage 8 converts governance requirements into enforceable application controls.

## Identity and access
- TOTP MFA plus WebAuthn/passkeys with challenge-to-user binding and required WebAuthn user verification.
- Google Workspace and Microsoft Entra ID use OIDC/PKCE with administrator-facing provider configuration; unknown users fail closed unless administrator-controlled auto-provisioning is explicitly enabled, and Google identities require a verified email.
- 15-minute access tokens and rotating 30-day refresh tokens.
- RS256 signing support, JWKS publishing and multiple public verification keys for key rotation; production refuses HMAC fallback when asymmetric keys are absent.
- Production readiness fails when asymmetric signing/encryption/WebAuthn configuration is absent.
- Session listing/revocation and forced logout.
- Password-reset workflow with hashed short-lived reset tokens, non-enumerating request behaviour, authenticated reset-delivery webhook support and a complete Talent Admin reset UI.
- Login throttling across password, refresh, password-reset, passkey and SSO endpoints, temporary lockout, security-event log and new-device signal.
- Five-minute privileged re-authentication for high-risk administration.
- Bootstrap administrator can be permanently disabled after real admin provisioning.
- Organisation IDs are carried in claims and enforced by Gateway, Jobs and Applications.
- Public routes force the configured public tenant rather than trusting caller-supplied tenant headers.
- Tenant-derived encryption helpers and tenant-scoped MFA encryption.
- Service identity/key issuance and introspection are available, and production service-to-service calls require signed service authentication by default. Gateway-supplied actor/organisation/service headers replace untrusted caller values.
- Secrets can be injected by environment variable or `*_FILE` mount from a platform secret manager; production tenant/MFA encryption fails closed rather than using development fallback keys.

## Privacy
- Versioned/publishable recruitment notices.
- Lawful-basis and legitimate-interest registers.
- Records of processing activities.
- Subprocessor, data-map and data-residency registers.
- Purpose-specific consent event history, including candidate-portal talent-pool and recruitment-marketing grant/withdrawal events.
- Careers consent UI separates essential processing, optional analytics and recruitment marketing.
- Privacy requests require identity verification and approval before execution; candidate-portal requests carry the authenticated portal session into the verification record.
- DSAR/anonymisation/deletion fulfilment remains auditable.
- DSAR result payload is tenant encrypted and automatically expires.
- Human-readable HTML and machine-readable JSON export.
- Legal holds and retention automation remain integrated.
- Formal compliance sign-off register.

## Fairness and responsible recruitment
- Configurable decision-reason taxonomy.
- Later-stage rejection and the final hire transition require configured reason, rationale and job-related supporting evidence.
- Blind-review policy is resolved by vacancy → organisation → tenant scope and enforced in recruiter application detail, comparison and hiring-manager review screens; direct identity/contact fields and candidate documents are withheld while active.
- Consistency-audit records.
- Aggregated fairness monitoring with minimum cohort size.
- AI is advisory only and cannot autonomously hire/reject.
- AI model registry, model-change reviews and candidate-impact assessments.
- Production can block AI models that are not governance-approved.

## Auditability
- Authenticated writes are audited.
- Sensitive reads of candidate, document, privacy, offer, audit and AI-governance data are audited.
- Identity security events are retained with hashed network/device signals.
- Privacy actions and exports have their own audit trail.
- Hiring and later-stage rejection decisions have independent decision-evidence records with actor, reason, rationale and evidence references.
- Governance console surfaces current security, privacy, fairness, AI and agency/contractor evidence.

## Stage 8 completion gate
The application-side Stage 8 controls are implemented and enforced. Production activation still requires environment-specific secrets/provider configuration and accountable organisational sign-off; those are deployment evidence, not substitutes for the controls above:

- inject RS256 private key and current/previous public keys;
- configure Google Workspace and/or Microsoft Entra OIDC client values where SSO is enabled;
- configure WebAuthn RP ID/origin;
- inject tenant/MFA encryption keys from the production secret manager;
- disable bootstrap access after the first real platform administrator;
- record required legal/policy sign-offs;
- run the production security/testing/deployment stages before exposing the system externally.

Live cloud secret-manager provisioning, WAF/IaC and penetration testing are infrastructure/security-assurance work in later stages, not reasons to weaken Stage 8 application controls.
