import type{DomainEvent}from"@raeburn/events";import{consumeDurable,minimiseEventPayload,pool}from"@raeburn/service-kit";
await consumeDurable(">", "analytics-facts", async(e:DomainEvent)=>{
 await pool.query("insert into fact_events(event_id,tenant_id,event_type,occurred_at,payload) values($1,$2,$3,$4,$5::jsonb) on conflict do nothing",[e.eventId,e.tenantId,e.eventType,e.occurredAt,JSON.stringify(minimiseEventPayload(e.payload))]);
});