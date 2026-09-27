export const businesses=[
 {slug:"group",name:"The Raeburn Group",match:["org_raeburn_group"],strap:"Build across a group designed to create, improve and scale ambitious businesses.",body:"Group roles work across strategy, operations, commercial growth and shared capabilities that connect the Raeburn businesses.",focus:["Group strategy","Commercial growth","Shared operations"]},
 {slug:"technologies",name:"Raeburn Technologies",match:["org_raeburn_technologies"],strap:"Build useful technology with a direct route from problem to product.",body:"Technology roles span software engineering, AI, product and technical delivery, with an emphasis on practical systems that solve real operational problems.",focus:["Software & AI","Product","Technical delivery"]},
 {slug:"automation-labs",name:"Raeburn Automation Labs",match:["org_raeburn_automation_labs"],strap:"Turn repetitive work into dependable automation.",body:"Automation Labs combines software, workflow design and operational insight to build systems that make businesses work better.",focus:["Automation","AI workflows","Operations"]},
 {slug:"consulting",name:"Raeburn Consulting",match:["org_raeburn_consulting"],strap:"Help organisations turn difficult questions into executable change.",body:"Consulting opportunities combine research, strategy, delivery and commercial thinking across complex client problems.",focus:["Strategy","Delivery","Transformation"]},
 {slug:"ventures",name:"Raeburn Ventures",match:["org_raeburn_ventures"],strap:"Create and support new businesses from the earliest decisions onward.",body:"Ventures roles suit builders who enjoy ambiguity, experimentation, commercial validation and shaping new operating models.",focus:["Venture building","Growth","Founder support"]},
 {slug:"gibp",name:"GIBP",match:["org_gibp"],strap:"Build resilient financial infrastructure and commercially rigorous operations.",body:"GIBP opportunities focus on financial infrastructure, commercial operations, partnerships and disciplined execution.",focus:["Financial infrastructure","Commercial operations","Partnerships"]}
] as const;
export const benefits=[
 ["Meaningful ownership","You should understand why your work matters and have enough responsibility to improve it."],
 ["Structured growth","Clear expectations, useful feedback and opportunities to expand your scope as capability grows."],
 ["Flexible working","Roles are designed around the work, the team and candidate needs rather than a single rigid template."],
 ["Accessible recruitment","Adjustments and alternative application routes are available throughout the process."],
 ["Transparent process","We explain the stages, use structured evidence and keep candidates able to see their status."],
 ["Cross-group opportunity","One talent platform allows appropriate movement and rediscovery across Raeburn businesses."]
] as const;
export function slugify(v:string){return v.toLowerCase().trim().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}
export function businessForJob(j:any){return businesses.find(b=>b.match.includes(j.hiringOrganisationId as never))||businesses[0];}
