import { errorResponse, HttpError } from "@/lib/hf";
import { importVideo, viaPythonFunction, type ImportedVideo } from "@/lib/download";

// O download pode levar minutos (yt-dlp + upload).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Baixa o vídeo de um link do TikTok/Instagram e devolve a URL usada como vídeo base. */
export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url.trim()) throw new HttpError(400, "Cole um link.");
    const video = process.env.VERCEL ? await viaPythonFunction<ImportedVideo>("import", url, req.url) : await importVideo(url);
    return Response.json(video);
  } catch (err) {
    return errorResponse(err);
  }
}
