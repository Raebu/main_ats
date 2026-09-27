import{api}from"../../../lib/api";
import{notFound}from"next/navigation";
import ExtractionReview from"../../../components/ExtractionReview";
import CandidateEditor from"../../../components/CandidateEditor";
import DocumentCompare from"../../../components/DocumentCompare";
import RecentView from"../../../components/RecentView";
import FavouriteButton from"../../../components/FavouriteButton";
import Breadcrumbs from"../../../components/Breadcrumbs";
import TalentPoolManager from"../../../components/TalentPoolManager";

export default async function Page({params}:{params:Promise<{id:string}>}){
 const{id}=await params;
 const[c,timeline,sources,applications,extractions,documents,memberships,poolHistory,duplicates,favourites,pools,intelligence,similar,graph]=await Promise.all([
  api("/v1/candidates/"+id),api("/v1/candidates/"+id+"/timeline"),api("/v1/candidates/"+id+"/sources"),api("/v1/applications?candidateId="+id),
  api("/v1/intelligence/candidates/"+id+"/extractions"),api("/v1/documents/candidate/"+id),api("/v1/talent-pools/memberships/"+id),
  api("/v1/talent-pools/history/"+id),api("/v1/candidates/"+id+"/duplicates"),api("/v1/workflow/favourites"),api("/v1/talent-pools"),
  api("/v1/candidates/"+id+"/intelligence"),api("/v1/search/similar/candidates/"+id),api("/v1/search/graph/candidate/"+id)
 ]);
 if(!c)notFound();
 const applicationHistory=await Promise.all((applications||[]).map(async(a:any)=>{const[workflow,workflowHistory,job,communications,interviews,offers]=await Promise.all([api("/v1/workflow/"+a.id),api("/v1/workflow/"+a.id+"/history"),api("/v1/jobs/"+a.jobId),api("/v1/communications/application/"+a.id),api("/v1/interviews?applicationId="+a.id),api("/v1/offers?applicationId="+a.id)]);return{...a,workflow,workflowHistory:workflowHistory||[],job,communications:communications||[],interviews:interviews||[],offers:offers||[]};}));
 const unified=[...(timeline||[]).map((t:any)=>({at:t.occurred_at,type:t.event_type,title:t.title,detail:t.detail})),...applicationHistory.flatMap((a:any)=>[{at:a.createdAt,type:"APPLICATION",title:"Applied for "+(a.job?.title||a.jobId),detail:{applicationId:a.id,stage:a.workflow?.stage}},...a.interviews.map((x:any)=>({at:x.created_at||x.starts_at,type:"INTERVIEW",title:"Interview "+x.status,detail:{applicationId:a.id,round:x.round}})),...a.offers.map((x:any)=>({at:x.created_at,type:"OFFER",title:"Offer "+x.status,detail:{applicationId:a.id,version:x.version}})),...a.communications.map((x:any)=>({at:x.created_at,type:"COMMUNICATION",title:x.subject||x.channel,detail:{status:x.status}})),...a.workflowHistory.map((x:any)=>({at:x.occurred_at,type:"WORKFLOW",title:(x.from_stage||"—")+" → "+x.to_stage,detail:{applicationId:a.id,actor:x.actor}}))]),...(poolHistory||[]).map((x:any)=>({at:x.occurred_at,type:"TALENT_POOL",title:(x.action==="ADDED"?"Added to ":"Removed from ")+(x.name||x.pool_id),detail:{poolId:x.pool_id,actor:x.actor}}))].filter((x:any)=>x.at).sort((a:any,b:any)=>new Date(b.at).getTime()-new Date(a.at).getTime());
 const favourite=(favourites||[]).some((x:any)=>x.resource_type==="candidate"&&x.resource_id===id);
 return <>
  <RecentView resourceType="candidate" resourceId={id} title={c.name} href={"/candidates/"+id}/>
  <Breadcrumbs items={[{label:"Candidates",href:"/candidates"},{label:c.name}]}/>
  <div className="pageHeader"><div><h1>{c.name}</h1><p>{c.email} · {c.location||"Location not recorded"}</p></div><FavouriteButton resourceType="candidate" resourceId={id} initial={favourite}/></div>
  <CandidateEditor candidate={c} duplicates={duplicates||[]}/>
  <div className="stats">
   <div className="card"><h3>Relationship</h3><p>{c.relationshipStatus}</p><p>Owner: {c.ownerUserId||"Unassigned"}</p><p>{c.doNotContact?"Do not contact":"Contact permitted"}</p></div>
   <div className="card"><h3>Engagement</h3><strong className="bigMetric">{intelligence?.engagement?.score??c.engagementScore??0}/100</strong><p>Freshness {intelligence?.freshness?.score??c.freshnessScore??0}/100</p><small>{intelligence?.freshness?.ageDays??"—"} days since last candidate activity</small></div>
   <div className="card"><h3>Sources</h3>{(sources||[]).map((s:any)=><p key={s.id}>{s.source}</p>)}</div>
   <div className="card"><h3>Talent pools</h3>{(memberships||[]).length?(memberships||[]).map((m:any)=><p key={m.pool_id}>{m.name}</p>):<p>None</p>}</div>
  </div>
  <div className="twoCol">
   <TalentPoolManager candidateId={id} pools={pools||[]}/>
   <div className="card"><h3>Talent graph</h3>{(graph||[]).length?(graph||[]).slice(0,12).map((e:any)=><p key={e.id}><span className="statusBadge">{e.relation}</span> {e.from_type==="candidate"?e.to_id:e.from_id}</p>):<p>Graph edges will appear as indexed profile evidence accumulates.</p>}</div>
  </div>
  <div className="card"><h2>Similar candidates</h2><p>Transparent similarity based on shared skills/location—not an automatic hiring rank.</p>{(similar||[]).length?(similar||[]).map((s:any)=><div className="rowCard" key={s.id}><div><a href={"/candidates/"+s.id}><strong>{s.title}</strong></a><p>{(s.similarityEvidence?.sharedSkills||[]).join(", ")||"Location evidence"}{s.similarityEvidence?.sameLocation?" · same location":""}</p></div><span className="statusBadge">evidence {s.score}</span></div>):<p>No evidence-based similar candidates yet.</p>}</div>
  <div className="card"><h3>CV versions</h3>{(documents||[]).filter((d:any)=>d.kind==="CV").map((d:any)=><p key={d.id}>v{d.version_number||1} · {d.file_name}<br/><small>{d.status}</small></p>)}</div>
  <DocumentCompare documents={documents||[]}/>
  <h2>Application history</h2><div className="grid">{applicationHistory.map((a:any)=><div className="card" key={a.id}><a href={"/applications/"+a.id}><strong>{a.job?.title||a.jobId}</strong></a><p><span className={"statusBadge stage-"+String(a.workflow?.stage||"APPLIED").toLowerCase()}>{a.workflow?.stage||"APPLIED"}</span></p><p>{new Date(a.createdAt).toLocaleDateString("en-GB")}</p><small>{a.interviews.length} interview(s) · {a.offers.length} offer record(s) · {a.communications.length} communication(s)</small></div>)}</div>
  <ExtractionReview items={extractions||[]}/>
  <h2>Unified history</h2><div className="timeline">{unified.map((t:any,i:number)=><div className="timelineItem" key={t.type+":"+t.at+":"+i}><span className="timelineDot"/><div><strong>{t.title}</strong><p><span className="statusBadge">{t.type}</span> · {new Date(t.at).toLocaleString("en-GB")}</p>{t.detail&&<small>{JSON.stringify(t.detail)}</small>}</div></div>)}</div>
 </>;
}
