// Área "Character": personagens + troca de personagem em vídeos (Genjutsu).
import { CREDITS_PER_USD, ENDPOINTS, type Endpoint } from "./models";

export type CharacterView = "card" | "front" | "profile" | "three-quarter" | "upload";

export type CharacterImage = { url: string; view: CharacterView };

export type Character = {
  id: string;
  name: string;
  description?: string;
  images: CharacterImage[];
  folder?: string | null;
  favorite?: boolean;
  source: "created" | "uploaded" | "sample";
  /** Vistas (frente, perfil, 3/4) ainda sendo geradas: id do job → vista. */
  pendingViews?: Record<string, CharacterView>;
  /** true quando a imagem ainda está só na CDN da Higgsfield (expira em ~7 dias). */
  temporary?: boolean;
  createdAt: number;
};

export type CharacterLibrary = { characters: Character[]; folders: string[] };

export type BaseVideo = {
  id: string;
  name: string;
  url: string;
  seconds: number;
  width: number;
  height: number;
  /** Origem do vídeo: "Instagram", "TikTok" ou "Arquivo". */
  source?: string;
  createdAt: number;
};

export type CharacterSettings = {
  createModel: Endpoint;
  viewsModel: Endpoint;
  swapModel: Endpoint;
  resolution: "480p" | "720p" | "1080p";
};

export const DEFAULT_SETTINGS: CharacterSettings = {
  createModel: ENDPOINTS.grokImage,
  viewsModel: ENDPOINTS.grokImage,
  swapModel: ENDPOINTS.genjutsuSwap,
  resolution: "1080p",
};

export const VIEW_LABELS: Record<CharacterView, string> = {
  card: "Card",
  front: "Frente",
  profile: "Perfil",
  "three-quarter": "3/4 direita",
  upload: "Foto",
};

/** Vistas geradas depois que o personagem é salvo (usadas como referência na troca). */
export const EXTRA_VIEWS: { view: CharacterView; prompt: string }[] = [
  { view: "front", prompt: "front-facing view, looking straight at the camera, upper body" },
  { view: "profile", prompt: "side profile view facing left, upper body" },
  { view: "three-quarter", prompt: "three-quarter view turned to the right, upper body" },
];

// ---------- Modelos ----------

export type CreateModel = { endpoint: Endpoint; label: string; google?: boolean; editsWithRefs: boolean };

/** Modelos para criar o card e as vistas. Só os que aceitam imagem de referência geram vistas fiéis. */
export const CREATE_MODELS: CreateModel[] = [
  { endpoint: ENDPOINTS.grokImage, label: "Grok Image 2.0", editsWithRefs: true },
  { endpoint: ENDPOINTS.soulStandard, label: "Higgsfield Soul", editsWithRefs: false },
  { endpoint: ENDPOINTS.googleNanoBanana, label: "Nano Banana 2.1 · Google", google: true, editsWithRefs: true },
  { endpoint: ENDPOINTS.googleNanoBananaLite, label: "Nano Banana 2 Lite · Google", google: true, editsWithRefs: true },
];

export const SWAP_MODELS: { endpoint: Endpoint; label: string; description: string; code: string }[] = [
  {
    endpoint: ENDPOINTS.genjutsuSwap,
    label: "Higgsfield Genjutsu · Troca de personagem",
    description: "Troca só a pessoa e mantém o resto da cena: movimento, câmera, fundo e luz.",
    code: "genjutsu/object-swap",
  },
  {
    endpoint: ENDPOINTS.genjutsuMotion,
    label: "Higgsfield Genjutsu · Transferência de movimento",
    description: "O personagem repete o movimento do vídeo.",
    code: "genjutsu/motion-transfer",
  },
];

/** Limites da API Genjutsu: vídeo de 4 a 30 s (o resto é cortado) e pelo menos 409.600 px por quadro. */
export const VIDEO_MIN_S = 4;
export const VIDEO_MAX_S = 30;
export const VIDEO_MIN_PIXELS = 409_600;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

// ---------- Prompts ----------

/** Estilo "Série Amarela": retrato caricato em estúdio com fundo amarelo. */
export function cardPrompt(description: string, yellow: boolean): string {
  const style = yellow
    ? "Studio portrait photograph, bust shot centered, slightly exaggerated caricature proportions, distinctive hairstyle, deadpan expression, plain saturated mustard-yellow seamless background, soft even key light, ultra detailed, photorealistic, 3:4 card."
    : "Studio portrait photograph, bust shot centered, neutral seamless background, soft even key light, ultra detailed, photorealistic.";
  return `${description.trim()}. ${style}`;
}

export function viewPrompt(viewPromptText: string, yellow: boolean): string {
  return (
    `The exact same character as in the reference image: identical face, hairstyle, outfit, colors and proportions. ${viewPromptText}. ` +
    (yellow ? "Same plain mustard-yellow seamless studio background and soft even light." : "Same neutral studio background and soft even light.")
  );
}

/** Prompt testado para a troca: mantém tudo e substitui só a pessoa. */
export const DEFAULT_SWAP_PROMPT =
  "Replace the main person in the video with the character from the reference images. Keep the original motion, timing, camera movement, framing, background and lighting exactly as in the source video. Preserve the character's face, hairstyle, outfit and body proportions as shown in the references.";

/** Monta a request de geração do card, conforme o modelo escolhido. */
export function cardRequest(endpoint: Endpoint, prompt: string, refs: string[] = []): { endpoint: Endpoint; input: Record<string, unknown> } {
  if (endpoint === ENDPOINTS.grokImage) {
    return { endpoint, input: { prompt, aspect_ratio: "3:4", resolution: "1k", quality: "medium", ...(refs.length ? { image_urls: refs } : {}) } };
  }
  if (endpoint.startsWith("google/")) {
    return { endpoint, input: { prompt, aspect_ratio: "3:4", image_size: "1K", ...(refs.length ? { image_urls: refs } : {}) } };
  }
  // Soul: referência só orienta o prompt.
  return { endpoint, input: { prompt, aspect_ratio: "3:4", resolution: "720p", batch_size: 1, ...(refs[0] ? { image_reference_url: refs[0] } : {}) } };
}

/** Imagens enviadas como referência na troca (card primeiro; a API aceita até 8). */
export function referenceImages(c: Character): string[] {
  const order: CharacterView[] = ["card", "upload", "front", "three-quarter", "profile"];
  return [...c.images].sort((a, b) => order.indexOf(a.view) - order.indexOf(b.view)).map((i) => i.url).slice(0, 8);
}

/** Input da troca de personagem: vídeo de origem, referências do personagem e prompt (vazio = padrão testado). */
export function swapInput(videoUrl: string, refs: string[], prompt: string, resolution: string): Record<string, unknown> {
  return { video_url: videoUrl, image_urls: refs, prompt: prompt.trim() || DEFAULT_SWAP_PROMPT, resolution };
}

/** Créditos da troca, quando o Genjutsu devolve preço por segundo (a Higgsfield arredonda a duração para cima). */
export function swapCredits(rates: Record<string, number> | null | undefined, seconds: number, resolution: string): number | null {
  const rate = rates?.[resolution];
  return rate != null && seconds > 0 ? Math.ceil(seconds) * rate * CREDITS_PER_USD : null;
}

export function coverImage(c: Character): string | undefined {
  return (c.images.find((i) => i.view === "card") ?? c.images[0])?.url;
}

/** Personagens originais para começar a biblioteca (gerados sob demanda). */
export const SAMPLE_CHARACTERS: { name: string; description: string }[] = [
  { name: "Bento Bigode", description: "A cheerful middle-aged Brazilian baker with an enormous curled handlebar mustache, round glasses and a flour-dusted white apron" },
  { name: "Dona Zuleica", description: "An elegant elderly woman with a towering silver beehive hairdo, cat-eye glasses and a pearl necklace over a teal cardigan" },
  { name: "Rafa Topete", description: "A young man with a gigantic glossy black pompadour, thin pencil mustache and a burgundy velvet blazer" },
  { name: "Professor Lúcio", description: "A lanky scientist with wild white Einstein-like hair, bushy eyebrows and a tweed jacket with elbow patches" },
  { name: "Kiki Franja", description: "A stylish young woman with a blunt glossy red bob and heavy bangs, oversized gold hoop earrings and a striped sailor shirt" },
  { name: "Seu Jorginho", description: "A stocky bald man with a thick gray walrus mustache, rosy cheeks and a checkered flat cap with suspenders" },
  { name: "Mila Cachos", description: "A woman with a huge voluminous curly afro, freckles and a bright mustard-orange turtleneck" },
  { name: "Duque Bartolomeu", description: "An aristocratic man with long wavy chestnut hair, a pointed goatee and an ornate embroidered navy coat with a ruffled collar" },
];
