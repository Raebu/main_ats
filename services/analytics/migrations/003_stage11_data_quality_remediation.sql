alter table data_quality_runs add column if not exists remediation jsonb not null default '{}';
