import { errorResponse, HttpError, hfJson, isUuid, type HfResponse } from "@/lib/hf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(400, "ID inválido.");
    return Response.json(await hfJson<HfResponse>(`/requests/${id}/status`));
  } catch (err) {
    return errorResponse(err);
  }
}
