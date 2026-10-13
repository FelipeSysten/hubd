import "server-only";
import { GoogleGenAI } from "@google/genai";
import { HttpError, storeBytes } from "./hf";

// Integração com a Gemini API (Google AI Studio). Chave em GEMINI_API_KEY, só no servidor.
// Docs: https://ai.google.dev/gemini-api/docs (texto e Nano Banana via Interactions API; Veo via REST).

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const TEXT_MODEL = "gemini-3.8-flash";

export function googleConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, "GEMINI_API_KEY não configurada no servidor.");
  return key;
}

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: apiKey() });
  return client;
}

/** O SDK guarda a mensagem real da API em `body` (JSON, às vezes dentro de um array). */
function bodyMessage(e: unknown): string | null {
  const body = (e as { body?: unknown })?.body;
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body);
    const err = (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
    return typeof err?.message === "string" ? err.message : null;
  } catch {
    return null;
  }
}

/** Converte erros da Gemini API em mensagens em português, sem expor a chave. */
function googleError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  const raw = bodyMessage(e) ?? (e instanceof Error ? e.message : String(e));
  const status = Number((e as { status?: number })?.status) || Number(raw.match(/\b(4\d\d|5\d\d)\b/)?.[1]) || 502;
  if (status === 400 && /API key/i.test(raw)) return new HttpError(401, "Chave do Google inválida.");
  if (status === 401 || status === 403) return new HttpError(status, "Chave do Google inválida ou sem permissão para este modelo.");
  if (status === 429) return new HttpError(429, "Limite de uso do Google atingido (cota ou créditos). Tente mais tarde ou verifique o faturamento no AI Studio.");
  return new HttpError(status >= 400 && status < 600 ? status : 502, `Google: ${raw.replace(/key=[\w-]+/g, "key=***").slice(0, 300)}`);
}

// ---------- Texto ----------

type Interaction = {
  status?: string;
  output_text?: string;
  output_image?: { data?: string; mime_type?: string };
};

export async function generateText(input: string, opts: { system?: string; schema?: object } = {}): Promise<string> {
  try {
    const res = (await ai().interactions.create({
      model: TEXT_MODEL,
      input,
      ...(opts.system ? { system_instruction: opts.system } : {}),
      ...(opts.schema ? { response_format: { type: "text", mime_type: "application/json", schema: opts.schema } } : {}),
    } as never)) as Interaction;
    const text = res.output_text?.trim();
    if (!text) throw new HttpError(502, "O Gemini não retornou texto.");
    return text;
  } catch (e) {
    throw e instanceof HttpError ? e : googleError(e);
  }
}

// ---------- Imagem (Nano Banana) ----------

async function fetchAsBase64(url: string): Promise<{ data: string; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(400, `Não foi possível ler a imagem de referência (HTTP ${res.status}).`);
  const mime = res.headers.get("content-type")?.split(";")[0] || "image/png";
  return { data: Buffer.from(await res.arrayBuffer()).toString("base64"), mime };
}

export type ImageResult = { ok: true; url: string } | { ok: false; status: "nsfw" | "failed"; error: string };

/** Gera (ou edita, com referências) uma imagem e guarda no storage. Síncrono: leva de 5 a 40 s. */
export async function generateImage(model: string, input: Record<string, unknown>): Promise<ImageResult> {
  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) throw new HttpError(400, "prompt: obrigatório.");
  const refs = Array.isArray(input.image_urls) ? (input.image_urls as string[]).slice(0, 14) : [];

  const content = refs.length
    ? [{ type: "text", text: prompt }, ...(await Promise.all(refs.map(fetchAsBase64))).map((r) => ({ type: "image", mime_type: r.mime, data: r.data }))]
    : prompt;

  let res: Interaction;
  try {
    res = (await ai().interactions.create({
      model,
      input: content,
      response_format: {
        type: "image",
        mime_type: "image/png",
        ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
        ...(input.image_size ? { image_size: input.image_size } : {}),
      },
    } as never)) as Interaction;
  } catch (e) {
    const err = googleError(e);
    // Bloqueio de conteúdo vira resultado "nsfw" no histórico, não erro de rede.
    if (/safety|blocked|prohibited|policy/i.test(err.message)) return { ok: false, status: "nsfw", error: err.message };
    throw err;
  }

  const img = res.output_image;
  if (!img?.data) {
    const why = res.output_text?.slice(0, 200) || `status ${res.status ?? "desconhecido"}`;
    return { ok: false, status: /safety|block|cannot|can't|unable/i.test(why) ? "nsfw" : "failed", error: `O Google não retornou imagem (${why}).` };
  }
  const mime = img.mime_type || "image/png";
  const url = await storeBytes(Buffer.from(img.data, "base64"), mime === "image/jpg" ? "image/jpeg" : mime);
  return { ok: true, url };
}

// ---------- Vídeo (Veo, operação longa) ----------

/** Inicia a geração no Veo e devolve o nome da operação. */
export async function startVideo(model: string, input: Record<string, unknown>): Promise<string> {
  const instance: Record<string, unknown> = { prompt: String(input.prompt ?? "").trim() };
  if (!instance.prompt && !input.image_url) throw new HttpError(400, "prompt: obrigatório sem frame inicial.");
  if (input.image_url) {
    const img = await fetchAsBase64(String(input.image_url));
    instance.image = { inlineData: { mimeType: img.mime, data: img.data } };
    if (input.end_image_url) {
      const last = await fetchAsBase64(String(input.end_image_url));
      instance.lastFrame = { inlineData: { mimeType: last.mime, data: last.data } };
    }
  }
  const parameters: Record<string, unknown> = {
    aspectRatio: input.aspect_ratio ?? "16:9",
    resolution: input.resolution ?? "720p",
    durationSeconds: Number(input.duration ?? 8),
  };

  const res = await fetch(`${BASE}/models/${model}:predictLongRunning`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [instance], parameters }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.name) throw googleError(Object.assign(new Error(data?.error?.message ?? `HTTP ${res.status}`), { status: res.status }));
  return data.name as string;
}

export type VideoCheck =
  | { done: false }
  | { done: true; ok: true; url: string }
  | { done: true; ok: false; status: "nsfw" | "failed"; error: string };

/** Consulta a operação; quando termina, baixa o vídeo (o Google apaga em 2 dias) e guarda no storage. */
export async function checkVideo(operationName: string): Promise<VideoCheck> {
  if (!/^models\/[\w.-]+\/operations\/[\w-]+$/.test(operationName)) throw new HttpError(400, "Operação inválida.");
  const res = await fetch(`${BASE}/${operationName}`, { headers: { "x-goog-api-key": apiKey() }, cache: "no-store" });
  const op = await res.json().catch(() => ({}));
  if (!res.ok) throw googleError(Object.assign(new Error(op?.error?.message ?? `HTTP ${res.status}`), { status: res.status }));
  if (!op.done) return { done: false };
  if (op.error) return { done: true, ok: false, status: "failed", error: String(op.error.message ?? "Falha no Veo.") };

  const out = op.response?.generateVideoResponse;
  const uri: string | undefined = out?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reasons: string[] = out?.raiMediaFilteredReasons ?? [];
    return { done: true, ok: false, status: reasons.length ? "nsfw" : "failed", error: reasons.join(" ") || "O Veo não retornou vídeo." };
  }

  const file = await fetch(uri, { headers: { "x-goog-api-key": apiKey() }, redirect: "follow" });
  if (!file.ok) throw new HttpError(502, `Não foi possível baixar o vídeo do Google (HTTP ${file.status}).`);
  const url = await storeBytes(new Uint8Array(await file.arrayBuffer()), "video/mp4");
  return { done: true, ok: true, url };
}

// ---------- Custo (tabela oficial: ai.google.dev/gemini-api/docs/pricing, out/2026) ----------

const IMAGE_USD: Record<string, Record<string, number>> = {
  "gemini-nano-banana-2.1": { "1K": 0.0336, "2K": 0.0504, "4K": 0.113 },
  "gemini-3.1-flash-lite-image": { "1K": 0.0336 },
  "gemini-3-pro-image": { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
};
const VEO_USD_PER_SECOND: Record<string, Record<string, number>> = {
  "veo-3.1-generate-preview": { "720p": 0.4, "1080p": 0.4, "4k": 0.6 },
  "veo-3.1-fast-generate-preview": { "720p": 0.1, "1080p": 0.12, "4k": 0.3 },
  "veo-3.1-lite-generate-preview": { "720p": 0.05, "1080p": 0.08 },
};

/** Custo em USD pela tabela pública (cobrado na conta Google, não em créditos Higgsfield). */
export function googleCostUsd(model: string, input: Record<string, unknown>): number | null {
  if (IMAGE_USD[model]) return IMAGE_USD[model][String(input.image_size ?? "1K")] ?? null;
  const veo = VEO_USD_PER_SECOND[model];
  if (veo) {
    const rate = veo[String(input.resolution ?? "720p")];
    return rate != null ? rate * Number(input.duration ?? 8) : null;
  }
  return null;
}
