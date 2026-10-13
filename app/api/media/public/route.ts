import { errorResponse, HttpError } from "@/lib/hf";
import { publicUrl } from "@/lib/media";

/** Converte URLs de imagens guardadas localmente em URLs públicas para usar como referência na API. */
export async function POST(req: Request) {
  try {
    const { urls } = await req.json();
    if (!Array.isArray(urls) || urls.length > 8 || !urls.every((u) => typeof u === "string")) throw new HttpError(400, "Lista de URLs inválida.");
    return Response.json({ urls: await Promise.all(urls.map(publicUrl)) });
  } catch (err) {
    return errorResponse(err);
  }
}
