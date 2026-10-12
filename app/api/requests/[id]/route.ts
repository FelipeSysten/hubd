import { errorResponse, HttpError, hfJson, isUuid } from "@/lib/hf";
import { applyStatus, type HfStatus } from "@/lib/jobs";
import { getJob, saveJob } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(400, "ID inválido.");
    const status = await hfJson<HfStatus>(`/requests/${id}/status`);

    // Mantém o histórico do servidor em dia (status final, URLs dos resultados).
    try {
      const job = await getJob(id);
      if (job && (job.status !== status.status || (!job.video && status.video) || (!job.images?.length && status.images?.length))) {
        await saveJob(applyStatus(job, status));
      }
    } catch (e) {
      console.error("Falha ao atualizar histórico:", e instanceof Error ? e.message : e);
    }

    return Response.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
