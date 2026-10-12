"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, post } from "@/lib/client";
import { TERMINAL, type ModuleKey, type RequestStatus } from "@/lib/models";

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

type SubmitArgs = {
  module: ModuleKey;
  endpoint: string;
  input: Record<string, unknown>;
  label: string;
  prompt?: string;
};

type Ctx = {
  jobs: Job[];
  ready: boolean;
  submit: (a: SubmitArgs) => Promise<Job>;
  /** Envia e espera o fim. Rejeita se a geração não terminar como "completed". */
  run: (a: SubmitArgs) => Promise<Job>;
  waitFor: (id: string) => Promise<Job>;
  cancel: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => void;
  remove: (id: string) => void;
};

const JobsContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "hubd.jobs.v1";
const MAX_JOBS = 300;
const POLL_MS = 3000;

type ApiResponse = {
  status: RequestStatus;
  request_id: string;
  images?: { url: string }[];
  video?: { url: string };
  error?: string;
  credits?: number | null;
};

function applyResponse(job: Job, r: ApiResponse): Job {
  const status = r.status;
  return {
    ...job,
    status,
    images: r.images?.map((i) => i.url) ?? job.images,
    video: r.video?.url ?? job.video,
    error: r.error ?? job.error,
    finishedAt: TERMINAL.includes(status) ? (job.finishedAt ?? Date.now()) : undefined,
  };
}

export function failureMessage(job: Job): string {
  if (job.status === "nsfw") return "Bloqueado pela moderação de conteúdo. Os créditos foram devolvidos.";
  if (job.status === "canceled") return "Geração cancelada. Os créditos foram devolvidos.";
  if (job.status === "failed") return `A geração falhou${job.error ? `: ${job.error}` : ""}. Os créditos foram devolvidos.`;
  if (job.status === "completed") return "A geração terminou sem retornar mídia.";
  return "Geração ainda em andamento.";
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ready, setReady] = useState(false);
  const jobsRef = useRef<Job[]>([]);
  const waiters = useRef(new Map<string, ((j: Job) => void)[]>());

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) setJobs(saved);
    } catch {
      // sem storage: começa vazio
    }
    setReady(true);
  }, []);

  useEffect(() => {
    jobsRef.current = jobs;
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_JOBS)));
    } catch {
      // storage cheio ou bloqueado
    }
    for (const job of jobs) {
      if (!TERMINAL.includes(job.status)) continue;
      const list = waiters.current.get(job.id);
      if (list) {
        waiters.current.delete(job.id);
        list.forEach((resolve) => resolve(job));
      }
    }
  }, [jobs, ready]);

  const update = useCallback((id: string, fn: (j: Job) => Job) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? fn(j) : j)));
  }, []);

  // Polling de tudo que ainda não terminou.
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    const tick = async () => {
      const pending = jobsRef.current.filter((j) => !TERMINAL.includes(j.status));
      await Promise.all(
        pending.map(async (job) => {
          try {
            const r = await api<ApiResponse>(`/api/requests/${job.id}`);
            if (!stopped) update(job.id, (j) => applyResponse(j, r));
          } catch {
            // falha de rede: tenta de novo no próximo ciclo
          }
        }),
      );
    };
    const handle = setInterval(tick, POLL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  }, [ready, update]);

  const submit = useCallback(async (a: SubmitArgs) => {
    const r = await post<ApiResponse>("/api/generate", { endpoint: a.endpoint, input: a.input });
    const job = applyResponse(
      {
        id: r.request_id,
        module: a.module,
        endpoint: a.endpoint,
        label: a.label,
        prompt: a.prompt,
        input: a.input,
        status: r.status,
        credits: r.credits ?? null,
        createdAt: Date.now(),
      },
      r,
    );
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)].slice(0, MAX_JOBS));
    return job;
  }, []);

  const waitFor = useCallback((id: string) => {
    const current = jobsRef.current.find((j) => j.id === id);
    if (current && TERMINAL.includes(current.status)) return Promise.resolve(current);
    return new Promise<Job>((resolve) => {
      const list = waiters.current.get(id) ?? [];
      list.push(resolve);
      waiters.current.set(id, list);
    });
  }, []);

  const run = useCallback(
    async (a: SubmitArgs) => {
      const job = await submit(a);
      const done = await waitFor(job.id);
      if (done.status !== "completed" || (!done.video && !done.images?.length)) throw new Error(failureMessage(done));
      return done;
    },
    [submit, waitFor],
  );

  const cancel = useCallback(
    async (id: string) => {
      await post(`/api/requests/${id}/cancel`, {});
      update(id, (j) => ({ ...j, status: "canceled", finishedAt: Date.now() }));
    },
    [update],
  );

  const toggleFavorite = useCallback((id: string) => update(id, (j) => ({ ...j, favorite: !j.favorite })), [update]);
  const remove = useCallback((id: string) => setJobs((prev) => prev.filter((j) => j.id !== id)), []);

  return (
    <JobsContext.Provider value={{ jobs, ready, submit, run, waitFor, cancel, toggleFavorite, remove }}>
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs fora de JobsProvider");
  return ctx;
}

/** Créditos estimados das gerações concluídas (a API pública não expõe o saldo da conta). */
export function spentCredits(jobs: Job[]): number {
  return jobs.reduce((sum, j) => sum + (j.status === "completed" && j.credits ? j.credits : 0), 0);
}
