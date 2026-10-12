"use client";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Erro HTTP ${res.status}`);
  return data as T;
}

export const post = <T,>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });

const MIME_FIX: Record<string, string> = { "audio/wave": "audio/wav", "audio/vnd.wave": "audio/wav" };

/** Envia um arquivo para o storage Higgsfield e retorna a URL pública para usar como input. */
export async function uploadFile(file: File): Promise<string> {
  const contentType = MIME_FIX[file.type] ?? file.type;
  const { upload_url, public_url, upload_headers } = await post<{
    upload_url: string;
    public_url: string;
    upload_headers: Record<string, string>;
  }>("/api/upload", { content_type: contentType });

  const res = await fetch(upload_url, { method: "PUT", headers: upload_headers, body: file });
  if (!res.ok) throw new Error(`Falha no upload (HTTP ${res.status}).`);
  return public_url;
}

export function formatCredits(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleDateString("pt-BR");
}

export function downloadUrl(url: string, name: string) {
  // As URLs da CDN são de outra origem: abrir em nova aba é o caminho confiável para salvar.
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
}

export function readQuery(): URLSearchParams {
  return typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
}
