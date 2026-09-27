export async function storeCandidateFile(file: File, candidateId: string) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `candidates/${candidateId}/${Date.now()}-${safeName}`;
  // Transitional root app: do not create public CV URLs.
  // Private candidate files are owned by the Document Service and uploaded via scoped signed R2 URLs.
  return `pending://${path}`;
}
