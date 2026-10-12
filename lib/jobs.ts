// Tipos e regras de uma geração, compartilhados entre servidor e navegador.
import { MODULE_LABELS, TERMINAL, type ModuleKey, type RequestStatus } from "./models";

export type Job = {
  id: string;
  module: ModuleKey;
  endpoint: string;
  label: string;
  prompt?: string;
  input: Record<string, unknown>;
  status: RequestStatus;
  images?: string[];
  video?: string;
  error?: string;
  credits: number | null;
  createdAt: number;
  finishedAt?: number;
  favorite?: boolean;
};

/** Resposta da Higgsfield em /requests/{id}/status (e no envio). */
export type HfStatus = {
  status: RequestStatus;
  request_id: string;
  images?: { url: string }[];
  video?: { url: string };
  error?: string;
};

export function applyStatus(job: Job, r: HfStatus): Job {
  return {
    ...job,
    status: r.status,
    images: r.images?.map((i) => i.url) ?? job.images,
    video: r.video?.url ?? job.video,
    error: r.error ?? job.error,
    finishedAt: TERMINAL.includes(r.status) ? (job.finishedAt ?? Date.now()) : undefined,
  };
}

export const MAX_JOBS = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: RequestStatus[] = ["queued", "in_progress", "completed", "failed", "nsfw", "canceled"];

/** Aceita só registros com formato de Job (usado ao importar o histórico antigo do navegador). */
export function isJob(x: unknown): x is Job {
  if (!x || typeof x !== "object") return false;
  const j = x as Record<string, unknown>;
  return (
    typeof j.id === "string" &&
    UUID.test(j.id) &&
    typeof j.module === "string" &&
    j.module in MODULE_LABELS &&
    typeof j.endpoint === "string" &&
    j.endpoint.length < 200 &&
    typeof j.label === "string" &&
    typeof j.status === "string" &&
    STATUSES.includes(j.status as RequestStatus) &&
    typeof j.createdAt === "number" &&
    !!j.input &&
    typeof j.input === "object"
  );
}
