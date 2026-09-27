insert into competency_frameworks(id,tenant_id,name,description,competencies) values
('cf_technical','tenant_raeburn_group','Technical Excellence','Evidence-based technical capability','[{"key":"problem_solving","label":"Problem solving"},{"key":"technical_depth","label":"Technical depth"},{"key":"delivery","label":"Delivery judgement"},{"key":"communication","label":"Technical communication"}]'::jsonb),
('cf_leadership','tenant_raeburn_group','Leadership','Leadership and organisational judgement','[{"key":"leadership","label":"Leadership"},{"key":"decision_making","label":"Decision making"},{"key":"people","label":"People development"},{"key":"commercial","label":"Commercial judgement"}]'::jsonb),
('cf_founder','tenant_raeburn_group','Founder Potential','Early-stage ownership and venture-building evidence','[{"key":"ownership","label":"Ownership"},{"key":"ambiguity","label":"Operating in ambiguity"},{"key":"customer","label":"Customer insight"},{"key":"execution","label":"Execution"}]'::jsonb),
('cf_values','tenant_raeburn_group','Values & Ways of Working','Behavioural evidence against Raeburn working principles','[{"key":"integrity","label":"Integrity"},{"key":"collaboration","label":"Collaboration"},{"key":"learning","label":"Learning"},{"key":"responsibility","label":"Responsibility"}]'::jsonb)
on conflict(id) do nothing;

insert into interview_templates(id,tenant_id,name,interview_type,competency_framework_id,questions,score_dimensions,instructions,version) values
('it_technical','tenant_raeburn_group','Technical Interview','TECHNICAL','cf_technical',
'[{"id":"q1","text":"Walk through a technically difficult problem you personally solved. What evidence shows your contribution?"},{"id":"q2","text":"Describe a design trade-off you made and what you would change now."},{"id":"q3","text":"How do you validate reliability, security and maintainability before release?"}]'::jsonb,
'[{"key":"problem_solving","label":"Problem solving","required":true},{"key":"technical_depth","label":"Technical depth","required":true},{"key":"delivery","label":"Delivery judgement","required":true},{"key":"communication","label":"Technical communication","required":true}]'::jsonb,
'Score evidence from the interview only. Record examples before an overall recommendation.',1),
('it_leadership','tenant_raeburn_group','Leadership Interview','LEADERSHIP','cf_leadership',
'[{"id":"q1","text":"Tell us about a consequential decision you made with incomplete information."},{"id":"q2","text":"How have you raised the performance of a team or function?"},{"id":"q3","text":"Describe a disagreement with a senior stakeholder and how you handled it."}]'::jsonb,
'[{"key":"leadership","label":"Leadership","required":true},{"key":"decision_making","label":"Decision making","required":true},{"key":"people","label":"People development","required":true},{"key":"commercial","label":"Commercial judgement","required":true}]'::jsonb,
'Use concrete examples and separate evidence from interpretation.',1),
('it_founder','tenant_raeburn_group','Founder Assessment','FOUNDER','cf_founder',
'[{"id":"q1","text":"What have you built from zero and what did you personally own?"},{"id":"q2","text":"Describe a time you changed direction because customers or evidence contradicted your assumptions."},{"id":"q3","text":"How would you prioritise the first 90 days with constrained resources?"}]'::jsonb,
'[{"key":"ownership","label":"Ownership","required":true},{"key":"ambiguity","label":"Operating in ambiguity","required":true},{"key":"customer","label":"Customer insight","required":true},{"key":"execution","label":"Execution","required":true}]'::jsonb,
'Assess founder evidence, not charisma. Require examples and counter-evidence.',1),
('it_values','tenant_raeburn_group','Values Interview','VALUES','cf_values',
'[{"id":"q1","text":"Tell us about a time doing the right thing was costly or inconvenient."},{"id":"q2","text":"Describe how you changed your view after receiving difficult feedback."},{"id":"q3","text":"Give an example of taking responsibility for an outcome beyond your formal remit."}]'::jsonb,
'[{"key":"integrity","label":"Integrity","required":true},{"key":"collaboration","label":"Collaboration","required":true},{"key":"learning","label":"Learning","required":true},{"key":"responsibility","label":"Responsibility","required":true}]'::jsonb,
'Use behavioural evidence. Do not infer culture fit from similarity or personal preference.',1)
on conflict(id) do nothing;