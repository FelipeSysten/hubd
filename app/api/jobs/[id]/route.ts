import { errorResponse, HttpError, isUuid } from "@/lib/hf";
import { deleteJob, getJob, saveJob } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

/** Atualiza campos do usuário (por enquanto, favorito). */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(400, "ID inválido.");
    const { favorite } = await req.json();
    const job = await getJob(id);
    if (!job) throw new HttpError(404, "Geração não encontrada no histórico.");
    await saveJob({ ...job, favorite: !!favorite });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(400, "ID inválido.");
    await deleteJob(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
