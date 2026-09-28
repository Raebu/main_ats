import{describe,expect,it}from"vitest";import{render,toPdf,toXlsx}from"./reporting";
describe("analytics report formats",()=>{const rows=[{metric:"applications",value:12},{metric:"hires",value:2}];
 it("builds an XLSX zip archive",()=>{const b=toXlsx(rows);expect(b.subarray(0,2).toString()).toBe("PK");expect(b.length).toBeGreaterThan(200);});
 it("builds a PDF document",()=>{const b=toPdf(rows);expect(b.subarray(0,5).toString()).toBe("%PDF-");expect(b.toString().includes("applications")).toBe(true);});
 it("renders CSV and JSON",()=>{expect(render(rows,"csv").data.toString()).toContain("applications");expect(JSON.parse(render(rows,"json").data.toString())).toHaveLength(2);});
});