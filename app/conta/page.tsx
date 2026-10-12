"use client";

import { useCallback, useEffect, useState } from "react";
import { spentCredits, useJobs } from "@/components/JobsProvider";
import { StatusPill } from "@/components/ui";
import { api, formatCredits, timeAgo } from "@/lib/client";
import { ENDPOINT_LABELS, MODULE_LABELS, TERMINAL, type Endpoint, type ModuleKey } from "@/lib/models";

type Check = { name: string; usage: string; ok: boolean; ms: number | null; detail?: string };
type Health = { configured: boolean; checks: Check[] };

const CONSOLE_URL = "https://console.higgsfield.ai";

export default function ContaPage() {
  const { jobs, cancel, remove } = useJobs();
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(() => {
    setChecking(true);
    api<Health>("/api/health")
      .then(setHealth)
      .catch((e) => setErr(e.message))
      .finally(() => setChecking(false));
  }, []);

  useEffect(check, [check]);

  const spent = spentCredits(jobs);
  const completed = jobs.filter((j) => j.status === "completed");
  const byModule = Object.entries(
    completed.reduce<Record<string, { credits: number; count: number }>>((acc, j) => {
      const m = (acc[j.module] ??= { credits: 0, count: 0 });
      m.credits += j.credits ?? 0;
      m.count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(1, ...byModule.map(([, v]) => v.count));
  const failed = jobs.filter((j) => j.status === "failed" || j.status === "nsfw").length;
  const pending = jobs.filter((j) => !TERMINAL.includes(j.status)).length;

  return (
    <main className="page">
      <h1 className="title">Conta, créditos e integrações</h1>

      <div className="split" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <section className="panel">
          <span className="label">Créditos usados neste navegador (estimativa)</span>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 600, letterSpacing: -2, color: "var(--accent)" }}>{formatCredits(spent)}</div>
          <p className="muted small">
            {completed.length} gerações concluídas · {pending} em andamento · {failed} falharam (reembolsadas). Vídeos Seedance são cobrados por segundo e não entram nesta soma.
          </p>
          <div className="note">A API pública da Higgsfield não informa o saldo da conta. O saldo real e o extrato ficam no console.</div>
          <div className="row">
            <a className="btn" href={CONSOLE_URL} target="_blank" rel="noopener">
              Comprar créditos
            </a>
            <a className="btn ghost" href={CONSOLE_URL} target="_blank" rel="noopener">
              Ver extrato
            </a>
          </div>
        </section>

        <section className="panel">
          <h3 className="h">Consumo por módulo</h3>
          {byModule.length === 0 ? (
            <p className="muted small">Ainda não há gerações concluídas.</p>
          ) : (
            <div className="col" style={{ gap: 12 }}>
              {byModule.map(([m, v]) => (
                <div key={m} className="col" style={{ gap: 4 }}>
                  <div className="row between small">
                    <span>{MODULE_LABELS[m as ModuleKey]}</span>
                    <span className="muted">
                      {v.count} {v.count === 1 ? "geração" : "gerações"}
                      {v.credits ? ` · ≈ ${formatCredits(v.credits)} créditos` : ""}
                    </span>
                  </div>
                  <div className="bar">
                    <div style={{ width: `${(v.count / maxCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="row between">
          <h3 className="h">Status das integrações</h3>
          <button className="btn ghost sm" onClick={check} disabled={checking}>
            {checking ? <span className="spinner" /> : "↻"} Verificar
          </button>
        </div>
        {err && <div className="error">{err}</div>}
        {health && !health.configured && <div className="error">HF_CREDENTIALS não está configurado no servidor. Defina a variável no Vercel (ou no .env.local).</div>}
        <div style={{ overflowX: "auto" }}>
          <table className="t">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Uso no hubd</th>
                <th>Status</th>
                <th>Latência</th>
              </tr>
            </thead>
            <tbody>
              {(health?.checks ?? []).map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="muted">{c.usage}</td>
                  <td>
                    <span className={`status ${c.ok ? (c.ms && c.ms > 3000 ? "in_progress" : "completed") : "failed"}`}>{c.ok ? (c.ms && c.ms > 3000 ? "Lento" : "Online") : `Falha${c.detail ? ` · ${c.detail}` : ""}`}</span>
                  </td>
                  <td className="muted">{c.ms != null ? (c.ms >= 1000 ? `${(c.ms / 1000).toFixed(1).replace(".", ",")} s` : `${c.ms} ms`) : "—"}</td>
                </tr>
              ))}
              {!health && (
                <tr>
                  <td colSpan={4} className="muted">
                    Verificando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3 className="h">Fila e histórico de gerações</h3>
        <p className="muted small">Guardado neste navegador. As mídias ficam disponíveis na Higgsfield por pelo menos 7 dias; baixe o que quiser manter.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="t">
            <thead>
              <tr>
                <th>Geração</th>
                <th>Módulo</th>
                <th>Modelo</th>
                <th>Status</th>
                <th>Créditos</th>
                <th>Quando</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 100).map((j) => (
                <tr key={j.id}>
                  <td style={{ maxWidth: 320 }}>
                    <div className="ellipsis">{j.label}</div>
                  </td>
                  <td>{MODULE_LABELS[j.module]}</td>
                  <td className="muted">{ENDPOINT_LABELS[j.endpoint as Endpoint] ?? j.endpoint}</td>
                  <td>
                    <StatusPill status={j.status} />
                  </td>
                  <td className="muted">{formatCredits(j.credits)}</td>
                  <td className="muted">{timeAgo(j.createdAt)}</td>
                  <td>
                    <div className="row" style={{ gap: 12 }}>
                      {(j.video || j.images?.[0]) && (
                        <a className="link" href={j.video ?? j.images![0]} target="_blank" rel="noopener">
                          abrir
                        </a>
                      )}
                      {j.status === "queued" && (
                        <button className="link" onClick={() => cancel(j.id).catch((e) => setErr(e.message))}>
                          cancelar
                        </button>
                      )}
                      {TERMINAL.includes(j.status) && (
                        <button className="muted small" onClick={() => remove(j.id)} title="Remover do histórico">
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!jobs.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    Nenhuma geração ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
