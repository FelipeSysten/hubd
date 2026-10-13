"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useJobs, type Job } from "@/components/JobsProvider";
import { useProviders } from "@/components/ui";
import { formatCredits } from "@/lib/client";

const TABS = [
  { href: "/character", label: "Estúdio" },
  { href: "/character/personagens", label: "Personagens" },
  { href: "/character/fila", label: "Fila" },
  { href: "/character/galeria", label: "Galeria" },
  { href: "/character/config", label: "Configurações" },
];

function sumSince(jobs: Job[], since: number) {
  return jobs.reduce((s, j) => s + (j.module === "character" && j.status === "completed" && j.createdAt >= since && j.credits ? j.credits : 0), 0);
}

export function CharacterHeader() {
  const path = usePathname();
  const { jobs } = useJobs();
  const providers = useProviders();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const running = jobs.filter((j) => j.module === "character" && (j.status === "queued" || j.status === "in_progress")).length;

  return (
    <>
      <header className="ch-top">
        <Link href="/character" className="ch-logo">
          Character
        </Link>
        <nav className="ch-tabs" aria-label="Character">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={path === t.href ? "on" : ""}>
              {t.label}
              {t.href === "/character/fila" && running > 0 && <span className="ch-count">{running}</span>}
            </Link>
          ))}
        </nav>
        <div className="ch-right">
          <span className="ch-meter">
            Hoje <b>{formatCredits(sumSince(jobs, today))}</b> cr
          </span>
          <span className="ch-meter">
            Mês <b>{formatCredits(sumSince(jobs, month))}</b> cr
          </span>
          <Link href="/character/config" className={`ch-hf ${providers?.higgsfield === false ? "off" : ""}`}>
            <span className="dot" /> Higgsfield API
          </Link>
          <Link href="/" className="ch-exit">
            hubd
          </Link>
        </div>
      </header>
      {providers && !providers.higgsfield && (
        <div className="ch-banner">
          <span>A chave da API Higgsfield (HF_CREDENTIALS) não está configurada no servidor. Sem ela não dá para criar personagens nem gerar vídeos.</span>
          <Link href="/character/config" className="ch-btn ghost sm">
            Ver configurações
          </Link>
        </div>
      )}
      {providers && providers.higgsfield && providers.media === null && (
        <div className="ch-banner">
          <span>As imagens dos personagens estão só na CDN da Higgsfield e expiram em cerca de 7 dias. Conecte o Vercel Blob (gratuito) para guardá-las de vez.</span>
          <Link href="/character/config" className="ch-btn ghost sm">
            Como resolver
          </Link>
        </div>
      )}
    </>
  );
}
