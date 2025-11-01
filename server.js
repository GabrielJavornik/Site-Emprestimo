const express = require('express');
const path = require('path');
const Firebird = require('node-firebird');

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// 🔗 Configuração do Firebird
const dbOptions = {
  host: 'localhost',
  port: 3050,
  database: 'C:\\fbdata\\site_emprestimo.fdb', // mesmo caminho usado no DBeaver
  user: 'sysdba',
  password: 'masterkey'
};

// 🏠 Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 💰 Rota de simulação e inserção no Firebird
app.post('/simular', (req, res) => {
  const { nome, cpf, valor } = req.body;
  const valorNumber = Number(valor || 0);
  const parcelas = 6;
  const jurosMes = 0.08;
  const total = valorNumber * (1 + jurosMes * parcelas);
  const valorParcela = total / parcelas;

  console.log(`💾 Salvando simulação: ${nome}, ${cpf}, R$${valorNumber}`);

  Firebird.attach(dbOptions, (err, db) => {
    if (err) {
      console.error('❌ Erro ao conectar ao Firebird:', err);
      return res.status(500).json({ ok: false, message: 'Erro ao conectar ao banco.' });
    }

    const query = `
      INSERT INTO SIMULACOES (NOME, CPF, VALOR, PARCELAS, VALOR_PARCELA, TOTAL)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(query, [nome, cpf, valorNumber, parcelas, valorParcela, total], (err2) => {
      if (err2) {
        console.error('❌ Erro ao inserir no Firebird:', err2);
        db.detach();
        return res.status(500).json({ ok: false, message: 'Erro ao salvar no banco.' });
      }

      db.detach();
      console.log('✅ Simulação salva com sucesso!');

      res.json({
        ok: true,
        nome,
        cpf,
        valor: valorNumber.toFixed(2),
        parcelas,
        valorParcela: valorParcela.toFixed(2),
        total: total.toFixed(2),
        message: `Beleza, ${nome}! Sua simulação foi salva no banco.`
      });
    });
  });
});

// 🚀 Inicia o servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});
