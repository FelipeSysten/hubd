import { errorResponse, HttpError } from "@/lib/hf";
import { generateText } from "@/lib/google";

// Agente do Canvas: transforma o pedido em um fluxo de nós (saída JSON validada por schema).
const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Resposta curta ao usuário, em português, explicando o fluxo montado." },
    prompt: { type: "string", description: "Prompt visual detalhado para gerar a imagem base do fluxo." },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["image", "video", "vertical", "extend", "edit"] },
          aspect: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "3:4"] },
          duration: { type: "integer", description: "Segundos, de 4 a 15." },
          resolution: { type: "string", enum: ["480p", "720p", "1080p"] },
          text: { type: "string", description: "Instrução específica do nó (movimento do vídeo, edição ou continuação)." },
        },
        required: ["type"],
      },
    },
  },
  required: ["summary", "prompt", "nodes"],
};

const SYSTEM = `Você é o agente do Kling Canvas do hubd. Monte um fluxo linear de geração a partir do pedido.
Nós disponíveis (executados em ordem, cada um usa a saída do anterior):
- image: gera a imagem base (Higgsfield Soul) a partir do prompt. Sempre o primeiro nó. Campo aspect.
- video: anima a imagem (Seedance 2.5). Campos duration, resolution e text (movimento de câmera/ação).
- vertical: cria uma versão 9:16 para Reels/Stories a partir da imagem. Campo duration.
- extend: continua o último vídeo. Campos duration e text.
- edit: edita o último vídeo por instrução. Campo text.
Regras: comece por image; use video quando o pedido envolver vídeo, anúncio, animação ou movimento; use vertical se pedirem versão vertical/Reels/TikTok/Stories e o vídeo principal não for 9:16; respeite durações pedidas (4 a 15 s); 720p é o padrão.
O prompt deve descrever visualmente a cena com riqueza (sujeito, cenário, luz, estilo). Responda no idioma do usuário no campo summary.`;

export async function POST(req: Request) {
  try {
    const { request, current } = await req.json();
    if (typeof request !== "string" || !request.trim()) throw new HttpError(400, "Descreva o que quer criar.");
    const context = current ? `\n\nFluxo atual (para ajustes): ${JSON.stringify(current).slice(0, 3000)}` : "";
    const raw = await generateText(`Pedido: ${request.trim().slice(0, 2000)}${context}`, { system: SYSTEM, schema: SCHEMA });
    return Response.json(JSON.parse(raw));
  } catch (err) {
    return errorResponse(err);
  }
}
