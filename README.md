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
| `apps-script/respostas.gs` | Recebe as respostas e grava na planilha do Google. |
| `_redirects` | Roteamento para Cloudflare Pages. |
| `_headers` | Cabeçalhos de segurança e cache. |
| `wrangler.toml` | Configuração opcional via CLI da Cloudflare. |

## Coleta de dados — salvamento parcial

Assim que a pessoa preenche Nome, CPF, E-mail e WhatsApp na etapa de
identificação, esses dados já são gravados na planilha com
**Status = "Parcial"**. Ao concluir o restante do formulário (evento,
bônus, confirmação), a mesma linha é atualizada para
**Status = "Completo"** — não cria duplicata.

Os dados do acompanhante só existem na segunda gravação, porque o bônus só
é perguntado depois da identificação. Por isso o Apps Script **precisa**
atualizar a linha existente pelo e-mail (upsert). Um script que recusa
e-mail repetido descarta justamente a gravação final: a planilha fica com a
linha "Parcial" e as colunas de acompanhante vazias para sempre.

O script correto está em `apps-script/respostas.gs`, neste repositório. Ele
casa os valores com as colunas **pelo nome do cabeçalho**, não por posição,
e nunca sobrescreve um valor já gravado com um valor vazio.

### Publicar o Apps Script

1. Na planilha: Extensões → Apps Script, cole `apps-script/respostas.gs`
   no lugar do conteúdo atual.
2. Implantar → Gerenciar implantações → editar a implantação existente →
   Versão: "Nova versão" → Implantar. Assim a URL do `ENDPOINT` continua a
   mesma e o `index.html` não precisa mudar.
3. Quem pode acessar: **qualquer pessoa** (não "qualquer pessoa da
   organização", senão quem responde com e-mail pessoal trava numa tela de
   login do Google).

## Colunas gravadas na planilha

Nome · CPF · E-mail · WhatsApp · Evento · Acomp. Nome · Acomp. CPF ·
Acomp. E-mail · Acomp. WhatsApp · Acomp. informar depois · Status ·
Iniciado em · Atualizado em · Formulário

## Trocar a planilha

A URL do Apps Script está na constante `ENDPOINT` no início do `<script>`
do `index.html`. Publique `apps-script/respostas.gs` como App da Web na
nova planilha e substitua essa linha.

## Publicação no Cloudflare Pages (via dashboard)

1. dash.cloudflare.com → Pages → Create a project.
2. Conecte o repositório GitHub.
3. Build settings: deixe tudo em branco — HTML puro, sem build.
4. Save and Deploy. Site no ar em menos de um minuto.
5. Domínio próprio: Custom domains no painel do projeto.
