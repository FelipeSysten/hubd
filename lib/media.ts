import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { HttpError, storeBytes } from "./hf";

// Guarda de forma permanente as imagens que precisam durar (personagens).
// As saídas da Higgsfield ficam na CDN por ~7 dias; aqui elas são copiadas para:
// - Vercel Blob (BLOB_READ_WRITE_TOKEN, cota gratuita no plano Hobby), ou
// - .data/media localmente (servido por /api/media/[file]).
// No Vercel sem Blob, a URL original é mantida e marcada como temporária.

const LOCAL_DIR = path.join(process.cwd(), ".data", "media");
const MAX_BYTES = 25 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export type MediaStorage = "blob" | "local" | null;

export function mediaStorage(): MediaStorage {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (!process.env.VERCEL) return "local";
  return null;
}

/** Só copia de origens conhecidas (CDNs da Higgsfield e o próprio Blob), para não virar um proxy aberto. */
function allowedSource(url: URL): boolean {
  const h = url.hostname;
  return url.protocol === "https:" && (h.endsWith(".cloudfront.net") || h.endsWith("higgsfield.ai") || h.endsWith(".public.blob.vercel-storage.com"));
}

export async function persistImage(sourceUrl: string): Promise<{ url: string; durable: boolean }> {
  let src: URL;
  try {
    src = new URL(sourceUrl);
  } catch {
    throw new HttpError(400, "URL inválida.");
  }
  if (src.hostname.endsWith(".public.blob.vercel-storage.com")) return { url: sourceUrl, durable: true };
  if (!allowedSource(src)) throw new HttpError(400, "Origem de imagem não permitida.");

  const kind = mediaStorage();
  if (!kind) return { url: sourceUrl, durable: false };

  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new HttpError(502, `Não foi possível baixar a imagem (HTTP ${res.status}).`);
  const type = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
  const ext = EXT[type];
  if (!ext) throw new HttpError(400, "Só imagens podem ser guardadas.");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new HttpError(413, "Imagem grande demais.");
  const name = `${randomUUID()}.${ext}`;

  if (kind === "blob") {
    const blob = await put(`characters/${name}`, bytes, { access: "public", contentType: type });
    return { url: blob.url, durable: true };
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, name), bytes);
  return { url: `/api/media/${name}`, durable: true };
}

export async function readLocalMedia(file: string): Promise<{ bytes: Buffer; type: string } | null> {
  const m = file.match(/^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/);
  if (!m) return null;
  try {
    const bytes = await fs.readFile(path.join(LOCAL_DIR, file));
    const type = Object.entries(EXT).find(([, e]) => e === m[1])![0];
    return { bytes, type };
  } catch {
    return null;
  }
}

/**
 * URL que a API da Higgsfield consegue baixar. Imagens guardadas localmente (/api/media/...) não são
 * acessíveis de fora; elas são enviadas ao storage da Higgsfield na hora do uso.
 */
export async function publicUrl(url: string): Promise<string> {
  const m = url.match(/^\/api\/media\/([^/?#]+)$/);
  if (!m) return url;
  const media = await readLocalMedia(m[1]);
  if (!media) throw new HttpError(404, "Imagem do personagem não encontrada.");
  return storeBytes(new Uint8Array(media.bytes), media.type);
}
