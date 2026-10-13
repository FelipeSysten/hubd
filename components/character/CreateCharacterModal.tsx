"use client";

import { useState } from "react";
import { useJobs, failureMessage, type Job } from "@/components/JobsProvider";
import { publicRefs, useCharacters } from "@/components/character/CharacterProvider";
import { CostEstimate, ErrorNote, Select, StatusPill, UploadBox } from "@/components/ui";
import { CREATE_MODELS, cardPrompt, cardRequest, type Character } from "@/lib/character";
import { TERMINAL } from "@/lib/models";

const SLOTS = 3;

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Cria um personagem pela descrição: gera 2 ou 4 cards, você salva o que gostar. */
export function CreateCharacterModal({ onClose, initial }: { onClose: () => void; initial?: { name: string; description: string } }) {
  const { settings, addCharacter, persist, requestViews } = useCharacters();
  const { jobs, submit } = useJobs();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [slots, setSlots] = useState<(string | null)[]>(Array(SLOTS).fill(null));
  const [model, setModel] = useState(settings.createModel);
  const [count, setCount] = useState<2 | 4>(2);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = CREATE_MODELS.find((m) => m.endpoint === model) ?? CREATE_MODELS[0];
  const refs = slots.filter((u): u is string => !!u);
  const prompt = cardPrompt(description || name || "a person", true);
  const mine = jobs.filter((j) => jobIds.includes(j.id)).sort((a, b) => b.createdAt - a.createdAt);
  const canGenerate = !!name.trim() && !!description.trim() && !busy;

  function setSlot(i: number, url: string | null) {
    setSlots((prev) => prev.map((u, k) => (k === i ? url : u)));
  }

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const refUrls = refs.length ? await publicRefs(refs) : [];
      const { endpoint, input } = cardRequest(model, prompt, refUrls);
      const created: string[] = [];
      // Um por vez: cada opção é uma cobrança separada na Higgsfield.
      for (let i = 0; i < count; i++) {
        const job = await submit({ module: "character", endpoint, input, label: `Card · ${name.trim()}`, prompt: name.trim() });
        created.push(job.id);
      }
      setJobIds((prev) => [...created, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  async function save(job: Job) {
    const url = job.images?.[0];
    if (!url) return;
    setSaving(job.id);
    setError(null);
    try {
      // Guarda a foto escolhida e as referências enviadas (a CDN da Higgsfield expira).
      const card = await persist(url);
      const uploads = await Promise.all(refs.map((u) => persist(u)));
      const character: Character = {
        id: newId(),
        name: name.trim(),
        description: description.trim(),
        images: [
          { url: card.url, view: "card" },
          ...uploads.map((u) => ({ url: u.url, view: "upload" as const })),
        ],
        source: "created",
        temporary: !card.durable,
        createdAt: Date.now(),
      };
      addCharacter(character);
      // As vistas para vídeo (frente, perfil, 3/4) saem depois, a partir do card salvo.
      await requestViews(character, true);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="ch-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ch-modal" role="dialog" aria-modal="true" aria-label="Criar personagem">
        <div className="ch-modal-head">
          Criar personagem
          <button className="ch-x" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="ch-modal-grid">
          <div className="ch-modal-left">
            <div>
              <label className="ch-label" htmlFor="ch-name">Nome</label>
              <input id="ch-name" className="ch-input" placeholder="Ex.: Archibald Brown" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="ch-label" htmlFor="ch-desc">Como ele é</label>
              <textarea
                id="ch-desc"
                className="ch-textarea"
                placeholder="Ex.: homem de 60 anos, cabelo grisalho, bigode branco, terno azul-marinho. Pode escrever em português."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="ch-hintline">
                O personagem sai da sua descrição e das imagens de referência. Não cite nomes de personagens famosos nem de pessoas reais: a moderação costuma recusar.
              </p>
            </div>
            <div>
              <span className="ch-label">Imagens de referência (opcional, até {SLOTS})</span>
              <div className="ch-refs">
                {slots.map((url, i) => (
                  <UploadBox key={i} kind="image" value={url} onChange={(u) => setSlot(i, u)} label="Anexar" height={130} />
                ))}
              </div>
              <p className="ch-hintline">
                Foto, desenho ou print de quem é o personagem. {meta.editsWithRefs ? "" : "Este modelo só usa a referência como orientação, sem garantir o rosto."}
              </p>
            </div>
            <div>
              <span className="ch-label">Modelo</span>
              <Select value={model} options={CREATE_MODELS.map((m) => m.endpoint)} onChange={setModel} format={(e) => CREATE_MODELS.find((m) => m.endpoint === e)?.label ?? e} />
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <span className="ch-tag" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>Série Amarela</span>
                <span className="ch-tag">até 4 opções</span>
              </div>
            </div>
            <div>
              <span className="ch-label">Opções para gerar</span>
              <div className="ch-chips">
                {([2, 4] as const).map((n) => (
                  <button key={n} type="button" className={count === n ? "on" : ""} onClick={() => setCount(n)}>
                    {n} cards
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ch-modal-right">
            <span className="ch-label">Resultados</span>
            {!mine.length && (
              <div className="ch-box ch-hintline" style={{ textAlign: "center", padding: 40 }}>
                <strong style={{ color: "var(--text)", display: "block", fontSize: 16, marginBottom: 8 }}>Nada gerado ainda</strong>
                Descreva o personagem, escolha quantas opções quer e clique em Gerar. Cada opção aparece aqui assim que fica pronta: salve a que gostar.
              </div>
            )}
            <div className="ch-opts">
              {mine.map((job) => {
                const done = job.status === "completed" && !!job.images?.[0];
                const finished = TERMINAL.includes(job.status);
                return (
                  <div className="ch-opt" key={job.id}>
                    <div className="pic">
                      {done ? <img src={job.images![0]} alt={name} /> : finished ? failureMessage(job) : <span className="spinner" />}
                    </div>
                    <div className="acts">
                      {done ? (
                        <>
                          <button className="ch-btn sm" disabled={saving === job.id} onClick={() => save(job)}>
                            {saving === job.id ? "Salvando…" : "Salvar"}
                          </button>
                          <button className="ch-btn ghost sm" onClick={() => setJobIds((ids) => ids.filter((id) => id !== job.id))}>
                            Descartar
                          </button>
                        </>
                      ) : (
                        <StatusPill status={job.status} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ch-modal-foot">
          <span>
            {meta.label} · <CostEstimate endpoint={model} input={cardRequest(model, prompt, []).input} times={count} waiting="custo ao gerar" /> · usa créditos do seu Higgsfield
          </span>
          <button className="ch-btn" onClick={generate} disabled={!canGenerate}>
            {busy ? <span className="spinner" /> : null}
            Gerar {count} opções
          </button>
        </div>
        {error && (
          <div style={{ padding: "0 22px 14px" }}>
            <ErrorNote error={error} />
          </div>
        )}
      </div>
    </div>
  );
}
