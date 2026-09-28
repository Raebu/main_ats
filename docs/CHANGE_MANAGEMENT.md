# Change and release management

All production changes originate from reviewed Git commits. CI, Security and Stage gates must pass for the exact release SHA. Images are immutable, digest-addressed and signed. The same digest is promoted through staging into production.

Production uses an approved environment gate and blue/green or progressive deployment. Smoke failure triggers automatic rollback. Database migrations are forward-compatible, immutable and validated before deployment.

Emergency changes require an incident/change record, named approver, rollback plan and retrospective review. Direct production database edits and untracked console changes are prohibited except documented break-glass actions.
