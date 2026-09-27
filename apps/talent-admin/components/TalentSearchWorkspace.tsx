"use client";
import{FormEvent,useMemo,useState}from"react";
import Link from"next/link";

type SearchData={query:string;effectiveQuery:string;filters:Record<string,any>;facets:Record<string,Record<string,number>>;explanation:any;results:any[]};

const facetKeys=["skill","employer","title","location","qualification","language"] as const;

export default function TalentSearchWorkspace({initialSaved=[]}:{initialSaved:any[]}){
 const[q,setQ]=useState(""),[type,setType]=useState("candidate"),[semantic,setSemantic]=useState(true),[filters,setFilters]=useState<Record<string,string>>({}),[data,setData]=useState<SearchData|null>(null),[saved,setSaved]=useState<any[]>(initialSaved),[busy,setBusy]=useState(false),[natural,setNatural]=useState(""),[interpreted,setInterpreted]=useState<any>(null);
 const activeFilters=useMemo(()=>Object.fromEntries(Object.entries(filters).filter(([,v])=>v.trim())),[filters]);
 async function run(e?:FormEvent){e?.preventDefault();setBusy(true);const p=new URLSearchParams({q,type,semantic:String(semantic),filters:JSON.stringify(activeFilters)});const r=await fetch("/api/talent/search?"+p);setData(r.ok?await r.json():null);setBusy(false);}
 async function interpret(){if(!natural.trim())return;const r=await fetch("/api/talent/search/interpret",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:natural})});if(!r.ok)return;const x=await r.json();setInterpreted(x);setQ(x.query||"");const next:Record<string,string>={};for(const[k,v]of Object.entries(x.filters||{}))next[k]=(v as string[]).join(", ");setFilters(next);}
 async function save(){const name=prompt("Name this talent search");if(!name)return;const r=await fetch("/api/talent/search/saved",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,resourceType:type||null,query:q,filters:activeFilters,alertEnabled:true,alertIntervalMinutes:1440})});if(r.ok){const all=await fetch("/api/talent/search/saved");if(all.ok)setSaved(await all.json());}}
 async function runSaved(id:string){const r=await fetch("/api/talent/search/saved/"+id+"/run",{method:"POST"});if(r.ok){const x=await r.json();setData({query:"Saved search",effectiveQuery:"Saved search",filters:{},facets:{},explanation:{ranking:"saved-search criteria",opaqueAiRanking:false},results:x.results||[]});}}
 function setFacet(key:string,value:string){setFilters(v=>({...v,[key]:value}));}
 return <div className="workspaceStack">
  <section className="card">
   <div className="sectionHead"><div><h2>Talent rediscovery</h2><p>Boolean, faceted and ontology-aware search with inspectable ranking evidence.</p></div><label><input type="checkbox" checked={semantic} onChange={e=>setSemantic(e.target.checked)}/> Expand synonyms & related skills</label></div>
   <form onSubmit={run} className="searchGrid">
    <label className="searchWide">Search query<input value={q} onChange={e=>setQ(e.target.value)} placeholder={'e.g. (AWS OR "Amazon Web Services") AND Kubernetes NOT intern'}/></label>
    <label>Record type<select value={type} onChange={e=>setType(e.target.value)}><option value="candidate">Candidates</option><option value="job">Jobs</option><option value="">Everything</option></select></label>
    {facetKeys.map(k=><label key={k}>{k[0].toUpperCase()+k.slice(1)}<input value={filters[k]||""} onChange={e=>setFacet(k,e.target.value)} placeholder={"Filter by "+k}/></label>)}
    <div className="headerActions searchWide"><button disabled={busy}>{busy?"Searching…":"Search talent"}</button><button type="button" onClick={save}>Save + alert</button></div>
   </form>
  </section>

  <section className="card">
   <h3>Natural-language search builder</h3><div className="filterBar"><input value={natural} onChange={e=>setNatural(e.target.value)} placeholder="Find engineers in Southampton with AWS and Kubernetes"/><button onClick={interpret}>Interpret</button></div>
   {interpreted&&<div className="notice"><strong>Inspect before searching</strong><p>Query: {interpreted.query||"—"}</p><p>Filters: {JSON.stringify(interpreted.filters||{})}</p><small>{interpreted.explanation}</small></div>}
  </section>

  {!!saved.length&&<section className="card"><h3>Saved searches & alerts</h3><div className="list">{saved.map((s:any)=><div className="rowCard" key={s.id}><div><strong>{s.name}</strong><p>{s.query||"Filter-only search"} · {s.alert_enabled?"Alerts on":"Alerts off"}</p></div><button onClick={()=>runSaved(s.id)}>Run now</button></div>)}</div></section>}

  {data&&<section>
   <div className="card searchExplain"><h3>How these results were found</h3><p><strong>{data.explanation?.ranking}</strong></p><p>Boolean query: <code>{data.explanation?.booleanQuery||"none"}</code></p>{(data.explanation?.expansions||[]).map((x:any)=><p key={x.term}><strong>{x.term}</strong> expanded to {x.expandedTo.join(", ")}</p>)}{(data.explanation?.typoSuggestions||[]).map((x:any)=><p key={x.term}>Possible spelling for <strong>{x.term}</strong>: {x.suggestions.join(", ")}</p>)}<p>Opaque AI ranking: <strong>{data.explanation?.opaqueAiRanking?"Yes":"No"}</strong></p></div>
   <div className="facetGrid">{Object.entries(data.facets||{}).map(([key,vals])=><div className="card" key={key}><h4>{key}</h4>{Object.entries(vals as Record<string,number>).slice(0,8).map(([v,n])=><button className="facetButton" key={v} onClick={()=>setFacet(key,v)}>{v} <span>{n}</span></button>)}</div>)}</div>
   <div className="list">{(data.results||[]).map((r:any)=><article className="card" key={r.type+":"+r.id}><div className="sectionHead"><div><strong>{r.title||r.id}</strong><p><span className="statusBadge">{r.type}</span> · evidence score {Number(r.rank||0).toFixed(1)}</p></div>{r.type==="candidate"?<Link className="button" href={"/candidates/"+r.id}>Open candidate</Link>:r.type==="job"?<Link className="button" href={"/jobs/"+r.id}>Open job</Link>:null}</div><div className="tagRow">{[...(r.metadata?.skill||[]),...(r.metadata?.location||[])].slice(0,12).map((x:any)=><span className="statusBadge" key={String(x)}>{String(x)}</span>)}</div></article>)}</div>
  </section>}
 </div>
}