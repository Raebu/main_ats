import{JSONCodec}from"nats";
import type{DomainEvent}from"@raeburn/events";
import{eventBus,pool,serviceAuthHeaders}from"@raeburn/service-kit";

const bus=await eventBus(),codec=JSONCodec<DomainEvent>();
const CANDIDATES=process.env.CANDIDATES_URL||"http://localhost:4102";
const APPLICATIONS=process.env.APPLICATIONS_URL||"http://localhost:4103";

async function candidateForApplication(tenantId:string,applicationId:string){
 const r=await fetch(APPLICATIONS+"/v1/applications/"+applicationId,{headers:serviceAuthHeaders({"x-tenant-id":tenantId})});
 if(!r.ok)return null;const a:any=await r.json();return a.candidateId||a.candidate_id||null;
}
async function record(e:DomainEvent,candidateId:string,kind:string,weight:number,detail:any={}){
 const r=await fetch(CANDIDATES+"/v1/candidates/"+candidateId+"/engagements",{method:"POST",headers:serviceAuthHeaders({"content-type":"application/json","x-tenant-id":e.tenantId,"x-correlation-id":e.correlationId,"x-actor":"candidate-intelligence-worker"}),body:JSON.stringify({kind,weight,source:e.eventType,detail,occurredAt:e.occurredAt})});
 if(!r.ok)throw new Error("candidate engagement write failed: "+r.status);
}
const subjects=["application.created.v1","interview.completed.v1","offer.accepted.v1","candidate.hired.v1"];
for(const subject of subjects){void (async()=>{const sub=bus.subscribe(subject);for await(const m of sub){const e=codec.decode(m.data);if((await pool.query("select 1 from processed_events where event_id=$1",[e.eventId])).rowCount)continue;try{const p:any=e.payload||{};let candidateId=p.candidateId||p.candidate_id||p.candidate?.id||null,applicationId=p.applicationId||p.application_id||null;if(!candidateId&&applicationId)candidateId=await candidateForApplication(e.tenantId,applicationId);if(candidateId){if(subject==="application.created.v1")await record(e,candidateId,"APPLICATION",20,{applicationId:p.id||applicationId,jobId:p.jobId||p.job_id||p.job?.id});if(subject==="interview.completed.v1")await record(e,candidateId,"INTERVIEW",25,{applicationId,interviewId:p.id});if(subject==="offer.accepted.v1")await record(e,candidateId,"OFFER_ACCEPTED",30,{applicationId,offerId:p.id});if(subject==="candidate.hired.v1")await record(e,candidateId,"HIRED",35,{applicationId});}await pool.query("insert into processed_events(event_id) values($1) on conflict do nothing",[e.eventId]);}catch(err){console.error(JSON.stringify({service:"candidate-intelligence-worker",eventId:e.eventId,eventType:e.eventType,error:String(err)}));}}})();}
