insert into organisations(id,tenant_id,parent_id,name,slug,legal_entity) values
('org_raeburn_group','tenant_raeburn_group',null,'The Raeburn Group','the-raeburn-group','The Raeburn Group'),
('org_raeburn_consulting','tenant_raeburn_group','org_raeburn_group','Raeburn Consulting','raeburn-consulting',null),
('org_raeburn_technologies','tenant_raeburn_group','org_raeburn_group','Raeburn Technologies','raeburn-technologies',null),
('org_raeburn_automation_labs','tenant_raeburn_group','org_raeburn_group','Raeburn Automation Labs','raeburn-automation-labs',null),
('org_raeburn_ventures','tenant_raeburn_group','org_raeburn_group','Raeburn Ventures','raeburn-ventures',null),
('org_gibp','tenant_raeburn_group','org_raeburn_group','GIBP','gibp',null)
on conflict do nothing;