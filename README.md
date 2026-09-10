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

## Coleta de dados — três gravações na mesma linha

A jornada grava a mesma linha (casada pelo e-mail) até três vezes, cada vez
que fica sabendo de algo novo — nunca espera o fim para não perder quem
desiste no meio:

1. **Status = "Parcial"** — assim que a pessoa preenche Nome, CPF, E-mail e
   WhatsApp na etapa de identificação.
2. **Status = "Ingresso resgatado"** — assim que a pessoa escolhe a cidade e
   chega na tela de confirmação do ingresso, mesmo que feche a página ali e
   nunca clique em "Continuar" (esse clique é só de quem quer o ingresso
   extra do acompanhante). Sem essa gravação, a cidade escolhida por quem
   não clica nunca chegava na planilha.
3. **Status = "Completo"** — ao concluir o restante do formulário (dados do
   acompanhante, se houver).

Só "Completo" é definitivo (pode sobrescrever qualquer coluna, inclusive
deixando em branco); "Parcial" e "Ingresso resgatado" só preenchem o que
ainda está vazio, sem apagar nada. E a jornada só anda para a frente: uma
gravação de etapa anterior à que já está na planilha é ignorada, então
reabrir o formulário nunca rebaixa um cadastro que já avançou mais.

Os dados do acompanhante só existem na terceira gravação, porque o bônus só
é perguntado depois da tela de resgate. Por isso o Apps Script **precisa**
atualizar a linha existente pelo e-mail (upsert). Um script que recusa
e-mail repetido descarta justamente a gravação final: a planilha fica com a
linha "Ingresso resgatado" e as colunas de acompanhante vazias para sempre.

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
