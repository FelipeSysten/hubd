// Catálogo de endpoints Higgsfield usados pelo hubd.
// Fonte: https://docs.higgsfield.ai/docs/llms.txt (schemas por modelo).
// O servidor só aceita endpoints listados aqui.

export type ModuleKey =
  | "explorar"
  | "imagem"
  | "video"
  | "motion"
  | "canvas"
  | "avatar"
  | "genjutsu"
  | "frameflow";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  explorar: "Explorar",
  imagem: "Imagem",
  video: "Vídeo",
  motion: "Motion",
  canvas: "Canvas",
  avatar: "Avatar",
  genjutsu: "Genjutsu",
  frameflow: "Frame Flow",
};

export const ENDPOINTS = {
  soulStandard: "higgsfield-ai/soul/standard",
  soulV2: "higgsfield-ai/soul/v2/standard",
  soulCinema: "higgsfield-ai/soul/cinema",
  zImageTurbo: "z-image/turbo",
  grokImage: "xai/grok-imagine-image-2.0",

  seedanceT2V: "bytedance/seedance-2.5/text-to-video",
  seedanceI2V: "bytedance/seedance-2.5/image-to-video",
  seedanceRef: "bytedance/seedance-2.5/reference-to-video",
  seedanceEdit: "bytedance/seedance-2.5/video-edit",
  seedanceExtend: "bytedance/seedance-2.5/video-extend",
  klingT2V: "kling-video/v3.0/std/text-to-video",
  klingI2V: "kling-video/v3.0/std/image-to-video",
  klingProT2V: "kling-video/v3.0/pro/text-to-video",
  klingProI2V: "kling-video/v3.0/pro/image-to-video",

  klingMotionV3Std: "kling-video/v3/motion-control/std",
  klingMotionV3Pro: "kling-video/v3/motion-control/pro",
  klingMotion26Std: "kling-video/motion-control/std",
  klingMotion26Pro: "kling-video/motion-control/pro",

  genjutsuMotion: "higgsfield/genjutsu/motion-transfer/v1.0",
  genjutsuSwap: "higgsfield/genjutsu/object-swap/v1.0",
  genjutsuRestyle: "higgsfield/genjutsu/restyle/v1.0",
} as const;

export type Endpoint = (typeof ENDPOINTS)[keyof typeof ENDPOINTS];

export const ALLOWED_ENDPOINTS = new Set<string>(Object.values(ENDPOINTS));

export const ENDPOINT_LABELS: Record<Endpoint, string> = {
  [ENDPOINTS.soulStandard]: "Higgsfield Soul",
  [ENDPOINTS.soulV2]: "Soul 2.0",
  [ENDPOINTS.soulCinema]: "Soul Cinema",
  [ENDPOINTS.zImageTurbo]: "Z-Image Turbo",
  [ENDPOINTS.grokImage]: "Grok Image 2.0",
  [ENDPOINTS.seedanceT2V]: "Seedance 2.5",
  [ENDPOINTS.seedanceI2V]: "Seedance 2.5",
  [ENDPOINTS.seedanceRef]: "Seedance 2.5 · Referências",
  [ENDPOINTS.seedanceEdit]: "Seedance 2.5 · Edição",
  [ENDPOINTS.seedanceExtend]: "Seedance 2.5 · Extensão",
  [ENDPOINTS.klingT2V]: "Kling 3.0",
  [ENDPOINTS.klingI2V]: "Kling 3.0",
  [ENDPOINTS.klingProT2V]: "Kling 3.0 Pro",
  [ENDPOINTS.klingProI2V]: "Kling 3.0 Pro",
  [ENDPOINTS.klingMotionV3Std]: "Kling 3.0 Motion Control",
  [ENDPOINTS.klingMotionV3Pro]: "Kling 3.0 Motion Control Pro",
  [ENDPOINTS.klingMotion26Std]: "Kling 2.6 Motion Control",
  [ENDPOINTS.klingMotion26Pro]: "Kling 2.6 Motion Control Pro",
  [ENDPOINTS.genjutsuMotion]: "Genjutsu · Transferência de movimento",
  [ENDPOINTS.genjutsuSwap]: "Genjutsu · Substituir objeto",
  [ENDPOINTS.genjutsuRestyle]: "Genjutsu · Restyle",
};

// ---------- Imagem ----------

export type ImageModel = {
  endpoint: Endpoint;
  label: string;
  aspects: string[];
  resolutions: string[];
  batch: boolean; // aceita batch_size 1|4 numa única request
  styles: boolean; // aceita style_id dos estilos Soul
  reference: "image_reference_url" | "image_urls" | null;
};

export const IMAGE_MODELS: ImageModel[] = [
  {
    endpoint: ENDPOINTS.soulStandard,
    label: "Higgsfield Soul",
    aspects: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2"],
    resolutions: ["720p", "1080p"],
    batch: true,
    styles: true,
    reference: "image_reference_url",
  },
  {
    endpoint: ENDPOINTS.soulV2,
    label: "Soul 2.0",
    aspects: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2"],
    resolutions: ["720p", "1080p"],
    batch: true,
    styles: false,
    reference: null,
  },
  {
    endpoint: ENDPOINTS.soulCinema,
    label: "Soul Cinema",
    aspects: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2"],
    resolutions: ["720p", "1080p"],
    batch: true,
    styles: false,
    reference: null,
  },
  {
    endpoint: ENDPOINTS.zImageTurbo,
    label: "Z-Image Turbo",
    aspects: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"],
    resolutions: ["1k", "2k"],
    batch: false,
    styles: false,
    reference: null,
  },
  {
    endpoint: ENDPOINTS.grokImage,
    label: "Grok Image 2.0",
    aspects: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2"],
    resolutions: ["1k", "2k"],
    batch: false,
    styles: false,
    reference: "image_urls",
  },
];

// ---------- Vídeo ----------

export type VideoModel = {
  key: string;
  label: string;
  t2v: Endpoint;
  i2v: Endpoint;
  durations: number[];
  resolutions: string[] | null; // null = modelo não expõe resolução
  aspects: string[];
  endFrame: "end_image_url" | "last_image_url";
  audio: "generate_audio" | "sound";
};

export const VIDEO_MODELS: VideoModel[] = [
  {
    key: "seedance",
    label: "Seedance 2.5",
    t2v: ENDPOINTS.seedanceT2V,
    i2v: ENDPOINTS.seedanceI2V,
    durations: [4, 5, 8, 10, 15, 20, 30],
    resolutions: ["480p", "720p", "1080p"],
    aspects: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    endFrame: "end_image_url",
    audio: "generate_audio",
  },
  {
    key: "kling",
    label: "Kling 3.0",
    t2v: ENDPOINTS.klingT2V,
    i2v: ENDPOINTS.klingI2V,
    durations: [3, 5, 8, 10, 15],
    resolutions: null,
    aspects: ["16:9", "9:16", "1:1"],
    endFrame: "last_image_url",
    audio: "sound",
  },
  {
    key: "kling-pro",
    label: "Kling 3.0 Pro",
    t2v: ENDPOINTS.klingProT2V,
    i2v: ENDPOINTS.klingProI2V,
    durations: [3, 5, 8, 10, 15],
    resolutions: null,
    aspects: ["16:9", "9:16", "1:1"],
    endFrame: "last_image_url",
    audio: "sound",
  },
];

export type VideoParams = {
  model: VideoModel;
  prompt: string;
  imageUrl?: string;
  endImageUrl?: string;
  duration: number;
  resolution: string;
  aspect: string;
  audio: boolean;
};

/** Monta endpoint + input de vídeo respeitando o schema de cada família. */
export function buildVideoRequest(p: VideoParams): { endpoint: Endpoint; input: Record<string, unknown> } {
  const m = p.model;
  const input: Record<string, unknown> = { duration: p.duration };
  if (p.prompt.trim()) input.prompt = p.prompt.trim();
  if (m.resolutions) input.resolution = p.resolution;
  if (m.audio === "generate_audio") input.generate_audio = p.audio;
  else input.sound = p.audio ? "on" : "off";

  if (p.imageUrl) {
    input.image_url = p.imageUrl;
    if (p.endImageUrl) input[m.endFrame] = p.endImageUrl;
    return { endpoint: m.i2v, input };
  }
  input.aspect_ratio = p.aspect;
  return { endpoint: m.t2v, input };
}

// ---------- Motion Control ----------

export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export type MotionModel = {
  key: string;
  label: string;
  /** Kling não tem parâmetro de resolução: a qualidade é a variante (Standard = 720p, Pro = 1080p). */
  endpoints: Partial<Record<Resolution, Endpoint>>;
  kling: boolean; // aceita character_orientation e keep_original_sound
  minSeconds: number;
};

export const MOTION_MODELS: MotionModel[] = [
  {
    key: "genjutsu",
    label: "Genjutsu Motion Transfer",
    endpoints: { "480p": ENDPOINTS.genjutsuMotion, "720p": ENDPOINTS.genjutsuMotion, "1080p": ENDPOINTS.genjutsuMotion },
    kling: false,
    minSeconds: 4,
  },
  {
    key: "kling3",
    label: "Kling 3.0 Motion Control",
    endpoints: { "720p": ENDPOINTS.klingMotionV3Std, "1080p": ENDPOINTS.klingMotionV3Pro },
    kling: true,
    minSeconds: 3,
  },
  {
    key: "kling26",
    label: "Kling 2.6 Motion Control",
    endpoints: { "720p": ENDPOINTS.klingMotion26Std, "1080p": ENDPOINTS.klingMotion26Pro },
    kling: true,
    minSeconds: 3,
  },
];

/** Conversão usada pelo /estimate da Higgsfield (constante em todos os modelos). */
export const CREDITS_PER_USD = 16;

// ---------- Status ----------

export type RequestStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export const TERMINAL: RequestStatus[] = ["completed", "failed", "nsfw", "canceled"];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  queued: "Na fila",
  in_progress: "Gerando…",
  completed: "Concluído",
  failed: "Falhou · reembolsado",
  nsfw: "Bloqueado pela moderação",
  canceled: "Cancelado · reembolsado",
};
