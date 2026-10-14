"use client";

import Link from "next/link";
import { useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { BaseVideoCard } from "@/components/character/BaseVideoCard";
import { CharacterTile } from "@/components/character/CharacterTile";
import { CreateCharacterModal } from "@/components/character/CreateCharacterModal";
import { publicRefs, useCharacters } from "@/components/character/CharacterProvider";
import { CostEstimate, ErrorNote, JobPreview, Segmented, Select, UploadBox, useVideoDuration } from "@/components/ui";
import { downloadUrl, post } from "@/lib/client";
import type { LinkPreview } from "@/lib/download";
import {
  referenceImages,
  studioImages,
  swapCredits,
  swapInput,
  SWAP_MODELS,
  VIDEO_MAX_S,
  VIDEO_MIN_S,
  VIEW_LABELS,
  type BaseVideo,
} from "@/lib/character";
import { RESOLUTIONS, type Endpoint } from "@/lib/models";

type Filter = "todos" | "favoritos" | "biblioteca" | "criados";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "favoritos", label: "★" },
  { key: "biblioteca", label: "Biblioteca" },
  { key: "criados", label: "Criados" },
];
const SWAP_ENDPOINTS: string[] = SWAP_MODELS.map((m) => m.endpoint);

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sourceOf(url: string): string {
  if (/instagram\.com|instagr\.am/i.test(url)) return "Instagram";
  if (/tiktok\.com/i.test(url)) return "TikTok";
  return "Link";
}

export default function CharacterStudio() {
  const { library, loaded, settings, setSettings, videos, addVideo, removeVideo } = useCharacters();
  const { jobs, submit } = useJobs();

  const [filter, setFilter] = useState<Filter>("todos");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Vídeos base: a lista vem da biblioteca (sincronizada). Clicar marca/desmarca.
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const video: BaseVideo | null = videos.find((v) => v.id === selectedVideoId) ?? null;
  const videoUrl = video?.url ?? null;
  const duration = useVideoDuration(videoUrl);

  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<(LinkPreview & { url: string }) | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [customPrompt, setCustomPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  const character = library.characters.find((c) => c.id === selectedId) ?? null;
  const term = q.trim().toLowerCase();
  const list = library.characters.filter((c) => {
    const byFilter =
      filter === "todos" ||
      (filter === "favoritos" && !!c.favorite) ||
      (filter === "biblioteca" && c.source !== "created") ||
      (filter === "criados" && c.source === "created");
    return byFilter && c.name.toLowerCase().includes(term);
  });

  const swapJobs = jobs.filter((j) => j.module === "character" && SWAP_ENDPOINTS.includes(j.endpoint));
  const shown = lastJobId ? swapJobs.find((j) => j.id === lastJobId) : swapJobs[0];

  const tooShort = duration != null && duration < VIDEO_MIN_S;
  const ready = !!character && referenceImages(character).length > 0 && !!videoUrl && !tooShort && !busy;
  const effectivePrompt = customPrompt ? prompt : "";
  const estimateInput = character && videoUrl ? swapInput(videoUrl, referenceImages(character), effectivePrompt, settings.resolution) : null;

  function addBaseVideo(url: string, name: string, source: string, extra: Partial<BaseVideo> = {}) {
    const v: BaseVideo = { id: newId(), name, url, source, seconds: 0, width: 0, height: 0, createdAt: Date.now(), ...extra };
    addVideo(v);
    setSelectedVideoId(v.id);
  }

  async function previewLink() {
    setImportError(null);
    setPreviewing(true);
    try {
      const info = await post<LinkPreview>("/api/media/preview", { url: link });
      setPreview({ ...info, url: link.trim() });
    } catch (e) {
      setPreview(null);
      setImportError(e instanceof Error ? e.message : "Falha ao ler o link.");
    } finally {
      setPreviewing(false);
    }
  }

  async function importPreview() {
    if (!preview) return;
    setImportError(null);
    setImporting(true);
    try {
      const v = await post<{ url: string; seconds: number; width: number; height: number }>("/api/media/import", { url: preview.url });
      addBaseVideo(v.url, preview.title, sourceOf(preview.url), { seconds: v.seconds, width: v.width, height: v.height });
      setPreview(null);
      setLink("");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Falha ao baixar o link.");
    } finally {
      setImporting(false);
    }
  }

  async function generate() {
    if (!character || !videoUrl) return;
    setError(null);
    setBusy(true);
    try {
      const refs = await publicRefs(referenceImages(character));
      const input = swapInput(videoUrl, refs, effectivePrompt, settings.resolution);
      // Genjutsu cobra por segundo: o servidor não consegue calcular, então o navegador envia o custo.
      const est = await post<{ rates?: Record<string, number> | null }>("/api/estimate", { endpoint: settings.swapModel, input }).catch(() => null);
      const credits = est ? swapCredits(est.rates, duration ?? 0, settings.resolution) : null;
      const job = await submit({
        module: "character",
        endpoint: settings.swapModel,
        input,
        label: `Troca · ${character.name}`,
        prompt: character.name,
        credits,
      });
      setLastJobId(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="ch-studio">
        {/* 1 · Personagem */}
        <section className="ch-col">
          <div className="ch-col-head">
            <span className="ch-num">1</span>
            <span className="ch-col-title">Personagem</span>
            <span className="ch-col-hint">
              {character ? "1 escolhido · " : "clique para escolher"}
              {character && (
                <button type="button" className="ch-linkbtn" onClick={() => setSelectedId(null)}>
                  limpar
                </button>
              )}
            </span>
          </div>
          <div className="ch-col-body">
            {character && (
              <div className="ch-selected">
                <div className="row between">
                  <strong style={{ fontSize: 15 }}>{character.name}</strong>
                  <Link href="/character/personagens" className="ch-link">
                    ficha
                  </Link>
                </div>
                {studioImages(character).length ? (
                  <div className="ch-views">
                    {studioImages(character).map((img) => (
                      <figure key={img.url}>
                        <img src={img.url} alt={`${character.name} · ${VIEW_LABELS[img.view]}`} />
                        <figcaption>{VIEW_LABELS[img.view]}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <span className="ch-hintline">Este personagem ainda não tem imagens.</span>
                )}
              </div>
            )}
            <input className="ch-search" placeholder="Buscar personagem" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="ch-chips">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="ch-chars">
              <button type="button" className="ch-char new" onClick={() => setCreating(true)}>
                <span className="plus">+</span>
                Criar
              </button>
              {list.map((c) => (
                <CharacterTile key={c.id} c={c} selected={c.id === selectedId} onClick={() => setSelectedId(c.id === selectedId ? null : c.id)} />
              ))}
            </div>
            {loaded && !library.characters.length && (
              <p className="ch-hintline">Você ainda não tem personagens. Crie um pela descrição ou pelas imagens de referência.</p>
            )}
          </div>
        </section>

        {/* 2 · Vídeo base */}
        <section className="ch-col">
          <div className="ch-col-head">
            <span className="ch-num">2</span>
            <span className="ch-col-title">Vídeo base</span>
            <span className="ch-col-hint">
              {video ? "1 escolhido · " : "arraste para a janela"}
              {video && (
                <button type="button" className="ch-linkbtn" onClick={() => setSelectedVideoId(null)}>
                  limpar
                </button>
              )}
            </span>
          </div>
          <div className="ch-col-body">
            <UploadBox
              kind="video"
              value={null}
              onChange={(u) => u && addBaseVideo(u, "Vídeo enviado", "Arquivo")}
              label={`Solte ou escolha vídeo de ${VIDEO_MIN_S} a ${VIDEO_MAX_S} s`}
              hint="MP4, até 200 MB"
              height={130}
            />
            <div className="ch-linkrow">
              <input
                className="ch-input"
                placeholder={`Cole o link do TikTok ou Instagram (vídeo de ${VIDEO_MIN_S} a ${VIDEO_MAX_S} s)`}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && link.trim() && !previewing && previewLink()}
              />
              <button type="button" className="ch-btn ghost sm" onClick={previewLink} disabled={!link.trim() || previewing}>
                {previewing ? <span className="spinner" /> : null}
                Visualizar
              </button>
            </div>
            <ErrorNote error={importError} />
            {preview && (
              <div className="ch-preview">
                {preview.thumbnail ? <img src={preview.thumbnail} alt="" referrerPolicy="no-referrer" /> : <div className="ph">▶</div>}
                <div className="col" style={{ minWidth: 0, gap: 4 }}>
                  <strong style={{ fontSize: 14, lineHeight: 1.3 }}>{preview.title}</strong>
                  <span className="ch-hintline">
                    {preview.uploader ? `${preview.uploader} · ` : ""}
                    {preview.seconds > 0 ? `${Math.round(preview.seconds)} s` : "duração na importação"}
                    {preview.width ? ` · ${preview.width}×${preview.height}` : ""}
                  </span>
                  {preview.seconds > 0 && preview.seconds < VIDEO_MIN_S && <ErrorNote error={`Vídeo com menos de ${VIDEO_MIN_S} s: não serve para a troca.`} />}
                  <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    <button type="button" className="ch-btn sm" onClick={importPreview} disabled={importing}>
                      {importing ? <span className="spinner" /> : null}
                      ↓ Baixar
                    </button>
                    <button type="button" className="ch-btn ghost sm" onClick={() => setPreview(null)} disabled={importing}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {videos.length > 0 && (
              <div className="ch-vids">
                {videos.map((v) => (
                  <BaseVideoCard
                    key={v.id}
                    v={v}
                    selected={v.id === selectedVideoId}
                    onToggle={() => setSelectedVideoId((cur) => (cur === v.id ? null : v.id))}
                    onRemove={() => {
                      removeVideo(v.id);
                      if (selectedVideoId === v.id) setSelectedVideoId(null);
                    }}
                  />
                ))}
              </div>
            )}

            {video && (
              <button type="button" className="ch-btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => downloadUrl(video.url, `${video.name.slice(0, 40) || "video-base"}.mp4`)}>
                ↓ Baixar arquivo
              </button>
            )}
            {tooShort && <ErrorNote error={`Este vídeo tem ${duration!.toFixed(1)} s. O mínimo é ${VIDEO_MIN_S} s.`} />}
            {duration != null && duration > VIDEO_MAX_S && (
              <p className="ch-hintline">Vídeo com {Math.round(duration)} s: a troca usa só os primeiros {VIDEO_MAX_S} s.</p>
            )}
          </div>
        </section>

        {/* 3 · Gerar */}
        <section className="ch-col">
          <div className="ch-col-head">
            <span className="ch-num">3</span>
            <span className="ch-col-title">Gerar</span>
          </div>
          <div className="ch-col-body">
            <div>
              <span className="ch-label">Modelo</span>
              <Select
                value={settings.swapModel}
                options={SWAP_MODELS.map((m) => m.endpoint)}
                onChange={(e: Endpoint) => setSettings({ ...settings, swapModel: e })}
                format={(e) => SWAP_MODELS.find((m) => m.endpoint === e)?.label ?? e}
              />
              <p className="ch-hintline" style={{ marginTop: 6 }}>
                {SWAP_MODELS.find((m) => m.endpoint === settings.swapModel)?.description}
              </p>
            </div>
            <div>
              <span className="ch-label">Resolução</span>
              <Segmented options={RESOLUTIONS} value={settings.resolution} onChange={(r) => setSettings({ ...settings, resolution: r })} />
            </div>
            <div className="ch-prompt">
              <div className="row between">
                <span className="ch-label" style={{ margin: 0 }}>Prompt</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={customPrompt}
                  className={`ch-switch ${customPrompt ? "on" : ""}`}
                  onClick={() => setCustomPrompt((v) => !v)}
                  aria-label="Usar prompt personalizado"
                />
              </div>
              {customPrompt ? (
                <textarea className="ch-textarea" style={{ minHeight: 80 }} placeholder="Ex.: mantenha o cabelo e a roupa do personagem" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              ) : (
                <span className="ch-hintline">Desligado: usa o padrão testado (mantém movimento, câmera, fundo e luz).</span>
              )}
            </div>
          </div>
          <div className="ch-col-foot">
            <ErrorNote error={error} />
            <div className="row" style={{ marginTop: 4 }}>
              <span className="ch-hintline">
                <CostEstimate endpoint={settings.swapModel} input={estimateInput} seconds={duration} resolution={settings.resolution} waiting={!character || !videoUrl ? "Escolha o personagem (1) e o vídeo (2)" : "custo após escolher"} />
              </span>
              <div className="grow" />
              <button className="ch-btn" onClick={generate} disabled={!ready}>
                {busy ? <span className="spinner" /> : null}
                Gerar
              </button>
            </div>
          </div>
        </section>

        {/* 4 · Resultados */}
        <section className="ch-col">
          <div className="ch-col-head">
            <span className="ch-num">4</span>
            <span className="ch-col-title">Resultados</span>
            <Link href="/character/galeria" className="ch-link" style={{ marginLeft: "auto" }}>
              Galeria →
            </Link>
          </div>
          <div className="ch-col-body">
            <JobPreview
              job={shown}
              empty={
                <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 6 }}>
                  <strong style={{ color: "var(--text)", fontSize: 16 }}>Nada gerado ainda</strong>
                  <span>Os vídeos aparecem aqui assim que você clicar em Gerar, com o progresso de cada um.</span>
                </div>
              }
            />
          </div>
        </section>
      </div>

      {creating && <CreateCharacterModal onClose={() => setCreating(false)} />}
    </>
  );
}
