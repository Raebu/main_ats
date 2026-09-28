import{describe,expect,it}from"vitest";
import{minimiseEventPayload,redact}from"./index";

describe("stage 9 data minimisation",()=>{
  it("removes direct candidate PII from event payloads",()=>{
    expect(minimiseEventPayload({id:"c1",candidateId:"c1",email:"person@example.com",name:"Person",telephone:"1",address:"x"})).toEqual({id:"c1",candidateId:"c1"});
  });
  it("redacts sensitive structured log fields recursively",()=>{
    const out=redact({candidateId:"c1",email:"person@example.com",nested:{token:"secret",status:"ok"}});
    expect(out).toEqual({candidateId:"c1",email:"[REDACTED]",nested:{token:"[REDACTED]",status:"ok"}});
  });
});
