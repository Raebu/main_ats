# Raeburn Talent infrastructure

The same OpenTofu/Terraform stack is used for staging and production with separate encrypted state.

It provisions:
- a private DigitalOcean VPC,
- managed PostgreSQL with provider-managed backups,
- a monitored/backed-up runtime host,
- a monitored/backed-up persistent NATS JetStream host,
- Cloudflare R2 private document storage,
- Cloudflare API and webhook DNS records,
- environment, owner and cost-centre tags.

Secrets are supplied with TF_VAR_ environment variables or the deployment secret store and must never be committed. Before production, configure an encrypted remote state backend and GitHub environment approval rules.

Validation:
```
tofu fmt -check -recursive infrastructure/terraform
tofu -chdir=infrastructure/terraform init -backend=false
tofu -chdir=infrastructure/terraform validate
```

Apply staging first. The release pipeline must deploy the same immutable image digest promoted from staging into production.
