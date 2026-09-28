import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { DomainEvent } from "@raeburn/events";
import { createEvent, Events } from "@raeburn/events";
import { consumeDurable, metricInc, pool, serviceAuthHeaders, withCircuitBreaker, withTransaction, writeOutbox } from "@raeburn/service-kit";

const tx = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});

const APPLICATIONS = process.env.APPLICATIONS_URL || "http://localhost:4103";
const CANDIDATES = process.env.CANDIDATES_URL || "http://localhost:4102";
const JOBS = process.env.JOBS_URL || "http://localhost:4101";

async function hydrate(tenantId:string,correlationId:string,applicationId:string){
  const headers=serviceAuthHeaders({"x-tenant-id":tenantId,"x-correlation-id":correlationId});
  const aRes=await fetch(APPLICATIONS+"/v1/applications/"+applicationId,{headers});
  if(!aRes.ok)throw new Error("application hydration failed: "+aRes.status);
  const application:any=await aRes.json();
  const[cRes,jRes]=await Promise.all([
    fetch(CANDIDATES+"/v1/candidates/"+application.candidateId,{headers}),
    fetch(JOBS+"/v1/jobs/"+application.jobId,{headers})
  ]);
  if(!cRes.ok||!jRes.ok)throw new Error("candidate/job hydration failed");
  return{application,candidate:await cRes.json(),job:await jRes.json()};
}

async function sendMessage(e:DomainEvent,applicationId:string|null,recipient:string,subject:string,body:string){
  const existing=(await pool.query("select id,status from messages where tenant_id=$1 and source_event_id=$2 and recipient=$3 and subject=$4",[e.tenantId,e.eventId,recipient,subject])).rows[0];
  if(existing?.status==="SENT"||existing?.status==="SKIPPED")return;
  const id=existing?.id||randomUUID();
  if(!existing)await pool.query("insert into messages(id,tenant_id,application_id,recipient,subject,body,status,source_event_id) values($1,$2,$3,$4,$5,$6,'PENDING',$7)",[id,e.tenantId,applicationId,recipient,subject,body,e.eventId]);
  let providerId:string|undefined,status="SKIPPED";
  if(process.env.SMTP_HOST){
    const result=await withCircuitBreaker("smtp-primary",()=>tx.sendMail({
      from:process.env.SMTP_FROM||"Raeburn Talent <careers@theraeburngroup.com>",
      to:recipient,subject,text:body,disableFileAccess:true,disableUrlAccess:true,
      messageId:"<"+id+"@talent.theraeburngroup.com>"
    }),{failureThreshold:3,cooldownMs:30000});
    providerId=result.messageId;status="SENT";metricInc("raeburn_email_send_total",{status:"SENT"});
  }
  await withTransaction(async client=>{
    await client.query("update messages set status=$2,provider_message_id=$3,sent_at=case when $2='SENT' then now() else null end where id=$1",[id,status,providerId||null]);
    await writeOutbox(client,createEvent({eventType:Events.communicationSent,eventVersion:1,producer:"communications",correlationId:e.correlationId,causationId:e.eventId,tenantId:e.tenantId,payload:{id,applicationId,subject,status,providerMessageId:providerId||null}}));
  });
}

async function handle(subject:string){
  await consumeDurable(subject,"communications-"+subject,async(e:DomainEvent)=>{
    if((await pool.query("select 1 from processed_events where event_id=$1",[e.eventId])).rowCount)return;
    try{
      const p:any=e.payload||{};let applicationId=p.applicationId||p.application_id||p.id;
      if(subject==="job.published.v1"){
        const r=await fetch(APPLICATIONS+"/v1/applications/job-alerts/match",{method:"POST",headers:serviceAuthHeaders({"content-type":"application/json","x-tenant-id":e.tenantId,"x-correlation-id":e.correlationId}),body:JSON.stringify(p)});
        if(!r.ok)throw new Error("job alert matching failed: "+r.status);
        const alerts:any[]=await r.json();
        for(const alert of alerts){
          if(alert.candidateId){
            const cr=await fetch(CANDIDATES+"/v1/candidates/"+alert.candidateId,{headers:serviceAuthHeaders({"x-tenant-id":e.tenantId,"x-correlation-id":e.correlationId})});
            if(!cr.ok)throw new Error("job alert candidate lookup failed: "+cr.status);
            const candidate:any=await cr.json();if(candidate?.doNotContact)continue;
          }
          const careers=process.env.CAREERS_BASE_URL||"https://theraeburngroup.com";
          await sendMessage(e,null,alert.email,"New Raeburn opportunity — "+(p.title||"Careers"),"A new opportunity matches your Raeburn job alert: "+(p.title||"Open role")+(p.location?" · "+p.location:"")+". Explore the role at "+careers+"/careers/jobs/"+p.slug+".\n\nStop this alert: "+careers+"/careers/job-alerts/unsubscribe?token="+encodeURIComponent(alert.manageToken||""));
        }
      }else if(subject==="application.created.v1"){
        applicationId=p.id;const h=await hydrate(e.tenantId,e.correlationId,applicationId),recipient=h?.candidate?.email;
        if(recipient)await sendMessage(e,applicationId,recipient,"Application received — "+(h?.job?.title||"Raeburn opportunity"),"Thank you for applying for "+(h?.job?.title||"this opportunity")+" at The Raeburn Group. We have received your application and will keep you updated.");
      }else if(subject==="interview.feedback_reminder.v1"&&p.reviewerId&&String(p.reviewerId).includes("@")){
        await sendMessage(e,p.applicationId,String(p.reviewerId),"Interview feedback reminder — Raeburn Talent","Your independent interview scorecard is due. Please submit your evidence before panel feedback is opened.");
      }else if(["scheduler.candidate_keep_in_touch.due.v1","scheduler.candidate_reengagement.due.v1","scheduler.candidate_application_anniversary.due.v1"].includes(subject)){
        if(applicationId){
          const h=await hydrate(e.tenantId,e.correlationId,applicationId),recipient=h?.candidate?.email;
          if(recipient&&!h?.candidate?.doNotContact){
            if(subject==="scheduler.candidate_keep_in_touch.due.v1")await sendMessage(e,applicationId,recipient,"Relevant opportunities at The Raeburn Group","You asked us to keep in touch about recruitment opportunities. Explore current Raeburn roles through Careers, or update your communication preferences in My Raeburn.");
            if(subject==="scheduler.candidate_reengagement.due.v1")await sendMessage(e,applicationId,recipient,"Still open to opportunities with Raeburn?","We are checking in because you chose to hear about future opportunities. If your interests have changed, update your profile and preferences in My Raeburn.");
            if(subject==="scheduler.candidate_application_anniversary.due.v1")await sendMessage(e,applicationId,recipient,"Your Raeburn recruitment preferences","It has been around a year since this application. Please review your profile, job alerts and recruitment communication preferences in My Raeburn so we only retain and use information in ways you still expect.");
          }
        }
      }else if(applicationId){
        const h=await hydrate(e.tenantId,e.correlationId,applicationId),recipient=h?.candidate?.email;
        if(recipient&&subject==="interview.scheduled.v1"){const when=p.starts_at||p.startsAt;await sendMessage(e,applicationId,recipient,"Interview scheduled — "+(h?.job?.title||"Raeburn opportunity"),"Your interview for "+(h?.job?.title||"this opportunity")+" has been scheduled"+(when?" for "+new Date(when).toLocaleString("en-GB"):"")+". We will provide any joining details separately.");}
        if(recipient&&subject==="assessment.assigned.v1")await sendMessage(e,applicationId,recipient,"Assessment assigned — "+(h?.job?.title||"Raeburn opportunity"),"An assessment has been assigned to your application. Sign in to your candidate portal to review the instructions and deadline.");
        if(recipient&&subject==="offer.issued.v1")await sendMessage(e,applicationId,recipient,"Offer update — "+(h?.job?.title||"Raeburn opportunity"),"An offer has been issued for your application for "+(h?.job?.title||"this opportunity")+". Please review the offer information provided by the recruitment team.");
        if(recipient&&subject==="offer.expired.v1")await sendMessage(e,applicationId,recipient,"Offer expired — "+(h?.job?.title||"Raeburn opportunity"),"The offer associated with your application has expired. Please contact the recruitment team if you believe this is unexpected.");
        if(recipient&&subject==="candidate.hired.v1")await sendMessage(e,applicationId,recipient,"Welcome to The Raeburn Group","We are delighted to confirm that your recruitment process has reached the hired stage. The team will contact you with onboarding information.");
      }
      await pool.query("insert into processed_events(event_id) values($1) on conflict do nothing",[e.eventId]);
    }catch(err){
      console.error("communication failed",e.eventId,err);
      metricInc("raeburn_email_failures_total",{source_event:e.eventType});await withTransaction(async client=>{await writeOutbox(client,createEvent({eventType:Events.communicationFailed,eventVersion:1,producer:"communications",correlationId:e.correlationId,causationId:e.eventId,tenantId:e.tenantId,payload:{sourceEvent:e.eventType,error:err instanceof Error?err.message:String(err)}}));});
      throw err;
    }
  },{maxDeliver:8,baseRetryMs:1000,ackWaitMs:60000});
}
for(const subject of["job.published.v1","application.created.v1","interview.scheduled.v1","interview.feedback_reminder.v1","assessment.assigned.v1","offer.issued.v1","offer.expired.v1","candidate.hired.v1","scheduler.candidate_keep_in_touch.due.v1","scheduler.candidate_reengagement.due.v1","scheduler.candidate_application_anniversary.due.v1"])void handle(subject);
