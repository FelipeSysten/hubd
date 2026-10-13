import { errorResponse, HttpError } from "@/lib/hf";
import { persistImage } from "@/lib/media";

/** Copia uma imagem gerada para o armazenamento permanente e devolve a nova URL. */
export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (typeof url !== "string") throw new HttpError(400, "URL obrigatória.");
    return Response.json(await persistImage(url));
  } catch (err) {
    return errorResponse(err);
  }
}
