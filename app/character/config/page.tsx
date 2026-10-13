"use client";

import { useCharacters } from "@/components/character/CharacterProvider";
import { CostEstimate, Segmented, Select, useProviders } from "@/components/ui";
import { CREATE_MODELS, cardRequest, SWAP_MODELS } from "@/lib/character";
import { RESOLUTIONS, type Endpoint } from "@/lib/models";

export default function ConfigPage() {
  const { settings, setSettings } = useCharacters();
  const providers = useProviders();

  const storageText =
    providers?.media === "blob"
      ? "Vercel Blob: as imagens dos personagens são guardadas de vez."
      : providers?.media === "local"
        ? "Pasta local (.data/media): guardadas só nesta máquina."
        : "Sem armazenamento permanente: as imagens expiram em cerca de 7 dias. Conecte o Vercel Blob (gratuito) para guardá-las de vez.";

  return (
    <main className="ch-page">
      <h1 className="ch-h1">Configurações</h1>

      <div className="ch-grid2">
        <section className="ch-box col" style={{ gap: 10 }}>
          <span className="ch-label" style={{ margin: 0 }}>Higgsfield</span>
          <div className="row" style={{ gap: 10 }}>
            <span className={`ch-dot ${providers?.higgsfield ? "" : "off"}`} />
            <strong>{providers?.higgsfield ? "Chave da API configurada" : "Chave da API não configurada"}</strong>
          </div>
          <p className="ch-hintline">
            Use a variável HF_CREDENTIALS no servidor. A API pública do Higgsfield não expõe o saldo da conta: os créditos mostrados no topo são estimativas das gerações feitas por este app.
          </p>
        </section>

        <section className="ch-box col" style={{ gap: 10 }}>
          <span className="ch-label" style={{ margin: 0 }}>Armazenamento</span>
          <div className="row" style={{ gap: 10 }}>
            <span className={`ch-dot ${providers?.media ? "" : "off"}`} />
            <strong>{providers?.media === "blob" ? "Vercel Blob" : providers?.media === "local" ? "Local" : "Temporário"}</strong>
          </div>
          <p className="ch-hintline">{storageText}</p>
        </section>

        <section className="ch-box col" style={{ gap: 10 }}>
          <span className="ch-label" style={{ margin: 0 }}>Baixar vídeo por link</span>
          <strong>TikTok e Instagram (público)</strong>
          <p className="ch-hintline">
            Usa o yt-dlp instalado no servidor (variável YTDLP_PATH, ou o comando yt-dlp). Não funciona na Vercel, que não tem o binário.
            Para Instagram com login, exporte os cookies do navegador para um cookies.txt e defina YTDLP_COOKIES.
          </p>
        </section>
      </div>

      <section className="ch-box" style={{ overflowX: "auto" }}>
        <span className="ch-label">Modelos</span>
        <table className="ch-table">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Modelo</th>
              <th>Créditos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Criar imagem</td>
              <td>
                <Select
                  value={settings.createModel}
                  options={CREATE_MODELS.map((m) => m.endpoint)}
                  onChange={(e: Endpoint) => setSettings({ ...settings, createModel: e })}
                  format={(e) => CREATE_MODELS.find((m) => m.endpoint === e)?.label ?? e}
                />
              </td>
              <td>
                <CostEstimate endpoint={settings.createModel} input={cardRequest(settings.createModel, "studio portrait", []).input} waiting="—" />
              </td>
            </tr>
            <tr>
              <td>Vistas (frente, perfil, 3/4)</td>
              <td>
                <Select
                  value={settings.viewsModel}
                  options={CREATE_MODELS.map((m) => m.endpoint)}
                  onChange={(e: Endpoint) => setSettings({ ...settings, viewsModel: e })}
                  format={(e) => CREATE_MODELS.find((m) => m.endpoint === e)?.label ?? e}
                />
                <p className="ch-hintline" style={{ marginTop: 6 }}>Use um modelo que aceite imagem de referência para manter o rosto.</p>
              </td>
              <td>
                <CostEstimate endpoint={settings.viewsModel} input={cardRequest(settings.viewsModel, "side view", []).input} times={3} waiting="—" />
              </td>
            </tr>
            <tr>
              <td>Troca de personagem</td>
              <td>
                <Select
                  value={settings.swapModel}
                  options={SWAP_MODELS.map((m) => m.endpoint)}
                  onChange={(e: Endpoint) => setSettings({ ...settings, swapModel: e })}
                  format={(e) => SWAP_MODELS.find((m) => m.endpoint === e)?.label ?? e}
                />
              </td>
              <td>
                <span className="ch-hintline">por segundo de vídeo</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 16, gap: 12, flexWrap: "wrap" }}>
          <span className="ch-label" style={{ margin: 0 }}>Resolução da troca</span>
          <Segmented options={RESOLUTIONS} value={settings.resolution} onChange={(r) => setSettings({ ...settings, resolution: r })} />
        </div>
      </section>
    </main>
  );
}
