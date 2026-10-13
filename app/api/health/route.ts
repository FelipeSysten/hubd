import { ENDPOINTS } from "@/lib/models";
import { hfFetch } from "@/lib/hf";
import { listJobs, storageKind } from "@/lib/store";
import { googleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

type Check = { name: string; usage: string; ok: boolean; ms: number | null; detail?: string };

async function timed(name: string, usage: string, run: () => Promise<Response>, okWhen: (s: number) => boolean): Promise<Check> {
  const t = Date.now();
  try {
    const res = await run();
    const ok = okWhen(res.status);
    return { name, usage, ok, ms: Date.now() - t, detail: ok ? undefined : `HTTP ${res.status}` };
  } catch {
    return { name, usage, ok: false, ms: null, detail: "sem resposta" };
  }
}

// Verificações sem custo: status de um ID inexistente (valida autenticação) e estimativas de preço por modelo.
const estimate = (endpoint: string, input: object) => () =>
  hfFetch(`/estimate/${endpoint}`, { method: "POST", body: JSON.stringify(input) });

export async function GET() {
  if (!process.env.HF_CREDENTIALS) {
    return Response.json({ configured: false, checks: [] });
  }
  const checks = await Promise.all([
    historyCheck(),
    googleCheck(),
    timed("Higgsfield API", "Autenticação e fila", () => hfFetch("/requests/00000000-0000-4000-8000-000000000000/status"), (s) => s === 404),
    timed("Seedance 2.5", "Vídeo, Frame Flow, Avatar", estimate(ENDPOINTS.seedanceT2V, { prompt: "x" }), (s) => s === 200),
    timed("Kling 3.0", "Vídeo", estimate(ENDPOINTS.klingT2V, { prompt: "x" }), (s) => s === 200),
    timed("Higgsfield Soul", "Imagem, Canvas, Avatar", estimate(ENDPOINTS.soulStandard, { prompt: "x" }), (s) => s === 200),
    timed("Genjutsu", "Efeitos de vídeo", () => hfFetch("/models/higgsfield/genjutsu/restyle/v1.0/presets"), (s) => s === 200),
    timed(
      "Armazenamento",
      "Upload de mídias",
      () => hfFetch("/files/generate-upload-url", { method: "POST", body: JSON.stringify({ content_type: "image/png" }) }),
      (s) => s === 200,
    ),
  ]);
  return Response.json({ configured: true, checks });
}

async function historyCheck(): Promise<Check> {
  const kind = storageKind();
  const name = "Histórico";
  if (!kind) return { name, usage: "Não configurado: conecte um Postgres (Neon) no Vercel", ok: false, ms: null, detail: "só no navegador" };
  const usage = kind === "postgres" ? "Postgres" : "Arquivo local (.data/)";
  const t = Date.now();
  try {
    await listJobs();
    return { name, usage, ok: true, ms: Date.now() - t };
  } catch (e) {
    return { name, usage, ok: false, ms: null, detail: e instanceof Error ? e.message.slice(0, 80) : "erro" };
  }
}

// Lista de modelos: valida a chave do Google sem custo.
async function googleCheck(): Promise<Check> {
  const name = "Google Gemini";
  const usage = "Melhorar com IA, agente do Canvas, Nano Banana, Veo";
  if (!googleConfigured()) return { name, usage, ok: false, ms: null, detail: "GEMINI_API_KEY não configurada" };
  return timed(
    name,
    usage,
    () => fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! }, cache: "no-store" }),
    (s) => s === 200,
  );
}
