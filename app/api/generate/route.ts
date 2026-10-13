import { randomUUID } from "node:crypto";
import { ALLOWED_ENDPOINTS, isGoogleEndpoint, MODULE_LABELS, type ModuleKey } from "@/lib/models";
import { errorResponse, HttpError, hfJson, submit } from "@/lib/hf";
import { generateImage, googleCostUsd, startVideo } from "@/lib/google";
import { applyStatus, type HfStatus, type Job } from "@/lib/jobs";
import { saveJob } from "@/lib/store";

// Imagens do Google são geradas dentro desta requisição (5 a 40 s).
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { endpoint, input, meta } = await req.json();
    if (typeof endpoint !== "string" || !ALLOWED_ENDPOINTS.has(endpoint)) {
      throw new HttpError(400, "Modelo não permitido.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HttpError(400, "Parâmetros inválidos.");
    }
    const base = {
      module: (meta?.module in MODULE_LABELS ? meta.module : "explorar") as ModuleKey,
      endpoint,
      label: String(meta?.label ?? "Geração").slice(0, 200),
      prompt: typeof meta?.prompt === "string" ? meta.prompt.slice(0, 2000) : undefined,
      input,
      createdAt: Date.now(),
    };

    const job = isGoogleEndpoint(endpoint) ? await runGoogle(endpoint, input, base) : await runHiggsfield(endpoint, input, base);
    // Modelos cobrados por segundo (Genjutsu) não têm estimativa fixa: vale o cálculo feito no navegador.
    if (job.credits == null && typeof meta?.credits === "number" && meta.credits >= 0 && meta.credits < 100000) job.credits = meta.credits;

    // A geração já foi aceita (e cobrada): uma falha ao gravar o histórico não pode virar erro.
    await saveJob(job).catch((e) => console.error("Falha ao gravar histórico:", e instanceof Error ? e.message : e));

    const status: HfStatus = {
      status: job.status,
      request_id: job.id,
      images: job.images?.map((url) => ({ url })),
      video: job.video ? { url: job.video } : undefined,
      error: job.error,
    };
    return Response.json({ ...status, credits: job.credits, job });
  } catch (err) {
    return errorResponse(err);
  }
}

type Base = Omit<Job, "id" | "status" | "credits">;

async function runHiggsfield(endpoint: string, input: Record<string, unknown>, base: Base): Promise<Job> {
  // A estimativa roda em paralelo e nunca bloqueia o envio.
  const estimate = hfJson<{ type?: string; credits?: string }>(`/estimate/${endpoint}`, { method: "POST", body: JSON.stringify(input) })
    .then((e) => (e.type === "estimate" && e.credits ? Number(e.credits) : null))
    .catch(() => null);
  const result = (await submit(endpoint, input)) as unknown as HfStatus;
  return applyStatus({ ...base, id: result.request_id, status: result.status, credits: await estimate }, result);
}

async function runGoogle(endpoint: string, input: Record<string, unknown>, base: Base): Promise<Job> {
  const model = endpoint.slice("google/".length);
  const usd = googleCostUsd(model, input);
  const job: Job = { ...base, id: randomUUID(), status: "in_progress", credits: null, usd };

  if (model.startsWith("veo-")) {
    return { ...job, ref: await startVideo(model, input) };
  }
  const r = await generateImage(model, input);
  const finishedAt = Date.now();
  if (r.ok) return { ...job, status: "completed", images: [r.url], finishedAt };
  return { ...job, status: r.status, error: r.error, usd: null, finishedAt };
}
