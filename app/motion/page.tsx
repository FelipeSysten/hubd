"use client";

import { useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { CostEstimate, ErrorNote, Field, GenerateBar, JobPreview, QueueList, Segmented, UploadBox, useVideoDuration } from "@/components/ui";
import { MOTION_MODELS, RESOLUTIONS, type MotionModel, type Resolution } from "@/lib/models";

export default function MotionPage() {
  const { jobs, submit } = useJobs();
  const [character, setCharacter] = useState<string | null>(null);
  const [motion, setMotion] = useState<string | null>(null);
  const [model, setModel] = useState<MotionModel>(MOTION_MODELS[0]);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [orientation, setOrientation] = useState<"video" | "image">("video");
  const [keepSound, setKeepSound] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [localSeconds, setLocalSeconds] = useState<number | null>(null);
  const remoteSeconds = useVideoDuration(motion);
  const seconds = localSeconds ?? remoteSeconds;

  const endpoint = model.endpoints[resolution] ?? null;

  function pickModel(m: MotionModel) {
    setModel(m);
    if (!m.endpoints[resolution]) setResolution("720p");
  }

  function buildInput(image: string, video: string): Record<string, unknown> {
    if (!model.kling) return { image_urls: [image], video_url: video, resolution, prompt: prompt.trim() };
    return {
      image_url: image,
      video_url: video,
      character_orientation: orientation,
      keep_original_sound: keepSound ? "yes" : "no",
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
    };
  }

  const tooShort = seconds != null && seconds < model.minSeconds;

  async function generate() {
    if (!character || !motion) return setError("Envie o personagem e o vídeo de movimento.");
    if (!endpoint) return setError(`${model.label} não oferece ${resolution}.`);
    if (tooShort) return setError(`O vídeo precisa ter pelo menos ${model.minSeconds} s para este modelo.`);
    setError(null);
    setBusy(true);
    try {
      const job = await submit({
        module: "motion",
        endpoint,
        input: buildInput(character, motion),
        label: `${prompt.trim() || "Transferência de movimento"} · ${resolution}`,
        prompt: prompt.trim(),
      });
      setSelected(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  const mine = jobs.filter((j) => j.module === "motion");
  const current = mine.find((j) => j.id === selected) ?? mine[0];
  const ready = !!(character && motion && endpoint);

  return (
    <main className="page">
      <div className="col" style={{ gap: 6 }}>
        <h1 className="title">Motion Control</h1>
        <p className="sub">Envie um personagem e um vídeo de referência: o movimento do vídeo é transferido para ele.</p>
      </div>

      <div className="split wide-left">
        <aside className="panel sticky">
          <div className="grid2">
            <Field label="1 · Personagem">
              <UploadBox kind="image" value={character} onChange={setCharacter} label="Personagem" hint="Corpo inteiro visível dá o melhor resultado." height={200} />
            </Field>
            <Field label="2 · Vídeo de movimento">
              <UploadBox kind="video" value={motion} onChange={setMotion} onDuration={setLocalSeconds} label="Movimento" hint={`MP4 de ${model.minSeconds} a 30 s, uma pessoa em cena.`} height={200} />
              {motion && seconds != null && (
                <span className="small" style={{ color: tooShort ? "var(--red)" : "var(--muted)" }}>
                  {seconds.toFixed(2).replace(".", ",")} s
                  {tooShort ? ` · mínimo ${model.minSeconds} s` : !model.kling && Math.ceil(seconds) !== seconds ? ` · cobrado como ${Math.ceil(seconds)} s` : ""}
                </span>
              )}
            </Field>
          </div>

          <Field label="Modelo">
            <select className="select" value={model.key} onChange={(e) => pickModel(MOTION_MODELS.find((m) => m.key === e.target.value)!)}>
              {MOTION_MODELS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Qualidade" aside={model.kling && <span className="muted small">{resolution === "1080p" ? "variante Pro" : "variante Standard"}</span>}>
            <Segmented options={RESOLUTIONS} value={resolution} onChange={setResolution} disabled={(r) => !model.endpoints[r] && `${model.label} não oferece ${r}. Use o Genjutsu Motion Transfer.`} />
            {model.kling && <span className="muted small">Kling não gera em 480p. Para 480p, use o Genjutsu Motion Transfer.</span>}
          </Field>

          {model.kling && (
            <Field label="Orientação do personagem">
              <Segmented options={["video", "image"] as const} value={orientation} onChange={setOrientation} format={(o) => (o === "video" ? "Seguir o vídeo" : "Seguir a imagem")} />
            </Field>
          )}

          <Field label="Prompt (opcional)">
            <textarea className="textarea" style={{ minHeight: 70 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex.: mantenha o figurino e o fundo do personagem" />
          </Field>

          {model.kling && (
            <label className="toggle">
              <input type="checkbox" checked={keepSound} onChange={(e) => setKeepSound(e.target.checked)} />
              Manter o som original do vídeo
            </label>
          )}

          <ErrorNote error={error} />
          <GenerateBar
            label="Gerar movimento"
            busy={busy}
            disabled={tooShort}
            onClick={generate}
            cost={
              <CostEstimate
                endpoint={endpoint}
                input={ready ? buildInput(character!, motion!) : null}
                seconds={seconds}
                resolution={resolution}
                waiting={!ready ? "envie imagem e vídeo para ver o custo" : "a Higgsfield não informa o preço deste modelo"}
              />
            }
          />
        </aside>

        <section className="col" style={{ gap: 20 }}>
          <h2 className="h">Resultado</h2>
          <JobPreview job={current} empty="O vídeo com o movimento transferido aparece aqui. A duração segue o vídeo de referência." />
          <div className="panel">
            <h3 className="h">Histórico</h3>
            <QueueList jobs={mine.slice(0, 10)} onSelect={(j) => setSelected(j.id)} selectedId={current?.id} empty="Nenhuma geração ainda." />
          </div>
        </section>
      </div>
    </main>
  );
}
