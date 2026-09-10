/**
 * Recebe as respostas do formulário "Ingressos Hotmart Fire 26" e grava na
 * planilha, com atualização da mesma linha pelo e-mail (upsert).
 *
 * Como atualizar o script de uma planilha que JÁ está no ar (caso normal):
 *   1. Na planilha: Extensões → Apps Script. Apague o conteúdo e cole este
 *      arquivo. Salve.
 *   2. Implantar → Gerenciar implantações → lápis (editar) na implantação
 *      existente → Versão: "Nova versão" → Implantar.
 *      Editar a implantação existente mantém a mesma URL, então o ENDPOINT
 *      do index.html continua valendo. Criar uma implantação nova gera outra
 *      URL e exigiria trocar o ENDPOINT.
 *   Salvar sem implantar não muda nada para quem acessa o formulário.
 *
 * Como publicar numa planilha nova:
 *   1. Extensões → Apps Script, cole este arquivo.
 *   2. Implantar → Nova implantação → tipo "App da Web".
 *        Executar como: eu mesmo
 *        Quem pode acessar: qualquer pessoa
 *   3. Copie a URL gerada (termina em /exec) para a constante ENDPOINT do
 *      index.html.
 *
 * Por que upsert e não "uma resposta por e-mail":
 *   O formulário grava duas vezes. A primeira logo depois da identificação,
 *   com Status "Parcial" — assim o time recupera nome, CPF, e-mail e WhatsApp
 *   mesmo de quem desiste no meio. A segunda ao concluir, com Status
 *   "Completo", e é só nela que existem os dados do acompanhante, porque o
 *   bônus só é perguntado depois. Um script que recusa e-mail repetido joga
 *   fora justamente a segunda gravação: a planilha fica com a linha Parcial
 *   e as colunas de acompanhante vazias para sempre.
 */

var ABA = 'Respostas';
var COL_EMAIL = 'E-mail';
var COL_STATUS = 'Status';

/**
 * Ordem das etapas da jornada. Serve para a linha nunca andar para trás:
 * "Parcial" é quem só deixou os dados, "Ingresso resgatado" é quem já
 * escolheu a cidade e garantiu o ingresso, "Completo" é quem foi até o fim.
 * Status desconhecido (vazio, ou de uma versão antiga do formulário) fica
 * como 0 e não impede nada.
 */
var ETAPAS = { 'Parcial': 1, 'Ingresso resgatado': 2, 'Completo': 3 };
function posicaoNaJornada_(status) {
  return ETAPAS[String(status || '').trim()] || 0;
}

function planilha_() {
  var arquivo = SpreadsheetApp.getActiveSpreadsheet();
  var aba = arquivo.getSheetByName(ABA);
  if (!aba) aba = arquivo.insertSheet(ABA);
  return aba;
}

function responder_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Lê a aba inteira de uma vez só.
 *
 * Cada chamada de getRange/getValues é uma ida e volta ao servidor da
 * planilha, e elas acontecem dentro da trava, que atende um envio por vez.
 * Numa abertura de inscrições isso vira fila: com uma leitura por etapa
 * (cabeçalho, busca do e-mail, linha atual) o envio demorava mais do que os
 * 15 segundos que o formulário espera, e as pessoas viam erro. Lendo tudo
 * junto e resolvendo em memória, sobra uma leitura e uma escrita.
 */
function lerTudo_(aba) {
  if (aba.getLastRow() === 0 || aba.getLastColumn() === 0) return [];
  return aba.getDataRange().getValues();
}

function cabecalhoDe_(todos) {
  if (!todos.length) return [];
  return todos[0].map(function (c) { return String(c || '').trim(); });
}

function cabecalho_(aba) {
  return cabecalhoDe_(lerTudo_(aba));
}

/**
 * Garante que toda coluna enviada pelo formulário exista no cabeçalho, e
 * devolve o cabeçalho final. Coluna nova entra no fim, sem mexer na ordem
 * do que já está lá — quem já usa a planilha não vê nada se deslocar.
 */
function garantirColunas_(aba, atual, colunas) {
  if (atual.length === 0) {
    aba.appendRow(colunas);
    aba.getRange(1, 1, 1, colunas.length).setFontWeight('bold');
    aba.setFrozenRows(1);
    return colunas.slice();
  }

  var faltando = colunas.filter(function (nome) {
    return atual.indexOf(nome) === -1;
  });
  if (faltando.length) {
    aba.getRange(1, atual.length + 1, 1, faltando.length)
       .setValues([faltando])
       .setFontWeight('bold');
    atual = atual.concat(faltando);
  }
  return atual;
}

/** Linha (número, base 1) do e-mail, procurando no que já foi lido. */
function linhaDoEmail_(todos, cabecalho, email) {
  if (!email || todos.length < 2) return 0;
  var col = cabecalho.indexOf(COL_EMAIL);
  if (col === -1) return 0;

  for (var k = 1; k < todos.length; k++) {
    if (String(todos[k][col] || '').trim().toLowerCase() === email) return k + 1;
  }
  return 0;
}

/** Consulta usada pelo formulário antes de a pessoa começar a responder. */
function doGet(e) {
  var email = String((e.parameter && e.parameter.email) || '').trim().toLowerCase();
  if (!email) return responder_({ ok: true, existe: false, status: '' });

  var todos = lerTudo_(planilha_());
  var cabecalho = cabecalhoDe_(todos);
  var linha = linhaDoEmail_(todos, cabecalho, email);
  if (!linha) return responder_({ ok: true, existe: false, status: '' });

  // O formulário só bloqueia quem já concluiu; "Parcial" pode retomar.
  var colStatus = cabecalho.indexOf(COL_STATUS);
  var status = colStatus === -1 ? '' : String(todos[linha - 1][colStatus] || '').trim();
  return responder_({ ok: true, existe: true, status: status });
}

/** Grava uma resposta. O formulário envia { email, colunas: [...], valores: [...] }. */
function doPost(e) {
  var trava = LockService.getScriptLock();
  // Sem a trava, dois envios simultâneos podem escrever na mesma linha.
  trava.waitLock(30000);
  try {
    var dados = JSON.parse(e.postData.contents);
    var colunas = dados.colunas || [];
    var valores = dados.valores || [];
    var email = String(dados.email || '').trim().toLowerCase();

    var aba = planilha_();
    var todos = lerTudo_(aba);                       // uma leitura, e só
    var cabecalho = garantirColunas_(aba, cabecalhoDe_(todos), colunas);
    var linha = linhaDoEmail_(todos, cabecalho, email);

    // A gravação "Completo" é o retrato final das respostas: ela manda tudo o
    // que a pessoa respondeu e pode sobrescrever qualquer coisa, inclusive
    // com vazio (quem escolhe "informar depois" tem mesmo as colunas de
    // acompanhante vazias). As anteriores conhecem menos e não podem apagar
    // nada: o que vier vazio nelas preserva o que já estava gravado.
    var posStatus = colunas.indexOf(COL_STATUS);
    var statusNovo = posStatus === -1 ? '' : String(valores[posStatus] || '').trim();
    var completo = statusNovo === 'Completo';

    // Monta a linha na ordem do cabeçalho da planilha, casando pelo NOME da
    // coluna. Assim, reordenar ou acrescentar colunas na planilha à mão não
    // faz o dado cair no lugar errado.
    var anterior = linha ? todos[linha - 1] : [];

    // A jornada só anda para a frente: quem já resgatou o ingresso não volta a
    // "Parcial", e quem concluiu não volta a nada. Sem isso, alguém que reabre
    // o formulário (a consulta de e-mail pode não responder a tempo e o
    // formulário deixa passar de propósito) teria a gravação da identificação
    // caindo por cima do que já havia conquistado.
    var colStatus = cabecalho.indexOf(COL_STATUS);
    if (linha && colStatus !== -1) {
      var statusAtual = String(anterior[colStatus] || '').trim();
      if (posicaoNaJornada_(statusNovo) < posicaoNaJornada_(statusAtual)) {
        return responder_({ ok: true, linha: linha, acao: 'ignorado (etapa anterior)' });
      }
    }

    var saida = cabecalho.map(function (nome, indice) {
      var pos = colunas.indexOf(nome);
      // A coluna pode ser nova (acabou de entrar no cabeçalho), e aí não há
      // nada anterior nesse índice.
      var tinha = anterior[indice] === undefined ? '' : anterior[indice];

      // Coluna que o formulário não envia (ex.: sobra de uma versão antiga
      // da planilha) fica como está, em qualquer situação.
      if (pos === -1) return tinha;

      var novo = valores[pos];
      if (completo) return novo === null || novo === undefined ? '' : novo;
      if (novo === '' || novo === null || novo === undefined) return tinha;
      return novo;
    });

    if (linha) {
      aba.getRange(linha, 1, 1, saida.length).setValues([saida]);
      return responder_({ ok: true, linha: linha, acao: 'atualizado' });
    }

    // Escreve direto na primeira linha livre em vez de appendRow + getLastRow:
    // duas idas e voltas a menos, ainda dentro da trava.
    var nova = Math.max(todos.length, 1) + 1;
    aba.getRange(nova, 1, 1, saida.length).setValues([saida]);
    return responder_({ ok: true, linha: nova, acao: 'inserido' });
  } catch (erro) {
    return responder_({ ok: false, motivo: String(erro) });
  } finally {
    trava.releaseLock();
  }
}
