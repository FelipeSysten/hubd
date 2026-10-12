"use client";

import { useEffect, useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { useSyncedState } from "@/components/useSyncedState";
import { CostEstimate, ErrorNote, Field, GenerateBar, JobPreview, QueueList, Segmented, UploadBox, useVideoDuration } from "@/components/ui";
import { api } from "@/lib/client";
import { ENDPOINTS, type Endpoint } from "@/lib/models";

type Category = "Em alta" | "Transformação" | "Movimento" | "Objetos" | "Câmera" | "Favoritos";
const CATEGORIES: Category[] = ["Em alta", "Transformação", "Movimento", "Objetos", "Câmera", "Favoritos"];

type Effect = {
  key: string;
  name: string;
  desc: string;
  categories: Category[];
  endpoint: Endpoint;
  images: "required" | "optional" | "none";
  imagesLabel?: string;
  maxImages?: number;
  prompt?: string; // instrução fixa do efeito (Seedance video-edit)
  userPrompt?: string; // placeholder quando o usuário pode complementar
  presetId?: string;
  preview?: string;
  bg: string;
  hot?: boolean;
};

const BASE_EFFECTS: Effect[] = [
  {
    key: "motion",
    name: "Transferência de movimento",
    desc: "Personagem copia um vídeo",
    categories: ["Em alta", "Movimento"],
    endpoint: ENDPOINTS.genjutsuMotion,
    images: "required",
    imagesLabel: "Personagem",
    maxImages: 8,
    userPrompt: "Opcional: detalhes a preservar",
    bg: "linear-gradient(160deg,#6366f1,#0f172a)",
    hot: true,
  },
  {
    key: "swap",
    name: "Substituir objeto",
    desc: "Troca um item da cena",
    categories: ["Em alta", "Objetos"],
    endpoint: ENDPOINTS.genjutsuSwap,
    images: "required",
    imagesLabel: "Novo objeto",
    maxImages: 8,
    userPrompt: "Qual objeto trocar? Ex.: troque a caneca pela lata da imagem",
    bg: "linear-gradient(160deg,#f59e0b,#7c2d12)",
    hot: true,
  },
  {
    key: "bullet",
    name: "Bullet time",
    desc: "A cena congela e a câmera gira",
    categories: ["Câmera", "Movimento"],
    endpoint: ENDPOINTS.seedanceEdit,
    images: "none",
    prompt: "At the key moment, freeze the action in a bullet-time effect while the camera orbits 360 degrees around the subject, then resume motion. Keep subject identity and scene.",
    bg: "linear-gradient(160deg,#0ea5e9,#111827)",
  },
  {
    key: "outfit",
    name: "Troca de roupa",
    desc: "Novo figurino, mesmo take",
    categories: ["Objetos", "Transformação"],
    endpoint: ENDPOINTS.seedanceEdit,
    images: "required",
    imagesLabel: "Figurino",
    maxImages: 3,
    prompt: "Replace the main person's outfit with the clothing shown in the reference image, keeping their face, motion, camera and background unchanged.",
    bg: "linear-gradient(160deg,#ec4899,#4c1d95)",
  },
  {
    key: "smoke",
    name: "Dissolver em fumaça",
    desc: "Saída dramática de cena",
    categories: ["Transformação"],
    endpoint: ENDPOINTS.seedanceEdit,
    images: "none",
    prompt: "Near the end, the main subject dramatically dissolves into drifting smoke particles that blow away, leaving the background intact.",
    bg: "linear-gradient(160deg,#9ca3af,#111827)",
  },
  {
    key: "cosmic",
    name: "Zoom cósmico",
    desc: "Do rosto até o espaço",
    categories: ["Câmera"],
    endpoint: ENDPOINTS.seedanceEdit,
    images: "none",
    prompt: "End with a continuous cosmic zoom out: the camera pulls back from the subject's face through the city, the planet, and into outer space.",
    bg: "linear-gradient(160deg,#1e3a8a,#000000)",
  },
  {
    key: "particles",
    name: "Explosão de partículas",
    desc: "Transição com estilhaços",
    categories: ["Transformação"],
    endpoint: ENDPOINTS.seedanceEdit,
    images: "none",
    prompt: "Add a dramatic transition where the scene shatters into glowing particles and shards that explode outward, cinematic lighting.",
    bg: "linear-gradient(160deg,#d7f75b,#14532d)",
  },
];

type Preset = { id: string; name: string; preview_url?: string };
const LEGACY_FAV_KEY = "hubd.genjutsu.favs.v1";

export default function GenjutsuPage() {
  const { jobs, submit } = useJobs();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [category, setCategory] = useState<Category>("Em alta");
  const [effect, setEffect] = useState<Effect>(BASE_EFFECTS[0]);
  const [video, setVideo] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("720p");
  const [favs, setFavs] = useSyncedState<string[]>("genjutsu-favs", [], LEGACY_FAV_KEY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [localSeconds, setLocalSeconds] = useState<number | null>(null);
  const remoteSeconds = useVideoDuration(video);
  const seconds = localSeconds ?? remoteSeconds;

  useEffect(() => {
    api<Preset[]>("/api/catalog/restyle-presets").then(setPresets).catch(() => setPresets([]));
  }, []);

  const restyles: Effect[] = presets.map((p, i) => ({
    key: `restyle-${p.id}`,
    name: p.name,
    desc: "Restyle · mantém movimento e áudio",
    categories: i < 4 ? ["Transformação", "Em alta"] : ["Transformação"],
    endpoint: ENDPOINTS.genjutsuRestyle,
    images: "optional",
    imagesLabel: "Personagem",
    maxImages: 5,
    userPrompt: "Opcional: o que manter. Ex.: cabelo rosa da personagem",
    presetId: p.id,
    preview: p.preview_url,
    bg: "linear-gradient(160deg,#334155,#0f172a)",
  }));
  const all = [...BASE_EFFECTS, ...restyles];
  const visible = category === "Favoritos" ? all.filter((e) => favs.includes(e.key)) : all.filter((e) => e.categories.includes(category));

  function toggleFav(key: string) {
    setFavs((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function pick(e: Effect) {
    setEffect(e);
    setPrompt("");
    setImages((prev) => (e.images === "none" ? [] : prev.slice(0, e.maxImages ?? 1)));
  }

  const refs = images;
  const slots: (string | null)[] = images.length < (effect.maxImages ?? 1) ? [...images, null] : images;

  function buildInput(videoUrl: string): Record<string, unknown> {
    const input: Record<string, unknown> = { video_url: videoUrl, resolution };
    const extra = prompt.trim();
    if (effect.endpoint === ENDPOINTS.seedanceEdit) {
      input.prompt = extra ? `${effect.prompt} ${extra}` : effect.prompt;
      if (refs.length) input.image_urls = refs;
    } else {
      input.prompt = extra;
      input.image_urls = refs;
      if (effect.presetId) input.preset_id = effect.presetId;
    }
    return input;
  }

  async function generate() {
    if (!video) return setError("Envie o vídeo de origem (MP4, mínimo de 4 s).");
    if (effect.images === "required" && !refs.length) return setError(`Envie a imagem: ${effect.imagesLabel}.`);
    setError(null);
    setBusy(true);
    try {
      const job = await submit({ module: "genjutsu", endpoint: effect.endpoint, input: buildInput(video), label: effect.name, prompt: prompt.trim() || effect.name });
      setSelected(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  const mine = jobs.filter((j) => j.module === "genjutsu");
  const current = mine.find((j) => j.id === selected) ?? mine[0];

  return (
    <main className="page">
      <div className="col" style={{ gap: 6 }}>
        <h1 className="title">Genjutsu</h1>
        <p className="sub">Efeitos de vídeo prontos: envie sua mídia e escolha o efeito.</p>
      </div>

      <div className="split wide-left">
        <aside className="panel sticky">
          <Field label="Vídeo de origem">
            <UploadBox kind="video" value={video} onChange={setVideo} onDuration={setLocalSeconds} label="Enviar vídeo" hint="MP4 de 4 a 30 s" height={150} />
          </Field>

          <div className="card col" style={{ padding: 14, gap: 10 }}>
            <div className="row between">
              <b>{effect.name}</b>
              <span className="muted small">{effect.desc}</span>
            </div>

            {effect.images !== "none" && (
              <Field label={`${effect.imagesLabel}${effect.images === "optional" ? " (opcional)" : ""}`}>
                <div className="grid2">
                  {slots.map((img, i) => (
                    <UploadBox
                      key={img ?? `empty-${i}`}
                      kind="image"
                      value={img}
                      label={slots.length > 1 ? `${effect.imagesLabel} ${i + 1}` : effect.imagesLabel!}
                      height={90}
                      onChange={(u) => setImages((prev) => (u ? [...prev, u] : prev.filter((_, j) => j !== i)))}
                    />
                  ))}
                </div>
              </Field>
            )}

            {effect.userPrompt ? (
              <textarea className="textarea" style={{ minHeight: 64 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={effect.userPrompt} />
            ) : (
              <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ajuste opcional do efeito" />
            )}

            <Field label="Resolução">
              <Segmented options={["480p", "720p", "1080p"] as const} value={resolution as "720p"} onChange={setResolution} />
            </Field>
          </div>

          <ErrorNote error={error} />
          <GenerateBar label="Aplicar efeito" busy={busy} onClick={generate} cost={<CostEstimate endpoint={effect.endpoint} input={video ? buildInput(video) : null} seconds={seconds} resolution={resolution} waiting="envie o vídeo para ver o custo" />} />
        </aside>

        <section className="col" style={{ gap: 18 }}>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button key={c} className={`chip ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>

          <div className="gallery" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {visible.map((e) => (
              <div key={e.key} style={{ position: "relative" }}>
                <button className={`fx ${effect.key === e.key ? "on" : ""}`} style={{ width: "100%", background: e.preview ? `center / cover url(${e.preview})` : e.bg }} onClick={() => pick(e)}>
                  {e.hot && <span className="badge lime">Em alta</span>}
                  <b>{e.name}</b>
                  <span>{e.desc}</span>
                </button>
                <button
                  onClick={() => toggleFav(e.key)}
                  aria-label="Favoritar"
                  style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: "50%", background: "rgba(10,11,12,.7)", color: favs.includes(e.key) ? "var(--accent)" : "var(--muted)" }}
                >
                  ★
                </button>
              </div>
            ))}
            {category === "Transformação" && !presets.length && <p className="muted small">Carregando estilos de Restyle…</p>}
            {category === "Favoritos" && !visible.length && <p className="muted small">Marque efeitos com ★ para encontrá-los aqui.</p>}
          </div>

          <h2 className="h">Resultado</h2>
          <JobPreview job={current} empty="O vídeo com o efeito aparece aqui." />
          <div className="panel">
            <h3 className="h">Histórico</h3>
            <QueueList jobs={mine.slice(0, 10)} onSelect={(j) => setSelected(j.id)} selectedId={current?.id} empty="Nenhum efeito aplicado ainda." />
          </div>
        </section>
      </div>
    </main>
  );
}
