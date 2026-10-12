import { config as loadEnv } from "dotenv";
import { config, higgsfield, HiggsfieldError, APIError } from "@higgsfield/client/v2";

loadEnv({ path: ".env.local" });

if (!process.env.HF_CREDENTIALS) {
  console.error("HF_CREDENTIALS ausente. Defina-o em .env.local no formato key-id:key-secret.");
  process.exit(1);
}

config({ credentials: process.env.HF_CREDENTIALS });

async function main() {
  const result = await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  const status = result.status as string;

  if (status === "completed" && result.video?.url) {
    console.log(`Request ${result.request_id} concluído.`);
    console.log(`Vídeo: ${result.video.url}`);
    return;
  }

  // failed, nsfw (moderado), canceled ou completed sem vídeo: nunca reportar sucesso
  const reason =
    status === "nsfw" ? "bloqueado pela moderação (nsfw)"
    : status === "failed" ? "falhou"
    : status === "canceled" || status === "cancelled" ? "cancelado"
    : status === "completed" ? "concluído sem URL de vídeo"
    : `status inesperado: ${status}`;
  console.error(`Request ${result.request_id} ${reason}.`);
  process.exit(1);
}

main().catch((err) => {
  if (err instanceof APIError) {
    console.error(`Erro da API Higgsfield (${err.name}, HTTP ${err.statusCode ?? "?"}): ${err.message}`);
  } else if (err instanceof HiggsfieldError) {
    console.error(`Erro do SDK Higgsfield (${err.name}): ${err.message}`);
  } else {
    console.error("Erro inesperado:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
