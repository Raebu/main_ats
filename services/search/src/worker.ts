import{randomUUID}from"node:crypto";
import type{DomainEvent}from"@raeburn/events";
import{consumeDurable,metricInc,pool,resilientFetch,serviceAuthHeaders,withWorkerLease}from"@raeburn/service-kit";

const SEARCH_URL=process.env.SEARCH_URL||"http://localhost:4125";
const NOTIFICATIONS_URL=process.env.NOTIFICATIONS_URL||"http://localhost:4112";

function names(list:any){return(Array.isArray(list)?list:[]).map((x:any)=>typeof x==="string"?x:(x?.name||x?.title||x?.value)).filter(Boolean);}
async function indexCandidate(e:DomainEvent,p:any){
 const skills=names(p.skills),qualifications=names(p.qualifications),languages=names(p.languages),employment=Array.isArray(p.employmentHistory)?p.employmentHistory:[];
 const employers=employment.map((x:any)=>x.company||x.employer).filter(Boolean),titles=employment.map((x:any)=>x.title||x.jobTitle).filter(Boolean);
 const body=[p.email,p.location,p.linkedIn,p.portfolio,...skills,...qualifications,...languages,...employers,...titles,...names(p.tags),...names(p.preferredBusinessAreas),...names(p.preferredRoleTypes)].filter(Boolean).join(" ");
 const metadata={...p,skill:skills,qualification:qualifications,language:languages,employer:employers,title:titles,location:p.location?[p.location]:[],recruiter:p.ownerUserId?[p.ownerUserId]:[],source:names(p.sources)};
 await pool.query("insert into search_documents(id,tenant_id,type,title,body,metadata) values($1,$2,'candidate',$3,$4,$5::jsonb) on conflict(tenant_id,type,id) do update set title=excluded.title,body=excluded.body,metadata=excluded.metadata,updated_at=now()",[p.id,e.tenantId,p.name||p.email,body,JSON.stringify(metadata)]);
 for(const skill of skills)await pool.query("insert into talent_graph_edges(id,tenant_id,from_type,from_id,to_type,to_id,relation,weight,evidence) values($1,$2,'candidate',$3,'skill',$4,'HAS_SKILL',1,$5::jsonb) on conflict(tenant_id,from_type,from_id,to_type,to_id,relation) do update set evidence=excluded.evidence,updated_at=now()",[randomUUID(),e.tenantId,p.id,String(skill).toLowerCase(),JSON.stringify({source:"candidate-profile"})]);
 for(const employer of employers)await pool.query("insert into talent_graph_edges(id,tenant_id,from_type,from_id,to_type,to_id,relation,weight,evidence) values($1,$2,'candidate',$3,'employer',$4,'WORKED_AT',1,$5::jsonb) on conflict(tenant_id,from_type,from_id,to_type,to_id,relation) do update set evidence=excluded.evidence,updated_at=now()",[randomUUID(),e.tenantId,p.id,String(employer).toLowerCase(),JSON.stringify({source:"employment-history"})]);
}
async function indexJob(e:DomainEvent,p:any){
 const skills=names(p.skills||p.requirements),body=[p.summary,p.description,p.requirements,...skills,p.location,p.organisationName].filter(Boolean).join(" ");
 const metadata={...p,skill:skills,title:p.title?[p.title]:[],location:p.location?[p.location]:[],employer:p.organisationName?[p.organisationName]:[]};
 await pool.query("insert into search_documents(id,tenant_id,type,title,body,metadata) values($1,$2,'job',$3,$4,$5::jsonb) on conflict(tenant_id,type,id) do update set title=excluded.title,body=excluded.body,metadata=excluded.metadata,updated_at=now()",[p.id,e.tenantId,p.title,body,JSON.stringify(metadata)]);
}
async function runSavedSearchAlerts(){
 const due=(await pool.query("select * from saved_searches where alert_enabled=true and coalesce(next_alert_at,now())<=now() order by next_alert_at nulls first limit 100")).rows;
 for(const s of due){try{
   const qs=new URLSearchParams({q:s.query||"",filters:JSON.stringify(s.filters||{}),limit:"250",semantic:"true"});if(s.resource_type)qs.set("type",s.resource_type);
   const response=await resilientFetch(SEARCH_URL+"/v1/search?"+qs,{headers:serviceAuthHeaders({"x-tenant-id":s.tenant_id,"x-actor":s.user_id})},{circuit:"search-self",attempts:2});
   if(!response.ok)throw new Error("search alert query returned "+response.status);
   const data:any=await response.json(),count=Array.isArray(data.results)?data.results.length:0,newCount=Math.max(0,count-Number(s.last_result_count||0)),runId=randomUUID();
   await pool.query("insert into search_alert_runs(id,tenant_id,saved_search_id,user_id,result_count,new_result_count,sample_results) values($1,$2,$3,$4,$5,$6,$7::jsonb)",[runId,s.tenant_id,s.id,s.user_id,count,newCount,JSON.stringify((data.results||[]).slice(0,10).map((r:any)=>({id:r.id,type:r.type,title:r.title})))]);
   await pool.query("update saved_searches set last_alert_at=now(),next_alert_at=now()+(alert_interval_minutes||' minutes')::interval,last_result_count=$3 where tenant_id=$1 and id=$2",[s.tenant_id,s.id,count]);
   if(newCount>0)await resilientFetch(NOTIFICATIONS_URL+"/internal/notifications",{method:"POST",headers:serviceAuthHeaders({"content-type":"application/json","x-tenant-id":s.tenant_id}),body:JSON.stringify({tenantId:s.tenant_id,userId:s.user_id,kind:"SAVED_SEARCH_ALERT",title:newCount+" new talent search result"+(newCount===1?"":"s"),body:'Saved search "'+s.name+'" has new matches.',resourceType:"saved_search",resourceId:s.id})},{circuit:"notifications",idempotent:true});
 }catch(err){console.error(JSON.stringify({service:"search-worker",event:"saved_search_alert_failed",savedSearchId:s.id,error:String(err)}));}}
}
const alertRun=()=>withWorkerLease("saved-search-alerts",runSavedSearchAlerts).catch(console.error);setInterval(alertRun,60000).unref();void alertRun();

await consumeDurable(">","search-index",async(e:DomainEvent)=>{const p:any=e.payload||{};try{if(e.eventType.startsWith("candidate.")&&p.id){await indexCandidate(e,p);metricInc("raeburn_search_index_total",{type:"candidate"});}if(e.eventType.startsWith("job.")&&p.id){await indexJob(e,p);metricInc("raeburn_search_index_total",{type:"job"});}}catch(err){metricInc("raeburn_search_index_failures_total",{event_type:e.eventType});console.error(JSON.stringify({service:"search-worker",event:"index_failed",eventId:e.eventId,eventType:e.eventType,error:String(err)}));throw err;}});
