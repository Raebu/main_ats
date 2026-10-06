import { describe, expect, it } from "vitest";
import { serviceDatabaseUrl } from "./database-url.mjs";

describe("serviceDatabaseUrl", () => {
  it("inserts the service database path before query parameters", () => {
    expect(
      serviceDatabaseUrl(
        "postgresql://talent_runtime:secret@db.example:25060?sslmode=require",
        "jobs",
      ),
    ).toBe("postgresql://talent_runtime:secret@db.example:25060/jobs?sslmode=require");
  });

  it("normalises hyphenated service names to provisioned database names", () => {
    expect(
      serviceDatabaseUrl(
        "postgresql://talent_runtime:secret@db.example:25060/defaultdb?sslmode=require",
        "talent-pools",
      ),
    ).toBe("postgresql://talent_runtime:secret@db.example:25060/talent_pools?sslmode=require");
  });
});
