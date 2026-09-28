# Service level objectives

Production targets are measured at the API/candidate journey boundary, not by process uptime alone.

- API availability: 99.9% monthly for standard production tier.
- Candidate application success: 99.9% over rolling 30 days excluding deliberate validation failures.
- API latency: 95% of non-upload authenticated requests under 1 second at the gateway.
- Event processing: 99% of normal-priority domain events acknowledged within 5 minutes.
- Email dispatch: 99% of accepted communication events reach SENT or an explicit failure state within 10 minutes.
- Malware scanning: 99% of uploaded documents reach PROCESSED or QUARANTINED within 5 minutes while scanner is healthy.
- Recovery objectives: target RPO <= 24h by baseline backup policy until provider PITR evidence supports a tighter contractual target; target RTO <= 4h for P1 recovery.

Alerting should use error-budget burn and symptom signals where possible. Targets may be tightened only after measured production history.
