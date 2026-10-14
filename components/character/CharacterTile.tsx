"use client";

import { coverImage, type Character } from "@/lib/character";

export function CharacterTile({ c, selected, onClick, big }: { c: Character; selected?: boolean; onClick?: () => void; big?: boolean }) {
  const cover = coverImage(c);
  const n = c.images.length;
  return (
    <button type="button" className={`ch-char ${selected ? "on" : ""} ${big ? "big" : ""}`} onClick={onClick} title={c.name}>
      {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="ph">?</span>}
      {selected && <span className="ch-check">✓</span>}
      <span className="nm">
        {c.name}
        <span className="sub">
          {n} {n === 1 ? "imagem" : "imagens"}
          {c.temporary ? " · temporária" : ""}
        </span>
      </span>
    </button>
  );
}
