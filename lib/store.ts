import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { MAX_JOBS, type Job } from "./jobs";

// Armazenamento do histórico no servidor.
// - Vercel: Postgres (Neon ou Supabase, ambos com plano gratuito). A integração define DATABASE_URL ou POSTGRES_URL.
// - Local: arquivo .data/hubd-store.json (fora do Git).
// Sem banco no Vercel não há onde gravar (o disco das funções é temporário): o portal avisa e usa só o navegador.

type Store = {
  kind: "postgres" | "file";
  listJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  saveJob(job: Job): Promise<void>;
  deleteJob(id: string): Promise<void>;
  getState(key: string): Promise<unknown>;
  setState(key: string, value: unknown): Promise<void>;
};

function postgresStore(url: string): Store {
  // prepare: false é exigido pelos poolers do Supabase/Neon em modo transação.
  const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 20, onnotice: () => {} });

  // Cria as tabelas na primeira consulta de cada instância (não precisa rodar migração à mão).
  let ready: Promise<unknown> | null = null;
  const init = () =>
    (ready ??= sql`
      create table if not exists hubd_jobs (
        id text primary key,
        created_at bigint not null,
        data jsonb not null
      );
      create index if not exists hubd_jobs_created_at on hubd_jobs (created_at desc);
      create table if not exists hubd_state (
        key text primary key,
        value jsonb
      );
    `.simple().catch((e) => {
      ready = null;
      throw e;
    }));

  return {
    kind: "postgres",
    async listJobs() {
      await init();
      const rows = await sql<{ data: Job }[]>`select data from hubd_jobs order by created_at desc limit ${MAX_JOBS}`;
      // Mantém o histórico limitado: remove o que passou do limite.
      if (rows.length === MAX_JOBS) {
        await sql`delete from hubd_jobs where id not in (select id from hubd_jobs order by created_at desc limit ${MAX_JOBS})`;
      }
      return rows.map((r) => r.data);
    },
    async getJob(id) {
      await init();
      const [row] = await sql<{ data: Job }[]>`select data from hubd_jobs where id = ${id}`;
      return row?.data ?? null;
    },
    async saveJob(job) {
      await init();
      await sql`
        insert into hubd_jobs (id, created_at, data) values (${job.id}, ${job.createdAt}, ${sql.json(job as never)})
        on conflict (id) do update set data = excluded.data
      `;
    },
    async deleteJob(id) {
      await init();
      await sql`delete from hubd_jobs where id = ${id}`;
    },
    async getState(key) {
      await init();
      const [row] = await sql<{ value: unknown }[]>`select value from hubd_state where key = ${key}`;
      return row?.value ?? null;
    },
    async setState(key, value) {
      await init();
      await sql`
        insert into hubd_state (key, value) values (${key}, ${sql.json(value as never)})
        on conflict (key) do update set value = excluded.value
      `;
    },
  };
}

function fileStore(file: string): Store {
  type Data = { jobs: Record<string, Job>; state: Record<string, unknown> };
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<Data> {
    try {
      const d = JSON.parse(await fs.readFile(file, "utf8"));
      return { jobs: d.jobs ?? {}, state: d.state ?? {} };
    } catch {
      return { jobs: {}, state: {} };
    }
  }
  // Escritas em fila para não perder atualizações simultâneas.
  function mutate(fn: (d: Data) => void): Promise<void> {
    const next = queue.then(async () => {
      const d = await read();
      fn(d);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(d));
      await fs.rename(tmp, file);
    });
    queue = next.catch(() => {});
    return next;
  }
  return {
    kind: "file",
    listJobs: async () =>
      Object.values((await read()).jobs)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_JOBS),
    getJob: async (id) => (await read()).jobs[id] ?? null,
    saveJob: (job) => mutate((d) => void (d.jobs[job.id] = job)),
    deleteJob: (id) => mutate((d) => void delete d.jobs[id]),
    getState: async (key) => (await read()).state[key] ?? null,
    setState: (key, value) => mutate((d) => void (d.state[key] = value)),
  };
}

let store: Store | null | undefined;
function getStore(): Store | null {
  if (store !== undefined) return store;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (url) store = postgresStore(url);
  else if (!process.env.VERCEL) store = fileStore(path.join(process.cwd(), ".data", "hubd-store.json"));
  else store = null;
  return store;
}

export function storageKind(): "postgres" | "file" | null {
  return getStore()?.kind ?? null;
}

export async function listJobs(): Promise<Job[] | null> {
  return (await getStore()?.listJobs()) ?? null;
}

export async function getJob(id: string): Promise<Job | null> {
  return (await getStore()?.getJob(id)) ?? null;
}

export async function saveJob(job: Job): Promise<void> {
  await getStore()?.saveJob(job);
}

export async function deleteJob(id: string): Promise<void> {
  await getStore()?.deleteJob(id);
}

/** Estado das telas (fluxo do Canvas, favoritos, estilos, retratos). */
export const STATE_KEYS = new Set(["canvas", "avatar-portraits", "genjutsu-favs", "frameflow-styles"]);

export async function getState(key: string): Promise<unknown> {
  return (await getStore()?.getState(key)) ?? null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await getStore()?.setState(key, value);
}
