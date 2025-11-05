const express = require('express');
const path = require('path');
const Firebird = require('node-firebird');

const app = express();
const PORT = 8080;

// config do Firebird
const dbOptions = {
  host: 'localhost',
  port: 3050,
  database: 'C:\\fbdata\\site_emprestimo.fdb',
  user: 'sysdba',
  password: 'masterkey'
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// -------- PÁGINAS --------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/como-fazer', (req, res) => {
  res.sendFile(path.join(__dirname, 'como-fazer.html'));
});

app.get('/vantagens', (req, res) => {
  res.sendFile(path.join(__dirname, 'vantagens.html'));
});

// -------- API --------
app.post('/simular', (req, res) => {
  // agora vem também parcelas do front
  const { nome = '', cpf = '', valor = '', parcelas = 6 } = req.body;

  const nomeTrim = nome.trim();
  const cpfDigits = (cpf || '').replace(/\D/g, '');
  const valorNumber = parseFloat(valor);
  const parcelasNumber = parseInt(parcelas, 10);

  // validações
  if (!nomeTrim) {
    return res.status(400).json({ ok: false, message: 'Nome é obrigatório.' });
  }

  if (!/^\d{11}$/.test(cpfDigits)) {
    return res.status(400).json({ ok: false, message: 'CPF deve conter 11 dígitos.' });
  }

  if (isNaN(valorNumber) || valorNumber <= 0) {
    return res.status(400).json({ ok: false, message: 'Valor inválido.' });
  }

  if (isNaN(parcelasNumber) || parcelasNumber <= 0) {
    return res.status(400).json({ ok: false, message: 'Número de parcelas inválido.' });
  }

  // juros por quantidade de parcelas
  let jurosMes;
  switch (parcelasNumber) {
    case 3:
      jurosMes = 0.04;
      break;
    case 6:
      jurosMes = 0.06;
      break;
    case 9:
      jurosMes = 0.07;
      break;
    case 12:
      jurosMes = 0.08;
      break;
    default:
      jurosMes = 0.08; // se vier outro valor, usa o maior
  }

  const total = valorNumber * (1 + jurosMes * parcelasNumber);
  const valorParcela = total / parcelasNumber;

  Firebird.attach(dbOptions, (err, db) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false, message: 'Erro ao conectar ao banco.' });
    }

    const sql = `
      INSERT INTO SIMULACOES (NOME, CPF, VALOR, PARCELAS, VALOR_PARCELA, TOTAL)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [nomeTrim, cpfDigits, valorNumber, parcelasNumber, valorParcela, total],
      (err2) => {
        db.detach();

        if (err2) {
          console.error(err2);
          return res.status(500).json({ ok: false, message: 'Erro ao salvar simulação.' });
        }

        return res.json({
          ok: true,
          message: 'Simulação salva com sucesso!',
          nome: nomeTrim,
          cpf: cpfDigits,
          valor: valorNumber.toFixed(2),
          parcelas: parcelasNumber,
          parcela: valorParcela.toFixed(2),
          total: total.toFixed(2)
        });
      }
    );
  });
});

// lista as simulações
app.get('/simulacoes', (req, res) => {
  Firebird.attach(dbOptions, (err, db) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erro ao conectar ao banco.');
    }

    db.query('SELECT * FROM SIMULACOES ORDER BY CRIADO_EM DESC', (err2, rows) => {
      db.detach();

      if (err2) {
        console.error(err2);
        return res.status(500).send('Erro ao consultar dados.');
      }

      let html = `
        <html><head><meta charset="utf-8"><title>Simulações</title>
        <style>
          body{font-family:Arial;padding:20px;background:#f5f5f5;}
          table{width:100%;border-collapse:collapse;background:#fff;}
          th,td{border:1px solid #ddd;padding:8px;}
          th{background:#0078d7;color:#fff;}
        </style>
        </head><body>
        <a href="/">⬅ Voltar</a>
        <h2>Simulações</h2>
        <table>
          <tr>
            <th>ID</th><th>Nome</th><th>CPF</th><th>Valor</th><th>Parcelas</th><th>Valor Parcela</th><th>Total</th><th>Criado em</th>
          </tr>
      `;

      rows.forEach((r) => {
        const cpfMask = r.CPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        html += `
          <tr>
            <td>${r.ID}</td>
            <td>${r.NOME}</td>
            <td>${cpfMask}</td>
            <td>R$ ${Number(r.VALOR).toFixed(2)}</td>
            <td>${r.PARCELAS}</td>
            <td>R$ ${Number(r.VALOR_PARCELA).toFixed(2)}</td>
            <td>R$ ${Number(r.TOTAL).toFixed(2)}</td>
            <td>${r.CRIADO_EM}</td>
          </tr>
        `;
      });

      html += `</table></body></html>`;
      res.send(html);
    });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
