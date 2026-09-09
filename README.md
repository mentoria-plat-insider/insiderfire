# Ingressos Hotmart Fire 26 — Imersão 100K

Formulário de resgate de ingresso cortesia para participantes do Hotmart
Fire 2026, oferecendo acesso à Imersão 100K (Grupo IGD / Insider).

Landing de recompensa com ingresso ilustrado em SVG (borda serrilhada,
picote, código de barras), fluxo passo a passo com identificação, escolha
de evento, bônus de acompanhante, e salvamento parcial de dados na
planilha — mesmo que a pessoa não conclua o formulário.

## Estrutura

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | Formulário completo: landing, identificação, evento, bônus, confirmação. |
| `_redirects` | Roteamento para Cloudflare Pages. |
| `_headers` | Cabeçalhos de segurança e cache. |
| `wrangler.toml` | Configuração opcional via CLI da Cloudflare. |

## Coleta de dados — salvamento parcial

Assim que a pessoa preenche Nome, CPF, E-mail e WhatsApp na etapa de
identificação, esses dados já são gravados na planilha com
**Status = "Parcial"**. Ao concluir o restante do formulário (evento,
bônus, confirmação), a mesma linha é atualizada para
**Status = "Completo"** — não cria duplicata.

Isso depende de um Apps Script com suporte a "upsert" por e-mail (arquivo
`apps-script-respostas.gs`, compartilhado com os outros formulários do
projeto). Sem esse suporte no script publicado, o salvamento parcial não
funciona.

## Colunas gravadas na planilha

Nome · CPF · E-mail · WhatsApp · Evento · Acomp. Nome · Acomp. CPF ·
Acomp. E-mail · Acomp. WhatsApp · Acomp. informar depois · Status ·
Iniciado em · Atualizado em · Formulário

## Trocar a planilha

A URL do Apps Script está na constante `ENDPOINT` no início do `<script>`
do `index.html`. Publique um novo App da Web (com suporte a upsert) e
substitua essa linha.

## Publicação no Cloudflare Pages (via dashboard)

1. dash.cloudflare.com → Pages → Create a project.
2. Conecte o repositório GitHub.
3. Build settings: deixe tudo em branco — HTML puro, sem build.
4. Save and Deploy. Site no ar em menos de um minuto.
5. Domínio próprio: Custom domains no painel do projeto.
