insert into offer_approval_rules(id,tenant_id,organisation_id,approval_type,condition,required) values
('oar_hiring_manager','tenant_raeburn_group',null,'HIRING_MANAGER','{}'::jsonb,true),
('oar_finance','tenant_raeburn_group',null,'FINANCE','{}'::jsonb,true)
on conflict(id) do nothing;