import "server-only";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { HttpError, storeBytes } from "./hf";

// Baixa o vídeo de um link público do TikTok ou do Instagram com yt-dlp e guarda no storage da Higgsfield.
// Requer o yt-dlp instalado no servidor (YTDLP_PATH, padrão: "yt-dlp"). Não roda na Vercel (sem binário).
// Instagram costuma pedir login: exporte os cookies do navegador para um cookies.txt e aponte YTDLP_COOKIES.

const run = promisify(execFile);
const YTDLP = process.env.YTDLP_PATH || "yt-dlp";
const MAX_BYTES = 200 * 1024 * 1024;
const HOSTS = ["tiktok.com", "instagram.com", "instagr.am"];

export function allowedLink(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "Link inválido.");
  }
  const host = url.hostname.toLowerCase();
  const ok = HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  if (url.protocol !== "https:" || !ok) throw new HttpError(400, "Use um link do TikTok ou do Instagram.");
  return url;
}

async function ytdlp(args: string[]): Promise<string> {
  const cookies = process.env.YTDLP_COOKIES;
  const full = ["--no-playlist", "--no-warnings", "--no-progress", ...(cookies ? ["--cookies", cookies] : []), ...args];
  try {
    const { stdout } = await run(YTDLP, full, { timeout: 240_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    return stdout;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") throw new HttpError(501, "yt-dlp não está instalado no servidor (defina YTDLP_PATH).");
    const line = (err.stderr ?? "").split("\n").filter((l) => l.includes("ERROR")).pop() ?? "";
    const reason = line.replace(/^.*ERROR:\s*/, "").slice(0, 300);
    throw new HttpError(422, reason ? `Não foi possível baixar este link: ${reason}` : "Não foi possível baixar este link.");
  }
}

export type LinkPreview = {
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  seconds: number;
  width: number;
  height: number;
};

/** Metadados do link (título, miniatura, duração) sem baixar o vídeo. */
export async function previewLink(raw: string): Promise<LinkPreview> {
  const link = allowedLink(raw).toString();
  let info: Record<string, unknown>;
  try {
    info = JSON.parse(await ytdlp(["--skip-download", "--dump-single-json", link]));
  } catch {
    throw new HttpError(422, "Não foi possível ler este link. Confira se o vídeo é público.");
  }
  return {
    title: String(info.title ?? "Vídeo sem título").slice(0, 200),
    uploader: typeof info.uploader === "string" ? info.uploader : typeof info.channel === "string" ? info.channel : null,
    thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : null,
    seconds: Number(info.duration) || 0,
    width: Number(info.width) || 0,
    height: Number(info.height) || 0,
  };
}

export type ImportedVideo = { url: string; seconds: number; width: number; height: number };

export async function importVideo(raw: string): Promise<ImportedVideo> {
  const link = allowedLink(raw).toString();

  // Metadados antes do download: duração e tamanho, para recusar vídeos fora dos limites sem baixar tudo.
  const meta = (await ytdlp(["--skip-download", "--print", "%(duration)s|%(width)s|%(height)s", link])).trim().split("\n").pop() ?? "";
  const [seconds, width, height] = meta.split("|").map(Number);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hubd-dl-"));
  try {
    await ytdlp(["-f", "best[ext=mp4]/best", "--max-filesize", "200M", "-o", path.join(dir, "video.%(ext)s"), link]);
    const file = (await fs.readdir(dir)).find((f) => f.startsWith("video."));
    if (!file) throw new HttpError(422, "O download não gerou arquivo de vídeo.");
    if (path.extname(file).toLowerCase() !== ".mp4") throw new HttpError(422, "Este vídeo não está em MP4 e não pode ser usado.");
    const bytes = await fs.readFile(path.join(dir, file));
    if (bytes.length > MAX_BYTES) throw new HttpError(413, "Vídeo grande demais (máximo 200 MB).");
    const url = await storeBytes(new Uint8Array(bytes), "video/mp4");
    return { url, seconds: Number.isFinite(seconds) ? seconds : 0, width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
