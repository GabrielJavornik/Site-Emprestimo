const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');

const app = express();
const PORT = 8080;

// 1. Configuração do PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'site_emprestimo',
  password: 'Chaves60.', 
  port: 5432,
});

// 2. CONFIGURAÇÃO DO UPLOAD (COM TRAVAS DE SEGURANÇA)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, (req.body.cpf || 'doc') + '-' + Date.now() + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // LIMITE: 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens (JPG, PNG) são permitidas!'));
        }
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/ver-documento', express.static(path.join(__dirname, 'uploads')));

// 3. -------- ROTAS PRINCIPAIS --------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/cadastro', async (req, res) => {
  const { nome, cpf, senha } = req.body;
  const cpfLimpo = cpf.replace(/\D/g, '');
  try {
    await pool.query('INSERT INTO USUARIOS (nome, cpf, senha) VALUES ($1, $2, $3)', [nome, cpfLimpo, senha]);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ ok: false }); }
});

app.post('/login', async (req, res) => {
  const { cpf, senha } = req.body;
  const cpfLimpo = cpf.replace(/\D/g, '');
  try {
    const result = await pool.query('SELECT * FROM USUARIOS WHERE cpf = $1 AND senha = $2', [cpfLimpo, senha]);
    if (result.rows.length > 0) res.json({ ok: true, nome: result.rows[0].nome, cpf: cpfLimpo });
    else res.status(401).json({ ok: false });
  } catch (err) { res.status(500).json({ ok: false }); }
});

// 4. -------- PAINEL DO CLIENTE --------
app.get('/simulacoes', async (req, res) => {
    const cpfFiltro = req.query.cpf;
    try {
        if (!cpfFiltro) return res.send("<h1>Acesso negado</h1>");
        const usuario = await pool.query('SELECT nome FROM USUARIOS WHERE cpf = $1', [cpfFiltro]);
        const result = await pool.query('SELECT * FROM SIMULACOES WHERE CPF = $1 ORDER BY CRIADO_EM DESC', [cpfFiltro]);
        const nomeUsuario = usuario.rows.length > 0 ? usuario.rows[0].nome : "Cliente";

        const getStatusStyle = (status) => {
            const s = (status || 'EM ANÁLISE').toUpperCase();
            if (s === 'PAGO') return 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;';
            if (s === 'REPROVADO') return 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;';
            if (s === 'AGUARDANDO DOCUMENTOS' || s === 'AGUARDANDO ANÁLISE DOC') return 'background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;';
            return 'background: #fff3cd; color: #856404; border: 1px solid #ffeeba;';
        };

        res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Painel AzulCrédito</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f4f8fb; margin: 0; padding: 20px; }
            .container { max-width: 900px; margin: auto; }
            .card { background: white; padding: 25px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); margin-bottom: 25px; }
            table { width: 100%; border-collapse: collapse; }
            td, th { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
            .status-badge { padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; display: inline-block; }
            .btn-simular { background: linear-gradient(90deg, #00d2ff, #3a7bd5); color: white; border: none; padding: 12px 20px; border-radius: 50px; cursor: pointer; font-weight: bold; }
            .btn-up { background: #3a7bd5; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2>Olá, ${nomeUsuario}! 👋</h2>
                <a href="/" style="color:red; text-decoration:none; font-weight:bold;">Sair</a>
            </div>

            <div class="card">
              <h3>Nova Simulação 💸</h3>
              <form id="f-int" style="display:flex; gap:10px; align-items:flex-end;">
                <input type="number" id="v" placeholder="Valor (R$)" required style="padding:10px; border-radius:8px; border:1px solid #ddd; flex:1;">
                <select id="p" style="padding:10px; border-radius:8px; border:1px solid #ddd;">
                    <option value="6">6x</option>
                    <option value="12">12x</option>
                </select>
                <button type="submit" class="btn-simular">Simular</button>
              </form>
            </div>

            <div class="card" style="border-left: 5px solid #3a7bd5;">
              <h3>Envio de Documentos 📄</h3>
              <p style="font-size: 0.9rem; color: #666;">Envie foto do seu RG ou CNH para análise.</p>
              <form action="/upload-doc" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="cpf" value="${cpfFiltro}">
                <input type="file" name="documento" accept="image/*" required>
                <button type="submit" class="btn-up">Enviar Documento</button>
              </form>
            </div>

            <div class="card">
              <h3>Histórico</h3>
              <table>
                <thead><tr><th>Data</th><th>Valor</th><th>Status</th></tr></thead>
                <tbody>
                  ${result.rows.map(r => `
                    <tr>
                        <td>${new Date(r.criado_em).toLocaleDateString()}</td>
                        <td>R$ ${Number(r.valor).toFixed(2)}</td>
                        <td><span class="status-badge" style="${getStatusStyle(r.status)}">${r.status || 'EM ANÁLISE'}</span></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <script>
            document.getElementById('f-int').addEventListener('submit', async (e) => {
                e.preventDefault();
                await fetch('/simular', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ nome: '${nomeUsuario}', cpf: '${cpfFiltro}', valor: document.getElementById('v').value, parcelas: document.getElementById('p').value })
                });
                location.reload();
            });
          </script>
        </body>
        </html>`);
    } catch (err) { res.status(500).send("Erro"); }
});

// 5. -------- PROCESSAR UPLOAD --------
app.post('/upload-doc', (req, res) => {
    upload.single('documento')(req, res, async (err) => {
        if (err) {
            return res.send(`<script>alert('Erro: ${err.message}'); window.history.back();</script>`);
        }
        try {
            const cpf = req.body.cpf;
            const nomeArquivo = req.file.filename;
            await pool.query('UPDATE SIMULACOES SET STATUS = $1, DOCUMENTO_PATH = $2 WHERE CPF = $3 AND ID = (SELECT MAX(ID) FROM SIMULACOES WHERE CPF = $3)', 
            ['AGUARDANDO ANÁLISE DOC', nomeArquivo, cpf]);
            res.send(`<script>alert('Recebido!'); window.location.href='/simulacoes?cpf=${cpf}';</script>`);
        } catch (dbErr) { res.status(500).send("Erro no banco."); }
    });
});

// 6. -------- ADMIN --------
app.get('/admin-azul', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM SIMULACOES ORDER BY CRIADO_EM DESC');
        res.send(`
        <html lang="pt-BR">
        <body style="font-family:sans-serif; padding:20px; background:#f0f4f8;">
            <h1>Painel Admin 🔒</h1>
            <table border="1" style="width:100%; border-collapse:collapse; background:white;">
                <tr style="background:#003b5c; color:white;">
                    <th>ID</th><th>Cliente</th><th>Valor</th><th>Doc</th><th>Status</th><th>Ação</th>
                </tr>
                ${result.rows.map(r => `
                <tr>
                    <td>${r.id || r.ID}</td>
                    <td>${r.nome}<br>${r.cpf}</td>
                    <td>R$ ${r.valor}</td>
                    <td>${r.documento_path ? `<a href="/ver-documento/${r.documento_path}" target="_blank">VER RG</a>` : 'Não enviado'}</td>
                    <td><b>${r.status}</b></td>
                    <td>
                        <select id="st-${r.id || r.ID}">
                            <option value="PAGO">Aprovar</option>
                            <option value="REPROVADO">Reprovar</option>
                            <option value="AGUARDANDO DOCUMENTOS">Pedir Doc</option>
                        </select>
                        <button onclick="salvar(${r.id || r.ID})">Salvar</button>
                    </td>
                </tr>`).join('')}
            </table>
            <script>
                async function salvar(id){
                    const st = document.getElementById('st-'+id).value;
                    await fetch('/atualizar-status', {
                        method: 'POST',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({id, status: st})
                    });
                    location.reload();
                }
            </script>
        </body>
        </html>`);
    } catch (err) { res.status(500).send("Erro"); }
});

app.post('/atualizar-status', async (req, res) => {
    const { id, status } = req.body;
    try {
        await pool.query('UPDATE SIMULACOES SET STATUS = $1 WHERE ID = $2', [status, id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false }); }
});

app.post('/simular', async (req, res) => {
  const { nome, cpf, valor, parcelas } = req.body;
  const v = parseFloat(valor);
  const p = parseInt(parcelas);
  const total = v * (1 + (0.015 * p));
  const valor_parcela = total / p;
  try {
    await pool.query('INSERT INTO SIMULACOES (NOME, CPF, VALOR, PARCELAS, VALOR_PARCELA, TOTAL, STATUS) VALUES ($1, $2, $3, $4, $5, $6, $7)', 
    [nome.trim(), cpf, v, p, valor_parcela, total, 'EM ANÁLISE']);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false }); }
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`🚀 AzulCrédito ON: http://localhost:${PORT}`);
});