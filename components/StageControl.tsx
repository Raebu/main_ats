"use client";

import { useState } from "react";

const stages=["NEW","SCREENING","REVIEW","SHORTLIST","INTERVIEW","FINAL_INTERVIEW","OFFER","HIRED","REJECTED","WITHDRAWN","ON_HOLD","TALENT_POOL"];

export default function StageControl({ applicationId, current }: { applicationId:string; current:string }) {
  const [stage,setStage]=useState(current);
  const [saving,setSaving]=useState(false);
  async function update(value:string){
    setStage(value); setSaving(true);
    const res=await fetch(`/api/applications/${applicationId}/stage`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({stage:value})});
    if(!res.ok) setStage(current);
    setSaving(false);
  }
  return <select value={stage} disabled={saving} onChange={e=>update(e.target.value)}>{stages.map(s=><option key={s}>{s}</option>)}</select>;
}
