import { errorResponse, HttpError } from "@/lib/hf";
import { generateText } from "@/lib/google";

const GUIDES: Record<string, string> = {
  image:
    "Reescreva como um prompt de geração de imagem rico e específico: sujeito, ação, cenário, composição, luz, lente/câmera, estilo e paleta. Máximo de 80 palavras.",
  video:
    "Reescreva como um prompt de geração de vídeo: sujeito e ação, movimento de câmera, ritmo, luz, estilo e sons/ambiência. Uma única cena contínua. Máximo de 90 palavras.",
  idea:
    "Transforme a ideia em um conceito de vídeo curto e visual: o que aparece, a sequência de momentos, o clima e o som. Máximo de 90 palavras.",
  script:
    "Reescreva como roteiro falado por um apresentador olhando para a câmera: frases curtas, naturais e envolventes, com abertura e fechamento. Deve caber em até 30 segundos de fala (no máximo 70 palavras). Sem marcações de cena, emojis ou aspas.",
};

const SYSTEM =
  "Você melhora textos para um estúdio de criação com IA. Responda SOMENTE com o texto final, sem comentários, títulos ou aspas. Mantenha o idioma do texto original e preserve a intenção do usuário.";

export async function POST(req: Request) {
  try {
    const { text, kind } = await req.json();
    if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "Escreva algo antes de melhorar.");
    if (text.length > 4000) throw new HttpError(413, "Texto longo demais.");
    const guide = GUIDES[kind] ?? GUIDES.image;
    const out = await generateText(`${guide}\n\nTexto original:\n${text.trim()}`, { system: SYSTEM });
    return Response.json({ text: out.replace(/^["“]|["”]$/g, "").trim() });
  } catch (err) {
    return errorResponse(err);
  }
}
