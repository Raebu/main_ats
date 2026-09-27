import TalentCopilot from"../../components/TalentCopilot";
import{api}from"../../lib/api";

export default async function Page(){
 const conversations=await api("/v1/intelligence/copilot/conversations")||[];
 return <>
  <div className="pageHeader">
   <div>
    <h1>Talent Copilot</h1>
    <p>Grounded recruitment assistance with source citations and confirmation before actions.</p>
   </div>
   <a className="button" href="/intelligence">AI governance</a>
  </div>
  <div className="notice"><strong>Advisory only.</strong> Copilot cannot hire, reject or invisibly rank candidates. Suggested actions are previews until you explicitly confirm them.</div>
  <TalentCopilot initialConversations={conversations}/>
 </>;
}