import{randomUUID}from"node:crypto";
import{serve}from"@hono/node-server";
import{Hono}from"hono";
import{z}from"zod";
import{context,health,pool}from"@raeburn/service-kit";

const app=new Hono();
const CANDIDATES=process.env.CANDIDATES_URL||"http://localhost:4102";
const JOBS=process.env.JOBS_URL||"http://localhost:4101";
const APPLICATIONS=process.env.APPLICATIONS_URL||"http://localhost:4103";
const WORKFLOW=process.env.WORKFLOW_URL||"http://localhost:4105";
const INTERVIEWS=process.env.INTERVIEWS_URL||"http://localhost:4114";
const ANALYTICS=process.env.ANALYTICS_URL||"http://localhost:4124";
const SEARCH=process.env.SEARCH_URL||"http://localhost:4125";

const Task=z.enum([
 "parse_cv","summarise_cv","evidence_against_requirements","missing_information","interview_questions",
 "summarise_interview","summarise_debrief","draft_communication","summarise_notes","draft_job_description",
 "review_job_description","inclusive_language_review","normalise_skills","search_query","talent_pool_suggestions",
 "similar_candidates","similar_roles","candidate_rediscovery","funnel_anomaly","source_performance",
 "workload_summary","needs_attention"
]);
type TaskName=z.infer<typeof Task>;

const Request=z.object({task:Task,context:z.record(z.string(),z.unknown()),promptVersion:z.string().default("v1")});
const CopilotRequest=z.object({
 message:z.string().min(2).max(4000),
 conversationId:z.string().optional(),
 context:z.object({candidateId:z.string().optional(),jobId:z.string().optional(),applicationId:z.string().optional()}).default({})
});

const taskGuidance:Record<TaskName,string>={
 parse_cv:"Extract only facts present in the CV. Return structured profile fields and source evidence. Do not infer protected traits or suitability.",
 summarise_cv:"Summarise the candidate CV factually. Separate explicit evidence from unknowns and cite source fields or documents.",
 evidence_against_requirements:"Map each stated job requirement to candidate evidence. Mark unsupported requirements as missing; do not score, rank, recommend, hire or reject.",
 missing_information:"Identify information needed to assess stated requirements that is absent from the supplied records. Do not treat absence as negative evidence.",
 interview_questions:"Generate structured questions tied to explicit job requirements and evidence gaps. Avoid protected-characteristic questions and provide the requirement each question tests.",
 summarise_interview:"Summarise interview evidence by competency, preserving uncertainty and citing interview records. Do not make a hiring recommendation.",
 summarise_debrief:"Summarise panel evidence and areas of agreement/disagreement without producing a hire/reject verdict.",
 draft_communication:"Draft clear candidate communication from supplied facts. Do not invent decisions, dates or commitments.",
 summarise_notes:"Summarise internal notes with attributed facts and unresolved items. Do not infer motives or protected characteristics.",
 draft_job_description:"Draft a job description from supplied role facts, responsibilities and requirements. Do not invent compensation or legal claims.",
 review_job_description:"Review clarity, duplication, completeness and job-relatedness. Return concrete edits rather than candidate-screening criteria.",
 inclusive_language_review:"Identify potentially exclusionary or unnecessarily restrictive wording and explain why; preserve genuine role requirements.",
 normalise_skills:"Map supplied skill terms to canonical skills and aliases without inventing proficiency.",
 search_query:"Translate the user's recruiting question into inspectable search terms and filters. Never hide ranking logic.",
 talent_pool_suggestions:"Suggest relevant existing pools using explicit candidate evidence and pool definitions. Suggestions require human confirmation.",
 similar_candidates:"Find candidates with overlapping explicit skills/experience. Explain overlap and do not rank by overall quality.",
 similar_roles:"Find roles with overlapping responsibilities/skills and explain the overlap.",
 candidate_rediscovery:"Surface previously known candidates using explicit role-related evidence and source links. Do not rank or recommend a hire.",
 funnel_anomaly:"Explain observable funnel changes using supplied metrics, distinguishing measured facts from hypotheses.",
 source_performance:"Summarise measured source performance and limitations. Do not claim causality from correlation alone.",
 workload_summary:"Summarise open recruiter work, deadlines and blockers using supplied task/SLA records.",
 needs_attention:"Prioritise operational attention by explicit urgency/deadline/status only, never by inferred candidate quality."
};

const outputContract={
 advisoryOnly:true,
 prohibited:["autonomous hire","autonomous reject","opaque candidate ranking","protected-characteristic inference"],
 expected:["answer","evidence","unknowns","suggestedActions"],
 evidenceFormat:{sourceType:"candidate|job|application|interview|task|metric|document",sourceId:"record id",field:"optional field",quote:"short factual excerpt only"}
};

function internalHeaders(tenantId:string,correlationId:string,actor:string|null){
 const h:Record<string,string>={"x-tenant-id":tenantId,"x-correlation-id":correlationId};
 if(actor)h["x-actor"]=actor;
 return h;
}
async function jsonFetch(url:string,headers:Record<string,string>){
 try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(8000)});return r.ok?await r.json():null;}catch{return null;}
}
async function postJson(url:string,headers:Record<string,string>,body:any){
 try{const r=await fetch(url,{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});return r.ok?await r.json():null;}catch{return null;}
}
function recordCitation(sourceType:string,sourceId:string,label:string,href:string,field?:string){
 return{sourceType,sourceId,label,href,...(field?{field}:{})};
}
function resultText(result:any,fallback:string){
 if(!result)return fallback;
 if(typeof result==="string")return result;
 return result.answer||result.summary||result.text||result.content||fallback;
}

async function runAdvice(tenantId:string,actor:string|null,b:z.infer<typeof Request>){
 const id=randomUUID(),endpoint=process.env.AI_ADVISORY_ENDPOINT,provider=process.env.AI_PROVIDER||"custom",model=process.env.AI_MODEL||"unspecified";
 const custom=(await pool.query("select prompt,version from prompt_versions where tenant_id=$1 and task=$2 and active=true order by created_at desc limit 1",[tenantId,b.task])).rows[0];
 const promptVersion=custom?.version||b.promptVersion;
 const systemPrompt=(custom?.prompt||taskGuidance[b.task])+"\nAll output is advisory. Never make or imply a final hiring decision. Cite supplied record identifiers for factual claims.";
 await pool.query("insert into ai_runs(id,tenant_id,task,provider,model,prompt_version,input_meta,status,requested_by) values($1,$2,$3,$4,$5,$6,$7::jsonb,'RUNNING',$8)",[id,tenantId,b.task,provider,model,promptVersion,JSON.stringify({keys:Object.keys(b.context),evidenceSourceCount:Array.isArray((b.context as any).sources)?(b.context as any).sources.length:0}),actor]);
 if(!endpoint){
   await pool.query("update ai_runs set status='DISABLED',last_error='Provider not configured',completed_at=now() where id=$1",[id]);
   return{id,status:"disabled",advisoryOnly:true,message:"AI advisory provider is not configured. Core recruitment remains available.",evidenceSources:(b.context as any).sources||[]};
 }
 try{
   const auth=process.env.AI_ADVISORY_TOKEN?"Bearer "+process.env.AI_ADVISORY_TOKEN:"";
   const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","authorization":auth},body:JSON.stringify({task:b.task,systemPrompt,promptVersion,context:b.context,outputContract}),signal:AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS||45000))});
   if(!r.ok)throw new Error("AI provider returned "+r.status);
   const result=await r.json();
   await pool.query("update ai_runs set status='SUCCEEDED',result=$2::jsonb,completed_at=now() where id=$1",[id,JSON.stringify(result)]);
   return{id,status:"ok",advisoryOnly:true,provider,model,promptVersion,result,evidenceSources:(b.context as any).sources||[]};
 }catch(err){
   const message=err instanceof Error?err.message:String(err);
   await pool.query("update ai_runs set status='FAILED',last_error=$2,completed_at=now() where id=$1",[id,message]);
   return{id,status:"unavailable",advisoryOnly:true,error:message,evidenceSources:(b.context as any).sources||[]};
 }
}

function detectIntent(message:string){
 const m=message.toLowerCase();
 if(/summari[sz]e.*cv|cv summary|summarise resume|resume summary/.test(m))return"SUMMARISE_CV";
 if(/missing (?:information|evidence)|what.*missing|evidence gaps?/.test(m))return"MISSING_INFORMATION";
 if(/generate.*interview question|interview questions? for/.test(m))return"INTERVIEW_QUESTIONS";
 if(/summari[sz]e.*(?:interview|feedback)/.test(m))return"SUMMARISE_INTERVIEW";
 if(/summari[sz]e.*(?:debrief|panel)|debrief summary/.test(m))return"SUMMARISE_DEBRIEF";
 if(/draft.*(?:job description|jd)|write.*job description/.test(m))return"DRAFT_JOB_DESCRIPTION";
 if(/review.*(?:job description|jd)|job description review/.test(m))return"REVIEW_JOB_DESCRIPTION";
 if(/inclusive.*language|inclusivity.*(?:job|jd)|exclusionary wording/.test(m))return"INCLUSIVE_LANGUAGE";
 if(/normali[sz]e.*skills?|canonical skills?|skill taxonomy/.test(m))return"NORMALISE_SKILLS";
 if(/similar candidates?/.test(m))return"SIMILAR_CANDIDATES";
 if(/similar roles?|similar jobs?/.test(m))return"SIMILAR_ROLES";
 if(/still needs? interview|needs? interviewing|awaiting interview/.test(m))return"NEEDS_INTERVIEW";
 if(/previous candidate|rediscover|previously interviewed|match(?:ing)? this (?:job|role)|may fit this role/.test(m))return"REDISCOVER";
 if(/evidence.*requirement|against the requirements|evidence for this candidate/.test(m))return"EVIDENCE";
 if(/draft.*(?:candidate )?(?:email|message|communication)/.test(m))return"DRAFT_COMMUNICATION";
 if(/draft.*follow|follow.?up/.test(m))return"DRAFT_FOLLOWUPS";
 if(/source performance|best source|source.*conversion/.test(m))return"SOURCE_PERFORMANCE";
 if(/funnel|drop.?off|conversion anomaly/.test(m))return"FUNNEL";
 if(/workload|needs? my attention|what needs attention|overdue/.test(m))return"ATTENTION";
 if(/create .*task|remind me|add .*task/.test(m))return"CREATE_TASK";
 if(/add .*note|note that/.test(m))return"ADD_NOTE";
 return"SEARCH";
}

async function createConversation(tenantId:string,userId:string,message:string,requestedId?:string){
 if(requestedId){
   const row=(await pool.query("select id from copilot_conversations where tenant_id=$1 and user_id=$2 and id=$3",[tenantId,userId,requestedId])).rows[0];
   if(row)return row.id;
 }
 const id=randomUUID(),title=message.replace(/\s+/g," ").slice(0,90);
 await pool.query("insert into copilot_conversations(id,tenant_id,user_id,title) values($1,$2,$3,$4)",[id,tenantId,userId,title]);
 return id;
}
async function saveMessage(tenantId:string,conversationId:string,role:"USER"|"ASSISTANT",content:string,intent:string|null,citations:any[]=[],metadata:any={}){
 const id=randomUUID();
 await pool.query("insert into copilot_messages(id,tenant_id,conversation_id,role,content,intent,citations,metadata) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)",[id,tenantId,conversationId,role,content,intent,JSON.stringify(citations),JSON.stringify(metadata)]);
 await pool.query("update copilot_conversations set updated_at=now() where tenant_id=$1 and id=$2",[tenantId,conversationId]);
 return id;
}
async function proposeAction(tenantId:string,conversationId:string,messageId:string,actor:string,actionType:string,summary:string,payload:any){
 const id=randomUUID();
 await pool.query("insert into copilot_action_proposals(id,tenant_id,conversation_id,message_id,action_type,summary,payload,created_by) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)",[id,tenantId,conversationId,messageId,actionType,summary,JSON.stringify(payload),actor]);
 return{id,actionType,summary,payload,status:"PROPOSED",requiresConfirmation:true};
}

app.get("/health",async c=>c.json(await health("intelligence")));

app.post("/v1/intelligence/advice",async c=>{
 const x=context(c.req.raw.headers),b=Request.parse(await c.req.json()),result=await runAdvice(x.tenantId,c.req.header("x-actor")||null,b);
 return c.json(result,result.status==="ok"?200:result.status==="disabled"?503:502);
});
app.post("/v1/intelligence/tasks/:task",async c=>{
 const x=context(c.req.raw.headers),task=Task.parse(c.req.param("task")),body=z.object({context:z.record(z.string(),z.unknown()),promptVersion:z.string().default("v1")}).parse(await c.req.json());
 const result=await runAdvice(x.tenantId,c.req.header("x-actor")||null,{task,context:body.context,promptVersion:body.promptVersion});
 return c.json(result,result.status==="ok"?200:result.status==="disabled"?503:502);
});

app.post("/v1/intelligence/copilot/query",async c=>{
 const x=context(c.req.raw.headers),actor=c.req.header("x-actor")||"unknown",b=CopilotRequest.parse(await c.req.json());
 const conversationId=await createConversation(x.tenantId,actor,b.message,b.conversationId);
 const intent=detectIntent(b.message),headers=internalHeaders(x.tenantId,x.correlationId,actor);
 await saveMessage(x.tenantId,conversationId,"USER",b.message,intent);
 let answer="",citations:any[]=[],proposalSeed:any=null,ai:any=null;

 if(intent==="SUMMARISE_CV"){
   if(!b.context.candidateId)answer="Choose a candidate first so I can summarise the correct CV/profile evidence.";
   else{
     const[candidate,extractions]=await Promise.all([
       jsonFetch(CANDIDATES+"/v1/candidates/"+encodeURIComponent(b.context.candidateId),headers),
       jsonFetch(process.env.INTELLIGENCE_SELF_URL||"http://localhost:4126"+"/v1/intelligence/candidates/"+encodeURIComponent(b.context.candidateId)+"/extractions",headers)
     ]);
     if(candidate)citations.push(recordCitation("candidate",candidate.id,candidate.name||"Candidate","/candidates/"+candidate.id));
     ai=await runAdvice(x.tenantId,actor,{task:"summarise_cv",context:{question:b.message,candidate,extractions:extractions||[],sources:citations},promptVersion:"v1"});
     answer=ai.status==="ok"?resultText(ai.result,"CV summary completed."):"The candidate record is linked below, but the advisory AI provider is not configured.";
   }
 }else if(intent==="MISSING_INFORMATION"){
   if(!b.context.candidateId||!b.context.jobId)answer="Choose both a candidate and vacancy so I can identify evidence gaps against explicit role requirements.";
   else{
     const[candidate,job,apps]=await Promise.all([
       jsonFetch(CANDIDATES+"/v1/candidates/"+encodeURIComponent(b.context.candidateId),headers),
       jsonFetch(JOBS+"/v1/jobs/"+encodeURIComponent(b.context.jobId),headers),
       jsonFetch(APPLICATIONS+"/v1/applications?candidateId="+encodeURIComponent(b.context.candidateId)+"&jobId="+encodeURIComponent(b.context.jobId),headers)
     ]);
     if(candidate)citations.push(recordCitation("candidate",candidate.id,candidate.name||"Candidate","/candidates/"+candidate.id));
     if(job)citations.push(recordCitation("job",job.id,job.title||"Vacancy","/jobs/"+job.id));
     for(const a of apps||[])citations.push(recordCitation("application",a.id,"Application "+a.id,"/applications/"+a.id));
     ai=await runAdvice(x.tenantId,actor,{task:"missing_information",context:{question:b.message,candidate,job,applications:apps||[],sources:citations},promptVersion:"v1"});
     answer=ai.status==="ok"?resultText(ai.result,"Evidence-gap review completed."):"The relevant records are linked below, but the advisory AI provider is not configured.";
   }
 }else if(intent==="INTERVIEW_QUESTIONS"){
   if(!b.context.jobId)answer="Choose a vacancy first so questions stay tied to the real role requirements.";
   else{
     const[job,candidate]=await Promise.all([
       jsonFetch(JOBS+"/v1/jobs/"+encodeURIComponent(b.context.jobId),headers),
       b.context.candidateId?jsonFetch(CANDIDATES+"/v1/candidates/"+encodeURIComponent(b.context.candidateId),headers):Promise.resolve(null)
     ]);
     if(job)citations.push(recordCitation("job",job.id,job.title||"Vacancy","/jobs/"+job.id));
     if(candidate)citations.push(recordCitation("candidate",candidate.id,candidate.name||"Candidate","/candidates/"+candidate.id));
     ai=await runAdvice(x.tenantId,actor,{task:"interview_questions",context:{question:b.message,job,candidate,sources:citations},promptVersion:"v1"});
     answer=ai.status==="ok"?resultText(ai.result,"Interview questions generated."):"The vacancy is linked below, but the advisory AI provider is not configured.";
   }
 }else if(intent==="SUMMARISE_INTERVIEW"||intent==="SUMMARISE_DEBRIEF"){
   if(!b.context.applicationId)answer="Choose an application first so I can use the correct interview and panel records.";
   else{
     const[interviews,workflow]=await Promise.all([
       jsonFetch(INTERVIEWS+"/v1/interviews?applicationId="+encodeURIComponent(b.context.applicationId),headers),
       jsonFetch(WORKFLOW+"/v1/workflow/"+encodeURIComponent(b.context.applicationId),headers)
     ]);
     citations=(interviews||[]).map((i:any)=>recordCitation("interview",i.id,"Interview "+(i.round||i.id),"/applications/"+b.context.applicationId,"feedback"));
     citations.push(recordCitation("application",b.context.applicationId,"Application "+b.context.applicationId,"/applications/"+b.context.applicationId));
     const task=intent==="SUMMARISE_INTERVIEW"?"summarise_interview":"summarise_debrief";
     ai=await runAdvice(x.tenantId,actor,{task,context:{question:b.message,interviews:interviews||[],workflow,sources:citations},promptVersion:"v1"});
     answer=ai.status==="ok"?resultText(ai.result,"Interview evidence summary completed."):"The interview records are linked below, but the advisory AI provider is not configured.";
   }
 }else if(intent==="DRAFT_JOB_DESCRIPTION"||intent==="REVIEW_JOB_DESCRIPTION"||intent==="INCLUSIVE_LANGUAGE"){
   const job=b.context.jobId?await jsonFetch(JOBS+"/v1/jobs/"+encodeURIComponent(b.context.jobId),headers):null;
   if(job)citations.push(recordCitation("job",job.id,job.title||"Vacancy","/jobs/"+job.id));
   if(intent!=="DRAFT_JOB_DESCRIPTION"&&!job)answer="Choose a vacancy first so I review the actual job description.";
   else{
     const task:TaskName=intent==="DRAFT_JOB_DESCRIPTION"?"draft_job_description":intent==="REVIEW_JOB_DESCRIPTION"?"review_job_description":"inclusive_language_review";
     ai=await runAdvice(x.tenantId,actor,{task,context:{question:b.message,job,sources:citations},promptVersion:"v1"});
     answer=ai.status==="ok"?resultText(ai.result,"Job-description assistance completed."):"The advisory AI provider is not configured, so I have not invented job-description content.";
   }
 }else if(intent==="NORMALISE_SKILLS"){
   const candidate=b.context.candidateId?await jsonFetch(CANDIDATES+"/v1/candidates/"+encodeURIComponent(b.context.candidateId),headers):null;
   if(candidate)citations.push(recordCitation("candidate",candidate.id,candidate.name||"Candidate","/candidates/"+candidate.id));
   ai=await runAdvice(x.tenantId,actor,{task:"normalise_skills",context:{question:b.message,candidate,sources:citations},promptVersion:"v1"});
   answer=ai.status==="ok"?resultText(ai.result,"Skill normalisation completed."):"The advisory AI provider is not configured.";
 }else if(intent==="SIMILAR_CANDIDATES"){
   if(!b.context.candidateId)answer="Choose a candidate first so similarity is based on explicit indexed evidence.";
   else{
     const rows:any[]=await jsonFetch(SEARCH+"/v1/search/similar/candidates/"+encodeURIComponent(b.context.candidateId),headers)||[];
     citations=rows.map((r:any)=>recordCitation("candidate",r.id,r.title||"Candidate "+r.id,"/candidates/"+r.id));
     ai=await runAdvice(x.tenantId,actor,{task:"similar_candidates",context:{question:b.message,records:rows,sources:citations},promptVersion:"v1"});
     answer=ai.status==="ok"?resultText(ai.result,"Similar candidates found."):(rows.length?"I found "+rows.length+" candidates with explicit overlapping indexed evidence.":"No similar candidates were found.");
   }
 }else if(intent==="SIMILAR_ROLES"){
   if(!b.context.jobId)answer="Choose a vacancy first so similarity is grounded in that role.";
   else{
     const job:any=await jsonFetch(JOBS+"/v1/jobs/"+encodeURIComponent(b.context.jobId),headers);
     if(job)citations.push(recordCitation("job",job.id,job.title||"Vacancy","/jobs/"+job.id));
     const qs=new URLSearchParams({type:"job",q:[job?.title,job?.requirements,job?.description].filter(Boolean).join(" "),semantic:"true",limit:"25"});
     const search:any=await jsonFetch(SEARCH+"/v1/search?"+qs,headers),rows=(search?.results||[]).filter((r:any)=>r.id!==b.context.jobId);
     citations.push(...rows.map((r:any)=>recordCitation("job",r.id,r.title||"Job "+r.id,"/jobs/"+r.id)));
     ai=await runAdvice(x.tenantId,actor,{task:"similar_roles",context:{question:b.message,job,records:rows,sources:citations},promptVersion:"v1"});
     answer=ai.status==="ok"?resultText(ai.result,"Similar roles found."):(rows.length?"I found "+rows.length+" roles with explicit searchable overlap.":"No similar roles were found.");
   }
 }else if(intent==="DRAFT_COMMUNICATION"){
   const[candidate,apps]=await Promise.all([
     b.context.candidateId?jsonFetch(CANDIDATES+"/v1/candidates/"+encodeURIComponent(b.context.candidateId),headers):Promise.resolve(null),
     b.context.applicationId?jsonFetch(APPLICATIONS+"/v1/applications",headers):Promise.resolve([])
   ]);
   if(candidate)citations.push(recordCitation("candidate",candidate.id,candidate.name||"Candidate","/candidates/"+candidate.id));
   if(b.context.applicationId)citations.push(recordCitation("application",b.context.applicationId,"Application "+b.context.applicationId,"/applications/"+b.context.applicationId));
   ai=await runAdvice(x.tenantId,actor,{task:"draft_communication",context:{question:b.message,candidate,applications:apps||[],sources:citations},promptVersion:"v1"});
   answer=ai.status==="ok"?resultText(ai.result,"Communication draft prepared."):"The advisory AI provider is not configured, so no candidate-facing text was invented.";
   proposalSeed={actionType:"DRAFT_COMMUNICATION",summary:"Approve this draft for recruiter review only — nothing will be sent automatically.",payload:{draft:answer,candidateId:b.context.candidateId||null,applicationId:b.context.applicationId||null}};
 }else if(intent==="NEEDS_INTERVIEW"){
   const qs=new URLSearchParams({type:"application",stage:"SHORTLIST,INTERVIEW,FINAL_INTERVIEW",limit:"100"});
   const search:any=await jsonFetch(SEARCH+"/v1/search?"+qs,headers);
   const rows=search?.results||[];
   citations=rows.slice(0,25).map((r:any)=>recordCitation("application",r.id,r.title||"Application "+r.id,"/applications/"+r.id));
   answer=rows.length?rows.length+" application records are currently indexed in interview-related stages. Open the cited records to review or schedule the next interview.":"I found no indexed applications currently in interview-related stages.";
   ai=await runAdvice(x.tenantId,actor,{task:"needs_attention",context:{question:b.message,records:rows.slice(0,50),sources:citations},promptVersion:"v1"});
   if(ai.status==="ok")answer=resultText(ai.result,answer);
 }else if(intent==="REDISCOVER"){
   let query=b.message;
   if(b.context.jobId){
     const job:any=await jsonFetch(JOBS+"/v1/jobs/"+encodeURIComponent(b.context.jobId),headers);
     if(job){query=[job.title,job.requirements,job.description].filter(Boolean).join(" ");citations.push(recordCitation("job",job.id,job.title,"/jobs/"+job.id));}
   }
   const qs=new URLSearchParams({type:"candidate",q:query,semantic:"true",limit:"50"});
   const search:any=await jsonFetch(SEARCH+"/v1/search?"+qs,headers),rows=search?.results||[];
   citations.push(...rows.slice(0,25).map((r:any)=>recordCitation("candidate",r.id,r.title||"Candidate "+r.id,"/candidates/"+r.id)));
   answer=rows.length?"I found "+rows.length+" previously indexed candidates with explicit searchable overlap. Results are evidence-based and not an overall candidate ranking.":"I did not find matching previously indexed candidates.";
   ai=await runAdvice(x.tenantId,actor,{task:"candidate_rediscovery",context:{question:b.message,records:rows.slice(0,50),sources:citations},promptVersion:"v1"});
   if(ai.status==="ok")answer=resultText(ai.result,answer);
 }else if(intent==="EVIDENCE"){
   if(!b.context.candidateId||!b.context.jobId){
     answer="Choose a candidate and vacancy first. I need both record IDs to map evidence against the role requirements.";
   }else{
     const[candidate,job,apps]=await Promise.all([
       jsonFetch(CANDIDATES+"/v1/candidates/"+encodeURIComponent(b.context.candidateId),headers),
       jsonFetch(JOBS+"/v1/jobs/"+encodeURIComponent(b.context.jobId),headers),
       jsonFetch(APPLICATIONS+"/v1/applications?candidateId="+encodeURIComponent(b.context.candidateId)+"&jobId="+encodeURIComponent(b.context.jobId),headers)
     ]);
     if(candidate)citations.push(recordCitation("candidate",candidate.id,candidate.name||"Candidate","/candidates/"+candidate.id));
     if(job)citations.push(recordCitation("job",job.id,job.title||"Vacancy","/jobs/"+job.id));
     for(const a of apps||[])citations.push(recordCitation("application",a.id,"Application "+a.id,"/applications/"+a.id));
     ai=await runAdvice(x.tenantId,actor,{task:"evidence_against_requirements",context:{question:b.message,candidate,job,applications:apps||[],sources:citations},promptVersion:"v1"});
     answer=ai.status==="ok"?resultText(ai.result,"Evidence mapping completed."):"The records are linked below, but the AI advisory provider is not configured, so I have not generated an evidence interpretation.";
   }
 }else if(intent==="DRAFT_FOLLOWUPS"){
   const attention:any=await jsonFetch(WORKFLOW+"/v1/workflow/attention/queue",headers),items=[...(attention?.tasks||[]),...(attention?.slas||[])];
   citations=(attention?.tasks||[]).slice(0,25).map((t:any)=>recordCitation("task",t.id,t.title||"Task "+t.id,t.application_id?"/applications/"+t.application_id:"/tasks"));
   ai=await runAdvice(x.tenantId,actor,{task:"draft_communication",context:{question:b.message,attention:items.slice(0,50),sources:citations},promptVersion:"v1"});
   answer=ai.status==="ok"?resultText(ai.result,"Draft follow-ups prepared."):"I found "+items.length+" attention items. The AI provider is not configured, so no message text was invented.";
   proposalSeed={actionType:"DRAFT_COMMUNICATION",summary:"Approve this draft for recruiter review only — nothing will be sent automatically.",payload:{draft:answer,itemCount:items.length}};
 }else if(intent==="SOURCE_PERFORMANCE"){
   const sources:any=await jsonFetch(ANALYTICS+"/v1/analytics/sources",headers);
   citations=(sources||[]).slice(0,25).map((s:any,i:number)=>recordCitation("metric","source:"+i,String(s.source||"source"),"/intelligence","applications"));
   ai=await runAdvice(x.tenantId,actor,{task:"source_performance",context:{question:b.message,metrics:sources||[],sources:citations},promptVersion:"v1"});
   answer=ai.status==="ok"?resultText(ai.result,"Source metrics loaded."):"Source metrics are available in the cited evidence, but the AI advisory provider is not configured.";
 }else if(intent==="FUNNEL"){
   const[executive,velocity]=await Promise.all([jsonFetch(ANALYTICS+"/v1/analytics/executive",headers),jsonFetch(ANALYTICS+"/v1/analytics/velocity",headers)]);
   citations=[recordCitation("metric","executive","Executive recruitment metrics","/intelligence"),recordCitation("metric","velocity","Stage transition metrics","/intelligence")];
   ai=await runAdvice(x.tenantId,actor,{task:"funnel_anomaly",context:{question:b.message,executive,velocity,sources:citations},promptVersion:"v1"});
   answer=ai.status==="ok"?resultText(ai.result,"Funnel metrics loaded."):"Funnel metrics are loaded, but the AI advisory provider is not configured.";
 }else if(intent==="ATTENTION"){
   const attention:any=await jsonFetch(WORKFLOW+"/v1/workflow/attention/queue",headers);
   citations=(attention?.tasks||[]).slice(0,25).map((t:any)=>recordCitation("task",t.id,t.title||"Task "+t.id,t.application_id?"/applications/"+t.application_id:"/tasks"));
   ai=await runAdvice(x.tenantId,actor,{task:"workload_summary",context:{question:b.message,attention,sources:citations},promptVersion:"v1"});
   answer=ai.status==="ok"?resultText(ai.result,"Attention queue loaded."):"You have "+(attention?.tasks?.length||0)+" open attention tasks and "+(attention?.slas?.length||0)+" upcoming or breached SLA items.";
 }else if(intent==="CREATE_TASK"){
   answer="I can create this as a recruiter task after you confirm the preview.";
   proposalSeed={actionType:"CREATE_TASK",summary:"Create recruiter task: "+b.message.slice(0,160),payload:{title:b.message.slice(0,180),applicationId:b.context.applicationId||null,jobId:b.context.jobId||null,candidateId:b.context.candidateId||null,priority:"NORMAL"}};
 }else if(intent==="ADD_NOTE"){
   if(!b.context.applicationId)answer="Choose an application before I can propose an internal note.";
   else{answer="I can add this internal application note after you confirm the preview.";proposalSeed={actionType:"ADD_NOTE",summary:"Add internal note to application "+b.context.applicationId,payload:{applicationId:b.context.applicationId,body:b.message}};}
 }else{
   const interpreted:any=await postJson(SEARCH+"/v1/search/interpret",headers,{query:b.message});
   const qs=new URLSearchParams({q:b.message,semantic:"true",limit:"50"});
   const search:any=await jsonFetch(SEARCH+"/v1/search?"+qs,headers),rows=search?.results||[];
   citations=rows.slice(0,25).map((r:any)=>recordCitation(r.type||"record",r.id,r.title||r.id,r.type==="candidate"?"/candidates/"+r.id:r.type==="job"?"/jobs/"+r.id:r.type==="application"?"/applications/"+r.id:"/search"));
   ai=await runAdvice(x.tenantId,actor,{task:"search_query",context:{question:b.message,interpretation:interpreted,results:rows.slice(0,50),sources:citations},promptVersion:"v1"});
   answer=ai.status==="ok"?resultText(ai.result,rows.length?"I found "+rows.length+" relevant records.":"I found no matching records."):rows.length?"I found "+rows.length+" relevant records. Open the citations below to inspect them.":"I found no matching records.";
 }

 const assistantId=await saveMessage(x.tenantId,conversationId,"ASSISTANT",answer,intent,citations,{aiRunId:ai?.id||null,aiStatus:ai?.status||null,advisoryOnly:true});
 const proposals=proposalSeed?[await proposeAction(x.tenantId,conversationId,assistantId,actor,proposalSeed.actionType,proposalSeed.summary,proposalSeed.payload)]:[];
 return c.json({conversationId,messageId:assistantId,intent,answer,citations,proposals,advisoryOnly:true,ai:{runId:ai?.id||null,status:ai?.status||"not_used"}});
});

app.get("/v1/intelligence/copilot/conversations",async c=>{
 const x=context(c.req.raw.headers),actor=c.req.header("x-actor")||"unknown";
 return c.json((await pool.query("select id,title,created_at,updated_at from copilot_conversations where tenant_id=$1 and user_id=$2 order by updated_at desc limit 100",[x.tenantId,actor])).rows);
});
app.get("/v1/intelligence/copilot/conversations/:id",async c=>{
 const x=context(c.req.raw.headers),actor=c.req.header("x-actor")||"unknown",id=c.req.param("id");
 const convo=(await pool.query("select id,title,created_at,updated_at from copilot_conversations where tenant_id=$1 and user_id=$2 and id=$3",[x.tenantId,actor,id])).rows[0];
 if(!convo)return c.json({code:"NOT_FOUND",message:"Conversation not found"},404);
 const[messages,actions]=await Promise.all([
   pool.query("select id,role,content,intent,citations,metadata,created_at from copilot_messages where tenant_id=$1 and conversation_id=$2 order by created_at",[x.tenantId,id]),
   pool.query("select id,message_id,action_type,summary,payload,status,created_at,confirmed_at,last_error from copilot_action_proposals where tenant_id=$1 and conversation_id=$2 order by created_at",[x.tenantId,id])
 ]);
 return c.json({...convo,messages:messages.rows,proposals:actions.rows});
});
app.post("/v1/intelligence/copilot/actions/:id/cancel",async c=>{
 const x=context(c.req.raw.headers),actor=c.req.header("x-actor")||"unknown";
 const{rows}=await pool.query("update copilot_action_proposals p set status='CANCELLED' from copilot_conversations v where p.tenant_id=$1 and p.id=$2 and p.status='PROPOSED' and v.id=p.conversation_id and v.user_id=$3 returning p.id,p.status",[x.tenantId,c.req.param("id"),actor]);
 return rows[0]?c.json(rows[0]):c.json({code:"NOT_FOUND",message:"Action proposal not found or no longer pending"},404);
});
app.post("/v1/intelligence/copilot/actions/:id/confirm",async c=>{
 const x=context(c.req.raw.headers),actor=c.req.header("x-actor")||"unknown",headers={...internalHeaders(x.tenantId,x.correlationId,actor),"content-type":"application/json"};
 const proposal=(await pool.query("select p.* from copilot_action_proposals p join copilot_conversations v on v.id=p.conversation_id and v.tenant_id=p.tenant_id where p.tenant_id=$1 and p.id=$2 and p.status='PROPOSED' and v.user_id=$3",[x.tenantId,c.req.param("id"),actor])).rows[0];
 if(!proposal)return c.json({code:"NOT_FOUND",message:"Action proposal not found or no longer pending"},404);
 let execution:any={ok:true,previewOnly:false};
 try{
   if(proposal.action_type==="CREATE_TASK"){
     const r=await fetch(WORKFLOW+"/v1/workflow/tasks",{method:"POST",headers,body:JSON.stringify(proposal.payload),signal:AbortSignal.timeout(8000)});
     if(!r.ok)throw new Error("Task creation failed with "+r.status);
     execution=await r.json();
   }else if(proposal.action_type==="ADD_NOTE"){
     if(!proposal.payload.applicationId)throw new Error("Application ID is required for note creation");
     const r=await fetch(WORKFLOW+"/v1/workflow/"+encodeURIComponent(proposal.payload.applicationId)+"/notes",{method:"POST",headers,body:JSON.stringify({body:proposal.payload.body}),signal:AbortSignal.timeout(8000)});
     if(!r.ok)throw new Error("Note creation failed with "+r.status);
     execution=await r.json();
   }else if(proposal.action_type==="DRAFT_COMMUNICATION"){
     execution={ok:true,draft:proposal.payload.draft,notSent:true,message:"Draft approved for recruiter review. Raeburn Talent did not send it automatically."};
   }else{
     return c.json({code:"ACTION_NOT_ALLOWED",message:"This copilot action type cannot be executed."},403);
   }
   await pool.query("update copilot_action_proposals set status='CONFIRMED',confirmed_by=$3,confirmed_at=now() where tenant_id=$1 and id=$2",[x.tenantId,proposal.id,actor]);
   return c.json({id:proposal.id,status:"CONFIRMED",actionType:proposal.action_type,execution});
 }catch(err){
   const message=err instanceof Error?err.message:String(err);
   await pool.query("update copilot_action_proposals set status='FAILED',last_error=$3 where tenant_id=$1 and id=$2",[x.tenantId,proposal.id,message]);
   return c.json({code:"ACTION_FAILED",message},502);
 }
});

app.get("/v1/intelligence/runs",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select id,task,provider,model,prompt_version,status,advisory_only,requested_by,created_at,completed_at,last_error from ai_runs where tenant_id=$1 order by created_at desc limit 250",[x.tenantId])).rows);});
app.get("/v1/intelligence/candidates/:id/extractions",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from candidate_extractions where tenant_id=$1 and candidate_id=$2 order by created_at desc",[x.tenantId,c.req.param("id")])).rows);});
app.post("/v1/intelligence/extractions/:id/approve",async c=>{const x=context(c.req.raw.headers),id=c.req.param("id"),row=(await pool.query("select * from candidate_extractions where tenant_id=$1 and id=$2",[x.tenantId,id])).rows[0];if(!row)return c.json({code:"NOT_FOUND",message:"Extraction not found"},404);if(row.status!=="REVIEW_REQUIRED")return c.json({code:"INVALID_STATE",message:"Extraction is not awaiting review"},409);const r=await fetch(CANDIDATES+"/v1/candidates/"+row.candidate_id+"/profile",{method:"PATCH",headers:{"content-type":"application/json","x-tenant-id":x.tenantId,"x-correlation-id":x.correlationId,"x-actor":c.req.header("x-actor")||"intelligence-review"},body:JSON.stringify({profile:row.extraction.profile||row.extraction,tags:row.extraction.tags||undefined})});if(!r.ok)return c.json({code:"CANDIDATE_UPDATE_FAILED",message:"Could not apply approved extraction"},502);await pool.query("update candidate_extractions set status='APPROVED',reviewed_by=$3,reviewed_at=now() where tenant_id=$1 and id=$2",[x.tenantId,id,c.req.header("x-actor")||null]);return c.json({id,status:"APPROVED",candidate:await r.json()});});
app.post("/v1/intelligence/extractions/:id/reject",async c=>{const x=context(c.req.raw.headers);const{rows}=await pool.query("update candidate_extractions set status='REJECTED',reviewed_by=$3,reviewed_at=now() where tenant_id=$1 and id=$2 and status='REVIEW_REQUIRED' returning *",[x.tenantId,c.req.param("id"),c.req.header("x-actor")||null]);return rows[0]?c.json(rows[0]):c.json({code:"NOT_FOUND",message:"Extraction not found or already reviewed"},404);});
app.post("/v1/intelligence/prompts",async c=>{const x=context(c.req.raw.headers),b=(await c.req.json()) as any,id=randomUUID();const task=Task.parse(b.task);await pool.query("insert into prompt_versions(id,tenant_id,task,version,prompt,active) values($1,$2,$3,$4,$5,$6)",[id,x.tenantId,task,String(b.version),String(b.prompt),b.active!==false]);return c.json({id},201);});
app.get("/v1/intelligence/prompts",async c=>{const x=context(c.req.raw.headers);return c.json((await pool.query("select * from prompt_versions where tenant_id=$1 order by task,created_at desc",[x.tenantId])).rows);});

serve({fetch:app.fetch,port:Number(process.env.PORT||4126)});
export{runAdvice,detectIntent,taskGuidance};
