"use client";

import { useEffect, useMemo, useState } from "react";
import { useJobs, type Job } from "@/components/JobsProvider";
import { ErrorNote, Field, QueueList, Segmented, Select, StatusPill, UploadBox } from "@/components/ui";
import { downloadUrl } from "@/lib/client";
import { ENDPOINTS, TERMINAL } from "@/lib/models";

type Persona = { key: string; name: string; look: string; voice: string; color: string };

const PERSONAS: Persona[] = [
  { key: "ana", name: "Ana", look: "a friendly Brazilian woman in her early 30s with wavy brown hair, wearing a beige blazer", voice: "warm, friendly female voice", color: "linear-gradient(150deg,#f59e0b,#ec4899)" },
  { key: "leo", name: "Léo", look: "a confident Brazilian man in his late 20s with short dark hair and a light beard, wearing a navy t-shirt", voice: "clear, energetic male voice", color: "linear-gradient(150deg,#14b8a6,#0f172a)" },
  { key: "bia", name: "Bia", look: "a cheerful young woman in her 20s with curly black hair, wearing a green sweater", voice: "bright, upbeat female voice", color: "linear-gradient(150deg,#d7f75b,#14b8a6)" },
  { key: "rafa", name: "Rafa", look: "a calm man in his 40s with salt-and-pepper hair and glasses, wearing a white shirt", voice: "deep, calm male voice", color: "linear-gradient(150deg,#6366f1,#0f172a)" },
  { key: "iara", name: "Iara", look: "an elegant Indigenous Brazilian woman in her 30s with long straight black hair, wearing a terracotta dress", voice: "soft, confident female voice", color: "linear-gradient(150deg,#ef4444,#f59e0b)" },
];

const VOICES = ["Voz da persona", "Calorosa", "Enérgica", "Grave e calma", "Suave"] as const;
const VOICE_PROMPT: Record<(typeof VOICES)[number], string | null> = {
  "Voz da persona": null,
  Calorosa: "warm and welcoming voice",
  Enérgica: "energetic, enthusiastic voice",
  "Grave e calma": "deep, calm voice",
  Suave: "soft, gentle voice",
};
const LANGS = { "PT-BR": "Brazilian Portuguese", EN: "English", ES: "Spanish" } as const;
type Lang = keyof typeof LANGS;
const FORMATS = ["9:16", "16:9", "1:1"] as const;
const PORTRAITS_KEY = "hubd.avatar.portraits.v1";
const MAX_CHARS = 1500;

/** ~2,4 palavras por segundo de fala, mais uma folga; limitado ao intervalo do Seedance (4–30 s). */
function speechSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 2.4) + 1;
}

/** Legendas aproximadas: divide o roteiro em frases ao longo da duração. */
function buildVtt(script: string, duration: number): string {
  const parts = script.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [script];
  const total = parts.reduce((n, p) => n + p.length, 0) || 1;
  let t = 0;
  const fmt = (s: number) => new Date(s * 1000).toISOString().slice(11, 23);
  const cues = parts.map((p, i) => {
    const d = (p.length / total) * duration;
    const cue = `${i + 1}\n${fmt(t)} --> ${fmt(t + d)}\n${p}`;
    t += d;
    return cue;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}`;
}

export default function AvatarPage() {
  const { jobs, run, submit } = useJobs();
  const [persona, setPersona] = useState<Persona | null>(PERSONAS[0]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [script, setScript] = useState("Oi! Eu sou a Ana, e hoje vou mostrar como o hubd transforma uma ideia em vídeo em menos de um minuto.");
  const [voice, setVoice] = useState<(typeof VOICES)[number]>("Voz da persona");
  const [lang, setLang] = useState<Lang>("PT-BR");
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("9:16");
  const [subtitles, setSubtitles] = useState(true);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPortraits(JSON.parse(localStorage.getItem(PORTRAITS_KEY) ?? "{}"));
    } catch {
      // sem cache de retratos
    }
  }, []);

  const savePortrait = (key: string, url: string) => {
    const next = { ...portraits, [key]: url };
    setPortraits(next);
    try {
      localStorage.setItem(PORTRAITS_KEY, JSON.stringify(next));
    } catch {
      // storage indisponível
    }
  };

  const seconds = speechSeconds(script);
  const duration = Math.min(30, Math.max(4, seconds));

  async function generate() {
    if (!script.trim()) return setError("Escreva o roteiro.");
    if (!photo && !persona) return setError("Escolha um avatar ou envie sua foto.");
    setError(null);
    try {
      let image = photo;
      const who = photo ? "the person in the image" : persona!.look;
      const portraitKey = persona ? `${persona.key}-${format}` : "";
      if (!image) {
        image = portraits[portraitKey] ?? null;
        if (!image) {
          setStep(`Criando o retrato de ${persona!.name}…`);
          const p = await run({
            module: "avatar",
            endpoint: ENDPOINTS.soulStandard,
            input: {
              prompt: `Front-facing medium shot portrait of ${persona!.look}, looking directly at the camera, neutral studio background, soft key light, photorealistic, mouth closed`,
              aspect_ratio: format,
              resolution: "1080p",
              batch_size: 1,
            },
            label: `Retrato · ${persona!.name}`,
          });
          image = p.images![0];
          savePortrait(portraitKey, image);
        }
      }

      setStep("Enviando o vídeo falado…");
      const voiceDesc = VOICE_PROMPT[voice] ?? persona?.voice ?? "natural voice";
      const prompt =
        `${who} speaks directly to the camera in ${LANGS[lang]} with a ${voiceDesc}, natural lip sync, subtle head movement and hand gestures, steady camera. ` +
        `They say exactly: "${script.trim()}"`;
      const job = await submit({
        module: "avatar",
        endpoint: ENDPOINTS.seedanceI2V,
        input: { image_url: image, prompt, duration, resolution: "720p", generate_audio: true },
        label: `${photo ? "Sua foto" : persona!.name} · ${script.trim().slice(0, 60)}`,
        prompt: script.trim(),
      });
      setSelected(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setStep(null);
    }
  }

  const videos = jobs.filter((j) => j.module === "avatar" && j.endpoint === ENDPOINTS.seedanceI2V);
  const current = videos.find((j) => j.id === selected) ?? videos[0];

  return (
    <main className="page">
      <div className="col" style={{ gap: 6 }}>
        <h1 className="title">Avatar 2.0</h1>
        <p className="sub">Foto, roteiro e voz viram um apresentador falando em vídeo.</p>
      </div>

      <div className="split wide-left">
        <aside className="panel sticky">
          <Field label="1 · Avatar">
            <div className="row wrap" style={{ gap: 4 }}>
              {PERSONAS.map((p) => {
                const img = portraits[`${p.key}-${format}`];
                return (
                  <button
                    key={p.key}
                    className={`persona ${persona?.key === p.key && !photo ? "on" : ""}`}
                    onClick={() => {
                      setPersona(p);
                      setPhoto(null);
                    }}
                  >
                    <span className="face" style={{ background: p.color }}>
                      {img ? <img src={img} alt="" /> : p.name[0]}
                    </span>
                    <span className="small">{p.name}</span>
                  </button>
                );
              })}
            </div>
            <UploadBox
              kind="image"
              value={photo}
              onChange={(u) => {
                setPhoto(u);
                if (u) setPersona(null);
                else if (!persona) setPersona(PERSONAS[0]);
              }}
              label="Sua foto"
              hint="Rosto de frente, boa luz"
              height={90}
            />
            {!photo && persona && !portraits[`${persona.key}-${format}`] && <span className="muted small">O retrato de {persona.name} é gerado na primeira vez (Higgsfield Soul) e reaproveitado depois.</span>}
          </Field>

          <Field label="2 · Roteiro" aside={<span className="muted small">{script.length.toLocaleString("pt-BR")} / {MAX_CHARS.toLocaleString("pt-BR")}</span>}>
            <textarea className="textarea" value={script} maxLength={MAX_CHARS} onChange={(e) => setScript(e.target.value)} />
            <span className="small" style={{ color: seconds > 30 ? "var(--warm)" : "var(--muted)" }}>
              Fala estimada: {seconds} s{seconds > 30 ? " — o vídeo tem no máximo 30 s; encurte o roteiro para caber." : ` · vídeo de ${duration} s`}
            </span>
          </Field>

          <Field label="3 · Voz e formato">
            <div className="grid2">
              <Select value={voice} options={VOICES} onChange={setVoice} format={(v) => `Voz · ${v}`} />
              <Select value={lang} options={Object.keys(LANGS) as Lang[]} onChange={setLang} format={(l) => `Idioma · ${l}`} />
            </div>
            <div className="row between">
              <Segmented options={FORMATS} value={format} onChange={setFormat} />
              <label className="toggle small">
                <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />
                Legendas
              </label>
            </div>
            {photo && <span className="muted small">Com foto própria, o enquadramento segue a foto.</span>}
          </Field>

          <ErrorNote error={error} />
          <div className="row">
            <span className="muted small">Seedance 2.5 · cobrado por segundo</span>
            <div className="grow" />
            <button className="btn" onClick={generate} disabled={!!step}>
              {step ? <span className="spinner" /> : null}
              {step ?? "Gerar avatar"}
            </button>
          </div>
        </aside>

        <section className="col" style={{ gap: 20 }}>
          <h2 className="h">Prévia</h2>
          <AvatarPreview job={current} subtitles={subtitles} />
          <div className="panel">
            <h3 className="h">Histórico</h3>
            <QueueList jobs={jobs.filter((j) => j.module === "avatar").slice(0, 10)} onSelect={(j) => j.video && setSelected(j.id)} selectedId={current?.id} empty="Nenhum avatar gerado ainda." />
          </div>
        </section>
      </div>
    </main>
  );
}

function AvatarPreview({ job, subtitles }: { job: Job | undefined; subtitles: boolean }) {
  const vtt = useMemo(() => {
    if (!job?.prompt || !subtitles) return null;
    const blob = new Blob([buildVtt(job.prompt, Number(job.input.duration) || 8)], { type: "text/vtt" });
    return URL.createObjectURL(blob);
  }, [job, subtitles]);

  useEffect(() => () => {
    if (vtt) URL.revokeObjectURL(vtt);
  }, [vtt]);

  if (!job) return <div className="empty">O apresentador aparece aqui, falando o seu roteiro.</div>;
  if (!TERMINAL.includes(job.status) || job.status !== "completed" || !job.video) {
    return (
      <div className="empty">
        <div className="col" style={{ alignItems: "center" }}>
          {!TERMINAL.includes(job.status) && <span className="spinner" style={{ width: 28, height: 28, color: "var(--accent)" }} />}
          <StatusPill status={job.status} />
        </div>
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="player">
        <video key={`${job.id}-${vtt}`} src={job.video} controls playsInline>
          {vtt && <track kind="subtitles" srcLang="pt" label="Legendas" src={vtt} default />}
        </video>
      </div>
      <div className="row between">
        <span className="muted small ellipsis">{job.label}</span>
        <button className="btn ghost sm" onClick={() => downloadUrl(job.video!, `hubd-avatar-${job.id}`)}>
          ↓ Baixar
        </button>
      </div>
    </div>
  );
}
