import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roles = [
  ["RG-2026-001","founding-commercial-business-development-lead","Founding Commercial / Business Development Lead","Commercial","Raeburn Group"],
  ["RG-2026-002","founding-engineer-technical-lead","Founding Engineer / Technical Lead","Engineering","Raeburn Automation Labs"],
  ["RG-2026-003","bid-funding-partnerships-lead","Bid, Funding & Partnerships Lead","Partnerships","Raeburn Group"],
  ["RG-2026-004","brand-communications-growth-lead","Brand, Communications & Growth Lead","Growth","Raeburn Group"],
  ["RG-2026-005","founding-product-ux-designer","Founding Product / UX Designer","Product","Raeburn Ventures / Automation Labs"],
  ["RG-2026-006","finance-commercial-operations-lead","Finance & Commercial Operations Lead","Finance","Raeburn Group"],
  ["RG-2026-007","compliance-risk-lead","Compliance / Risk Lead","Compliance","GIBP / Fintech"],
  ["RG-2026-008","enterprise-account-executive","Enterprise Account Executive","Commercial","Raeburn Group"]
] as const;

for (const [reference, slug, title, department, operatingHome] of roles) {
  await prisma.job.upsert({
    where: { reference },
    update: {},
    create: {
      reference,
      slug,
      title,
      department,
      operatingHome,
      location: "United Kingdom / Hybrid / Flexible",
      workplaceType: "Hybrid / Flexible",
      engagement: title.startsWith("Founding") ? "Founding opportunity" : "Flexible engagement",
      summary: `Help build and scale The Raeburn Group in the role of ${title}.`,
      description: `This is an initial vacancy record for ${title}. Replace this seeded summary in the ATS with the approved full job description before publishing.`,
      requirements: "Role-specific requirements to be completed in the ATS before publication.",
      benefits: "Flexible working and the opportunity to help shape a growing group of businesses.",
      audiences: ["mainstream","disability-confident","women","forces-veterans","founders"],
      status: "DRAFT"
    }
  });
}

await prisma.$disconnect();
