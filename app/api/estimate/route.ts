import { ALLOWED_ENDPOINTS } from "@/lib/models";
import { errorResponse, HttpError, hfJson } from "@/lib/hf";

type Estimate = { type: "estimate"; credits: string; usd: string } | { type: "description"; pricing_description: string };

export async function POST(req: Request) {
  try {
    const { endpoint, input } = await req.json();
    if (typeof endpoint !== "string" || !ALLOWED_ENDPOINTS.has(endpoint)) throw new HttpError(400, "Modelo não permitido.");
    const e = await hfJson<Estimate>(`/estimate/${endpoint}`, { method: "POST", body: JSON.stringify(input ?? {}) });
    if (e.type === "estimate") return Response.json({ credits: Number(e.credits), usd: Number(e.usd) });
    return Response.json({ credits: null, description: e.type === "description" ? e.pricing_description : null });
  } catch (err) {
    return errorResponse(err);
  }
}
