import { errorResponse, HttpError } from "@/lib/hf";
import { isJob, MAX_JOBS } from "@/lib/jobs";
import { getJob, saveJob, storageKind } from "@/lib/store";

/** Recebe o histórico que só existia no navegador e grava o que o servidor ainda não tem. */
export async function POST(req: Request) {
  try {
    if (!storageKind()) throw new HttpError(503, "Histórico no servidor não configurado.");
    const { jobs } = await req.json();
    if (!Array.isArray(jobs)) throw new HttpError(400, "Formato inválido.");
    let imported = 0;
    for (const j of jobs.slice(0, MAX_JOBS)) {
      if (!isJob(j) || (await getJob(j.id))) continue;
      await saveJob(j);
      imported++;
    }
    return Response.json({ imported });
  } catch (err) {
    return errorResponse(err);
  }
}
