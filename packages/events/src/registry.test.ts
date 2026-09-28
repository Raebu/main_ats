import{describe,expect,it}from"vitest";import{createEvent,EventSchemaRegistry,Events,PlatformEvents,validateDomainEvent}from"./index";
describe("event schema registry",()=>{
 it("registers every declared domain event",()=>{for(const type of Object.values(Events))expect(EventSchemaRegistry[type],type).toBeDefined();});
 it("keeps event type and envelope versions compatible",()=>{const event=createEvent({eventType:Events.jobPublished,eventVersion:1,producer:"test",correlationId:"corr",tenantId:"tenant",payload:{id:"job"}});expect(validateDomainEvent(event).eventType).toBe(Events.jobPublished);});
 it("rejects mismatched versions",()=>{expect(()=>validateDomainEvent({...createEvent({eventType:Events.jobPublished,eventVersion:1,producer:"test",correlationId:"corr",tenantId:"tenant",payload:{id:"job"}}),eventVersion:2})).toThrow(/version mismatch/);});
 it("registers platform dead letters",()=>expect(EventSchemaRegistry[PlatformEvents.deadLetter]).toBeDefined());
});
