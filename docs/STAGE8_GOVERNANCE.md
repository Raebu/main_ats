# Stage 8 — Security, Privacy, Fairness & Compliance

Stage 8 converts governance requirements into enforceable application controls.

## Identity and access
- TOTP MFA plus WebAuthn/passkeys.
- Generic OIDC/PKCE SSO compatible with Google Workspace and Microsoft Entra ID.
- 15-minute access tokens and rotating 30-day refresh tokens.
- RS256 signing support, JWKS publishing and multiple public verification keys for key rotation.
- Production readiness fails when asymmetric signing/encryption/WebAuthn configuration is absent.
- Session listing/revocation and forced logout.
- Password-reset workflow with hashed short-lived reset tokens.
- Login throttling, temporary lockout, security-event log and new-device signal.
- Five-minute privileged re-authentication for high-risk administration.
- Bootstrap administrator can be permanently disabled after real admin provisioning.
- Organisation IDs are carried in claims and enforced by Gateway, Jobs and Applications.
- Public routes force the configured public tenant rather than trusting caller-supplied tenant headers.
- Tenant-derived encryption helpers and tenant-scoped MFA encryption.
- Service identity/key issuance and introspection are available for deployment-level service authentication.
- Secrets can be injected by environment variable or `*_FILE` mount from a platform secret manager.

## Privacy
- Versioned/publishable recruitment notices.
- Lawful-basis and legitimate-interest registers.
- Records of processing activities.
- Subprocessor, data-map and data-residency registers.
- Purpose-specific consent event history.
- Careers consent UI separates essential processing, optional analytics and recruitment marketing.
- Privacy requests require identity verification and approval before execution.
- DSAR/anonymisation/deletion fulfilment remains auditable.
- DSAR result payload is tenant encrypted and automatically expires.
- Human-readable HTML and machine-readable JSON export.
- Legal holds and retention automation remain integrated.
- Formal compliance sign-off register.

## Fairness and responsible recruitment
- Configurable decision-reason taxonomy.
- Later-stage rejection requires reason, rationale and evidence.
- Blind candidate projection hides direct identity/contact fields.
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
- Hiring decisions have independent decision-evidence records.
- Governance console surfaces current security, privacy, fairness, AI and agency/contractor evidence.

## Deployment gates
Application code is ready for the controls above, but production still requires secrets/provider configuration:
- inject RS256 private key and current/previous public keys;
- configure Google Workspace and/or Microsoft Entra OIDC client values where SSO is enabled;
- configure WebAuthn RP ID/origin;
- inject tenant/MFA encryption keys from the production secret manager;
- disable bootstrap access after the first real platform administrator;
- record required legal/policy sign-offs;
- run the production security/testing/deployment stages before exposing the system externally.

Live cloud secret-manager provisioning, WAF/IaC and penetration testing are infrastructure/security-assurance work in later stages, not reasons to weaken Stage 8 application controls.
