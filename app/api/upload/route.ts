import { errorResponse, HttpError, hfJson } from "@/lib/hf";

const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "audio/wav", "audio/x-wav", "video/mp4"]);

/** Gera uma URL pré-assinada; o navegador envia o arquivo direto ao storage (sem passar pelo limite de corpo do Vercel). */
export async function POST(req: Request) {
  try {
    const { content_type } = await req.json();
    if (!ALLOWED.has(content_type)) {
      throw new HttpError(400, "Formato não suportado. Use JPG, PNG, WEBP, GIF, WAV ou MP4.");
    }
    const data = await hfJson<{ public_url: string; upload_url: string; upload_headers: Record<string, string> }>(
      "/files/generate-upload-url",
      { method: "POST", body: JSON.stringify({ content_type }) },
    );
    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
