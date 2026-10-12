import { errorResponse } from "@/lib/hf";
import { listJobs, storageKind } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Histórico completo guardado no servidor. `storage: null` = sem banco configurado (só o navegador guarda). */
export async function GET() {
  try {
    const jobs = await listJobs();
    return Response.json({ storage: storageKind(), jobs: jobs ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
