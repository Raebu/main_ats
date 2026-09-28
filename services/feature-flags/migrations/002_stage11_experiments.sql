alter table feature_flags add column if not exists experiment_key text;
alter table feature_flags add column if not exists evaluation_count bigint not null default 0;
alter table feature_flags add column if not exists enabled_count bigint not null default 0;
alter table feature_flags add column if not exists last_evaluated_at timestamptz;
