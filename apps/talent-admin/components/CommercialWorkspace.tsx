"use client";
import {useMemo,useState} from "react";

async function call(path:string,method="POST",body?:unknown){
  const r=await fetch("/api/talent"+path,{method,headers:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.message||data.error||"Request failed");
  return data;
}

export default function CommercialWorkspace(p:any){
  const[msg,setMsg]=useState("");
  const busy=async(fn:()=>Promise<any>)=>{try{setMsg("Saving…");await fn();setMsg("Saved. Refresh to see the latest totals.");}catch(e){setMsg(e instanceof Error?e.message:"Failed");}};
  const s=p.referralDashboard?.summary||{};
  const activeCampaigns=p.campaigns.filter((x:any)=>x.status==="ACTIVE").length;
  const agencyQuality=useMemo(()=>p.vendors.length?Math.round(p.vendors.reduce((n:number,v:any)=>n+Number(v.quality_score||0),0)/p.vendors.length):0,[p.vendors]);

  return <div className="workspaceStack">
    {msg&&<div className="notice">{msg}</div>}
    <div className="stats">
      <div className="card"><small>Active campaigns</small><h2>{activeCampaigns}</h2></div>
      <div className="card"><small>Referral hires</small><h2>{s.hires||0}</h2></div>
      <div className="card"><small>Agency quality</small><h2>{agencyQuality}%</h2></div>
      <div className="card"><small>Actual / planned hires</small><h2>{p.workforce.actualHires||0} / {p.workforce.plannedOpenings||0}</h2></div>
    </div>

    <section className="card">
      <div className="sectionHead"><div><h2>Recruitment marketing</h2><p>Landing campaigns, careers fairs/events, advocacy links, QR codes and controlled experiments.</p></div></div>
      <div className="twoCol">
        <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);busy(()=>call("/v1/campaigns","POST",{name:f.get("name"),slug:f.get("slug"),campaignType:f.get("type"),objective:f.get("objective"),budget:Number(f.get("budget")||0),landing:{headline:f.get("headline"),body:f.get("body"),ctaLabel:f.get("cta")}}));}}>
          <h3>Create campaign</h3>
          <input name="name" placeholder="Campaign name" required/>
          <input name="slug" placeholder="campaign-slug" required/>
          <select name="type"><option>GENERAL</option><option>CAREERS_FAIR</option><option>EVENT</option><option>UNIVERSITY</option><option>EMPLOYEE_ADVOCACY</option><option>VETERAN</option><option>RETURNER</option><option>FOUNDER</option></select>
          <input name="objective" placeholder="Objective"/>
          <input name="budget" type="number" min="0" placeholder="Budget GBP"/>
          <input name="headline" placeholder="Landing headline"/>
          <textarea name="body" placeholder="Landing copy"/>
          <input name="cta" placeholder="CTA label"/>
          <button>Create campaign</button>
        </form>
        <div>
          <h3>Campaigns</h3>
          {p.campaigns.map((c:any)=><div className="subCard" key={c.id}>
            <strong>{c.name}</strong>
            <small>{c.campaign_type} · {c.status} · £{Number(c.budget||0).toLocaleString()}</small>
            <div className="actions">
              <button onClick={()=>busy(()=>call("/v1/campaigns/"+c.id,"PATCH",{status:c.status==="ACTIVE"?"PAUSED":"ACTIVE"}))}>{c.status==="ACTIVE"?"Pause":"Activate"}</button>
              <button className="secondaryButton" onClick={()=>busy(()=>call("/v1/campaigns/"+c.id+"/experiments","POST",{name:"CTA test "+new Date().toLocaleDateString("en-GB"),experimentType:"CTA",primaryMetric:"APPLICATION",configuration:{}}))}>Add CTA test</button>
            </div>
          </div>)}
        </div>
      </div>
    </section>

    <section className="card">
      <h2>Employee referrals</h2>
      <div className="stats">
        <div><small>Referral links</small><strong className="bigMetric">{s.referrals||0}</strong></div>
        <div><small>Claims</small><strong className="bigMetric">{s.claims||0}</strong></div>
        <div><small>Hires</small><strong className="bigMetric">{s.hires||0}</strong></div>
        <div><small>Rewards paid</small><strong className="bigMetric">£{Number(s.rewards_paid||0).toLocaleString()}</strong></div>
      </div>
      <div className="twoCol">
        <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);busy(()=>call("/v1/attribution/referrals","POST",{referrerId:f.get("employee"),jobId:String(f.get("job")||"")||undefined,ownershipDays:Number(f.get("days")||180),rewardScheme:{amount:Number(f.get("reward")||0),currency:"GBP"}}));}}>
          <h3>Create employee referral</h3>
          <input name="employee" placeholder="Employee user ID" required/>
          <input name="job" placeholder="Optional vacancy ID"/>
          <input name="days" type="number" defaultValue="180"/>
          <input name="reward" type="number" min="0" placeholder="Reward on hire"/>
          <button>Create referral link</button>
        </form>
        <div>
          <h3>Referral dashboard</h3>
          {p.referrals.map((r:any)=><div className="subCard" key={r.id}><strong>{r.referral_code}</strong><small>{r.referrer_id} · {r.claims||0} claims · {r.hires||0} hires · ownership {r.ownership_days} days</small></div>)}
          {(p.referralDashboard.fraudFlags||[]).map((f:any)=><div className="notice" key={f.id}><strong>Fraud review: {f.flag_type}</strong><small>{f.severity}</small></div>)}
        </div>
      </div>
    </section>

    <section className="card">
      <h2>Agencies & suppliers</h2>
      <div className="twoCol">
        <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);busy(()=>call("/v1/organisations/vendors","POST",{name:f.get("name"),vendorType:"AGENCY",contact:{email:f.get("email")},terms:{},feeModel:{}}));}}>
          <h3>Add agency</h3>
          <input name="name" placeholder="Agency name" required/>
          <input name="email" type="email" placeholder="Contact email"/>
          <button>Add supplier</button>
        </form>
        <div>
          {p.vendors.map((v:any)=><div className="subCard" key={v.id}>
            <strong>{v.name}</strong><small>Status {v.status} · quality {Number(v.quality_score||0)}%</small>
            <button onClick={()=>{const email=prompt("Agency account email");if(email)busy(()=>call("/v1/organisations/vendors/"+v.id+"/accounts","POST",{email,displayName:v.name}).then(x=>navigator.clipboard?.writeText(x.accessToken||"")));}}>Create portal account & copy token</button>
          </div>)}
        </div>
      </div>
    </section>

    <section className="card">
      <h2>Contractor operating pipeline</h2>
      <div className="grid">
        {p.contractors.map((c:any)=><div className="subCard" key={c.id}>
          <strong>{c.candidate_id||c.id}</strong>
          <small>{c.contractor_stage} · £{Number(c.day_rate||0)}/day · ends {c.contract_end_date||"not set"}</small>
          <select value={c.contractor_stage||"PRE_ENGAGEMENT"} onChange={e=>busy(()=>call("/v1/onboarding/contractors/"+c.id+"/stage","PATCH",{stage:e.target.value}))}>
            <option>PRE_ENGAGEMENT</option><option>ACTIVE</option><option>EXTENSION_REVIEW</option><option>ENDING</option><option>ENDED</option><option>REENGAGE</option>
          </select>
          <button onClick={()=>{const end=prompt("New contract end date YYYY-MM-DD");if(end)busy(()=>call("/v1/onboarding/contractors/"+c.id+"/extensions","POST",{newEndDate:end,reason:"Extension approved in workforce workspace"}));}}>Extend contract</button>
        </div>)}
      </div>
      <h3>Upcoming contractor reminders</h3>
      {p.reminders.slice(0,12).map((r:any)=><div className="rowCard" key={r.id}><span>{r.reminder_type} · {r.candidate_id||r.new_hire_id}</span><strong>{new Date(r.due_at).toLocaleDateString("en-GB")}</strong></div>)}
    </section>

    <section className="card">
      <h2>Workforce planning</h2>
      <div className="stats">
        <div><small>Planned openings</small><strong className="bigMetric">{p.workforce.plannedOpenings||0}</strong></div>
        <div><small>Approved</small><strong className="bigMetric">{p.workforce.approvedOpenings||0}</strong></div>
        <div><small>Forecast cost</small><strong className="bigMetric">£{Number(p.workforce.forecastCost||0).toLocaleString()}</strong></div>
        <div><small>Hiring velocity</small><strong className="bigMetric">{p.workforce.hiringVelocityPerMonth||0}/mo</strong></div>
      </div>
      <div className="twoCol">
        <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);busy(()=>call("/v1/jobs/workforce/capacity","POST",{organisationId:f.get("org"),department:f.get("department"),periodStart:f.get("start"),periodEnd:f.get("end"),currentHeadcount:Number(f.get("current")||0),targetHeadcount:Number(f.get("target")||0),plannedHires:Number(f.get("hires")||0),plannedExits:Number(f.get("exits")||0),annualisedCost:Number(f.get("cost")||0)}));}}>
          <h3>Add capacity plan</h3>
          <input name="org" placeholder="Organisation ID" required/>
          <input name="department" placeholder="Department"/>
          <input name="start" type="date"/><input name="end" type="date"/>
          <input name="current" type="number" placeholder="Current headcount"/><input name="target" type="number" placeholder="Target headcount"/>
          <input name="hires" type="number" placeholder="Planned hires"/><input name="exits" type="number" placeholder="Planned exits"/>
          <input name="cost" type="number" placeholder="Annualised cost"/>
          <button>Add capacity</button>
        </form>
        <div>
          <h3>Actual vs plan</h3>
          {p.plans.map((x:any)=><div className="subCard" key={x.id}><strong>{x.name}</strong><small>{x.status} · budget £{Number(x.budget||0).toLocaleString()}</small><button className="secondaryButton" onClick={()=>busy(()=>call("/v1/jobs/hiring-plans/"+x.id+"/reconcile","POST",{}))}>Reconcile actual hires</button></div>)}
        </div>
      </div>
    </section>
  </div>;
}
