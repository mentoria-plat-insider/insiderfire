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

function cabecalho_(aba) {
  if (aba.getLastRow() === 0 || aba.getLastColumn() === 0) return [];
  return aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(function (c) {
    return String(c || '').trim();
  });
}

/**
 * Garante que toda coluna enviada pelo formulário exista no cabeçalho, e
 * devolve o cabeçalho final. Coluna nova entra no fim, sem mexer na ordem
 * do que já está lá — quem já usa a planilha não vê nada se deslocar.
 */
function garantirColunas_(aba, colunas) {
  var atual = cabecalho_(aba);

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

/** Linha (número, base 1) do e-mail na planilha, ou 0 se ainda não existe. */
function linhaDoEmail_(aba, cabecalho, email) {
  if (!email || aba.getLastRow() < 2) return 0;
  var col = cabecalho.indexOf(COL_EMAIL) + 1;
  if (col === 0) return 0;

  var valores = aba.getRange(2, col, aba.getLastRow() - 1, 1).getValues();
  for (var k = 0; k < valores.length; k++) {
    if (String(valores[k][0] || '').trim().toLowerCase() === email) return k + 2;
  }
  return 0;
}

/** Consulta usada pelo formulário antes de a pessoa começar a responder. */
function doGet(e) {
  var email = String((e.parameter && e.parameter.email) || '').trim().toLowerCase();
  if (!email) return responder_({ ok: true, existe: false, status: '' });

  var aba = planilha_();
  var cabecalho = cabecalho_(aba);
  var linha = linhaDoEmail_(aba, cabecalho, email);
  if (!linha) return responder_({ ok: true, existe: false, status: '' });

  // O formulário só bloqueia quem já concluiu; "Parcial" pode retomar.
  var colStatus = cabecalho.indexOf(COL_STATUS) + 1;
  var status = colStatus ? String(aba.getRange(linha, colStatus).getValue() || '').trim() : '';
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
    var cabecalho = garantirColunas_(aba, colunas);
    var linha = linhaDoEmail_(aba, cabecalho, email);

    // Monta a linha na ordem do cabeçalho da planilha, casando pelo NOME da
    // coluna. Assim, reordenar ou acrescentar colunas na planilha à mão não
    // faz o dado cair no lugar errado.
    var anterior = linha
      ? aba.getRange(linha, 1, 1, cabecalho.length).getValues()[0]
      : [];

    var saida = cabecalho.map(function (nome, indice) {
      var pos = colunas.indexOf(nome);
      var novo = pos === -1 ? '' : valores[pos];
      var tinha = anterior.length ? anterior[indice] : '';

      // Valor vazio não apaga o que já estava gravado: a gravação "Parcial"
      // manda as colunas de acompanhante em branco, e ela não pode zerar o
      // que a gravação "Completo" já tiver preenchido.
      if (novo === '' || novo === null || novo === undefined) return tinha;
      return novo;
    });

    if (linha) {
      aba.getRange(linha, 1, 1, saida.length).setValues([saida]);
      return responder_({ ok: true, linha: linha, acao: 'atualizado' });
    }

    aba.appendRow(saida);
    return responder_({ ok: true, linha: aba.getLastRow(), acao: 'inserido' });
  } catch (erro) {
    return responder_({ ok: false, motivo: String(erro) });
  } finally {
    trava.releaseLock();
  }
}
