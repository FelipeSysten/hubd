import { googleConfigured } from "@/lib/google";
import { storageKind } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Quais integrações estão configuradas no servidor (sem expor nenhuma chave). */
export async function GET() {
  return Response.json({
    higgsfield: !!process.env.HF_CREDENTIALS,
    google: googleConfigured(),
    storage: storageKind(),
  });
}
