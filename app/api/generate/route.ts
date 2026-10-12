import { ALLOWED_ENDPOINTS, MODULE_LABELS, type ModuleKey } from "@/lib/models";
import { errorResponse, HttpError, hfJson, submit } from "@/lib/hf";
import { applyStatus, type HfStatus, type Job } from "@/lib/jobs";
import { saveJob } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const { endpoint, input, meta } = await req.json();
    if (typeof endpoint !== "string" || !ALLOWED_ENDPOINTS.has(endpoint)) {
      throw new HttpError(400, "Modelo não permitido.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HttpError(400, "Parâmetros inválidos.");
    }
    const module: ModuleKey = meta?.module in MODULE_LABELS ? meta.module : "explorar";

    // A estimativa roda em paralelo e nunca bloqueia o envio.
    const estimate = hfJson<{ type?: string; credits?: string }>(`/estimate/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(input),
    })
      .then((e) => (e.type === "estimate" && e.credits ? Number(e.credits) : null))
      .catch(() => null);

    const result = (await submit(endpoint, input)) as unknown as HfStatus;
    const credits = await estimate;

    const job = applyStatus(
      {
        id: result.request_id,
        module,
        endpoint,
        label: String(meta?.label ?? "Geração").slice(0, 200),
        prompt: typeof meta?.prompt === "string" ? meta.prompt.slice(0, 2000) : undefined,
        input,
        status: result.status,
        credits,
        createdAt: Date.now(),
      } satisfies Job,
      result,
    );
    // A geração já foi aceita (e cobrada): uma falha ao gravar o histórico não pode virar erro.
    await saveJob(job).catch((e) => console.error("Falha ao gravar histórico:", e instanceof Error ? e.message : e));

    return Response.json({ ...result, credits, job });
  } catch (err) {
    return errorResponse(err);
  }
}
