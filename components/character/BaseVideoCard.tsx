"use client";

import type { BaseVideo } from "@/lib/character";

/** Cartão de vídeo base: clique para marcar/desmarcar. Mostra origem, duração e resolução. */
export function BaseVideoCard({
  v,
  selected,
  onToggle,
  onRemove,
}: {
  v: BaseVideo;
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`ch-vid ${selected ? "on" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <video src={v.url} muted preload="metadata" playsInline />
      <div className="meta">
        <span className="title" title={v.name}>
          {v.name}
        </span>
        <div className="ch-chiprow">
          {v.seconds > 0 && <span className="ch-tag">{Math.round(v.seconds)} s</span>}
          {v.height > 0 && <span className="ch-tag">{v.height}p</span>}
          {v.source && <span className="ch-tag">{v.source}</span>}
        </div>
      </div>
      <div className="ch-vid-actions" onClick={(e) => e.stopPropagation()}>
        <a className="ch-icon" href={v.url} target="_blank" rel="noopener" aria-label="Abrir vídeo">
          ↗
        </a>
        <button type="button" className="ch-icon" aria-label="Remover vídeo" onClick={onRemove}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          </svg>
        </button>
      </div>
      {selected && <span className="ch-check">✓</span>}
    </div>
  );
}
