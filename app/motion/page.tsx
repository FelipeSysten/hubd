"use client";

import { useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { CostEstimate, ErrorNote, Field, GenerateBar, JobPreview, QueueList, Segmented, UploadBox } from "@/components/ui";
import { MOTION_MODELS } from "@/lib/models";

export default function MotionPage() {
  const { jobs, submit } = useJobs();
  const [character, setCharacter] = useState<string | null>(null);
  const [motion, setMotion] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string>(MOTION_MODELS[0].endpoint);
  const [orientation, setOrientation] = useState<"video" | "image">("video");
  const [keepSound, setKeepSound] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const input = {
    image_url: character ?? "https://example.com/c.jpg",
    video_url: motion ?? "https://example.com/m.mp4",
    character_orientation: orientation,
    keep_original_sound: keepSound ? "yes" : "no",
    ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
  };

  async function generate() {
    if (!character || !motion) return setError("Envie o personagem e o vídeo de movimento.");
    setError(null);
    setBusy(true);
    try {
      const job = await submit({ module: "motion", endpoint, input: { ...input, image_url: character, video_url: motion }, label: prompt.trim() || "Transferência de movimento", prompt: prompt.trim() });
      setSelected(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  const mine = jobs.filter((j) => j.module === "motion");
  const current = mine.find((j) => j.id === selected) ?? mine[0];

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
              <UploadBox kind="video" value={motion} onChange={setMotion} label="Movimento" hint="MP4 de 3 a 30 s, uma pessoa em cena." height={200} />
            </Field>
          </div>

          <Field label="Modelo">
            <select className="select" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
              {MOTION_MODELS.map((m) => (
                <option key={m.endpoint} value={m.endpoint}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Orientação do personagem">
            <Segmented options={["video", "image"] as const} value={orientation} onChange={setOrientation} format={(o) => (o === "video" ? "Seguir o vídeo" : "Seguir a imagem")} />
          </Field>

          <Field label="Prompt (opcional)">
            <textarea className="textarea" style={{ minHeight: 70 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex.: mantenha o figurino e o fundo do personagem" />
          </Field>

          <label className="toggle">
            <input type="checkbox" checked={keepSound} onChange={(e) => setKeepSound(e.target.checked)} />
            Manter o som original do vídeo
          </label>

          <ErrorNote error={error} />
          <GenerateBar label="Gerar movimento" busy={busy} onClick={generate} cost={<CostEstimate endpoint={endpoint as never} input={character && motion ? input : null} />} />
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
