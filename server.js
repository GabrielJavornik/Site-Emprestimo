const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const basicAuth = require('express-basic-auth');
const session = require('express-session');
const nodemailer = require('nodemailer');
const fs = require('fs');

const app = express();
const PORT = 8080;

// --- 1. SEGURANÇA ADMIN ---
const adminAuth = basicAuth({
    users: { 'admin': 'Azul2026' },
    challenge: true,
    unauthorizedResponse: 'Acesso negado.'
});

// --- 2. CONFIGURAÇÃO DO EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '093278@aluno.uricer.edu.br', 
        pass: 'fniv rcur sarl yizv' 
    }
});

// Funções de E-mail Estilizadas
async function enviarEmailConfirmacao(dest, nome, valor) {
    const mailOptions = {
        from: '"AzulCrédito" <093278@aluno.uricer.edu.br>',
        to: dest,
        subject: 'Recebemos sua proposta! 🚀',
        html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #eee;padding:25px;border-radius:15px;background-color:#fcfdfe;">
                <h2 style="color:#1e3c72;border-bottom:2px solid #1e3c72;padding-bottom:10px;">Olá, ${nome}!</h2>
                <p>Sua proposta de empréstimo de <strong>R$ ${valor.toFixed(2)}</strong> foi enviada.</p>
                <div style="background:#eef2f7;padding:10px;border-radius:8px;margin:15px 0;">Status: <strong>Em Análise Técnica</strong></div>
                <p>Nossa equipe revisará seus documentos e você receberá uma resposta em breve.</p></div>`
    };
    try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }
}

async function enviarEmailAprovado(dest, nome) {
    const mailOptions = {
        from: '"AzulCrédito" <093278@aluno.uricer.edu.br>',
        to: dest,
        subject: 'BOAS NOTÍCIAS: Seu crédito foi APROVADO! 🎉',
        html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #dcfce7;padding:25px;border-radius:15px;background-color:#f0fdf4;">
                <h2 style="color:#166534;border-bottom:2px solid #166534;padding-bottom:10px;">Parabéns, ${nome}! 🎉</h2>
                <p>Seu crédito na <strong>AzulCrédito</strong> foi <strong>APROVADO</strong>.</p>
                <p>O valor será transferido via PIX para sua conta em instantes.</p>
                <p style="font-size:0.8rem;color:#166534;">Equipe AzulCrédito</p></div>`
    };
    try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }
}

async function enviarEmailReprovado(dest, nome) {
    const mailOptions = {
        from: '"AzulCrédito" <093278@aluno.uricer.edu.br>',
        to: dest,
        subject: 'Atualização sobre sua proposta',
        html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #fee2e2;padding:25px;border-radius:15px;background-color:#fef2f2;">
                <h2 style="color:#991b1b;border-bottom:2px solid #991b1b;padding-bottom:10px;">Olá, ${nome}</h2>
                <p>Infelizmente não foi possível aprovar sua solicitação neste momento.</p>
                <p>Você poderá realizar uma nova tentativa em <strong>60 dias</strong>.</p>
                <p style="font-size:0.8rem;color:#991b1b;">Equipe AzulCrédito</p></div>`
    };
    try { await transporter.sendMail(mailOptions); } catch (e) { console.error(e); }
}

// --- 3. CONFIGURAÇÕES GERAIS ---
app.use(session({ secret: 'azul-credito-segredo-2026', resave: false, saveUninitialized: false, cookie: { maxAge: 30 * 60 * 1000 } }));
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'site_emprestimo', password: 'Chaves60.', port: 5432 });
const storage = multer.diskStorage({ destination: (req,file,cb)=>cb(null,'uploads/'), filename:(req,file,cb)=>cb(null,file.fieldname+'-'+Date.now()+path.extname(file.originalname)) });
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname))); 

const soNumeros = (str) => String(str || '').replace(/\D/g, '');
const formatarMoeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// --- ROTA DE ARQUIVO SEGURO ---
app.get('/ver-arquivo/:nome', adminAuth, (req, res) => {
    const caminho = path.join(__dirname, 'uploads', req.params.nome);
    if (fs.existsSync(caminho)) res.sendFile(caminho);
    else res.status(404).send("Arquivo não encontrado.");
});

// --- ROTA DE TERMOS DE USO ---
app.get('/termos', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termos - AzulCrédito</title><style>body{font-family:sans-serif;line-height:1.6;padding:40px;background:#f4f7fa;}.content{max-width:800px;margin:auto;background:white;padding:40px;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.05);}h2{color:#1e3c72;border-bottom:2px solid #3a7bd5;padding-bottom:10px;}</style></head><body><div class="content"><h2>Termos e Privacidade</h2><p>Ao utilizar a AzulCrédito, você autoriza a análise de seus dados e documentos para fins de crédito conforme a LGPD. O limite máximo é de R$ 20.000,00 em 24x. Propostas falsas resultam em banimento.</p><br><a href="javascript:history.back()">Voltar</a></div></body></html>`);
});

// --- 4. ROTAS DO SITE ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/sair', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.post('/cadastro', async (req, res) => {
    try {
        await pool.query('INSERT INTO USUARIOS (nome, cpf, senha, email, whatsapp) VALUES ($1, $2, $3, $4, $5)', 
        [req.body.nome, soNumeros(req.body.cpf), req.body.senha, req.body.email, soNumeros(req.body.whatsapp)]);
        res.json({ ok: true });
    } catch (err) { res.status(400).json({ ok: false }); }
});

app.post('/login', async (req, res) => {
    const result = await pool.query('SELECT * FROM USUARIOS WHERE cpf = $1 AND senha = $2', [soNumeros(req.body.cpf), req.body.senha]);
    if (result.rows.length > 0) {
        req.session.usuarioLogado = true; req.session.userCpf = result.rows[0].cpf; req.session.userName = result.rows[0].nome;
        res.json({ ok: true });
    } else { res.status(401).json({ ok: false }); }
});

// --- PAINEL DO CLIENTE ---
app.get('/simulacoes', async (req, res) => {
    if (!req.session.usuarioLogado) return res.send("<script>alert('Sessão expirada.'); window.location.href='/';</script>");
    const cpf = req.session.userCpf;
    try {
        const result = await pool.query('SELECT * FROM SIMULACOES WHERE CPF = $1 ORDER BY CRIADO_EM DESC', [cpf]);
        res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Painel AzulCrédito</title><style>` +
            'body{font-family:"Segoe UI",sans-serif;background:#f4f7fa;margin:0;padding:0;color:#333;}' +
            '.header{background:#1e3c72;color:white;padding:15px 30px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 10px rgba(0,0,0,0.1);}' +
            '.container{max-width:900px;margin:30px auto;padding:20px;}' +
            '.card{background:white;padding:30px;border-radius:24px;box-shadow:0 10px 25px rgba(0,0,0,0.05);margin-bottom:30px;}' +
            'input,button{width:100%;padding:14px;margin:10px 0;border-radius:12px;border:2px solid #eef2f7;font-size:1rem;box-sizing:border-box;}' +
            '.btn-blue{background:#3a7bd5;color:white;font-weight:bold;cursor:pointer;border:none;margin-top:20px;transition:0.3s;}' +
            '.badge{padding:6px 12px;border-radius:50px;font-size:0.85rem;font-weight:bold;}' +
            '.st-PAGO{background:#dcfce7;color:#166534;}.st-ANÁLISE{background:#fef9c3;color:#854d0e;}.st-REPROVADO{background:#fee2e2;color:#991b1b;}' +
            'table{width:100%;border-collapse:collapse;}td{padding:15px 5px;border-bottom:1px solid #f1f5f9;}' +
            'label{font-size:0.85rem;font-weight:bold;color:#666;margin-bottom:5px;display:block;}' +
            '</style></head><body>' +
            `<div class="header"><div style="font-size:1.2rem;font-weight:bold;">AZUL CRÉDITO</div><a href="/sair" style="color:white;text-decoration:none;font-weight:bold;border:1px solid white;padding:5px 15px;border-radius:8px;">SAIR</a></div>` +
            `<div class="container"><h2>Olá, ${req.session.userName}! 👋</h2>` +
            '<div class="card"><h3>💰 Solicitar Empréstimo</h3><form action="/enviar-proposta" method="POST" enctype="multipart/form-data">' +
            '<label>VALOR (MÁX R$ 20.000)</label><input type="text" id="v_mask" placeholder="R$ 0,00" required>' +
            '<input type="hidden" id="v_real" name="valor">' +
            '<label>PARCELAS (MÁX 24)</label><input type="number" name="parcelas" placeholder="Ex: 12" max="24" required>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:15px;">' +
            '<div><label>FOTO ID</label><input type="file" name="doc_id" required></div>' +
            '<div><label>RENDA</label><input type="file" name="doc_renda" required></div></div>' +
            '<button type="submit" class="btn-blue">SOLICITAR CRÉDITO</button></form></div>' +
            '<div class="card"><h3>📋 Histórico</h3><table>' +
            result.rows.map(r => `<tr><td>${new Date(r.criado_em).toLocaleDateString()}</td><td><strong>${formatarMoeda(r.valor)}</strong></td><td style="text-align:right;"><span class="badge st-${r.status.replace(/\s/g,'')}">${r.status}</span></td></tr>`).join('') +
            '</table></div></div><script>' +
            'const vM=document.getElementById("v_mask"), vR=document.getElementById("v_real");' +
            'vM.addEventListener("input",(e)=>{let v=e.target.value.replace(/\\D/g,"");if(parseInt(v)>2000000)v="2000000";v=(Number(v)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});e.target.value=v;vR.value=Number(e.target.value.replace(/\\D/g,""))/100;});' +
            '</script></body></html>');
    } catch (e) { res.status(500).send("Erro"); }
});

app.post('/enviar-proposta', upload.fields([{name:'doc_id'}, {name:'doc_renda'}]), async (req, res) => {
    try {
        const { valor, parcelas } = req.body;
        const vPedido = parseFloat(valor);
        const p = parseInt(parcelas);
        if (vPedido > 20000 || p > 24) return res.send("<script>alert('Valores fora do limite.'); window.history.back();</script>");
        const user = await pool.query('SELECT nome, email, whatsapp FROM USUARIOS WHERE cpf = $1', [req.session.userCpf]);
        const vTotal = vPedido + (vPedido * 0.05 * p); 
        await pool.query('INSERT INTO SIMULACOES (NOME, CPF, VALOR, PARCELAS, VALOR_PARCELA, TOTAL, STATUS, DOCUMENTO_PATH, RENDA_PATH, EMAIL, WHATSAPP) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
            [user.rows[0].nome, req.session.userCpf, vPedido, p, vTotal/p, vTotal, 'EM ANÁLISE', req.files['doc_id'][0].filename, req.files['doc_renda'][0].filename, user.rows[0].email, user.rows[0].whatsapp]);
        if (user.rows[0].email) enviarEmailConfirmacao(user.rows[0].email, user.rows[0].nome, vPedido);
        res.send("<script>alert('Proposta enviada!'); window.location.href='/simulacoes';</script>");
    } catch (e) { res.status(500).send("Erro"); }
});

// --- 5. ADMIN PREMIUM ---
app.get('/admin-azul', adminAuth, async (req, res) => {
    try {
        const allSims = await pool.query('SELECT * FROM SIMULACOES ORDER BY CRIADO_EM DESC');
        const perfis = {};
        allSims.rows.forEach(r => {
            if (!perfis[r.cpf]) perfis[r.cpf] = { nome: r.nome, whatsapp: r.whatsapp, email: r.email, pedidos: [] };
            perfis[r.cpf].pedidos.push(r);
        });
        const totalSolicitado = allSims.rows.reduce((acc, r) => acc + parseFloat(r.valor || 0), 0);
        const totalAprovado = allSims.rows.filter(r => r.status === 'PAGO').reduce((acc, r) => acc + parseFloat(r.total || 0), 0);

        res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Admin AzulCrédito</title><style>` +
            'body{font-family:"Segoe UI",sans-serif;background:#f0f4f8;margin:0;padding:0;}' +
            '.header{background:#1e3c72;color:white;padding:15px 30px;display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;}' +
            '.stats{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:0 30px 40px 30px;}' +
            '.stat-card{background:white;padding:25px;border-radius:15px;border-bottom:5px solid #1e3c72;box-shadow: 0 4px 6px rgba(0,0,0,0.02);}' +
            '.profile-card{background:white;border-radius:18px;margin:0 30px 30px 30px;box-shadow:0 10px 20px rgba(0,0,0,0.05);overflow:hidden;border:1px solid #e1e8ed;}' +
            '.profile-header{background:#1e3c72;color:white;padding:15px 25px;display:flex;justify-content:space-between;align-items:center;}' +
            '.btn-whatsapp{background:#25d366;color:white;padding:8px 16px;border-radius:50px;text-decoration:none;font-weight:bold;font-size:0.8rem;}' +
            'table{width:100%;border-collapse:collapse;}th{text-align:left;padding:15px;background:#f8f9fa;font-size:0.8rem;color:#636e72;}td{padding:15px;border-top:1px solid #f1f3f5;}' +
            '.badge{padding:4px 12px;border-radius:50px;font-size:0.7rem;font-weight:bold;}' +
            '.st-pago{background:#d4edda;color:#155724;}.st-analise{background:#fff3cd;color:#856404;}.st-reprovado{background:#f8d7da;color:#721c24;}' +
            '.doc-link{text-decoration:none;font-weight:bold;color:#3498db;margin-right:10px;font-size:0.85rem;}' +
            '.btn-ok{background:#1e3c72;color:white;border:none;padding:6px 15px;border-radius:6px;cursor:pointer;}' +
            '</style></head><body>' +
            '<div class="header"><div style="font-size:1.2rem;font-weight:bold;">AZUL CRÉDITO ADMIN 🔒</div><a href="/sair" style="color:white;text-decoration:none;font-weight:bold;border:1px solid white;padding:5px 15px;border-radius:8px;">SAIR</a></div>' +
            `<div class="stats"><div class="stat-card"><h3>Solicitado</h3><p style="font-size:1.8rem;font-weight:bold;margin:0;">${formatarMoeda(totalSolicitado)}</p></div>` +
            `<div class="stat-card" style="border-color:#2ecc71;"><h3>Aprovado (Total)</h3><p style="font-size:1.8rem;font-weight:bold;color:#2ecc71;margin:0;">${formatarMoeda(totalAprovado)}</p></div></div>` +
            Object.keys(perfis).map(cpf => {
                const p = perfis[cpf];
                return `<div class="profile-card"><div class="profile-header"><div><strong>👤 ${p.nome}</strong> <small style="margin-left:15px;opacity:0.8;">CPF: ${cpf}</small></div><a href="https://wa.me/${p.whatsapp}" target="_blank" class="btn-whatsapp">WHATSAPP</a></div>` +
                `<table><thead><tr><th>DATA</th><th>VALOR</th><th>TOTAL</th><th>DOCS</th><th>AÇÃO</th><th>DEL</th></tr></thead><tbody>` +
                p.pedidos.map(ped => {
                    const st = ped.status === 'PAGO' ? 'st-pago' : (ped.status === 'REPROVADO' ? 'st-reprovado' : 'st-analise');
                    return `<tr><td>${new Date(ped.criado_em).toLocaleDateString()}</td><td>${formatarMoeda(ped.valor)}</td><td style="font-weight:bold;">${formatarMoeda(ped.total)}</td>` +
                    `<td><a href="/ver-arquivo/${ped.documento_path}" target="_blank" class="doc-link">🗂️ ID</a><a href="/ver-arquivo/${ped.renda_path}" target="_blank" class="doc-link">📄 RENDA</a></td>` +
                    `<td><span class="badge ${st}">${ped.status}</span><select id="st-${ped.id}" style="padding:4px;border-radius:5px;"><option value="EM ANÁLISE" ${ped.status==='EM ANÁLISE'?'selected':''}>Análise</option><option value="PAGO" ${ped.status==='PAGO'?'selected':''}>Aprovar</option><option value="REPROVADO" ${ped.status==='REPROVADO'?'selected':''}>Reprovar</option></select><button onclick="salvar(${ped.id},'${p.whatsapp}','${p.nome}')" class="btn-ok">OK</button></td>` +
                    `<td><button onclick="excluir(${ped.id})" style="background:none;border:none;cursor:pointer;">🗑️</button></td></tr>`;
                }).join('') + '</tbody></table></div>';
            }).join('') +
            `<script>
                async function salvar(id,whats,nome){
                    const st=document.getElementById('st-'+id).value;
                    await fetch('/atualizar-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:st})});
                    if(st==='PAGO') window.open("https://wa.me/"+whats+"?text="+encodeURIComponent("Olá "+nome+"! Seu empréstimo foi APROVADO! 🚀"),"_blank");
                    location.reload();
                }
                async function excluir(id){ if(confirm("Apagar?")){ await fetch('/excluir-proposta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); location.reload(); }}
            </script></body></html>`);
    } catch (e) { res.status(500).send("Erro"); }
});

app.post('/atualizar-status', adminAuth, async (req, res) => {
    const { id, status } = req.body;
    try {
        const cli = await pool.query('SELECT nome, email FROM SIMULACOES WHERE ID = $1', [id]);
        await pool.query('UPDATE SIMULACOES SET STATUS = $1 WHERE ID = $2', [status, id]);
        if (status === 'PAGO' && cli.rows[0].email) await enviarEmailAprovado(cli.rows[0].email, cli.rows[0].nome);
        if (status === 'REPROVADO' && cli.rows[0].email) await enviarEmailReprovado(cli.rows[0].email, cli.rows[0].nome);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false }); }
});

app.post('/excluir-proposta', adminAuth, async (req, res) => {
    await pool.query('DELETE FROM SIMULACOES WHERE ID = $1', [req.body.id]);
    res.json({ ok: true });
});

app.listen(PORT, () => { console.log('🚀 Dashboard AzulCrédito Premium ON: http://localhost:' + PORT); });