"use client";

import { useEffect, useState } from "react";
import { useJobs } from "@/components/JobsProvider";
import { useSyncedState } from "@/components/useSyncedState";
import { ErrorNote, Select, useProviders } from "@/components/ui";
import { downloadUrl, formatCredits, post } from "@/lib/client";
import { ENDPOINTS } from "@/lib/models";

type NodeType = "prompt" | "image" | "video" | "vertical" | "extend" | "edit";

type FlowNode = {
  id: string;
  type: NodeType;
  text?: string; // prompt / instrução do nó
  aspect?: string;
  duration?: number;
  resolution?: string;
  state?: "idle" | "running" | "done" | "error";
  output?: { image?: string; video?: string };
  error?: string;
};

type Ctx = { prompt: string; image?: string; video?: string; duration: number; resolution: string };

const NODE_INFO: Record<NodeType, { title: string; desc: string }> = {
  prompt: { title: "PROMPT", desc: "Texto base do fluxo" },
  image: { title: "IMAGEM", desc: "Higgsfield Soul" },
  video: { title: "VÍDEO", desc: "Seedance 2.5 · imagem → vídeo" },
  vertical: { title: "VERSÃO 9:16", desc: "Seedance 2.5 · para Reels" },
  extend: { title: "ESTENDER", desc: "Seedance 2.5 · continua o vídeo" },
  edit: { title: "EDITAR VÍDEO", desc: "Seedance 2.5 · edição por texto" },
};

const ADDABLE: NodeType[] = ["image", "video", "vertical", "extend", "edit"];
const LEGACY_CANVAS_KEY = "hubd.canvas.v1";
const uid = () => Math.random().toString(36).slice(2, 9);

function defaults(type: NodeType): FlowNode {
  const base: FlowNode = { id: uid(), type, state: "idle" };
  if (type === "prompt") return { ...base, text: "" };
  if (type === "image") return { ...base, aspect: "16:9" };
  if (type === "video") return { ...base, duration: 8, resolution: "720p", text: "" };
  if (type === "vertical") return { ...base, duration: 8 };
  if (type === "extend") return { ...base, duration: 5, text: "Continue a cena com o mesmo estilo." };
  return { ...base, text: "Deixe a iluminação mais quente e cinematográfica." };
}

/** Monta a request de cada nó a partir do contexto acumulado. */
function requestFor(node: FlowNode, ctx: Ctx): { endpoint: string; input: Record<string, unknown> } | { error: string } {
  switch (node.type) {
    case "image":
      return { endpoint: ENDPOINTS.soulStandard, input: { prompt: ctx.prompt, aspect_ratio: node.aspect, resolution: "720p", batch_size: 1 } };
    case "video":
      if (!ctx.image) return { error: "Precisa de uma IMAGEM antes." };
      return {
        endpoint: ENDPOINTS.seedanceI2V,
        input: { image_url: ctx.image, prompt: node.text?.trim() || ctx.prompt, duration: node.duration, resolution: node.resolution, generate_audio: true },
      };
    case "vertical":
      if (!ctx.image) return { error: "Precisa de uma IMAGEM antes." };
      return {
        endpoint: ENDPOINTS.seedanceRef,
        input: { image_urls: [ctx.image], prompt: `${ctx.prompt}. Vertical 9:16 framing for social media.`, aspect_ratio: "9:16", duration: node.duration ?? ctx.duration, resolution: ctx.resolution, generate_audio: true },
      };
    case "extend":
      if (!ctx.video) return { error: "Precisa de um VÍDEO antes." };
      return { endpoint: ENDPOINTS.seedanceExtend, input: { video_url: ctx.video, prompt: node.text?.trim() || ctx.prompt, duration: node.duration, resolution: ctx.resolution } };
    case "edit":
      if (!ctx.video) return { error: "Precisa de um VÍDEO antes." };
      return { endpoint: ENDPOINTS.seedanceEdit, input: { video_url: ctx.video, prompt: node.text?.trim() || "Melhore a cena.", resolution: ctx.resolution } };
    default:
      return { error: "Nó sem geração." };
  }
}

function advance(ctx: Ctx, node: FlowNode): Ctx {
  const next = { ...ctx };
  if (node.type === "prompt" && node.text?.trim()) next.prompt = node.text.trim();
  if (node.type === "video" || node.type === "vertical") {
    next.duration = node.duration ?? ctx.duration;
    if (node.resolution) next.resolution = node.resolution;
  }
  if (node.output?.image) next.image = node.output.image;
  if (node.output?.video) next.video = node.output.video;
  return next;
}

// ---------- Agente: transforma um pedido em fluxo ----------

function plan(request: string): { nodes: FlowNode[]; summary: string } {
  const t = request.toLowerCase();
  const seconds = Number(t.match(/(\d{1,2})\s*(s\b|seg|segundo)/)?.[1] ?? 0);
  const duration = seconds ? Math.min(30, Math.max(4, seconds)) : 8;
  const wantsVertical = /vertical|9:16|reels|stories|tiktok|shorts/.test(t);
  const onlyImage = /\b(imagem|foto|still)\b/.test(t) && !/v[íi]deo|an[úu]ncio|anima|reels|clip/.test(t);
  const wantsExtend = /estend|mais longo|continua/.test(t);
  const resolution = /1080|full ?hd/.test(t) ? "1080p" : "720p";
  const aspect = wantsVertical && !/16:9|horizontal/.test(t) ? "9:16" : "16:9";

  const prompt = request
    .replace(/,?\s*(com|e)?\s*(uma\s+)?vers[ãa]o vertical/gi, "")
    .replace(/\b(crie|gere|fa[çc]a|monte)\b\s*/gi, "")
    .trim();

  const nodes: FlowNode[] = [{ ...defaults("prompt"), text: prompt }, { ...defaults("image"), aspect }];
  const steps = ["prompt", "imagem"];
  if (!onlyImage) {
    nodes.push({ ...defaults("video"), duration, resolution });
    steps.push(`vídeo de ${duration}s em ${resolution}`);
    if (wantsExtend) {
      nodes.push(defaults("extend"));
      steps.push("extensão");
    }
    if (wantsVertical && aspect !== "9:16") {
      nodes.push({ ...defaults("vertical"), duration });
      steps.push("versão 9:16");
    }
  }
  return { nodes, summary: `Montei o fluxo: ${steps.join(" → ")}.` };
}

type Msg = { role: "user" | "agent"; text: string };

type AiPlan = { summary: string; prompt: string; nodes: { type: string; aspect?: string; duration?: number; resolution?: string; text?: string }[] };

const ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const NODE_RESOLUTIONS = ["480p", "720p", "1080p"];

/** Converte o plano do Gemini em nós válidos (descarta tipos e valores desconhecidos). */
function fromAiPlan(p: AiPlan): FlowNode[] {
  const nodes: FlowNode[] = [{ ...defaults("prompt"), text: p.prompt.trim() }];
  for (const n of p.nodes) {
    if (!["image", "video", "vertical", "extend", "edit"].includes(n.type)) continue;
    const node = defaults(n.type as NodeType);
    if (n.aspect && ASPECTS.includes(n.aspect)) node.aspect = n.aspect;
    if (n.duration && node.duration !== undefined) node.duration = Math.min(15, Math.max(4, Math.round(n.duration)));
    if (n.resolution && node.resolution && NODE_RESOLUTIONS.includes(n.resolution)) node.resolution = n.resolution;
    if (n.text?.trim() && node.text !== undefined) node.text = n.text.trim();
    nodes.push(node);
  }
  if (!nodes.some((n) => n.type === "image")) nodes.splice(1, 0, defaults("image"));
  return nodes;
}

const DEFAULT_NODES = plan("Tênis branco flutuando em estúdio, luz suave, fundo creme, anúncio de 8s").nodes;

export default function CanvasPage() {
  const { run } = useJobs();
  const providers = useProviders();
  const [thinking, setThinking] = useState(false);
  const [nodes, setNodes, nodesLoaded] = useSyncedState<FlowNode[]>("canvas", DEFAULT_NODES, LEGACY_CANVAS_KEY);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "agent", text: "Descreva o que quer criar e eu monto o fluxo. Ex.: “Crie um anúncio de 8 s do tênis, com versão vertical.”" }]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<{ credits: number; perSecond: boolean } | null>(null);

  // Um fluxo salvo no meio da execução volta como "aguardando" (a execução não continua após recarregar).
  useEffect(() => {
    if (nodesLoaded) setNodes((prev) => (prev.some((n) => n.state === "running") ? prev.map((n) => (n.state === "running" ? { ...n, state: "idle" } : n)) : prev));
  }, [nodesLoaded, setNodes]);

  // Estimativa somando os nós (vídeos Seedance são cobrados por segundo e não retornam número fixo).
  useEffect(() => {
    const t = setTimeout(async () => {
      let ctx: Ctx = { prompt: "x", duration: 8, resolution: "720p", image: "https://example.com/i.jpg", video: "https://example.com/v.mp4" };
      let credits = 0;
      let perSecond = false;
      for (const n of nodes) {
        ctx = advance({ ...ctx, prompt: ctx.prompt || "x" }, n);
        if (n.type === "prompt") continue;
        const r = requestFor(n, ctx);
        if ("error" in r) continue;
        try {
          const e = await post<{ credits: number | null }>("/api/estimate", r);
          if (e.credits != null) credits += e.credits;
          else perSecond = true;
        } catch {
          perSecond = true;
        }
      }
      setCost({ credits, perSecond });
    }, 600);
    return () => clearTimeout(t);
  }, [nodes]);

  const patch = (id: string, p: Partial<FlowNode>) => setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...p } : n)));

  async function execute(fromIndex = 0) {
    setError(null);
    setRunning(true);
    let ctx: Ctx = { prompt: "", duration: 8, resolution: "720p" };
    // Reaproveita as saídas dos nós anteriores ao ponto de partida.
    for (let i = 0; i < fromIndex; i++) ctx = advance(ctx, nodes[i]);
    setNodes((prev) => prev.map((n, i) => (i >= fromIndex && n.type !== "prompt" ? { ...n, state: "idle", output: undefined, error: undefined } : n)));

    for (let i = fromIndex; i < nodes.length; i++) {
      let node = nodes[i];
      if (node.type === "prompt") {
        ctx = advance(ctx, node);
        patch(node.id, { state: "done" });
        continue;
      }
      if (!ctx.prompt) {
        patch(node.id, { state: "error", error: "Defina o PROMPT." });
        break;
      }
      const r = requestFor(node, ctx);
      if ("error" in r) {
        patch(node.id, { state: "error", error: r.error });
        break;
      }
      patch(node.id, { state: "running", error: undefined });
      try {
        const job = await run({ module: "canvas", endpoint: r.endpoint, input: r.input, label: `${NODE_INFO[node.type].title.toLowerCase()} · ${ctx.prompt.slice(0, 50)}`, prompt: ctx.prompt });
        const output = { image: job.images?.[0], video: job.video };
        node = { ...node, state: "done", output };
        patch(node.id, { state: "done", output });
        ctx = advance(ctx, node);
      } catch (e) {
        patch(node.id, { state: "error", error: e instanceof Error ? e.message : "Falhou." });
        setError(`O nó ${NODE_INFO[node.type].title} falhou; os seguintes não foram executados.`);
        break;
      }
    }
    setRunning(false);
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || thinking) return;
    setDraft("");
    setMsgs((m) => [...m, { role: "user", text }]);

    // Com o Google configurado, o Gemini interpreta o pedido; sem ele (ou se falhar), valem as regras locais.
    if (providers?.google) {
      setThinking(true);
      try {
        const current = nodes.map(({ type, text: t, aspect, duration, resolution }) => ({ type, text: t, aspect, duration, resolution }));
        const ai = await post<AiPlan>("/api/ai/plan", { request: text, current });
        setNodes(fromAiPlan(ai));
        setMsgs((m) => [...m, { role: "agent", text: `${ai.summary} Revise os nós e clique em Executar.` }]);
        return;
      } catch (err) {
        setMsgs((m) => [...m, { role: "agent", text: `Não consegui falar com o Gemini (${err instanceof Error ? err.message : "erro"}). Montei pelas regras locais.` }]);
      } finally {
        setThinking(false);
      }
    }
    const { nodes: planned, summary } = plan(text);
    setNodes(planned);
    setMsgs((m) => [...m, { role: "agent", text: `${summary} Revise os nós e clique em Executar.` }]);
  }

  const totalCost = cost ? `${cost.credits ? `≈ ${formatCredits(cost.credits)} créditos` : ""}${cost.perSecond ? `${cost.credits ? " + " : ""}vídeo cobrado por segundo` : ""}` : "calculando…";

  return (
    <main className="page">
      <div className="row between wrap">
        <div className="row">
          <h1 className="title">Kling Canvas</h1>
          <span className="badge">Agente</span>
        </div>
        <div className="row wrap">
          <span className="muted small">+ Nó</span>
          {ADDABLE.map((t) => (
            <button key={t} className="chip" disabled={running} onClick={() => setNodes((p) => [...p, defaults(t)])}>
              {NODE_INFO[t].title.toLowerCase()}
            </button>
          ))}
          <button className="btn" disabled={running} onClick={() => execute(0)}>
            {running ? <span className="spinner" /> : "▶"} Executar fluxo
          </button>
        </div>
      </div>

      <div className="split" style={{ gridTemplateColumns: "1fr 360px" }}>
        <section className="panel" style={{ padding: 18, background: "var(--bg-2)", backgroundImage: "radial-gradient(#22262a 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
          <div className="flow">
            {nodes.map((n, i) => (
              <div key={n.id} style={{ display: "flex" }}>
                {i > 0 && <div className="wire" />}
                <NodeCard
                  node={n}
                  disabled={running}
                  onChange={(p) => patch(n.id, p)}
                  onRemove={n.type === "prompt" ? undefined : () => setNodes((prev) => prev.filter((x) => x.id !== n.id))}
                  onRunFrom={() => execute(i)}
                />
              </div>
            ))}
          </div>
          <p className="muted small">Cada nó usa a saída do anterior. Clique em ▶ num nó para refazer a partir dele, reaproveitando o que já foi gerado.</p>
          <div className="row">
            <span className="muted small">Custo estimado do fluxo: {totalCost}</span>
          </div>
          <ErrorNote error={error} />
        </section>

        <aside className="panel">
          <div className="row">
            <h3 className="h">Agente</h3>
            <span className="muted small">{providers?.google ? "Gemini monta o fluxo a partir do seu pedido" : "monta o fluxo a partir do seu pedido"}</span>
          </div>
          <div className="chat">
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.text}
              </div>
            ))}
            {thinking && (
              <div className="msg agent row">
                <span className="spinner" style={{ width: 12, height: 12 }} /> pensando…
              </div>
            )}
          </div>
          <div className="row">
            <button className="btn sm" disabled={running} onClick={() => execute(0)}>
              ▶ Executar
            </button>
            <span className="muted small">{totalCost}</span>
          </div>
          <form className="searchbar" onSubmit={ask} style={{ padding: "4px 4px 4px 12px" }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Peça um fluxo ou uma alteração…" />
            <button className="btn sm" type="submit" aria-label="Enviar">
              ↑
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}

function NodeCard({ node, disabled, onChange, onRemove, onRunFrom }: { node: FlowNode; disabled: boolean; onChange: (p: Partial<FlowNode>) => void; onRemove?: () => void; onRunFrom: () => void }) {
  const info = NODE_INFO[node.type];
  const cls = node.state === "running" ? "running" : node.state === "done" ? "done" : node.state === "error" ? "err" : "";
  const out = node.output?.video ?? node.output?.image;
  return (
    <div className={`node ${cls}`}>
      <div className="row between">
        <span className="node-type">{info.title}</span>
        <div className="row" style={{ gap: 4 }}>
          {node.type !== "prompt" && (
            <button className="link" disabled={disabled} onClick={onRunFrom} title="Executar a partir daqui">
              ▶
            </button>
          )}
          {onRemove && (
            <button className="muted" disabled={disabled} onClick={onRemove} aria-label="Remover nó">
              ×
            </button>
          )}
        </div>
      </div>
      <span className="muted small">{info.desc}</span>

      {node.type === "prompt" && <textarea className="textarea" style={{ minHeight: 120 }} value={node.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Descreva o que criar" />}
      {node.type === "image" && <Select value={node.aspect ?? "16:9"} options={["16:9", "9:16", "1:1", "4:3", "3:4"]} onChange={(aspect) => onChange({ aspect })} />}
      {(node.type === "video" || node.type === "vertical" || node.type === "extend") && (
        <Select value={node.duration ?? 8} options={[4, 5, 8, 10, 15]} onChange={(duration) => onChange({ duration })} format={(d) => `${d} s`} />
      )}
      {node.type === "video" && <Select value={node.resolution ?? "720p"} options={["480p", "720p", "1080p"]} onChange={(resolution) => onChange({ resolution })} />}
      {(node.type === "extend" || node.type === "edit" || node.type === "video") && (
        <input className="input" value={node.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} placeholder={node.type === "video" ? "Movimento (opcional)" : "Instrução"} />
      )}

      {node.type !== "prompt" && (
        <div className="media">
          {node.state === "running" ? (
            <span className="row">
              <span className="spinner" /> Gerando…
            </span>
          ) : node.output?.video ? (
            <video src={node.output.video} muted loop autoPlay playsInline />
          ) : node.output?.image ? (
            <img src={node.output.image} alt="" />
          ) : (
            <span>{node.state === "error" ? "—" : "◷ Aguardando"}</span>
          )}
        </div>
      )}
      {node.error && <span className="small" style={{ color: "var(--red)" }}>{node.error}</span>}
      {out && (
        <button className="link" style={{ textAlign: "left" }} onClick={() => downloadUrl(out, `hubd-canvas-${node.id}`)}>
          ↓ Baixar
        </button>
      )}
    </div>
  );
}
