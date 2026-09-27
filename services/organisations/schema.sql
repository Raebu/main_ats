create table if not exists organisations(id text primary key,tenant_id text not null,parent_id text,name text not null,slug text not null,legal_entity text,brand jsonb not null default '{}',careers_config jsonb not null default '{}',hiring_config jsonb not null default '{}',unique(tenant_id,slug));
create table if not exists vendors(
 id text primary key,tenant_id text not null,name text not null,vendor_type text not null,status text not null default 'ACTIVE',
 terms jsonb not null default '{}',fee_model jsonb not null default '{}',contact jsonb not null default '{}',
 quality_score numeric not null default 0,created_at timestamptz not null default now()
);
create table if not exists vendor_job_access(
 tenant_id text not null,vendor_id text not null,job_id text not null,ownership_days int not null default 180,
 granted_at timestamptz not null default now(),primary key(tenant_id,vendor_id,job_id)
);
create table if not exists vendor_submissions(
 id text primary key,tenant_id text not null,vendor_id text not null,job_id text not null,candidate_id text,
 candidate_email_hash text,status text not null default 'SUBMITTED',fee jsonb not null default '{}',
 submitted_at timestamptz not null default now(),placed_at timestamptz
);
create table if not exists vendor_accounts(
 id text primary key,tenant_id text not null,vendor_id text not null,email text not null,display_name text,status text not null default 'ACTIVE',
 token_hash text not null,created_at timestamptz not null default now(),last_used_at timestamptz,unique(tenant_id,email)
);
create table if not exists vendor_placements(
 id text primary key,tenant_id text not null,vendor_id text not null,submission_id text not null,application_id text,
 candidate_id text,job_id text not null,start_date date,fee_amount numeric,currency text not null default 'GBP',
 status text not null default 'PLACED',created_at timestamptz not null default now()
);
create table if not exists vendor_invoices(
 id text primary key,tenant_id text not null,vendor_id text not null,placement_id text,invoice_reference text not null,
 amount numeric not null,currency text not null default 'GBP',status text not null default 'RECEIVED',
 invoice_date date,due_date date,paid_at timestamptz,reconciliation_note text,created_at timestamptz not null default now(),
 unique(tenant_id,vendor_id,invoice_reference)
);
create table if not exists departments(id text primary key,tenant_id text not null,organisation_id text not null,name text not null,slug text not null,parent_id text,active boolean not null default true,unique(tenant_id,organisation_id,slug));
create table if not exists teams(id text primary key,tenant_id text not null,organisation_id text not null,department_id text,name text not null,manager_user_id text,active boolean not null default true);
create table if not exists locations(id text primary key,tenant_id text not null,organisation_id text,name text not null,country_code text not null default 'GB',timezone text not null default 'Europe/London',address jsonb not null default '{}',remote_allowed boolean not null default true,active boolean not null default true);


create table if not exists engagement_compliance_reviews(
 id text primary key,tenant_id text not null,subject_type text not null check(subject_type in ('AGENCY','CONTRACTOR')),
 subject_id text not null,review_type text not null,status text not null default 'OPEN',
 checks jsonb not null default '[]',evidence jsonb not null default '[]',findings jsonb not null default '{}',
 reviewer text,decision text,decision_reason text,review_due_at timestamptz,
 created_at timestamptz not null default now(),decided_at timestamptz,updated_at timestamptz not null default now()
);
create index if not exists engagement_compliance_review_subject on engagement_compliance_reviews(tenant_id,subject_type,subject_id,created_at desc);
