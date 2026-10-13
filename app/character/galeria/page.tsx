"use client";

import { useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { ResultsGrid } from "@/components/ui";

export default function GaleriaPage() {
  const { jobs } = useJobs();
  const [q, setQ] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);

  const term = q.trim().toLowerCase();
  const list = jobs.filter(
    (j) =>
      j.module === "character" &&
      j.status === "completed" &&
      (!onlyFav || j.favorite) &&
      (j.label.toLowerCase().includes(term) || (j.prompt ?? "").toLowerCase().includes(term)),
  );

  return (
    <main className="ch-page">
      <div className="ch-head">
        <h1 className="ch-h1">Galeria</h1>
        <input className="ch-search" style={{ maxWidth: 300 }} placeholder="Buscar personagem ou vídeo" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row" style={{ gap: 10, cursor: "pointer" }}>
          <button
            type="button"
            role="switch"
            aria-checked={onlyFav}
            className={`ch-switch ${onlyFav ? "on" : ""}`}
            onClick={() => setOnlyFav((v) => !v)}
            aria-label="Só favoritos"
          />
          <span>Só favoritos</span>
        </label>
        <span className="ch-hintline" style={{ marginLeft: "auto" }}>
          Cada vídeo pronto fica disponível para baixar por 30 dias. Baixe os que quiser guardar.
        </span>
      </div>

      <ResultsGrid
        jobs={list}
        animate={false}
        empty={
          <div className="col" style={{ alignItems: "center", gap: 6 }}>
            <strong style={{ color: "var(--text)", fontSize: 16 }}>Nenhum vídeo pronto ainda</strong>
            <span>Cada vídeo pronto aparece aqui para baixar.</span>
          </div>
        }
      />
    </main>
  );
}
