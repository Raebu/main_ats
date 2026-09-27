import { db } from "@/lib/db";

export const gatewayCopy: Record<string, { title: string; intro: string; bullets: string[] }> = {
  mainstream: {
    title: "Build what matters.",
    intro: "Join The Raeburn Group and help build businesses, platforms and capabilities designed for lasting impact.",
    bullets: ["Flexible working", "Meaningful ownership", "Cross-group opportunity"]
  },
  "disability-confident": {
    title: "Disability Confident careers",
    intro: "We want disabled applicants and people with long-term health conditions to be able to participate fully in our recruitment process.",
    bullets: ["Reasonable adjustments", "Alternative formats", "Accessible recruitment"]
  },
  women: {
    title: "Women at Raeburn",
    intro: "We want women to have clear routes into leadership, commercial, technical and founding roles across the group.",
    bullets: ["Flexible working", "Progression", "Leadership opportunities"]
  },
  "forces-veterans": {
    title: "Forces & Veterans",
    intro: "We welcome service leavers, veterans, reservists and military families, and value transferable operational and leadership experience.",
    bullets: ["Transferable skills", "Flexible transitions", "Commercial pathways"]
  },
  founders: {
    title: "Founding opportunities",
    intro: "Take responsibility early, shape the operating model and build with a group designed to launch and scale ambitious ventures.",
    bullets: ["Early responsibility", "Build from zero", "Group-wide exposure"]
  }
};

export async function publishedJobs(audience?: string) {
  return db.job.findMany({
    where: {
      status: "PUBLISHED",
      ...(audience && audience !== "mainstream" ? { audiences: { has: audience } } : {})
    },
    orderBy: [{ datePosted: "desc" }, { createdAt: "desc" }]
  });
}

export async function jobBySlug(slug: string) {
  return db.job.findUnique({ where: { slug }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
}
