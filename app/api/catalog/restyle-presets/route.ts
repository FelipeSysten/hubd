import { errorResponse, hfJson } from "@/lib/hf";

// Catálogo muda pouco: deixa a CDN do Vercel guardar por 1 h.
const CACHE = { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" };

type Presets = { items: { id: string; name: string; preview_url?: string }[] };

export async function GET() {
  try {
    const { items } = await hfJson<Presets>("/models/higgsfield/genjutsu/restyle/v1.0/presets");
    return Response.json(items, { headers: CACHE });
  } catch (err) {
    return errorResponse(err);
  }
}
