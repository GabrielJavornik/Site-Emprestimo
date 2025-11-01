const express = require('express');
const path = require('path');
const Firebird = require('node-firebird');

const app = express();
const PORT = 8080;

// Configuração do Firebird
const dbOptions = {
  host: 'localhost',
  port: 3050,
  database: 'C:\\fbdata\\site_emprestimo.fdb',
  user: 'sysdba',
  password: 'masterkey'
};

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para simulação e inserção
app.post('/simular', (req, res) => {
  const { nome = '', cpf = '', valor = '' } = req.body;

  const nomeTrim = nome.trim();
  const cpfDigits = cpf.replace(/\D/g, '');
  const valorNumber = parseFloat(valor);

  if (!nomeTrim) {
    return res.status(400).json({ ok: false, message: 'Nome é obrigatório.' });
  }

  if (!/^\d{11}$/.test(cpfDigits)) {
    return res.status(400).json({ ok: false, message: 'CPF deve conter 11 dígitos numéricos.' });
  }

  if (isNaN(valorNumber) || valorNumber <= 0) {
    return res.status(400).json({ ok: false, message: 'Valor inválido.' });
  }

  const parcelas = 6;
  const jurosMes = 0.08;
  const total = valorNumber * (1 + jurosMes * parcelas);
  const valorParcela = total / parcelas;

  Firebird.attach(dbOptions, (err, db) => {
    if (err) {
      console.error('Erro ao conectar ao Firebird:', err);
      return res.status(500).json({ ok: false, message: 'Erro ao conectar ao banco.' });
    }

    const sql = `
      INSERT INTO SIMULACOES (NOME, CPF, VALOR, PARCELAS, VALOR_PARCELA, TOTAL)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [nomeTrim, cpfDigits, valorNumber, parcelas, valorParcela, total], (err2) => {
      if (err2) {
        console.error('Erro ao inserir no banco:', err2);
        db.detach();
        return res.status(500).json({ ok: false, message: 'Erro ao salvar simulação.' });
      }

      db.detach();
      console.log(`💾 Simulação salva: ${nomeTrim}, ${cpfDigits}, R$${valorNumber}`);
      res.json({
        ok: true,
        message: `Simulação salva com sucesso!`,
        nome: nomeTrim,
        cpf: cpfDigits,
        valor: valorNumber.toFixed(2),
        parcelas,
        valorParcela: valorParcela.toFixed(2),
        total: total.toFixed(2)
      });
    });
  });
});

// Rota para visualizar simulações
app.get('/simulacoes', (req, res) => {
  Firebird.attach(dbOptions, (err, db) => {
    if (err) {
      console.error('Erro ao conectar ao Firebird:', err);
      return res.status(500).send('Erro ao conectar ao banco.');
    }

    db.query('SELECT * FROM SIMULACOES ORDER BY CRIADO_EM DESC', (err2, rows) => {
      if (err2) {
        console.error('Erro ao consultar simulações:', err2);
        db.detach();
        return res.status(500).send('Erro ao consultar dados.');
      }

      db.detach();

      let html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Simulações</title>
            <style>
              body { font-family: Arial; padding: 20px; background: #f5f5f5; }
              table { width: 100%; border-collapse: collapse; background: #fff; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background: #0078d7; color: white; }
              tr:nth-child(even) { background: #f2f2f2; }
              a { text-decoration: none; color: #0078d7; }
            </style>
          </head>
          <body>
            <a href="/">⬅ Voltar</a>
            <h2>Simulações Registradas</h2>
            <table>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>CPF</th>
                <th>Valor</th>
                <th>Parcelas</th>
                <th>Valor Parcela</th>
                <th>Total</th>
                <th>Criado em</th>
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

      html += `
            </table>
          </body>
        </html>
      `;

      res.send(html);
    });
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
});
