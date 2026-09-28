# Capacity and cost monitoring

Capacity review is performed at least monthly and after material traffic changes.

Track:
- API request rate, p95 latency and error rate;
- PostgreSQL CPU, storage, connections, slow queries and backup/PITR state;
- NATS bytes, message count, consumer lag and disk growth;
- R2 stored bytes, operations and egress;
- scanner queue/latency and CPU;
- SMTP volume/failover rate;
- deployment-unit CPU/memory and replica saturation;
- per-tenant API request and commercial usage meters.

Infrastructure carries environment, owner and cost-centre tags. Provider invoices and cost anomalies are reviewed against usage growth. Capacity changes use the normal change process; emergency scaling is recorded as an incident/change and reviewed afterwards.

Before onboarding a tenant whose expected load exceeds the current tested envelope, run load tests using the proposed production deployment-unit sizes and update the capacity record.
