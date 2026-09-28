# Penetration testing requirement

Automated SAST, dependency scanning, container scanning, DAST and browser security checks are necessary but do not satisfy the Stage 12 penetration-test requirement by themselves.

Before the live completion gate is signed, commission an authorised penetration test covering:
- authentication, MFA, SSO and session lifecycle;
- tenant and organisation isolation;
- IDOR/BOLA across candidate and administrator APIs;
- uploads, signed URLs and malware handling;
- API keys/webhooks and SSRF controls;
- Cloudflare/WAF bypass and origin exposure;
- privilege escalation and re-authentication;
- rate limiting and abuse paths;
- privacy/export endpoints and sensitive data leakage.

Track findings to remediation/retest. The production proof records only pass/fail evidence and report reference; do not commit sensitive findings.
