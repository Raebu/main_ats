# Raeburn Talent security assurance

## Core controls

- API Gateway is the only intended public entry point for service APIs.
- Internal APIs require signed ATS identity tokens and route-level permissions.
- Candidate portal access uses separate application-scoped random sessions stored as hashes.
- Candidate documents are private, uploaded through short-lived scoped URLs, quarantined and unavailable until processed clean.
- Secrets are supplied through environment/secret-management infrastructure rather than committed configuration.
- Third-party integration configuration stores environment-variable references rather than access tokens.
- Authenticated write requests are audited with actor, correlation ID, status, duration and hashed IP.
- AI is advisory-only and cannot autonomously hire or reject.

## CI assurance

The repository runs TypeScript validation, tests, both production frontend builds and high-severity npm audit checks. The Security workflow adds CodeQL, Gitleaks, Trivy filesystem scanning and an SPDX SBOM.

## Production requirements

Before serious external use:

1. Replace bootstrap administrator access with normal administrators and rotate/remove bootstrap secrets.
2. Configure MFA/SSO and session revocation.
3. Put Cloudflare WAF/rate limiting in front of the API gateway.
4. Use managed secrets, private service networking and least-privilege database credentials.
5. Configure real malware scanning; never use the development bypass.
6. Run staging DAST and a third-party penetration test.
7. Test backup restoration and incident-response procedures.
8. Review UK recruitment/privacy/employment-law configuration with appropriate professional advice.
