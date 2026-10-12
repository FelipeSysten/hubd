"use client";

import { useEffect, useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { CostEstimate, ErrorNote, Field, GenerateBar, JobPreview, QueueList, Select, UploadBox } from "@/components/ui";
import { api } from "@/lib/client";
import { ENDPOINTS } from "@/lib/models";

type Style = { key: string; name: string; tagline: string; direction: string; ideas: string[]; custom?: boolean };

const STYLES: Style[] = [
  {
    key: "motion",
    name: "Motion Design",
    tagline: "Uma ideia vira direção: objetos 3D, tipografia e som em sintonia.",
    direction:
      "Premium motion design piece. Clean 3D objects with soft studio lighting, smooth eased camera moves, bold precise kinetic typography, harmonious color palette, rhythmic edits synced to an elegant electronic soundtrack.",
    ideas: [
      "Apresentar um produto com formas 3D, luz suave e tipografia precisa.",
      "Transformar uma ideia sobre criatividade em uma sequência de motion.",
      "Revelar minha marca com materiais de estúdio e movimentos elegantes.",
    ],
  },
  {
    key: "cine",
    name: "Cinemático",
    tagline: "Planos de cinema, luz dramática e trilha envolvente.",
    direction: "Cinematic film look, anamorphic lens, shallow depth of field, dramatic volumetric lighting, slow dolly and crane moves, rich color grading, orchestral score and ambient sound design.",
    ideas: ["Uma corredora atravessando a cidade ao amanhecer.", "Um chef preparando o prato principal em um restaurante silencioso.", "Um carro antigo cruzando uma estrada no deserto ao pôr do sol."],
  },
  {
    key: "ugc",
    name: "UGC / Selfie",
    tagline: "Vídeo autêntico de criador, gravado no celular.",
    direction: "Authentic user-generated content style, handheld vertical smartphone selfie footage, natural daylight, casual home setting, the creator talks to camera with genuine enthusiasm, natural ambient audio.",
    ideas: ["Uma criadora mostrando a rotina de skincare da manhã.", "Unboxing empolgado de um fone de ouvido novo.", "Review rápido de um café da cafeteria do bairro."],
  },
  {
    key: "product",
    name: "Produto 360°",
    tagline: "O produto girando em estúdio, cada detalhe à mostra.",
    direction: "Studio product commercial, the product rotates 360 degrees on a seamless backdrop, crisp reflections, macro detail shots, perfect softbox lighting, minimal elegant sound design.",
    ideas: ["Um relógio de aço girando sobre fundo preto.", "Uma garrafa de perfume com reflexos dourados.", "Um tênis branco flutuando em fundo creme."],
  },
  {
    key: "anime",
    name: "Anime",
    tagline: "Animação 2D expressiva com cores vibrantes.",
    direction: "High-quality Japanese anime style, expressive hand-drawn 2D animation, vibrant colors, dynamic camera angles, detailed backgrounds, emotional music.",
    ideas: ["Uma estudante correndo para pegar o trem ao entardecer.", "Um samurai sob a chuva em um templo antigo.", "Dois amigos olhando fogos de artifício num festival."],
  },
  {
    key: "doc",
    name: "Documental",
    tagline: "Olhar real, narrativa honesta e luz natural.",
    direction: "Observational documentary style, natural available light, handheld camera with subtle movement, intimate close-ups, real environments, calm narration-friendly pacing with ambient sound.",
    ideas: ["Um artesão trabalhando em sua oficina de madeira.", "Pescadores voltando ao porto no amanhecer.", "A feira livre de domingo ganhando vida."],
  },
];

const STYLES_KEY = "hubd.frameflow.styles.v1";
const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const ASPECT_LABEL: Record<string, string> = { "16:9": "Horizontal · 16:9", "9:16": "Vertical · 9:16", "1:1": "Quadrado · 1:1", "4:3": "Clássico · 4:3", "3:4": "Retrato · 3:4", "21:9": "Cinema · 21:9" };

type Health = { configured: boolean; checks: { name: string; ok: boolean }[] };

export default function FrameFlowPage() {
  const { jobs, submit } = useJobs();
  const [custom, setCustom] = useState<Style[]>([]);
  const [style, setStyle] = useState<Style>(STYLES[0]);
  const [idea, setIdea] = useState("");
  const [audioRef, setAudioRef] = useState<string | null>(null);
  const [imageRef, setImageRef] = useState<string | null>(null);
  const [showAudio, setShowAudio] = useState(false);
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(15);
  const [audio, setAudio] = useState(true);
  const [showDirection, setShowDirection] = useState(false);
  const [creating, setCreating] = useState<{ name: string; direction: string } | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    try {
      setCustom(JSON.parse(localStorage.getItem(STYLES_KEY) ?? "[]"));
    } catch {
      // sem estilos próprios
    }
    api<Health>("/api/health").then(setHealth).catch(() => setHealth(null));
  }, []);

  function saveCustom(next: Style[]) {
    setCustom(next);
    try {
      localStorage.setItem(STYLES_KEY, JSON.stringify(next));
    } catch {
      // storage indisponível
    }
  }

  function createStyle() {
    if (!creating?.name.trim() || !creating.direction.trim()) return;
    const s: Style = { key: `c-${Date.now()}`, name: creating.name.trim(), tagline: "Estilo personalizado.", direction: creating.direction.trim(), ideas: [], custom: true };
    saveCustom([...custom, s]);
    setStyle(s);
    setCreating(null);
  }

  const hasRefs = !!(audioRef || imageRef);
  const buildRequest = (text: string) => {
    const prompt = `${style.direction}\n\nConcept: ${text}`;
    const input: Record<string, unknown> = { prompt, duration, resolution, aspect_ratio: aspect, generate_audio: audio };
    if (!hasRefs) return { endpoint: ENDPOINTS.seedanceT2V, input };
    if (imageRef) input.image_urls = [imageRef];
    if (audioRef) input.audio_urls = [audioRef];
    return { endpoint: ENDPOINTS.seedanceRef, input };
  };
  const req = buildRequest(idea || "x");

  async function generate() {
    if (!idea.trim()) return setError("Descreva sua ideia.");
    setError(null);
    setBusy(true);
    try {
      const { endpoint, input } = buildRequest(idea.trim());
      const job = await submit({ module: "frameflow", endpoint, input, label: `${style.name} · ${idea.trim().slice(0, 60)}`, prompt: idea.trim() });
      setSelected(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  const mine = jobs.filter((j) => j.module === "frameflow");
  const current = mine.find((j) => j.id === selected) ?? mine[0];
  const hfOk = health?.configured && health.checks.find((c) => c.name === "Seedance 2.5")?.ok;

  return (
    <main className="page">
      <div className="split" style={{ gridTemplateColumns: "240px 1fr" }}>
        <aside className="panel sticky" style={{ padding: 14 }}>
          <span className="node-type" style={{ padding: "4px 12px" }}>ESTILOS</span>
          <div className="styles-list">
            {[...STYLES, ...custom].map((s) => (
              <button key={s.key} className={style.key === s.key ? "on" : ""} onClick={() => setStyle(s)}>
                {s.name}
              </button>
            ))}
            <button onClick={() => setCreating({ name: "", direction: "" })} style={{ color: "var(--accent)" }}>
              + Novo estilo
            </button>
          </div>
          {creating && (
            <div className="col" style={{ gap: 8 }}>
              <input className="input" placeholder="Nome do estilo" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
              <textarea className="textarea" placeholder="Direção: luz, câmera, ritmo, som…" value={creating.direction} onChange={(e) => setCreating({ ...creating, direction: e.target.value })} />
              <div className="row">
                <button className="btn sm" onClick={createStyle}>
                  Salvar
                </button>
                <button className="btn ghost sm" onClick={() => setCreating(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {style.custom && (
            <button className="link" style={{ textAlign: "left", padding: "0 12px" }} onClick={() => { saveCustom(custom.filter((c) => c.key !== style.key)); setStyle(STYLES[0]); }}>
              Excluir “{style.name}”
            </button>
          )}
        </aside>

        <section className="col" style={{ gap: 20 }}>
          <div className="col" style={{ gap: 6 }}>
            <span className="node-type">FRAME FLOW</span>
            <h1 className="title">{style.name}</h1>
            <p className="sub">{style.tagline}</p>
          </div>

          {style.ideas.length > 0 && (
            <div className="col" style={{ gap: 8 }}>
              {style.ideas.map((s) => (
                <button key={s} className="suggest" onClick={() => setIdea(s)}>
                  {s} <span style={{ color: "var(--accent)" }}>→</span>
                </button>
              ))}
            </div>
          )}

          <div className="panel">
            <div className="row between">
              <span className="label">Ideia ou referência</span>
              <button className="link" onClick={() => setShowAudio((v) => !v)}>
                ∿ A partir de áudio
              </button>
            </div>
            <textarea className="textarea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ex.: apresentar um aplicativo que organiza a rotina." />
            <div className="grid2">
              <UploadBox kind="image" value={imageRef} onChange={setImageRef} label="Imagem de referência" hint="opcional" height={80} />
              {showAudio || audioRef ? <UploadBox kind="audio" value={audioRef} onChange={setAudioRef} label="Áudio (WAV)" hint="trilha ou narração" height={80} /> : <div />}
            </div>

            <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <Field label="Modelo">
                <div className="select" style={{ backgroundImage: "none" }}>Seedance 2.5</div>
              </Field>
              <Field label="Proporção">
                <Select value={aspect} options={ASPECTS} onChange={setAspect} format={(a) => ASPECT_LABEL[a]} />
              </Field>
              <Field label="Qualidade">
                <Select value={resolution} options={["480p", "720p", "1080p"]} onChange={setResolution} />
              </Field>
              <Field label="Duração">
                <Select value={duration} options={[5, 8, 10, 15, 20, 30]} onChange={setDuration} format={(d) => `${d} segundos`} />
              </Field>
              <Field label="Áudio nativo">
                <Select value={audio ? "Com áudio" : "Sem áudio"} options={["Com áudio", "Sem áudio"]} onChange={(v) => setAudio(v === "Com áudio")} />
              </Field>
            </div>

            <ErrorNote error={error} />
            <GenerateBar label="Gerar vídeo" busy={busy} onClick={generate} cost={<CostEstimate endpoint={req.endpoint} input={req.input} />} />
          </div>

          <div className="row between wrap">
            <span className="muted small">Seedance 2.5 integrado. Seu prompt e o estilo escolhido orientam o vídeo; a geração consome créditos Higgsfield.</span>
            <span className="row small">
              ▸ Status das integrações
              <span className={`status ${health === null ? "queued" : hfOk ? "completed" : "failed"}`}>{health === null ? "verificando" : hfOk ? "Higgsfield conectada" : "Higgsfield indisponível"}</span>
            </span>
          </div>
          <button className="link" style={{ textAlign: "left" }} onClick={() => setShowDirection((v) => !v)}>
            O que está por trás deste estilo {showDirection ? "↑" : "↗"}
          </button>
          {showDirection && <div className="note">{style.direction}</div>}

          <h2 className="h">Resultado</h2>
          <JobPreview job={current} empty="Seu vídeo aparece aqui." />
          <div className="panel">
            <h3 className="h">Histórico</h3>
            <QueueList jobs={mine.slice(0, 10)} onSelect={(j) => setSelected(j.id)} selectedId={current?.id} empty="Nenhum vídeo gerado ainda." />
          </div>
        </section>
      </div>
    </main>
  );
}
