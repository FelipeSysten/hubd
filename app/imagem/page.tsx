"use client";

import { useEffect, useMemo, useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { CostEstimate, EnhanceButton, ErrorNote, Field, GenerateBar, ResultsGrid, Segmented, UploadBox, useProviders } from "@/components/ui";
import { api, readQuery } from "@/lib/client";
import { IMAGE_MODELS, type ImageModel } from "@/lib/models";

type SoulStyle = { id: string; name: string; preview_url?: string };

// Atalhos para estilos do catálogo Soul (nome na API → rótulo no portal).
const FEATURED: [string, string][] = [
  ["General", "Geral"],
  ["Realistic", "Realista"],
  ["90’s Editorial", "Editorial"],
  ["Movie", "Cinema"],
  ["Artwork", "Arte"],
];

const QUANTITIES = [1, 2, 4] as const;

function buildInput(m: ImageModel, o: { prompt: string; aspect: string; resolution: string; batch: number; styleId: string | null; ref: string | null; enhance: boolean }) {
  if (m.google) {
    // Nano Banana: tamanho em "1K/2K/4K"; referências viram edição da imagem.
    return { prompt: o.prompt, aspect_ratio: o.aspect, image_size: o.resolution, ...(o.ref ? { image_urls: [o.ref] } : {}) };
  }
  const input: Record<string, unknown> = { prompt: o.prompt, aspect_ratio: o.aspect, resolution: o.resolution };
  if (m.batch) {
    input.batch_size = o.batch;
    input.enhance_prompt = o.enhance;
  } else if (m.endpoint === "z-image/turbo") {
    input.prompt_extend = o.enhance;
  }
  if (m.styles && o.styleId) input.style_id = o.styleId;
  if (o.ref && m.reference === "image_reference_url") input.image_reference_url = o.ref;
  if (o.ref && m.reference === "image_urls") input.image_urls = [o.ref];
  return input;
}

export default function ImagemPage() {
  const { jobs, submit } = useJobs();
  const providers = useProviders();
  const [model, setModel] = useState<ImageModel>(IMAGE_MODELS[0]);
  const [prompt, setPrompt] = useState("Retrato editorial de uma ceramista no ateliê, luz suave de janela, filme 35 mm");
  const [aspect, setAspect] = useState("3:4");
  const [quantity, setQuantity] = useState<(typeof QUANTITIES)[number]>(4);
  const [resolution, setResolution] = useState("720p");
  const [styles, setStyles] = useState<SoulStyle[]>([]);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [enhance, setEnhance] = useState(false);
  const [tab, setTab] = useState<"Recentes" | "Favoritas" | "Histórico">("Recentes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = readQuery();
    if (q.get("prompt")) setPrompt(q.get("prompt")!);
    api<SoulStyle[]>("/api/catalog/soul-styles")
      .then((s) => {
        setStyles(s);
        setStyleId(s.find((x) => x.name === "Realistic")?.id ?? null);
      })
      .catch(() => setStyles([]));
  }, []);

  function pickModel(m: ImageModel) {
    setModel(m);
    if (!m.aspects.includes(aspect)) setAspect(m.aspects[0]);
    setResolution(m.resolutions[0]);
    if (!m.reference) setRef(null);
  }

  // Modelos com batch aceitam 1 ou 4 por request; o resto vira N requests de 1.
  const plan = useMemo(() => {
    if (model.batch && quantity !== 2) return { batch: quantity, requests: 1 };
    return { batch: 1, requests: quantity };
  }, [model, quantity]);

  const input = buildInput(model, { prompt: prompt.trim() || "x", aspect, resolution, batch: plan.batch, styleId, ref, enhance });

  async function generate() {
    if (!prompt.trim()) return setError("Escreva um prompt.");
    setError(null);
    setBusy(true);
    try {
      const real = buildInput(model, { prompt: prompt.trim(), aspect, resolution, batch: plan.batch, styleId, ref, enhance });
      // Em paralelo: as imagens do Google são geradas durante a própria requisição.
      const results = await Promise.allSettled(
        Array.from({ length: plan.requests }, () =>
          submit({ module: "imagem", endpoint: model.endpoint, input: real, label: prompt.trim().slice(0, 80), prompt: prompt.trim() }),
        ),
      );
      setTab("Recentes");
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) throw failed.reason;
      const blocked = results.find((r) => r.status === "fulfilled" && r.value.status !== "completed" && r.value.error);
      if (blocked?.status === "fulfilled") setError(blocked.value.error!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  const mine = jobs.filter((j) => j.module === "imagem");
  const shown = tab === "Favoritas" ? mine.filter((j) => j.favorite) : tab === "Recentes" ? mine.slice(0, 12) : mine;
  const featured = FEATURED.map(([name, label]) => ({ label, style: styles.find((s) => s.name === name) })).filter((f) => f.style);

  return (
    <main className="page">
      <div className="split">
        <aside className="panel sticky">
          <h2 className="h">Image Generation</h2>

          <Field label="Prompt" aside={<EnhanceButton value={prompt} onChange={setPrompt} kind="image" />}>
            <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Descreva a imagem…" />
          </Field>

          <Field label="Modelo">
            <select className="select" value={model.endpoint} onChange={(e) => pickModel(IMAGE_MODELS.find((m) => m.endpoint === e.target.value)!)}>
              {IMAGE_MODELS.map((m) => (
                <option key={m.endpoint} value={m.endpoint} disabled={m.google && providers?.google === false}>
                  {m.label}
                  {m.google && providers?.google === false ? " (configure GEMINI_API_KEY)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Proporção">
            <Segmented options={model.aspects} value={aspect} onChange={setAspect} />
          </Field>

          <div className="grid2">
            <Field label="Quantidade">
              <Segmented options={QUANTITIES} value={quantity} onChange={setQuantity} />
            </Field>
            <Field label="Resolução">
              <Segmented options={model.resolutions} value={resolution} onChange={setResolution} />
            </Field>
          </div>

          {model.styles && (
            <Field
              label="Estilo"
              aside={
                styles.length > 0 && (
                  <select className="select" style={{ width: 170, padding: "4px 28px 4px 10px", fontSize: 12 }} value={styleId ?? ""} onChange={(e) => setStyleId(e.target.value || null)}>
                    <option value="">Padrão do modelo</option>
                    {styles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )
              }
            >
              <div className="chips">
                {featured.map((f) => (
                  <button key={f.style!.id} className={`chip ${styleId === f.style!.id ? "on" : ""}`} onClick={() => setStyleId(f.style!.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {model.reference ? (
            <UploadBox kind="image" value={ref} onChange={setRef} label="Imagem de referência" hint="JPG, PNG ou WEBP" height={96} />
          ) : (
            <p className="muted small">Este modelo não aceita imagem de referência.</p>
          )}

          {model.google ? (
            <p className="muted small">{busy ? "Gerando no Google… leva de 5 a 40 s por imagem." : "Gerado pela Gemini API e cobrado na sua conta Google. Com imagem de referência, o Nano Banana edita a imagem conforme o prompt."}</p>
          ) : (
            <label className="toggle">
              <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
              Melhorar prompt automaticamente
            </label>
          )}

          <ErrorNote error={error} />
          <GenerateBar label="Gerar imagem" busy={busy} onClick={generate} cost={<CostEstimate endpoint={model.endpoint} input={input} times={plan.requests} />} />
        </aside>

        <section className="col" style={{ gap: 14 }}>
          <div className="row between wrap">
            <h2 className="h">Resultados</h2>
            <Segmented options={["Recentes", "Favoritas", "Histórico"] as const} value={tab} onChange={setTab} />
          </div>
          <ResultsGrid
            jobs={shown}
            empty={tab === "Favoritas" ? "Marque imagens com ★ para vê-las aqui." : "Suas imagens aparecem aqui. Passe o mouse para baixar ou animar."}
          />
        </section>
      </div>
    </main>
  );
}
