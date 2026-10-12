import { ALLOWED_ENDPOINTS } from "@/lib/models";
import { errorResponse, HttpError, hfJson, submit } from "@/lib/hf";

export async function POST(req: Request) {
  try {
    const { endpoint, input } = await req.json();
    if (typeof endpoint !== "string" || !ALLOWED_ENDPOINTS.has(endpoint)) {
      throw new HttpError(400, "Modelo não permitido.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HttpError(400, "Parâmetros inválidos.");
    }

    // A estimativa roda em paralelo e nunca bloqueia o envio.
    const estimate = hfJson<{ type?: string; credits?: string }>(`/estimate/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(input),
    })
      .then((e) => (e.type === "estimate" && e.credits ? Number(e.credits) : null))
      .catch(() => null);

    const result = await submit(endpoint, input);
    return Response.json({ ...result, credits: await estimate });
  } catch (err) {
    return errorResponse(err);
  }
}
