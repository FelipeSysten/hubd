"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { ResultsGrid } from "@/components/ui";
import type { ModuleKey } from "@/lib/models";

const TOOLS = [
  { href: "/imagem", ico: "✦", title: "Image Generation", text: "Texto e referência viram imagem." },
  { href: "/video", ico: "▶", title: "Video Generation", text: "Prompt ou frame inicial vira vídeo." },
  { href: "/motion", ico: "∿", title: "Motion Control", text: "Movimento de um vídeo num personagem." },
  { href: "/canvas", ico: "⌘", title: "Kling Canvas", text: "Fluxos em nós, guiados por agente.", badge: "Agente" },
  { href: "/avatar", ico: "☺", title: "Avatar 2.0", text: "Avatar falante com roteiro e voz." },
  { href: "/genjutsu", ico: "✺", title: "Genjutsu", text: "Efeitos prontos sobre o seu vídeo." },
  { href: "/frame-flow", ico: "◈", title: "Frame Flow", text: "Estilos guiados a partir de uma ideia." },
];

const FILTERS: { key: string; label: string; modules?: ModuleKey[]; kind?: "image" | "video" }[] = [
  { key: "all", label: "Tudo" },
  { key: "img", label: "Imagens", kind: "image" },
  { key: "vid", label: "Vídeos", kind: "video" },
  { key: "gen", label: "Genjutsu", modules: ["genjutsu"] },
  { key: "ff", label: "Frame Flow", modules: ["frameflow"] },
];

export default function Explorar() {
  const router = useRouter();
  const { jobs } = useJobs();
  const [prompt, setPrompt] = useState("");
  const [target, setTarget] = useState<"imagem" | "video">("imagem");
  const [filter, setFilter] = useState("all");

  const f = FILTERS.find((x) => x.key === filter)!;
  const feed = jobs
    .filter((j) => j.status === "completed")
    .filter((j) => (f.modules ? f.modules.includes(j.module) : true))
    .filter((j) => (f.kind === "video" ? !!j.video : f.kind === "image" ? !j.video : true))
    .slice(0, 60);

  function create(e: React.FormEvent) {
    e.preventDefault();
    const q = prompt.trim() ? `?prompt=${encodeURIComponent(prompt.trim())}` : "";
    router.push(`/${target}${q}`);
  }

  return (
    <main className="page">
      <section className="hero">
        <h1>O que vamos criar hoje?</h1>
        <form className="searchbar" onSubmit={create}>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Descreva uma imagem ou um vídeo…" aria-label="Prompt" />
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value as "imagem" | "video")} aria-label="Tipo">
            <option value="imagem">Imagem</option>
            <option value="video">Vídeo</option>
          </select>
          <button className="btn" type="submit">
            Criar
          </button>
        </form>
      </section>

      <section className="tools">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="tool">
            <div className="row between">
              <span className="ico">{t.ico}</span>
              {t.badge && <span className="badge">{t.badge}</span>}
            </div>
            <b style={{ fontSize: 16 }}>{t.title} →</b>
            <span className="muted small">{t.text}</span>
          </Link>
        ))}
      </section>

      <section className="col" style={{ gap: 14 }}>
        <div className="row between wrap">
          <h2 className="h">Suas criações</h2>
          <div className="chips">
            {FILTERS.map((x) => (
              <button key={x.key} className={`chip ${filter === x.key ? "on" : ""}`} onClick={() => setFilter(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <ResultsGrid
          jobs={feed}
          empty={
            <div className="col" style={{ alignItems: "center" }}>
              <b>Nada por aqui ainda.</b>
              <span className="small">Tudo que você gerar em qualquer módulo aparece neste feed.</span>
            </div>
          }
        />
      </section>
    </main>
  );
}
