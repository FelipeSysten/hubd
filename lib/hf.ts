import "server-only";
import { createHiggsfieldClient, APIError, HiggsfieldError } from "@higgsfield/client/v2";

export const HF_BASE_URL = "https://api.higgsfield.ai";

function credentials(): string {
  const c = process.env.HF_CREDENTIALS;
  if (!c) throw new HttpError(500, "HF_CREDENTIALS não configurado no servidor.");
  return c;
}

// Sem retries automáticos no envio: repetir um POST pode criar uma geração cobrada em dobro.
let client: ReturnType<typeof createHiggsfieldClient> | null = null;
function sdk() {
  client ??= createHiggsfieldClient({ credentials: credentials(), maxRetries: 0 });
  return client;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type HfResponse = {
  status: string;
  request_id: string;
  images?: { url: string }[];
  video?: { url: string };
  audio?: { url: string };
  error?: string;
};

/** Envia a geração e retorna imediatamente (sem polling: funções do Vercel têm tempo limite). */
export async function submit(endpoint: string, input: Record<string, unknown>): Promise<HfResponse> {
  return (await sdk().subscribe(endpoint, { input, withPolling: false })) as unknown as HfResponse;
}

/** Chamada REST direta para rotas que o SDK TypeScript não expõe (status, cancel, estimate, upload). */
export async function hfFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${HF_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Key ${credentials()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
}

export async function hfJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await hfFetch(path, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new HttpError(res.status, detailMessage(res.status, data?.detail));
  return data as T;
}

function detailMessage(status: number, detail: unknown): string {
  if (status === 401) return "Credenciais Higgsfield inválidas.";
  if (status === 403) return "Créditos Higgsfield insuficientes.";
  if (Array.isArray(detail)) {
    return detail.map((d) => `${(d.loc ?? []).slice(1).join(".") || "input"}: ${d.msg}`).join("; ");
  }
  return typeof detail === "string" ? detail : `Erro da API Higgsfield (HTTP ${status}).`;
}

/** Converte qualquer erro em resposta JSON sem vazar credenciais. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof APIError) {
    const status = err.statusCode ?? 502;
    const detail = (err as APIError & { details?: unknown }).details ?? err.responseData?.detail;
    return Response.json({ error: detailMessage(status, detail ?? err.message) }, { status });
  }
  if (err instanceof HiggsfieldError) return Response.json({ error: err.message }, { status: 502 });
  console.error(err instanceof Error ? err.message : err);
  return Response.json({ error: "Erro inesperado no servidor." }, { status: 500 });
}

export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
