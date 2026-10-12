import { errorResponse, HttpError, hfFetch, isUuid } from "@/lib/hf";
import { getJob, saveJob } from "@/lib/store";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(400, "ID inválido.");
    const res = await hfFetch(`/requests/${id}/cancel`, { method: "POST" });
    if (res.status === 400) throw new HttpError(400, "A geração já começou e não pode mais ser cancelada.");
    if (res.status !== 202) throw new HttpError(res.status, `Não foi possível cancelar (HTTP ${res.status}).`);

    const job = await getJob(id).catch(() => null);
    if (job) await saveJob({ ...job, status: "canceled", finishedAt: Date.now() }).catch(() => {});
    return Response.json({ canceled: true });
  } catch (err) {
    return errorResponse(err);
  }
}
