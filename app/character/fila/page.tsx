"use client";

import Link from "next/link";
import { useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { QueueList } from "@/components/ui";
import { TERMINAL, type RequestStatus } from "@/lib/models";

const TABS: { key: string; label: string; match: (s: RequestStatus) => boolean; empty: string }[] = [
  { key: "rodando", label: "Rodando", match: (s) => !TERMINAL.includes(s), empty: "Nada rodando agora" },
  { key: "erro", label: "Com erro", match: (s) => s === "failed" || s === "nsfw" || s === "canceled", empty: "Nenhum erro" },
  { key: "prontos", label: "Prontos", match: (s) => s === "completed", empty: "Nada pronto ainda" },
  { key: "todos", label: "Todos", match: () => true, empty: "Nada gerado ainda" },
];

export default function FilaPage() {
  const { jobs } = useJobs();
  const [tab, setTab] = useState("rodando");
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const list = jobs.filter((j) => j.module === "character" && current.match(j.status));

  return (
    <main className="ch-page">
      <div className="ch-head">
        <h1 className="ch-h1">Fila</h1>
        <div className="ch-chips" style={{ marginLeft: 12 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {list.length ? (
        <div className="ch-box">
          <QueueList jobs={list} showModule={false} />
        </div>
      ) : (
        <div className="empty" style={{ minHeight: 240 }}>
          <div className="col" style={{ alignItems: "center", gap: 10 }}>
            <strong style={{ color: "var(--text)", fontSize: 16 }}>{current.empty}</strong>
            <span>Gere vídeos no Estúdio. Eles aparecem aqui com o progresso de cada etapa.</span>
            <Link href="/character" className="ch-btn" style={{ marginTop: 6 }}>
              Ir para o Estúdio
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
