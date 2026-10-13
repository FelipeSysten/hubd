import { errorResponse, HttpError } from "@/lib/hf";
import { previewLink, viaPythonFunction, type LinkPreview } from "@/lib/download";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Mostra a prévia (título, miniatura, duração) de um link do TikTok/Instagram, sem baixar o vídeo. */
export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url.trim()) throw new HttpError(400, "Cole um link.");
    // Na Vercel o yt-dlp roda na função Python; em desenvolvimento usa o binário local.
    const info = process.env.VERCEL ? await viaPythonFunction<LinkPreview>("preview", url, req.url) : await previewLink(url);
    return Response.json(info);
  } catch (err) {
    return errorResponse(err);
  }
}
