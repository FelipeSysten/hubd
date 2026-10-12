# hubd

Estúdio de criação de imagens e vídeos com IA sobre a API Higgsfield. Next.js 15 (App Router), pronto para o Vercel.

## Módulos

| Tela | Modelos Higgsfield |
| --- | --- |
| Explorar | Feed das suas criações e atalhos |
| Imagem | Soul, Soul 2.0, Soul Cinema, Z-Image Turbo, Grok Image 2.0 (106 estilos Soul via API) |
| Vídeo | Seedance 2.5 e Kling 3.0 / 3.0 Pro (texto→vídeo e imagem→vídeo com frame final) |
| Motion | Genjutsu Motion Transfer (480p/720p/1080p, custo exato pela duração do vídeo) e Kling 3.0 / 2.6 Motion Control (720p = Standard, 1080p = Pro) |
| Canvas | Fluxo em nós: Soul → Seedance (imagem→vídeo, versão 9:16, extensão, edição); o agente monta o fluxo a partir do pedido |
| Avatar | Retrato Soul (ou sua foto) + Seedance 2.5 imagem→vídeo com fala e áudio nativos |
| Genjutsu | Transferência de movimento, troca de objeto, Restyle (20 estilos via API) e efeitos por edição Seedance |
| Frame Flow | Estilos de direção + Seedance 2.5 (texto→vídeo ou referências de imagem/áudio) |
| Conta | Créditos estimados, consumo por módulo, status das integrações e fila |

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha HF_CREDENTIALS=key-id:key-secret
npm run dev                  # http://localhost:3000
```

`npm run example` roda o exemplo mínimo do SDK (`index.ts`): gera um vídeo Seedance 2.5 e imprime a URL. **É cobrado.**

## Deploy no Vercel

1. Suba o projeto para um repositório Git e importe no Vercel (framework detectado: Next.js).
2. Em **Settings → Environment Variables**, defina:
   - `HF_CREDENTIALS` = `key-id:key-secret`
   - `APP_PASSWORD` = uma senha. **Recomendado:** sem ela, qualquer pessoa com a URL gera conteúdo com os seus créditos. Com ela, o navegador pede login (qualquer usuário + essa senha).
3. **Histórico no servidor:** em **Storage → Create Database → Neon (Serverless Postgres)**, escolha o plano **Free** e conecte ao projeto. O Vercel cria sozinho a variável `DATABASE_URL`. As tabelas são criadas automaticamente no primeiro acesso. (Qualquer Postgres serve: Supabase gratuito também funciona; basta definir `DATABASE_URL` com a connection string do pooler.) Sem banco, o histórico fica só no navegador e some quando os dados do site são apagados.
4. Faça um novo deploy (variáveis novas só valem a partir do próximo deploy).

A tela **Conta → Status das integrações** mostra a linha "Histórico" como Postgres quando está tudo certo.

## Como funciona

- As credenciais ficam só no servidor (`lib/hf.ts`). O navegador fala com as rotas `/api/*`, que aceitam apenas os endpoints listados em `lib/models.ts`.
- `/api/generate` envia a geração e responde na hora com o `request_id`; o navegador consulta `/api/requests/:id` a cada 3 s. Assim nenhuma função do Vercel fica esperando o vídeo ficar pronto.
- Uploads: `/api/upload` gera uma URL pré-assinada e o navegador envia o arquivo direto ao storage da Higgsfield (sem o limite de 4,5 MB do Vercel). Formatos: JPG, PNG, WEBP, GIF, WAV, MP4.
- Custos vêm de `/estimate` (não cobra). Modelos Seedance retornam preço por segundo, não um número fixo.
- Histórico, favoritos, estilos próprios do Frame Flow, retratos do Avatar e o fluxo do Canvas ficam no servidor (Postgres no Vercel, tabelas `hubd_jobs` e `hubd_state`; `.data/hubd-store.json` localmente), com cópia no navegador para abrir na hora. Cada geração é gravada no envio e atualizada pelo servidor quando termina. Na primeira abertura, o histórico que só existia no navegador é enviado ao servidor.
- O histórico é único para o portal (não há contas de usuário): quem tem a senha vê tudo.

## Limitações conhecidas

- A API pública não expõe o saldo da conta: a tela Conta mostra créditos *estimados* gastos neste navegador e leva ao console para o saldo real.
- Não há endpoint de upscale/reframe na API pública; o Canvas usa "Versão 9:16" (Seedance com referência) no lugar do reframe.
- O agente do Canvas interpreta o pedido por regras (duração, vertical, extensão, resolução), sem LLM.
- As mídias geradas ficam na CDN da Higgsfield por pelo menos 7 dias; baixe o que quiser manter.
