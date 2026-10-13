import { errorResponse, HttpError } from "@/lib/hf";
import { importVideo } from "@/lib/download";

// O download pode levar minutos (yt-dlp + upload). Só funciona onde o yt-dlp está instalado.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Baixa o vídeo de um link do TikTok/Instagram e devolve a URL usada como vídeo base. */
export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url.trim()) throw new HttpError(400, "Cole um link.");
    return Response.json(await importVideo(url));
  } catch (err) {
    return errorResponse(err);
  }
}
