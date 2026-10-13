"use client";

import { useState } from "react";
import { CharacterTile } from "@/components/character/CharacterTile";
import { CreateCharacterModal } from "@/components/character/CreateCharacterModal";
import { useCharacters } from "@/components/character/CharacterProvider";
import { SAMPLE_CHARACTERS, type Character } from "@/lib/character";

export default function PersonagensPage() {
  const { library, loaded, updateCharacter, removeCharacter, addFolder, removeFolder, requestViews } = useCharacters();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string>("todos");
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ name: string; description: string } | null>(null);

  const selected = library.characters.find((c) => c.id === selectedId) ?? null;
  const term = q.trim().toLowerCase();
  const list = library.characters.filter((c) => (folder === "todos" || c.folder === folder) && c.name.toLowerCase().includes(term));

  return (
    <main className="ch-page">
      <div className="ch-head">
        <h1 className="ch-h1">
          Personagens <small>{library.characters.length}</small>
        </h1>
        <input className="ch-search" style={{ maxWidth: 300 }} placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="ch-btn" style={{ marginLeft: "auto" }} onClick={() => setModal({ name: "", description: "" })}>
          + Criar personagem
        </button>
      </div>

      <div className="ch-head">
        <div className="ch-chips">
          <button type="button" className={folder === "todos" ? "on" : ""} onClick={() => setFolder("todos")}>
            Todos {library.characters.length}
          </button>
          {library.folders.map((f) => (
            <button key={f} type="button" className={folder === f ? "on" : ""} onClick={() => setFolder(f)}>
              {f} {library.characters.filter((c) => c.folder === f).length}
            </button>
          ))}
          {newFolder === null ? (
            <button type="button" className="add" onClick={() => setNewFolder("")}>
              + Nova pasta
            </button>
          ) : (
            <input
              className="ch-search"
              style={{ width: 160, padding: "6px 10px" }}
              autoFocus
              placeholder="Nome da pasta"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNewFolder(null);
                if (e.key === "Enter" && newFolder.trim()) {
                  addFolder(newFolder.trim());
                  setFolder(newFolder.trim());
                  setNewFolder(null);
                }
              }}
              onBlur={() => setNewFolder(null)}
            />
          )}
        </div>
        {folder !== "todos" && (
          <button
            type="button"
            className="ch-btn ghost sm"
            onClick={() => {
              removeFolder(folder);
              setFolder("todos");
            }}
          >
            Excluir pasta “{folder}”
          </button>
        )}
      </div>

      {selected && (
        <SelectedBar
          key={selected.id}
          c={selected}
          folders={library.folders}
          onRename={(name) => updateCharacter(selected.id, { name })}
          onFavorite={() => updateCharacter(selected.id, { favorite: !selected.favorite })}
          onFolder={(f) => updateCharacter(selected.id, { folder: f })}
          onViews={() => requestViews(selected, true)}
          onDelete={() => {
            removeCharacter(selected.id);
            setSelectedId(null);
          }}
        />
      )}

      <div className="ch-chars big">
        <button type="button" className="ch-char new big" onClick={() => setModal({ name: "", description: "" })}>
          <span className="plus">+</span>
          Criar
        </button>
        {list.map((c) => (
          <CharacterTile key={c.id} c={c} big selected={c.id === selectedId} onClick={() => setSelectedId(c.id === selectedId ? null : c.id)} />
        ))}
      </div>

      {loaded && !library.characters.length && (
        <div className="ch-box col" style={{ gap: 12 }}>
          <p className="ch-hintline">Nenhum personagem ainda. Crie um pela descrição ou comece por um dos exemplos:</p>
          <div className="ch-samples">
            {SAMPLE_CHARACTERS.map((s) => (
              <button key={s.name} type="button" onClick={() => setModal(s)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {modal && <CreateCharacterModal initial={modal} onClose={() => setModal(null)} />}
    </main>
  );
}

function SelectedBar({
  c,
  folders,
  onRename,
  onFavorite,
  onFolder,
  onViews,
  onDelete,
}: {
  c: Character;
  folders: string[];
  onRename: (name: string) => void;
  onFavorite: () => void;
  onFolder: (f: string | null) => void;
  onViews: () => void;
  onDelete: () => void;
}) {
  const hasViews = c.images.some((i) => i.view !== "card" && i.view !== "upload") || Object.keys(c.pendingViews ?? {}).length > 0;
  return (
    <div className="ch-box ch-actionbar">
      <input
        className="ch-input"
        style={{ maxWidth: 260 }}
        defaultValue={c.name}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== c.name) onRename(v);
        }}
      />
      <button type="button" className="ch-btn ghost sm" onClick={onFavorite}>
        {c.favorite ? "★ Favorito" : "☆ Favoritar"}
      </button>
      <select className="ch-select" style={{ maxWidth: 200 }} value={c.folder ?? ""} onChange={(e) => onFolder(e.target.value || null)}>
        <option value="">Sem pasta</option>
        {folders.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {!hasViews && (
        <button type="button" className="ch-btn ghost sm" onClick={onViews}>
          Gerar vistas (frente, perfil, 3/4)
        </button>
      )}
      <button
        type="button"
        className="ch-btn ghost sm"
        style={{ marginLeft: "auto", color: "var(--red)" }}
        onClick={() => {
          if (window.confirm(`Excluir ${c.name}? As imagens não voltam.`)) onDelete();
        }}
      >
        Excluir
      </button>
    </div>
  );
}
