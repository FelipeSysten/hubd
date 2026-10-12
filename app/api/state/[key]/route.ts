import { errorResponse, HttpError } from "@/lib/hf";
import { getState, setState, STATE_KEYS, storageKind } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

async function checkedKey(params: Ctx["params"]) {
  const { key } = await params;
  if (!STATE_KEYS.has(key)) throw new HttpError(404, "Chave desconhecida.");
  return key;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const key = await checkedKey(params);
    return Response.json({ storage: storageKind(), value: await getState(key) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const key = await checkedKey(params);
    if (!storageKind()) throw new HttpError(503, "Histórico no servidor não configurado.");
    const text = await req.text();
    if (text.length > 1_000_000) throw new HttpError(413, "Dados grandes demais.");
    await setState(key, JSON.parse(text).value ?? null);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
