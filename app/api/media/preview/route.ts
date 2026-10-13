import { errorResponse, HttpError } from "@/lib/hf";
import { previewLink } from "@/lib/download";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Mostra a prévia (título, miniatura, duração) de um link do TikTok/Instagram, sem baixar o vídeo. */
export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url.trim()) throw new HttpError(400, "Cole um link.");
    return Response.json(await previewLink(url));
  } catch (err) {
    return errorResponse(err);
  }
}
