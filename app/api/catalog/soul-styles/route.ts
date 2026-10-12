import { errorResponse, hfJson } from "@/lib/hf";

// Catálogo muda pouco: deixa a CDN do Vercel guardar por 1 h.
const CACHE = { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" };

type Style = { id: string; name: string; description?: string; preview_url?: string };

export async function GET() {
  try {
    const styles = await hfJson<Style[]>("/v1/text2image/soul-styles");
    return Response.json(
      styles.map(({ id, name, description, preview_url }) => ({ id, name, description, preview_url })),
      { headers: CACHE },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
