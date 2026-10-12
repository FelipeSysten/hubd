"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { downloadUrl, formatCredits, post, timeAgo, uploadFile } from "@/lib/client";
import { CREDITS_PER_USD, ENDPOINT_LABELS, MODULE_LABELS, STATUS_LABELS, TERMINAL, type Endpoint, type RequestStatus } from "@/lib/models";
import { failureMessage, useJobs, type Job } from "./JobsProvider";

export function Field({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="col">
      <div className="row between">
        <span className="label">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  format = String,
  disabled,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
  disabled?: (v: T) => string | false; // retorna o motivo para desabilitar a opção
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => {
        const reason = disabled?.(o);
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={o === value}
            className={o === value ? "on" : ""}
            disabled={!!reason}
            title={reason || undefined}
            onClick={() => onChange(o)}
          >
            {format(o)}
          </button>
        );
      })}
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  format = String,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <select
      className="select"
      value={String(value)}
      onChange={(e) => {
        const found = options.find((o) => String(o) === e.target.value);
        if (found !== undefined) onChange(found);
      }}
    >
      {options.map((o) => (
        <option key={String(o)} value={String(o)}>
          {format(o)}
        </option>
      ))}
    </select>
  );
}

type UploadKind = "image" | "video" | "audio";
const ACCEPT: Record<UploadKind, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4",
  audio: "audio/wav,audio/x-wav,audio/wave",
};

/** Caixa de upload: envia ao storage Higgsfield e devolve a URL pública. */
export function UploadBox({
  kind,
  value,
  onChange,
  label,
  hint,
  height = 120,
  onDuration,
}: {
  kind: UploadKind;
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  hint?: string;
  height?: number;
  /** Vídeo: duração lida do arquivo local, antes mesmo de o upload terminar. */
  onDuration?: (seconds: number | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    if (kind === "video" && onDuration) localDuration(file).then(onDuration);
    try {
      onChange(await uploadFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col" style={{ gap: 6 }}>
      <div
        className={`drop ${value ? "filled" : ""} ${over ? "over" : ""}`}
        style={{ height }}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept={ACCEPT[kind]} onChange={(e) => handle(e.target.files?.[0])} />
        {value ? (
          <>
            {kind === "image" && <img src={value} alt="" />}
            {kind === "video" && <video src={value} muted loop autoPlay playsInline />}
            {kind === "audio" && <span className="muted small">♪ áudio enviado</span>}
            <span className="tag">{label} ✓</span>
            <button
              type="button"
              className="x"
              aria-label="Remover"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                onDuration?.(null);
              }}
            >
              ×
            </button>
          </>
        ) : busy ? (
          <span className="row muted small">
            <span className="spinner" /> Enviando…
          </span>
        ) : (
          <>
            <span style={{ fontSize: 15 }}>+ {label}</span>
            {hint && <span className="small">{hint}</span>}
          </>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

type EstimateState = { credits: number | null; usd?: number; description?: string | null; rates?: Record<string, number> | null };

/**
 * Estimativa de custo via /estimate (não cobra).
 * Modelos cobrados por segundo de vídeo de entrada (Genjutsu) devolvem `rates`; com `seconds` e `resolution`
 * o custo é calculado aqui (a Higgsfield arredonda a duração para cima).
 */
export function CostEstimate({
  endpoint,
  input,
  times = 1,
  seconds,
  resolution,
  waiting = "custo após enviar",
}: {
  endpoint: Endpoint | null;
  input: Record<string, unknown> | null;
  times?: number;
  seconds?: number | null;
  resolution?: string;
  waiting?: string;
}) {
  const [state, setState] = useState<EstimateState | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify([endpoint, input]);

  useEffect(() => {
    if (!endpoint || !input) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      post<EstimateState>("/api/estimate", { endpoint, input })
        .then(setState)
        .catch(() => setState(null))
        .finally(() => setLoading(false));
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (loading) return <span className="muted small">calculando custo…</span>;
  if (!state) return <span className="muted small">{waiting}</span>;
  if (state.credits != null) {
    return <span className="muted">≈ {formatCredits(state.credits * times)} créditos</span>;
  }
  const rate = resolution ? state.rates?.[resolution] : undefined;
  if (rate != null) {
    if (!seconds) return <span className="muted small">lendo a duração do vídeo…</span>;
    const billed = Math.ceil(seconds);
    const usd = billed * rate * times;
    return (
      <span className="muted" title={`${billed} s × US$ ${rate.toFixed(3)}/s em ${resolution}. ${state.description ?? ""}`} style={{ cursor: "help" }}>
        ≈ {formatCredits(usd * CREDITS_PER_USD)} créditos <span className="small">(US$ {usd.toFixed(2).replace(".", ",")})</span>
      </span>
    );
  }
  return (
    <span className="muted small" title={state.description ?? undefined} style={{ cursor: "help", textDecoration: "underline dotted" }}>
      cobrado por segundo gerado
    </span>
  );
}

function localDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

/** Lê a duração (em segundos) de um vídeo por URL, sem baixar o arquivo inteiro. */
export function useVideoDuration(url: string | null): number | null {
  const [duration, setDuration] = useState<number | null>(null);
  useEffect(() => {
    setDuration(null);
    if (!url) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => setDuration(Number.isFinite(v.duration) ? v.duration : null);
    v.src = url;
    return () => {
      v.onloadedmetadata = null;
      v.removeAttribute("src");
      v.load();
    };
  }, [url]);
  return duration;
}

export function StatusPill({ status }: { status: RequestStatus }) {
  return <span className={`status ${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function jobThumb(job: Job): string | null {
  return job.images?.[0] ?? null;
}

export function JobMedia({ job, controls = false }: { job: Job; controls?: boolean }) {
  if (job.video) return <video src={job.video} muted={!controls} loop playsInline controls={controls} autoPlay={!controls} preload="metadata" />;
  if (job.images?.[0]) return <img src={job.images[0]} alt={job.prompt ?? job.label} loading="lazy" />;
  return null;
}

/** Lista de gerações com status, tempo e cancelamento (só enquanto estiver na fila). */
export function QueueList({
  jobs,
  empty = "Nada na fila ainda.",
  showModule = false,
  onSelect,
  selectedId,
}: {
  jobs: Job[];
  empty?: string;
  showModule?: boolean;
  onSelect?: (j: Job) => void;
  selectedId?: string;
}) {
  const { cancel } = useJobs();
  const [err, setErr] = useState<string | null>(null);
  if (!jobs.length) return <p className="muted small">{empty}</p>;
  return (
    <div className="queue">
      {err && <div className="error">{err}</div>}
      {jobs.map((j) => (
        <div
          className="queue-item"
          key={j.id}
          onClick={onSelect ? () => onSelect(j) : undefined}
          style={onSelect ? { cursor: "pointer", background: selectedId === j.id ? "var(--bg-2)" : undefined } : undefined}
        >
          <div className="thumb">
            {j.video ? <video src={j.video} muted preload="metadata" /> : j.images?.[0] ? <img src={j.images[0]} alt="" /> : TERMINAL.includes(j.status) ? "—" : <span className="spinner" />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="ellipsis" style={{ fontSize: 14 }}>{j.label}</div>
            <div className="muted small ellipsis">
              {showModule ? `${MODULE_LABELS[j.module]} · ` : ""}
              {ENDPOINT_LABELS[j.endpoint as Endpoint] ?? j.endpoint} · há {timeAgo(j.createdAt)}
            </div>
          </div>
          <div className="col" style={{ alignItems: "flex-end", gap: 4 }}>
            <StatusPill status={j.status} />
            {j.status === "queued" && (
              <button className="link" onClick={() => cancel(j.id).catch((e) => setErr(e.message))}>
                cancelar
              </button>
            )}
            {(j.video || j.images?.[0]) && (
              <a className="link" href={j.video ?? j.images![0]} target="_blank" rel="noopener">
                abrir
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Grade de resultados: cada imagem de cada job vira um tile. */
export function ResultsGrid({ jobs, animate = true, empty }: { jobs: Job[]; animate?: boolean; empty: React.ReactNode }) {
  const { toggleFavorite } = useJobs();
  const tiles = jobs.flatMap((j) => {
    if (!TERMINAL.includes(j.status)) return [{ job: j, url: null as string | null, i: 0 }];
    if (j.status !== "completed") return [];
    if (j.video) return [{ job: j, url: j.video, i: 0 }];
    return (j.images ?? []).map((url, i) => ({ job: j, url, i }));
  });

  if (!tiles.length) return <div className="empty">{empty}</div>;

  return (
    <div className="gallery">
      {tiles.map(({ job, url, i }) =>
        url ? (
          <div className="tile" key={`${job.id}-${i}`}>
            {job.video ? <video src={url} muted loop playsInline preload="metadata" onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} /> : <img src={url} alt={job.prompt ?? ""} loading="lazy" />}
            {job.video && <span className="kind">▶ Vídeo</span>}
            <button className={`fav ${job.favorite ? "on" : ""}`} onClick={() => toggleFavorite(job.id)} aria-label="Favoritar">
              ★
            </button>
            <div className="overlay">
              <button className="btn sm" onClick={() => downloadUrl(url, `hubd-${job.id}-${i}`)}>
                ↓ Baixar
              </button>
              {animate && !job.video && (
                <Link className="btn sm" href={`/video?image=${encodeURIComponent(url)}&prompt=${encodeURIComponent(job.prompt ?? "")}`}>
                  ▶ Animar
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="tile pending" key={job.id}>
            <div className="col" style={{ alignItems: "center" }}>
              <span className="spinner" />
              <StatusPill status={job.status} />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

/** Mostra o último job: player, estado de espera ou motivo da falha. */
export function JobPreview({ job, empty, aspect }: { job: Job | undefined; empty: React.ReactNode; aspect?: string }) {
  if (!job) return <div className="empty">{empty}</div>;
  if (!TERMINAL.includes(job.status)) {
    return (
      <div className="empty" style={aspect ? { aspectRatio: aspect.replace(":", " / "), minHeight: 0 } : undefined}>
        <div className="col" style={{ alignItems: "center" }}>
          <span className="spinner" style={{ width: 28, height: 28, color: "var(--accent)" }} />
          <StatusPill status={job.status} />
          <span className="small">Iniciado há {timeAgo(job.createdAt)} · vídeos levam de 1 a 5 min</span>
        </div>
      </div>
    );
  }
  if (job.status !== "completed" || (!job.video && !job.images?.length)) {
    return (
      <div className="empty">
        <div className="col" style={{ alignItems: "center", maxWidth: 420 }}>
          <StatusPill status={job.status} />
          <span className="small">{failureMessage(job)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="player">
        <JobMedia job={job} controls />
      </div>
      <div className="row between">
        <span className="muted small ellipsis">{job.prompt ?? job.label}</span>
        <button className="btn ghost sm" onClick={() => downloadUrl(job.video ?? job.images![0], `hubd-${job.id}`)}>
          ↓ Baixar
        </button>
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <div className="error" role="alert">{error}</div> : null;
}

/** Botão de gerar com custo ao lado, no rodapé dos painéis. */
export function GenerateBar({
  label,
  busy,
  disabled,
  onClick,
  cost,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  cost?: React.ReactNode;
}) {
  return (
    <div className="row" style={{ marginTop: 4 }}>
      {cost}
      <div className="grow" />
      <button className="btn" onClick={onClick} disabled={busy || disabled}>
        {busy ? <span className="spinner" /> : null}
        {label}
      </button>
    </div>
  );
}

/** Pega o job mais recente deste módulo (opcionalmente filtrado). */
export function useLatest(module: Job["module"], filter?: (j: Job) => boolean): Job | undefined {
  const { jobs } = useJobs();
  return jobs.find((j) => j.module === module && (!filter || filter(j)));
}
