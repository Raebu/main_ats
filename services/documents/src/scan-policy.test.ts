import{describe,expect,it}from"vitest";
import{initialScanPolicy,statusForScanResult}from"./scan-policy";

describe("document malware scan policy",()=>{
  it("fails closed when no scanner is configured",()=>{
    expect(initialScanPolicy({developmentBypass:false,scannerConfigured:false})).toEqual({
      clean:false,reason:"scanner_not_configured",pending:true
    });
  });

  it("allows explicit development bypass only when requested",()=>{
    expect(initialScanPolicy({developmentBypass:true,scannerConfigured:false})).toEqual({
      clean:true,reason:"development_bypass",pending:false
    });
  });

  it("quarantines a negative scanner result",()=>{
    expect(statusForScanResult(false)).toBe("QUARANTINED");
  });

  it("processes only a clean scanner result",()=>{
    expect(statusForScanResult(true)).toBe("PROCESSED");
  });
});
