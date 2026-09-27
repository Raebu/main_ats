import { put } from "@vercel/blob";

export async function storeCandidateFile(file: File, candidateId: string) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `candidates/${candidateId}/${Date.now()}-${safeName}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(path, file, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false
    });
    return blob.url;
  }

  // Development fallback: retain metadata without pretending the file is public.
  return `pending://${path}`;
}
