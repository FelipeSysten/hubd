"use client";

import { useEffect, useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { CostEstimate, EnhanceButton, ErrorNote, Field, GenerateBar, JobPreview, QueueList, Segmented, Select, UploadBox, useProviders } from "@/components/ui";
import { readQuery } from "@/lib/client";
import { buildVideoRequest, VIDEO_MODELS, videoDurations, type VideoModel } from "@/lib/models";

type Mode = "Imagem → vídeo" | "Texto → vídeo";

export default function VideoPage() {
  const { jobs, submit } = useJobs();
  const providers = useProviders();
  const [mode, setMode] = useState<Mode>("Texto → vídeo");
  const [image, setImage] = useState<string | null>(null);
  const [endImage, setEndImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Câmera orbita a ceramista enquanto ela ergue o vaso; poeira dançando na luz.");
  const [model, setModel] = useState<VideoModel>(VIDEO_MODELS[0]);
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [audio, setAudio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const q = readQuery();
    if (q.get("prompt")) setPrompt(q.get("prompt")!);
    if (q.get("image")) {
      setImage(q.get("image"));
      setMode("Imagem → vídeo");
    }
  }, []);

  function pickModel(m: VideoModel) {
    setModel(m);
    const res = m.resolutions?.includes(resolution) ? resolution : (m.resolutions?.[0] ?? resolution);
    setResolution(res);
    fitDuration(m, res);
    if (!m.aspects.includes(aspect)) setAspect(m.aspects[0]);
  }

  // Veo: 1080p e 4k só com 8 s.
  function fitDuration(m: VideoModel, res: string) {
    const allowed = videoDurations(m, res);
    if (!allowed.includes(duration)) setDuration(allowed.includes(5) ? 5 : allowed[allowed.length - 1]);
  }

  const durations = videoDurations(model, resolution);

  const i2v = mode === "Imagem → vídeo";
  const req = buildVideoRequest({
    model,
    prompt: prompt || "x",
    imageUrl: i2v ? (image ?? "https://example.com/frame.jpg") : undefined,
    endImageUrl: i2v ? (endImage ?? undefined) : undefined,
    duration,
    resolution,
    aspect,
    audio,
  });

  async function generate() {
    if (i2v && !image) return setError("Envie o frame inicial.");
    if (!i2v && !prompt.trim()) return setError("Escreva um prompt.");
    setError(null);
    setBusy(true);
    try {
      const { endpoint, input } = buildVideoRequest({
        model,
        prompt,
        imageUrl: i2v ? image! : undefined,
        endImageUrl: i2v ? (endImage ?? undefined) : undefined,
        duration,
        resolution,
        aspect,
        audio,
      });
      const job = await submit({ module: "video", endpoint, input, label: prompt.trim().slice(0, 80) || "Vídeo a partir de imagem", prompt: prompt.trim() });
      setSelected(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  const mine = jobs.filter((j) => j.module === "video");
  const current = mine.find((j) => j.id === selected) ?? mine[0];

  return (
    <main className="page">
      <div className="split wide-left">
        <aside className="panel sticky">
          <h2 className="h">Video Generation</h2>
          <Segmented options={["Imagem → vídeo", "Texto → vídeo"] as const} value={mode} onChange={setMode} />

          {i2v && (
            <div className="grid2">
              <UploadBox kind="image" value={image} onChange={setImage} label="Frame inicial" height={110} />
              <UploadBox kind="image" value={endImage} onChange={setEndImage} label="Frame final" hint="opcional" height={110} />
            </div>
          )}

          <Field label="Prompt" aside={<EnhanceButton value={prompt} onChange={setPrompt} kind="video" />}>
            <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={i2v ? "Descreva o movimento (opcional)" : "Descreva a cena"} />
          </Field>

          <div className="grid2">
            <Field label="Modelo">
              <select className="select" value={model.key} onChange={(e) => pickModel(VIDEO_MODELS.find((m) => m.key === e.target.value)!)}>
                {VIDEO_MODELS.map((m) => (
                  <option key={m.key} value={m.key} disabled={m.google && providers?.google === false}>
                    {m.label}
                    {m.google && providers?.google === false ? " (configure GEMINI_API_KEY)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Proporção">
              {i2v && !model.google ? <div className="select muted" style={{ backgroundImage: "none" }}>Segue a imagem</div> : <Select value={aspect} options={model.aspects} onChange={setAspect} />}
            </Field>
            <Field label="Qualidade">
              {model.resolutions ? (
                <Select
                  value={resolution}
                  options={model.resolutions}
                  onChange={(r) => {
                    setResolution(r);
                    fitDuration(model, r);
                  }}
                />
              ) : <div className="select muted" style={{ backgroundImage: "none" }}>Padrão do modelo</div>}
            </Field>
            <Field label="Duração">
              <Select value={duration} options={durations} onChange={setDuration} format={(d) => `${d} segundos`} />
            </Field>
          </div>

          <div className="row">
            <span className="label">Áudio nativo</span>
            <div className="grow" />
            {model.audio === "always" ? (
              <span className="muted small">O Veo sempre gera áudio</span>
            ) : (
              <Segmented options={["Com áudio", "Sem áudio"] as const} value={audio ? "Com áudio" : "Sem áudio"} onChange={(v) => setAudio(v === "Com áudio")} />
            )}
          </div>
          {model.google && <p className="muted small">Gerado pela Gemini API e cobrado na sua conta Google. 1080p e 4k só com 8 s.</p>}

          <ErrorNote error={error} />
          <GenerateBar label="Gerar vídeo" busy={busy} onClick={generate} cost={<CostEstimate endpoint={req.endpoint} input={req.input} />} />
        </aside>

        <section className="col" style={{ gap: 20 }}>
          <div className="row between">
            <h2 className="h">Prévia</h2>
            {current && <span className="muted small">{current.label}</span>}
          </div>
          <JobPreview job={current} empty="O vídeo gerado aparece aqui." />

          <div className="panel">
            <h3 className="h">Fila de gerações</h3>
            <QueueList jobs={mine.slice(0, 15)} onSelect={(j) => setSelected(j.id)} selectedId={current?.id} />
          </div>
        </section>
      </div>
    </main>
  );
}
