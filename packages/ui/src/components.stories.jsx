import React,{useState}from"react";
import{Badge,BarChart,Button,Card,DataTable,Drawer,EmptyState,FormField,Input,Modal,PageHeader,Toast}from"./components";

export default{title:"Foundations/Raeburn UI"};

export const Controls=()=> <Card><PageHeader title="Platform controls" description="Shared accessible primitives"/><div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}><Button>Primary action</Button><Badge>Neutral</Badge><Badge tone="success">Success</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Danger</Badge></div></Card>;

export const Forms=()=> <Card><FormField label="Candidate email" hint="Used for recruitment communications"><Input type="email" placeholder="candidate@example.com"/></FormField><br/><FormField label="Required field" error="This field is required"><Input aria-invalid="true"/></FormField></Card>;

export const Table=()=> <DataTable><thead><tr><th>Candidate</th><th>Stage</th><th>Status</th></tr></thead><tbody><tr><td>Example candidate</td><td>Interview</td><td><Badge tone="success">Active</Badge></td></tr><tr><td>Second candidate</td><td>Review</td><td><Badge>Pending</Badge></td></tr></tbody></DataTable>;

export const DrawerExample=()=>{const[open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>Open drawer</Button><Drawer open={open} title="Candidate details" onClose={()=>setOpen(false)}><p>Drawer content preserves a clear dialog boundary.</p></Drawer></>};

export const ModalExample=()=>{const[open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>Open modal</Button><Modal open={open} title="Confirm change" onClose={()=>setOpen(false)} footer={<Button onClick={()=>setOpen(false)}>Confirm</Button>}><p>Use modals for bounded decisions, not long workflows.</p></Modal></>};

export const Notifications=()=> <div style={{display:"grid",gap:10}}><Toast>Informational update</Toast><Toast tone="success">Configuration saved</Toast><Toast tone="warning">Review required</Toast><Toast tone="danger">Operation failed</Toast></div>;

export const Empty=()=> <EmptyState title="No scheduled reports" body="Create a schedule to deliver reports automatically." action={<Button>Create schedule</Button>}/>;

export const Chart=()=> <BarChart label="Applications by source" data={[{label:"Direct",value:42},{label:"LinkedIn",value:28},{label:"Referral",value:19}]}/>;
