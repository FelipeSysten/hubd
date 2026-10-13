import { errorResponse, HttpError, hfJson, isUuid } from "@/lib/hf";
import { checkVideo } from "@/lib/google";
import { applyStatus, type HfStatus } from "@/lib/jobs";
import { TERMINAL } from "@/lib/models";
import { getJob, saveJob } from "@/lib/store";

// Ao terminar, o vídeo do Veo é baixado e copiado para o storage dentro desta requisição.
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(400, "ID inválido.");
    const job = await getJob(id).catch(() => null);
    // `ref` vem do navegador quando o histórico não está no servidor.
    const ref = job?.ref ?? new URL(req.url).searchParams.get("ref");

    // Veo já finalizado e gravado: não consulta (nem copia o vídeo) de novo.
    if (job?.ref && TERMINAL.includes(job.status)) {
      return Response.json({
        status: job.status,
        request_id: id,
        video: job.video ? { url: job.video } : undefined,
        error: job.error,
      } satisfies HfStatus);
    }

    let status: HfStatus;
    if (ref) {
      const r = await checkVideo(ref);
      status = !r.done
        ? { status: "in_progress", request_id: id }
        : r.ok
          ? { status: "completed", request_id: id, video: { url: r.url } }
          : { status: r.status, request_id: id, error: r.error };
    } else {
      status = await hfJson<HfStatus>(`/requests/${id}/status`);
    }

    // Mantém o histórico do servidor em dia (status final, URLs dos resultados).
    try {
      if (job && (job.status !== status.status || (!job.video && status.video) || (!job.images?.length && status.images?.length))) {
        const next = applyStatus(job, status);
        await saveJob(ref && status.status !== "completed" && status.status !== "in_progress" ? { ...next, usd: null } : next);
      }
    } catch (e) {
      console.error("Falha ao atualizar histórico:", e instanceof Error ? e.message : e);
    }

    return Response.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
