"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatCredits } from "@/lib/client";
import { spentCredits, useJobs } from "./JobsProvider";

const TABS = [
  { href: "/", label: "Explorar" },
  { href: "/imagem", label: "Imagem" },
  { href: "/video", label: "Vídeo" },
  { href: "/motion", label: "Motion" },
  { href: "/canvas", label: "Canvas" },
  { href: "/avatar", label: "Avatar" },
  { href: "/genjutsu", label: "Genjutsu" },
  { href: "/frame-flow", label: "Frame Flow" },
];

export function Nav() {
  const path = usePathname();
  const { jobs } = useJobs();
  const running = jobs.filter((j) => j.status === "queued" || j.status === "in_progress").length;

  return (
    <header className="topbar">
      <Link href="/" className="logo">
        hubd<span>.</span>
      </Link>
      <nav className="tabs" aria-label="Módulos">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={path === t.href ? "active" : ""}>
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="top-right">
        {running > 0 && (
          <Link href="/conta" className="credits-pill" style={{ color: "var(--text)" }}>
            <span className="spinner" style={{ width: 11, height: 11, verticalAlign: -1 }} /> {running}<span className="hide-sm"> gerando</span>
          </Link>
        )}
        <Link href="/conta" className="credits-pill" title="Créditos estimados gastos neste navegador">
          ◆ {formatCredits(spentCredits(jobs))}<span className="hide-sm"> créditos usados</span>
        </Link>
        <Link href="/conta" className={`avatar-dot`} aria-label="Conta" style={path === "/conta" ? { borderColor: "var(--accent)" } : undefined}>
          FS
        </Link>
      </div>
    </header>
  );
}
