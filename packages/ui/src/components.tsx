import type{ButtonHTMLAttributes,HTMLAttributes,ReactNode}from"react";
export function Button({children,className="",...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button className={"rb-button "+className} {...props}>{children}</button>;}
export function Card({children,className="",...props}:HTMLAttributes<HTMLDivElement>){return <div className={"rb-card "+className} {...props}>{children}</div>;}
export function Badge({children,tone="neutral"}:{children:ReactNode;tone?:"neutral"|"success"|"warning"|"danger"}){return <span className={"rb-badge rb-badge-"+tone}>{children}</span>;}
export function EmptyState({title,body,action}:{title:string;body:string;action?:ReactNode}){return <div className="rb-empty"><h3>{title}</h3><p>{body}</p>{action}</div>;}
export function PageHeader({title,description,actions}:{title:string;description?:string;actions?:ReactNode}){return <div className="rb-page-header"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{actions}</div>;}