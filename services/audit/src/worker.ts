import type{DomainEvent}from"@raeburn/events";import{consumeDurable,pool,redact}from"@raeburn/service-kit";
await consumeDurable(">", "audit-all-events", async(e:DomainEvent)=>{
 const p:any=e.payload&&typeof e.payload==="object"?e.payload:{value:e.payload};
 const safe=redact(p as Record<string,unknown>);
 await pool.query("insert into audit_events(id,tenant_id,event_type,actor,resource_type,resource_id,correlation_id,causation_id,producer,event_version,payload,occurred_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) on conflict do nothing",[e.eventId,e.tenantId,e.eventType,(p as any).actor||null,(p as any).resourceType||null,(p as any).id||(p as any).applicationId||(p as any).jobId||null,e.correlationId,e.causationId||null,e.producer,e.eventVersion,JSON.stringify(safe),e.occurredAt]);
});