import { googleConfigured } from "@/lib/google";
import { storageKind } from "@/lib/store";
import { mediaStorage } from "@/lib/media";

export const dynamic = "force-dynamic";

/** Quais integrações estão configuradas no servidor (sem expor nenhuma chave). */
export async function GET() {
  return Response.json({
    higgsfield: !!process.env.HF_CREDENTIALS,
    google: googleConfigured(),
    storage: storageKind(),
    media: mediaStorage(),
    passwordProtected: !!process.env.APP_PASSWORD,
  });
}
