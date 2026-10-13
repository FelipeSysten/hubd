import { readLocalMedia } from "@/lib/media";

/** Serve as imagens guardadas localmente (desenvolvimento, sem Vercel Blob). */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const media = await readLocalMedia(file);
  if (!media) return new Response("Não encontrado.", { status: 404 });
  return new Response(new Uint8Array(media.bytes), {
    headers: { "Content-Type": media.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
