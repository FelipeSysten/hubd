import { ALLOWED_ENDPOINTS } from "@/lib/models";
import { errorResponse, HttpError, hfJson } from "@/lib/hf";

type Estimate = { type: "estimate"; credits: string; usd: string } | { type: "description"; pricing_description: string };

/**
 * Os modelos Genjutsu cobram por segundo do vídeo de entrada e descrevem o preço em texto
 * ("$0.318 at 480p, $0.681 at 720p, $1.632 at 1080p"). Extrai a tabela em USD por segundo.
 * Só para Genjutsu: as descrições do Seedance misturam preços por token e não são confiáveis de extrair.
 */
function perSecondRates(endpoint: string, text: string): Record<string, number> | null {
  if (!endpoint.startsWith("higgsfield/genjutsu/")) return null;
  const rates: Record<string, number> = {};
  for (const m of text.matchAll(/\$([\d.]+)\s*(?:per second\s*)?at\s*(480p|720p|1080p)/g)) rates[m[2]] = Number(m[1]);
  return Object.keys(rates).length ? rates : null;
}

export async function POST(req: Request) {
  try {
    const { endpoint, input } = await req.json();
    if (typeof endpoint !== "string" || !ALLOWED_ENDPOINTS.has(endpoint)) throw new HttpError(400, "Modelo não permitido.");
    const e = await hfJson<Estimate>(`/estimate/${endpoint}`, { method: "POST", body: JSON.stringify(input ?? {}) });
    if (e.type === "estimate") return Response.json({ credits: Number(e.credits), usd: Number(e.usd) });
    const description = e.type === "description" ? e.pricing_description : null;
    return Response.json({ credits: null, description, rates: description ? perSecondRates(endpoint, description) : null });
  } catch (err) {
    return errorResponse(err);
  }
}
