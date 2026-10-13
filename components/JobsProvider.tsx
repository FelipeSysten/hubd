"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, post } from "@/lib/client";
import { applyStatus, MAX_JOBS, type HfStatus, type Job } from "@/lib/jobs";
import { TERMINAL, type ModuleKey } from "@/lib/models";

export type { Job };

type SubmitArgs = {
  module: ModuleKey;
  endpoint: string;
  input: Record<string, unknown>;
  label: string;
  prompt?: string;
  /** Custo calculado no navegador, usado quando a API não devolve um número (cobrança por segundo). */
  credits?: number | null;
};

/** Onde o histórico está guardado: servidor (Postgres ou arquivo local) ou só neste navegador. */
export type Storage = "postgres" | "file" | "browser" | "loading";

type Ctx = {
  jobs: Job[];
  ready: boolean;
  storage: Storage;
  submit: (a: SubmitArgs) => Promise<Job>;
  /** Envia e espera o fim. Rejeita se a geração não terminar como "completed". */
  run: (a: SubmitArgs) => Promise<Job>;
  waitFor: (id: string) => Promise<Job>;
  cancel: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => void;
  remove: (id: string) => void;
};

const JobsContext = createContext<Ctx | null>(null);
// Cache local: mostra o histórico na hora enquanto o servidor responde.
const CACHE_KEY = "hubd.jobs.v1";
// Marca que o histórico antigo deste navegador já foi enviado ao servidor.
const IMPORTED_KEY = "hubd.jobs.imported.v1";
const POLL_MS = 3000;

function readCache(): Job[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function writeCache(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage cheio ou bloqueado
  }
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
  const [storage, setStorage] = useState<Storage>("loading");
  const jobsRef = useRef<Job[]>([]);
  const waiters = useRef(new Map<string, ((j: Job) => void)[]>());

  // 1) cache local na hora; 2) histórico do servidor (fonte da verdade); 3) envia o histórico antigo uma única vez.
  useEffect(() => {
    const cached = readCache();
    setJobs(cached);
    setReady(true);

    let cancelled = false;
    (async () => {
      try {
        const { storage: kind, jobs: serverJobs } = await api<{ storage: "postgres" | "file" | null; jobs: Job[] }>("/api/jobs");
        if (cancelled) return;
        if (!kind) return setStorage("browser");

        let alreadyImported = false;
        try {
          alreadyImported = localStorage.getItem(IMPORTED_KEY) === "1";
        } catch {
          // sem storage
        }
        const serverIds = new Set(serverJobs.map((j) => j.id));
        const localOnly = alreadyImported ? [] : cached.filter((j) => !serverIds.has(j.id));
        if (localOnly.length) await post("/api/jobs/import", { jobs: localOnly }).catch(() => {});
        writeCache(IMPORTED_KEY, "1");

        if (cancelled) return;
        // Gerações enviadas nesta aba enquanto o servidor respondia também entram.
        setJobs((current) => {
          const ids = new Set(serverJobs.map((j) => j.id));
          const fresh = current.filter((j) => !ids.has(j.id) && !cached.some((c) => c.id === j.id));
          return [...fresh, ...localOnly, ...serverJobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_JOBS);
        });
        setStorage(kind);
      } catch {
        if (!cancelled) setStorage("browser");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    jobsRef.current = jobs;
    if (!ready) return;
    writeCache(CACHE_KEY, JSON.stringify(jobs.slice(0, MAX_JOBS)));
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

  // Polling de tudo que ainda não terminou (inclusive gerações iniciadas antes de fechar o navegador).
  // O servidor aproveita cada consulta para atualizar o histórico gravado.
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    const inFlight = new Set<string>(); // evita consultas sobrepostas (a cópia do vídeo do Veo leva alguns segundos)
    const tick = async () => {
      const pending = jobsRef.current.filter((j) => !TERMINAL.includes(j.status) && !inFlight.has(j.id));
      await Promise.all(
        pending.map(async (job) => {
          inFlight.add(job.id);
          try {
            const q = job.ref ? `?ref=${encodeURIComponent(job.ref)}` : "";
            const r = await api<HfStatus>(`/api/requests/${job.id}${q}`);
            if (!stopped) update(job.id, (j) => applyStatus(j, r));
          } catch {
            // falha de rede: tenta de novo no próximo ciclo
          } finally {
            inFlight.delete(job.id);
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
    const r = await post<HfStatus & { credits?: number | null; job?: Job }>("/api/generate", {
      endpoint: a.endpoint,
      input: a.input,
      meta: { module: a.module, label: a.label, prompt: a.prompt, credits: a.credits ?? undefined },
    });
    const job =
      r.job ??
      applyStatus(
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

  const toggleFavorite = useCallback(
    (id: string) => {
      const favorite = !jobsRef.current.find((j) => j.id === id)?.favorite;
      update(id, (j) => ({ ...j, favorite }));
      api(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ favorite }) }).catch(() => {});
    },
    [update],
  );

  const remove = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    api(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  return (
    <JobsContext.Provider value={{ jobs, ready, storage, submit, run, waitFor, cancel, toggleFavorite, remove }}>
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

/** Custo estimado em US$ das gerações do Google concluídas (cobrado na conta Google). */
export function spentUsd(jobs: Job[]): number {
  return jobs.reduce((sum, j) => sum + (j.status === "completed" && j.usd ? j.usd : 0), 0);
}
