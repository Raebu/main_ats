create table if not exists privacy_notices(
 id text primary key,tenant_id text not null,version text not null,content_hash text not null,effective_at timestamptz not null,
 unique(tenant_id,version)
);
create table if not exists consent_records(
 id text primary key,tenant_id text not null,candidate_id text not null,notice_version text not null,accepted_at timestamptz not null
);
create table if not exists privacy_requests(
 id text primary key,tenant_id text not null,candidate_id text not null,type text not null,
 status text not null default 'OPEN',created_at timestamptz not null default now(),
 started_at timestamptz,completed_at timestamptz,result jsonb,last_error text
);
alter table privacy_requests add column if not exists started_at timestamptz;
alter table privacy_requests add column if not exists result jsonb;
alter table privacy_requests add column if not exists last_error text;

create table if not exists retention_policies(
 id text primary key,tenant_id text not null,scope_type text not null default 'TENANT',scope_id text not null,
 data_category text not null,retention_days int not null,action text not null default 'ANONYMISE',
 enabled boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,scope_type,scope_id,data_category)
);
create table if not exists legal_holds(
 id text primary key,tenant_id text not null,candidate_id text not null,reason text not null,
 placed_by text,placed_at timestamptz not null default now(),released_by text,released_at timestamptz
);
create table if not exists suppression_registry(
 tenant_id text not null,contact_hash text not null,reason text not null,created_at timestamptz not null default now(),
 primary key(tenant_id,contact_hash)
);
create table if not exists privacy_audit(
 id text primary key,tenant_id text not null,candidate_id text,action text not null,detail jsonb not null default '{}',
 actor text,created_at timestamptz not null default now()
);


-- Stage 8 privacy governance
alter table privacy_notices add column if not exists title text;
alter table privacy_notices add column if not exists content text;
alter table privacy_notices add column if not exists status text not null default 'DRAFT';
alter table privacy_notices add column if not exists published_at timestamptz;
alter table privacy_notices add column if not exists supersedes_id text;
alter table privacy_requests add column if not exists requested_by text;
alter table privacy_requests add column if not exists identity_verified_at timestamptz;
alter table privacy_requests add column if not exists identity_verified_by text;
alter table privacy_requests add column if not exists approved_at timestamptz;
alter table privacy_requests add column if not exists approved_by text;
alter table privacy_requests add column if not exists rejected_at timestamptz;
alter table privacy_requests add column if not exists rejected_by text;
alter table privacy_requests add column if not exists rejection_reason text;
alter table privacy_requests add column if not exists result_encrypted text;
alter table privacy_requests add column if not exists result_expires_at timestamptz;

create table if not exists lawful_bases(
 id text primary key,tenant_id text not null,purpose text not null,data_categories jsonb not null default '[]',
 lawful_basis text not null,special_category_condition text,article_reference text,notes text,
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,purpose)
);
create table if not exists legitimate_interest_assessments(
 id text primary key,tenant_id text not null,purpose text not null,status text not null default 'DRAFT',
 purpose_test text not null,necessity_test text not null,balancing_test text not null,safeguards jsonb not null default '[]',
 approved_by text,approved_at timestamptz,review_due_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists processing_activities(
 id text primary key,tenant_id text not null,name text not null,purpose text not null,lawful_basis_id text,
 data_subjects jsonb not null default '[]',data_categories jsonb not null default '[]',recipients jsonb not null default '[]',
 retention text,systems jsonb not null default '[]',international_transfers jsonb not null default '[]',
 security_measures jsonb not null default '[]',owner text,status text not null default 'ACTIVE',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists subprocessors(
 id text primary key,tenant_id text not null,name text not null,purpose text not null,country text,
 data_categories jsonb not null default '[]',transfer_mechanism text,dpa_reference text,status text not null default 'ACTIVE',
 review_due_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists data_map_records(
 id text primary key,tenant_id text not null,system text not null,data_category text not null,source text,
 destination text,storage_location text,classification text not null default 'PERSONAL',encrypted boolean not null default true,
 owner text,retention_policy_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists data_residency_records(
 id text primary key,tenant_id text not null,system text not null,provider text,region text not null,country text not null,
 transfer_mechanism text,approved boolean not null default false,reviewed_by text,reviewed_at timestamptz,
 created_at timestamptz not null default now(),unique(tenant_id,system,region)
);
create table if not exists consent_events(
 id text primary key,tenant_id text not null,subject_type text not null,subject_id text,purpose text not null,
 action text not null check(action in ('GRANTED','WITHDRAWN')),notice_version text,source text,
 metadata jsonb not null default '{}',occurred_at timestamptz not null default now()
);
create index if not exists consent_events_subject on consent_events(tenant_id,subject_type,subject_id,purpose,occurred_at desc);

create table if not exists privacy_request_verifications(
 id text primary key,tenant_id text not null,request_id text not null,method text not null,evidence_hash text,
 verified_by text,verified_at timestamptz not null default now()
);
create table if not exists privacy_request_approvals(
 id text primary key,tenant_id text not null,request_id text not null,decision text not null,
 reason text,decided_by text,decided_at timestamptz not null default now()
);
create table if not exists privacy_exports(
 id text primary key,tenant_id text not null,request_id text not null,format text not null,
 created_by text,created_at timestamptz not null default now(),expires_at timestamptz not null
);


create table if not exists compliance_signoffs(
 id text primary key,tenant_id text not null,area text not null,version text not null,status text not null default 'PENDING',
 reviewer_name text,reviewer_role text,reviewer_organisation text,evidence_reference text,notes text,
 decided_at timestamptz,review_due_at timestamptz,created_by text,created_at timestamptz not null default now(),
 unique(tenant_id,area,version)
);


-- Baseline Raeburn Group recruitment governance records. Formal reviewer sign-off remains auditable separately.
insert into privacy_notices(id,tenant_id,version,title,content,content_hash,effective_at,status,published_at)
values(
 'notice_raeburn_2026_09_27','tenant_raeburn_group','2026-09-27','Raeburn Talent Recruitment Privacy Notice',
 $notice$Raeburn Talent Recruitment Privacy Notice

The Raeburn Group uses Raeburn Talent to manage recruitment across its businesses. We process information you provide when you express interest in, apply for, or progress through a recruitment process, together with information generated during recruitment such as interview, assessment, communication and offer records.

We use recruitment information to administer applications, assess candidates against job-related requirements, communicate with candidates, arrange interviews and assessments, make and administer offers, meet legal and regulatory obligations, protect the security and integrity of the recruitment service, and improve recruitment operations. Optional recruitment marketing, talent-community and non-essential analytics processing is handled separately and, where consent is the applicable basis, can be withdrawn.

We only make candidate information available to authorised people and approved service providers who need it for recruitment. Sensitive information, including reasonable-adjustment information, must be handled with additional access controls and only for appropriate purposes.

Raeburn Talent records source and attribution history, access and decision evidence, privacy choices and retention controls. Candidate documents are private and access is time-limited. Recruitment information is retained according to the applicable retention policy and may be anonymised or deleted when the retention period expires, unless a lawful hold or other legal reason requires continued retention.

You can use the candidate portal to view recruitment status, withdraw an application and submit privacy requests. You may also request access to your personal information, correction of inaccurate information, deletion or restriction where applicable, and raise concerns about how your information is used. Identity verification may be required before a privacy request is fulfilled.

Raeburn Talent may use AI tools to assist with tasks such as summarising or extracting evidence. AI output is advisory: Raeburn Talent does not permit autonomous hire or reject decisions or invisible candidate ranking. Consequential recruitment decisions require human responsibility and recorded evidence.

This notice may be updated. The version and effective date shown with the published notice identify the terms applying at the relevant time.$notice$,
 '5658de5d1c82f9efc84e6003c8922ed1ae223ae9821a4cd710683b55740f0731',
 '2026-09-27T00:00:00Z','PUBLISHED',now()
) on conflict(tenant_id,version) do nothing;

insert into lawful_bases(id,tenant_id,purpose,data_categories,lawful_basis,article_reference,notes)
values
 ('lb_core_recruitment','tenant_raeburn_group','Core recruitment administration','["candidate identity","contact details","application","interview","assessment","offer"]'::jsonb,'Steps at the request of the data subject before entering a contract / legitimate interests as applicable','UK GDPR Article 6(1)(b), 6(1)(f)','Confirm the applicable basis for each recruitment context and organisation during formal policy sign-off.'),
 ('lb_legal_compliance','tenant_raeburn_group','Recruitment legal and regulatory compliance','["work eligibility","compliance records","audit evidence"]'::jsonb,'Legal obligation where applicable','UK GDPR Article 6(1)(c)','Use only where a concrete legal obligation applies.'),
 ('lb_security','tenant_raeburn_group','Recruitment platform security, fraud prevention and audit','["security events","access logs","audit metadata"]'::jsonb,'Legitimate interests','UK GDPR Article 6(1)(f)','Subject to documented necessity, balancing and security safeguards.'),
 ('lb_marketing','tenant_raeburn_group','Optional recruitment marketing and talent-community communications','["contact details","communication preferences","campaign engagement"]'::jsonb,'Consent where used','UK GDPR Article 6(1)(a)','Optional processing; withdrawal must be honoured without affecting core recruitment.')
on conflict(tenant_id,purpose) do nothing;
