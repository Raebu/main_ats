import{api}from"../../lib/api";
import TalentSearchWorkspace from"../../components/TalentSearchWorkspace";

export default async function Page(){
 const saved=await api("/v1/search/saved")||[];
 return <><div className="pageHeader"><div><h1>Talent search & rediscovery</h1><p>Search across candidates and roles using Boolean logic, structured facets, ontology expansion and explainable similarity.</p></div></div><TalentSearchWorkspace initialSaved={saved}/></>;
}
