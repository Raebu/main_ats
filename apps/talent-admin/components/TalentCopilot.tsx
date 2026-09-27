"use client";
import{FormEvent,useState}from"react";

type Citation={sourceType:string;sourceId:string;label:string;href:string;field?:string};
type Proposal={id:string;actionType:string;summary:string;payload:any;status:string;requiresConfirmation?:boolean};
type Message={id:string;role:"USER"|"ASSISTANT";content:string;citations?:Citation[];proposals?:Proposal[];aiStatus?:string};
const examples=[
 "Who still needs interviewing?",
 "Find previous candidates matching this job.",
 "Draft follow-ups for my attention queue.",
 "What needs my attention?",
 "Show evidence against the role requirements."
];

export default function TalentCopilot({initialConversations}:{initialConversations:any[]}){
 const[messages,setMessages]=useState<Message[]>([]);
 const[conversationId,setConversationId]=useState<string|undefined>();
 const[input,setInput]=useState("");
 const[busy,setBusy]=useState(false);
 const[context,setContext]=useState({candidateId:"",jobId:"",applicationId:""});
 const[conversations,setConversations]=useState(initialConversations||[]);

 async function ask(text:string){
  const message=text.trim();if(!message||busy)return;
  setBusy(true);setInput("");
  const user:Message={id:"local-"+Date.now(),role:"USER",content:message};
  setMessages(v=>[...v,user]);
  try{
   const r=await fetch("/api/talent/intelligence/copilot/query",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message,conversationId,context:Object.fromEntries(Object.entries(context).filter(([,v])=>v))})});
   const body=await r.json();
   if(!r.ok)throw new Error(body.message||body.error||"Copilot request failed");
   setConversationId(body.conversationId);
   const assistant:Message={id:body.messageId,role:"ASSISTANT",content:body.answer,citations:body.citations||[],proposals:body.proposals||[],aiStatus:body.ai?.status};
   setMessages(v=>[...v,assistant]);
   if(!conversationId)setConversations(v=>[{id:body.conversationId,title:message.slice(0,90),updated_at:new Date().toISOString()},...v]);
  }catch(err){
   setMessages(v=>[...v,{id:"error-"+Date.now(),role:"ASSISTANT",content:err instanceof Error?err.message:"Copilot request failed"}]);
  }finally{setBusy(false);}
 }

 async function loadConversation(id:string){
  const r=await fetch("/api/talent/intelligence/copilot/conversations/"+id);
  if(!r.ok)return;
  const body=await r.json();setConversationId(id);
  const proposalsByMessage=new Map<string,Proposal[]>();
  for(const p of body.proposals||[]){const list=proposalsByMessage.get(p.message_id)||[];list.push({...p,actionType:p.action_type});proposalsByMessage.set(p.message_id,list);}
  setMessages((body.messages||[]).map((m:any)=>({id:m.id,role:m.role,content:m.content,citations:m.citations||[],proposals:proposalsByMessage.get(m.id)||[],aiStatus:m.metadata?.aiStatus})));
 }
 function newConversation(){setConversationId(undefined);setMessages([]);setInput("");}
 async function proposalAction(id:string,action:"confirm"|"cancel"){
  const r=await fetch("/api/talent/intelligence/copilot/actions/"+id+"/"+action,{method:"POST"});
  const body=await r.json();
  setMessages(v=>v.map(m=>({...m,proposals:m.proposals?.map(p=>p.id===id?{...p,status:body.status||p.status}:p)})));
 }
 function submit(e:FormEvent){e.preventDefault();void ask(input);}

 return <div className="copilotLayout">
  <div className="copilotHistory">
   <button onClick={newConversation}>+ New conversation</button>
   <h3>Recent</h3>
   {(conversations||[]).map((c:any)=><button className={c.id===conversationId?"historyActive":"historyButton"} key={c.id} onClick={()=>loadConversation(c.id)}>{c.title||"Conversation"}</button>)}
  </aside>
  <section className="copilotPanel">
   <details className="card copilotContext">
    <summary>Optional record context</summary>
    <div className="formGrid">
     <label>Candidate ID<input value={context.candidateId} onChange={e=>setContext(v=>({...v,candidateId:e.target.value}))}/></label>
     <label>Job ID<input value={context.jobId} onChange={e=>setContext(v=>({...v,jobId:e.target.value}))}/></label>
     <label>Application ID<input value={context.applicationId} onChange={e=>setContext(v=>({...v,applicationId:e.target.value}))}/></label>
    </div>
   </details>
   {!messages.length&&<div className="copilotWelcome">
    <h2>Ask Raeburn Talent</h2>
    <p>Copilot searches and explains the records you already have. It shows its sources and never makes the hiring decision for you.</p>
    <div className="copilotExamples">{examples.map(x=><button key={x} className="exampleButton" onClick={()=>ask(x)}>{x}</button>)}</div>
   </div>}
   <div className="copilotMessages" aria-live="polite">
    {messages.map(m=><article key={m.id} className={"copilotMessage "+(m.role==="USER"?"copilotUser":"copilotAssistant")}>
     <strong>{m.role==="USER"?"You":"Talent Copilot"}</strong>
     <p>{m.content}</p>
     {!!m.citations?.length&&<div className="citationList"><small>Evidence</small>{m.citations.map((c,i)=><a key={c.sourceType+":"+c.sourceId+":"+i} href={c.href}><span>{c.label}</span><small>{c.sourceType}{c.field?" · "+c.field:""}</small></a>)}</div>}
     {!!m.proposals?.length&&<div className="proposalList">{m.proposals.map(p=><div className="proposalCard" key={p.id}><strong>Action preview</strong><p>{p.summary}</p><pre>{JSON.stringify(p.payload,null,2)}</pre>{p.status==="PROPOSED"?<div className="actions"><button onClick={()=>proposalAction(p.id,"confirm")}>Confirm action</button><button className="secondaryButton" onClick={()=>proposalAction(p.id,"cancel")}>Cancel</button></div>:<span className="statusBadge">{p.status}</span>}</div>)}</div>}
     {m.role==="ASSISTANT"&&m.aiStatus==="disabled"&&<small>AI provider unavailable; this response used deterministic platform data only.</small>}
    </article>)}
    {busy&&<div className="copilotMessage copilotAssistant"><strong>Talent Copilot</strong><p>Working from Raeburn Talent records…</p></div>}
   </div>
   <form className="copilotComposer" onSubmit={submit}>
    <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about candidates, vacancies, interviews, workload, sources or evidence…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(input.trim())void ask(input);}}}/>
    <button disabled={busy||!input.trim()} type="submit">Ask Copilot</button>
   </form>
  </section>
 </div>;
}