const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const basicAuth = require('express-basic-auth');
const session = require('express-session');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');

const app = express();
const PORT = 8080;
const BASE_URL = process.env.BASE_URL || 'http://192.168.0.17:8080';
// Exemplo: 'http://192.168.1.100:8080'

// --- 1. SEGURANÇA ADMIN ---
const adminAuth = basicAuth({
    users: { 'admin': 'Azul2026' },
    challenge: true,
    unauthorizedResponse: 'Acesso negado.'
});

/// --- 2. CONFIGURAÇÃO DO EMAIL (SendGrid) ---
const API_KEY_SENDGRID = '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';
const EMAIL_REMETENTE = '093278@aluno.uricer.edu.br';

sgMail.setApiKey(API_KEY_SENDGRID);
console.log('✅ SendGrid CONFIGURADO - Remetente:', EMAIL_REMETENTE);

// --- FUNÇÕES DE E-MAIL COM SendGrid ---
async function enviarEmailConfirmacao(dest, nome, valor) {
    console.log('\n📧 [CONFIRMAÇÃO] Enviando para:', dest);
    try {
        await sgMail.send({
            to: dest,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: 'Recebemos sua proposta! 🚀',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #eee;padding:25px;border-radius:15px;background-color:#fcfdfe;">
                    <h2 style="color:#1e3c72;border-bottom:2px solid #1e3c72;padding-bottom:10px;">Olá, ${nome}!</h2>
                    <p>Sua proposta de empréstimo de <strong>R$ ${valor.toFixed(2)}</strong> foi recebida.</p>
                    <div style="background:#eef2f7;padding:10px;border-radius:8px;margin:15px 0;">Status: <strong>Em Análise Técnica</strong></div>
                    <p>Equipe AzulCrédito</p></div>`
        });
        console.log('✅ Email de confirmação enviado com sucesso!');
    } catch (e) {
        console.error('❌ Erro ao enviar confirmação:', e.response?.body || e.message);
    }
}

async function enviarEmailAprovado(dest, nome) {
    console.log('\n📧 [APROVAÇÃO] Enviando para:', dest);
    try {
        await sgMail.send({
            to: dest,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: 'BOAS NOTÍCIAS: Seu crédito foi APROVADO! 🎉',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #dcfce7;padding:25px;border-radius:15px;background-color:#f0fdf4;">
                    <h2 style="color:#166534;">Parabéns, ${nome}! 🎉</h2>
                    <p>Seu crédito foi <strong>APROVADO</strong>. O valor será transferido via PIX em instantes.</p></div>`
        });
        console.log('✅ Email de aprovação enviado com sucesso!');
    } catch (e) {
        console.error('❌ Erro ao enviar aprovação:', e.response?.body || e.message);
    }
}

async function enviarEmailReprovado(dest, nome) {
    console.log('\n📧 [REPROVAÇÃO] Enviando para:', dest);
    try {
        await sgMail.send({
            to: dest,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: 'Atualização sobre sua proposta',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #fee2e2;padding:25px;border-radius:15px;background-color:#fef2f2;">
                    <h2 style="color:#991b1b;">Olá, ${nome}</h2>
                    <p>No momento não conseguimos aprovar seu crédito. Tente novamente em 60 dias.</p></div>`
        });
        console.log('✅ Email de reprovação enviado com sucesso!');
    } catch (e) {
        console.error('❌ Erro ao enviar reprovação:', e.response?.body || e.message);
    }
}

async function enviarEmailPagamento(dest, nome, valorPago, totalPago, totalDivida, parcelas, parcelasRestantes) {
    console.log('\n📧 [PAGAMENTO] Enviando para:', dest);
    try {
        const percentualPago = ((totalPago / totalDivida) * 100).toFixed(1);
        await sgMail.send({
            to: dest,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: 'Pagamento Recebido ✅ - AzulCrédito',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #bbf7d0;padding:25px;border-radius:15px;background-color:#f0fdf4;">
                    <h2 style="color:#166534;border-bottom:2px solid #166534;padding-bottom:10px;">Pagamento Recebido ✅</h2>
                    <p>Olá, <strong>${nome}</strong>!</p>
                    <p>Recebemos seu pagamento com sucesso! Aqui estão os detalhes:</p>

                    <div style="background:#e8f5e9;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2ecc71;">
                        <div style="margin:10px 0;"><strong>💰 Valor pago:</strong> R$ ${valorPago.toFixed(2).replace('.', ',')}</div>
                        <div style="margin:10px 0;"><strong>📊 Total pago até agora:</strong> R$ ${totalPago.toFixed(2).replace('.', ',')}</div>
                        <div style="margin:10px 0;"><strong>⏳ Ainda faltam:</strong> R$ ${(totalDivida - totalPago).toFixed(2).replace('.', ',')}</div>
                        <div style="margin:10px 0;"><strong>📋 Parcelas restantes:</strong> ${parcelasRestantes} de ${parcelas}</div>
                        <div style="margin:10px 0;border-top:1px solid #ccc;padding-top:10px;"><strong>Progresso:</strong> ${percentualPago}% concluído</div>
                    </div>

                    <p>Continue realizando seus pagamentos no prazo para manter seu crédito em dia!</p>
                    <p style="font-size:0.9rem;color:#666;margin-top:20px;">Equipe AzulCrédito</p>
                    </div>`
        });
        console.log('✅ Email de pagamento enviado com sucesso!');
    } catch (e) {
        console.error('❌ Erro ao enviar email de pagamento:', e.response?.body || e.message);
    }
}

// --- 3. CONFIGURAÇÕES GERAIS ---
app.use(session({ secret: 'azul-credito-segredo-2026', resave: false, saveUninitialized: false, cookie: { maxAge: 30 * 60 * 1000 } }));
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'site_emprestimo', password: 'Chaves60.', port: 5432 });
const storage = multer.diskStorage({ destination: (req,file,cb)=>cb(null,'uploads/'), filename:(req,file,cb)=>cb(null,Date.now()+path.extname(file.originalname)) });
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Criar tabela PAGAMENTOS se não existir
pool.query(`
    CREATE TABLE IF NOT EXISTS PAGAMENTOS (
        id SERIAL PRIMARY KEY,
        simulacao_id INT NOT NULL,
        data_pagamento DATE NOT NULL,
        valor DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'CONFIRMADO',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (simulacao_id) REFERENCES SIMULACOES(id) ON DELETE CASCADE
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela PAGAMENTOS:', err.message));

const soNumeros = (str) => String(str || '').replace(/\D/g, '');
const formatarMoeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Senhas comuns/fracas a rejeitar
const SENHAS_FRACAS = [
    '123456', '12345678', '1234567890', '123456789',
    'password', 'senha123', 'admin', 'root', '000000',
    'qwerty', 'abc123', 'aaaaaa', '111111', '666666',
    'senha', 'teste123', 'usuario', '000000', '1234567',
    'azul123', 'credito', 'emprestimo', 'cliente'
];

// Validar força da senha
function validarSenha(senha) {
    // Mínimo 8 caracteres
    if (senha.length < 8) {
        return { valida: false, msg: 'Senha deve ter no mínimo 8 caracteres' };
    }

    // Não pode estar na lista de senhas fracas
    if (SENHAS_FRACAS.includes(senha.toLowerCase())) {
        return { valida: false, msg: 'Esta senha é muito comum. Escolha uma senha mais segura' };
    }

    // Verificar se tem letra maiúscula
    if (!/[A-Z]/.test(senha)) {
        return { valida: false, msg: 'Senha deve conter pelo menos 1 letra MAIÚSCULA' };
    }

    // Verificar se tem letra minúscula
    if (!/[a-z]/.test(senha)) {
        return { valida: false, msg: 'Senha deve conter pelo menos 1 letra minúscula' };
    }

    // Verificar se tem número
    if (!/[0-9]/.test(senha)) {
        return { valida: false, msg: 'Senha deve conter pelo menos 1 número' };
    }

    // Verificar se tem caractere especial
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha)) {
        return { valida: false, msg: 'Senha deve conter pelo menos 1 caractere especial (!@#$%^&*...)' };
    }

    // Não pode ter sequências óbvias (123, abc, 111, etc)
    if (/(\d)\1{2,}/.test(senha)) { // 3+ números iguais seguidos
        return { valida: false, msg: 'Senha não pode ter 3+ caracteres repetidos' };
    }

    if (/(?:123|234|345|456|567|678|789|890|abc|bcd|cde|def)/.test(senha.toLowerCase())) {
        return { valida: false, msg: 'Senha não pode conter sequências óbvias (123, abc, etc)' };
    }

    return { valida: true, msg: 'Senha forte ✅' };
}

app.get('/ver-arquivo/:nome', adminAuth, (req, res) => {
    const caminho = path.join(__dirname, 'uploads', req.params.nome);
    if (fs.existsSync(caminho)) res.sendFile(caminho);
    else res.status(404).send("Arquivo não encontrado.");
});

// --- 4. ROTAS ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/sair', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.post('/solicitar-reset-senha', async (req, res) => {
    try {
        const cpfLimpo = soNumeros(req.body.cpf);
        const user = await pool.query('SELECT email FROM USUARIOS WHERE cpf = $1', [cpfLimpo]);

        if (user.rows.length === 0) {
            return res.status(400).json({ ok: false, msg: 'CPF não encontrado' });
        }

        const resetToken = require('crypto').randomBytes(32).toString('hex');
        await pool.query('UPDATE USUARIOS SET reset_token = $1, reset_expira = NOW() + INTERVAL \'1 hour\' WHERE cpf = $2', [resetToken, cpfLimpo]);

        // Enviar email com link de reset
        const linkReset = `${BASE_URL}/reset-senha/${resetToken}`;
        await sgMail.send({
            to: user.rows[0].email,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: '🔐 Recuperar Senha - AzulCrédito',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #fee2e2;padding:25px;border-radius:15px;background-color:#fef2f2;">
                    <h2 style="color:#991b1b;">🔐 Recuperação de Senha</h2>
                    <p>Recebemos uma solicitação para resetar sua senha.</p>
                    <p>Clique no botão abaixo para criar uma nova senha:</p>
                    <a href="${linkReset}" style="background:#1e3c72;color:white;padding:12px 30px;text-decoration:none;border-radius:8px;display:inline-block;margin:20px 0;font-weight:bold;">RESETAR SENHA</a>
                    <p style="font-size:0.9rem;color:#666;">Este link expira em 1 hora.</p>
                    <p style="font-size:0.85rem;color:#999;">Se você não solicitou isso, ignore este email.</p></div>`
        }).catch(e => console.error('Erro ao enviar reset:', e.message));

        res.json({ ok: true, msg: 'Email de reset enviado! Verifique sua caixa de entrada.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false });
    }
});

app.get('/reset-senha/:token', async (req, res) => {
    try {
        const user = await pool.query('SELECT * FROM USUARIOS WHERE reset_token = $1 AND reset_expira > NOW()', [req.params.token]);
        if (user.rows.length === 0) {
            return res.send('<h2 style="color:red;text-align:center;margin-top:50px;">❌ Link expirado ou inválido!</h2>');
        }

        res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resetar Senha</title><style>
            body{font-family:"Segoe UI";background:#f4f7fa;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}
            .box{background:white;padding:40px;border-radius:15px;box-shadow:0 10px 25px rgba(0,0,0,0.1);max-width:400px;width:90%;}
            h2{color:#1e3c72;text-align:center;}
            input{width:100%;padding:12px;margin:15px 0;border:2px solid #eef2f7;border-radius:8px;box-sizing:border-box;font-size:1rem;}
            button{width:100%;padding:12px;background:#3a7bd5;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;margin-top:20px;}
            button:hover{background:#2a5fa5;}
        </style></head><body>
        <div class="box">
            <h2>🔐 Resetar Senha</h2>
            <input type="password" id="novaSenha" placeholder="Nova Senha (mín. 6 caracteres)" required>
            <input type="password" id="confirmaSenha" placeholder="Confirmar Senha" required>
            <button onclick="resetarSenha('${req.params.token}')">Resetar Senha</button>
            <div id="msg" style="margin-top:15px;text-align:center;font-weight:bold;"></div>
        </div>
        <script>
            function resetarSenha(token) {
                const nova = document.getElementById('novaSenha').value;
                const confirma = document.getElementById('confirmaSenha').value;
                const msg = document.getElementById('msg');

                if (nova.length < 6) {
                    msg.style.color = 'red';
                    msg.innerText = '❌ Senha deve ter no mínimo 6 caracteres';
                    return;
                }

                if (nova !== confirma) {
                    msg.style.color = 'red';
                    msg.innerText = '❌ Senhas não conferem';
                    return;
                }

                fetch('/confirmar-reset-senha', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({token, novaSenha: nova})
                }).then(r => r.json()).then(json => {
                    if (json.ok) {
                        msg.style.color = 'green';
                        msg.innerText = '✅ Senha resetada com sucesso!';
                        setTimeout(() => window.location.href = '/', 2000);
                    } else {
                        msg.style.color = 'red';
                        msg.innerText = '❌ Erro ao resetar. Tente novamente.';
                    }
                });
            }
        </script></body></html>`);
    } catch (err) { res.status(500).send("Erro"); }
});

app.post('/confirmar-reset-senha', async (req, res) => {
    try {
        const { token, novaSenha } = req.body;

        // Validar força da senha
        const validacao = validarSenha(novaSenha);
        if (!validacao.valida) {
            return res.status(400).json({ ok: false, msg: validacao.msg });
        }

        const result = await pool.query('UPDATE USUARIOS SET senha = $1, reset_token = NULL, reset_expira = NULL WHERE reset_token = $2 AND reset_expira > NOW() RETURNING id', [novaSenha, token]);

        if (result.rows.length > 0) {
            res.json({ ok: true });
        } else {
            res.status(400).json({ ok: false });
        }
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

app.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, whatsapp, cpf, senha } = req.body;

        // Validar força da senha
        const validacao = validarSenha(senha);
        if (!validacao.valida) {
            return res.status(400).json({ ok: false, msg: validacao.msg });
        }

        const cpfLimpo = soNumeros(cpf);
        const tokenEmail = require('crypto').randomBytes(32).toString('hex');

        await pool.query('INSERT INTO USUARIOS (nome, cpf, senha, email, whatsapp, email_verificado, token_email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [nome, cpfLimpo, senha, email, soNumeros(whatsapp), false, tokenEmail]);

        // Enviar email de confirmação
        const linkConfirmacao = `${BASE_URL}/confirmar-email/${tokenEmail}`;
        await sgMail.send({
            to: email,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: '✅ Confirme seu email - AzulCrédito',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #eee;padding:25px;border-radius:15px;background-color:#fcfdfe;">
                    <h2 style="color:#1e3c72;">Bem-vindo, ${nome}! 👋</h2>
                    <p>Clique no botão abaixo para confirmar seu email:</p>
                    <a href="${linkConfirmacao}" style="background:#1e3c72;color:white;padding:12px 30px;text-decoration:none;border-radius:8px;display:inline-block;margin:20px 0;font-weight:bold;">CONFIRMAR EMAIL</a>
                    <p style="font-size:0.9rem;color:#666;">Ou copie este link: ${linkConfirmacao}</p>
                    <p style="font-size:0.85rem;color:#999;">Este link expira em 24 horas.</p></div>`
        }).catch(e => console.error('Erro ao enviar email de confirmação:', e.message));

        res.json({ ok: true, msg: 'Verifique seu email para confirmar a conta!' });
    } catch (err) { res.status(400).json({ ok: false }); }
});

app.get('/confirmar-email/:token', async (req, res) => {
    try {
        const token = req.params.token;
        console.log('🔍 Tentando confirmar email com token:', token.substring(0, 10) + '...');

        const result = await pool.query('SELECT * FROM USUARIOS WHERE token_email = $1', [token]);
        console.log('📋 Resultado da query:', result.rows.length, 'registros encontrados');

        if (result.rows.length === 0) {
            console.log('❌ Token não encontrado no banco');
            return res.send('<h2 style="color:red;text-align:center;margin-top:50px;">❌ Token inválido ou expirado!</h2>');
        }

        await pool.query('UPDATE USUARIOS SET email_verificado = true, token_email = NULL WHERE token_email = $1', [token]);
        console.log('✅ Email confirmado para usuário:', result.rows[0].nome);

        res.send(`<div style="text-align:center;margin-top:50px;">
            <h2 style="color:green;">✅ Email confirmado com sucesso!</h2>
            <p>Você pode fazer login agora.</p>
            <a href="/" style="color:#1e3c72;text-decoration:none;font-weight:bold;font-size:1.1rem;">Voltar ao início</a>
        </div>`);
    } catch (err) {
        console.error('❌ Erro ao confirmar email:', err);
        res.status(500).send("Erro ao confirmar email");
    }
});

app.post('/login', async (req, res) => {
    const result = await pool.query('SELECT * FROM USUARIOS WHERE cpf = $1 AND senha = $2', [soNumeros(req.body.cpf), req.body.senha]);
    if (result.rows.length > 0) {
        if (!result.rows[0].email_verificado) {
            return res.status(403).json({ ok: false, msg: 'Email não confirmado. Verifique sua caixa de entrada!' });
        }
        req.session.usuarioLogado = true; req.session.userCpf = result.rows[0].cpf; req.session.userName = result.rows[0].nome;
        res.json({ ok: true });
    } else { res.status(401).json({ ok: false }); }
});

app.post('/simular', async (req, res) => {
    try {
        const { nome, cpf, valor, parcelas } = req.body;
        const vTotal = valor + (valor * 0.05 * parcelas);
        res.json({ ok: true, nome, cpf, valor, parcelas, vTotal });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

app.get('/api/propostas/:cpf', async (req, res) => {
    try {
        if (!req.session.usuarioLogado || req.session.userCpf !== req.params.cpf) {
            return res.status(401).json({ ok: false });
        }
        const result = await pool.query('SELECT id, valor, total, status, criado_em FROM SIMULACOES WHERE CPF = $1 ORDER BY CRIADO_EM DESC LIMIT 5', [req.params.cpf]);
        res.json({ ok: true, propostas: result.rows });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

// --- PERFIL DO USUÁRIO ---
app.get('/perfil', async (req, res) => {
    if (!req.session.usuarioLogado) return res.send("<script>location.href='/';</script>");
    try {
        const cpf = req.session.userCpf;
        const result = await pool.query('SELECT nome, email, whatsapp FROM USUARIOS WHERE cpf = $1', [cpf]);
        if (result.rows.length === 0) return res.status(404).send('Usuário não encontrado');

        const user = result.rows[0];
        res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Perfil - AzulCrédito</title><style>
            body{font-family:"Segoe UI",sans-serif;background:#f4f7fa;margin:0;padding:0;}
            .header{background:#1e3c72;color:white;padding:15px 30px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 10px rgba(0,0,0,0.1);}
            .container{max-width:600px;margin:40px auto;padding:20px;}
            .card{background:white;padding:30px;border-radius:15px;box-shadow:0 4px 15px rgba(0,0,0,0.08);margin-bottom:30px;}
            .card h2{margin-top:0;color:#1e3c72;border-bottom:2px solid #1e3c72;padding-bottom:10px;}
            label{display:block;margin-top:15px;font-weight:bold;color:#333;margin-bottom:5px;}
            input{width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:1rem;box-sizing:border-box;}
            input:focus{outline:none;border-color:#3a7bd5;box-shadow:0 0 0 3px rgba(58,123,213,0.1);}
            button{width:100%;padding:12px;margin-top:20px;background:#3a7bd5;color:white;border:none;border-radius:8px;font-weight:bold;font-size:1rem;cursor:pointer;}
            button:hover{background:#2a5fa5;}
            .success{color:#2ecc71;font-weight:bold;margin:10px 0;}
            .error{color:#e74c3c;font-weight:bold;margin:10px 0;}
            .info{background:#f0f7ff;padding:15px;border-radius:8px;margin-top:15px;border-left:4px solid #3a7bd5;color:#333;}
        </style></head><body>
            <div class="header"><div style="font-size:1.2rem;font-weight:bold;">AZUL CRÉDITO</div><a href="/simulacoes" style="color:white;text-decoration:none;font-weight:bold;border:1px solid white;padding:5px 15px;border-radius:8px;">← VOLTAR</a></div>

            <div class="container">
                <h1 style="color:#1e3c72;text-align:center;">⚙️ Meu Perfil</h1>

                <div class="card">
                    <h2>👤 Meus Dados</h2>
                    <div id="resultado-perfil"></div>
                    <label>Nome</label>
                    <input type="text" id="nome" value="${user.nome}" placeholder="Seu nome completo">

                    <label>Email</label>
                    <input type="email" id="email" value="${user.email}" placeholder="seu@email.com">

                    <label>WhatsApp</label>
                    <input type="tel" id="whatsapp" value="${user.whatsapp || ''}" placeholder="55 xx 99999-9999">

                    <button onclick="atualizarPerfil()">✅ Salvar Alterações</button>
                </div>

                <div class="card">
                    <h2>🔒 Trocar Senha</h2>
                    <div id="resultado-senha"></div>
                    <label>Senha Atual</label>
                    <input type="password" id="senha-atual" placeholder="Digite sua senha atual">

                    <label>Nova Senha</label>
                    <input type="password" id="nova-senha" placeholder="Digite a nova senha">

                    <label>Confirmar Nova Senha</label>
                    <input type="password" id="confirmar-senha" placeholder="Confirme a nova senha">

                    <button onclick="trocarSenha()">🔒 Trocar Senha</button>

                    <div class="info" style="background:#fff3cd;border-left-color:#ff9800;">
                        <strong>🔐 Requisitos de Senha Forte:</strong>
                        <ul style="margin:10px 0;padding-left:20px;">
                            <li>Mínimo 8 caracteres</li>
                            <li>Pelo menos 1 LETRA MAIÚSCULA (A-Z)</li>
                            <li>Pelo menos 1 letra minúscula (a-z)</li>
                            <li>Pelo menos 1 número (0-9)</li>
                            <li>Pelo menos 1 caractere especial (!@#$%^&*)</li>
                            <li>Sem sequências óbvias (123, abc, 111...)</li>
                        </ul>
                    </div>
                </div>
            </div>

            <script>
                async function atualizarPerfil() {
                    const nome = document.getElementById('nome').value.trim();
                    const email = document.getElementById('email').value.trim();
                    const whatsapp = document.getElementById('whatsapp').value.trim();

                    if (!nome || !email) {
                        document.getElementById('resultado-perfil').innerHTML = '<p class="error">❌ Nome e Email são obrigatórios!</p>';
                        return;
                    }

                    const resp = await fetch('/atualizar-perfil', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nome, email, whatsapp })
                    });

                    const json = await resp.json();
                    if (json.ok) {
                        document.getElementById('resultado-perfil').innerHTML = '<p class="success">✅ Perfil atualizado com sucesso!</p>';
                    } else {
                        document.getElementById('resultado-perfil').innerHTML = '<p class="error">❌ ' + (json.msg || 'Erro ao atualizar') + '</p>';
                    }
                }

                async function trocarSenha() {
                    const senhaAtual = document.getElementById('senha-atual').value;
                    const novaSenha = document.getElementById('nova-senha').value;
                    const confirmar = document.getElementById('confirmar-senha').value;

                    if (!senhaAtual || !novaSenha || !confirmar) {
                        document.getElementById('resultado-senha').innerHTML = '<p class="error">❌ Preencha todos os campos!</p>';
                        return;
                    }

                    if (novaSenha !== confirmar) {
                        document.getElementById('resultado-senha').innerHTML = '<p class="error">❌ As senhas não correspondem!</p>';
                        return;
                    }

                    const resp = await fetch('/trocar-senha', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha })
                    });

                    const json = await resp.json();
                    if (json.ok) {
                        document.getElementById('resultado-senha').innerHTML = '<p class="success">✅ Senha alterada com sucesso! Você será redirecionado...</p>';
                        setTimeout(() => { location.href = '/simulacoes'; }, 2000);
                    } else {
                        document.getElementById('resultado-senha').innerHTML = '<p class="error">❌ ' + (json.msg || 'Erro ao trocar senha') + '</p>';
                    }
                }
            </script>
        </body></html>`);
    } catch (e) {
        console.error('❌ Erro em /perfil:', e);
        res.status(500).send('Erro ao carregar perfil');
    }
});

app.get('/simulacoes', async (req, res) => {
    if (!req.session.usuarioLogado) return res.send("<script>location.href='/';</script>");
    const cpf = req.session.userCpf;
    try {
        const result = await pool.query('SELECT * FROM SIMULACOES WHERE CPF = $1 ORDER BY CRIADO_EM DESC', [cpf]);

        // Fetch total paid for each simulation
        const pagamentosPromises = result.rows.map(r =>
            pool.query('SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1', [r.id])
        );
        const pagamentosResults = await Promise.all(pagamentosPromises);
        res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Painel AzulCrédito</title><script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script><style>
            body{font-family:"Segoe UI",sans-serif;background:#f4f7fa;margin:0;padding:0;}
            .header{background:#1e3c72;color:white;padding:15px 30px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 10px rgba(0,0,0,0.1);}
            .container{max-width:900px;margin:30px auto;padding:20px;}
            .card{background:white;padding:30px;border-radius:24px;box-shadow:0 10px 25px rgba(0,0,0,0.05);margin-bottom:30px;}
            input,button{width:100%;padding:14px;margin:10px 0;border-radius:12px;border:2px solid #eef2f7;font-size:1rem;box-sizing:border-box;}
            .btn-blue{background:#3a7bd5;color:white;font-weight:bold;border:none;cursor:pointer;margin-top:20px;}
            .btn-pdf{background:#e74c3c;color:white;padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;font-size:0.85rem;margin-top:5px;}
            .resumo-box{background:#f0f7ff; padding:20px; border-radius:15px; margin:15px 0; border-left:5px solid #3a7bd5; display:none;}
            .badge{padding:6px 12px;border-radius:50px;font-size:0.85rem;font-weight:bold;}
            .st-PAGO{background:#dcfce7;color:#166534;}.st-ANÁLISE{background:#fef9c3;color:#854d0e;}.st-REPROVADO{background:#fee2e2;color:#991b1b;}
            table{width:100%;border-collapse:collapse;}td, th{padding:15px 10px; border-bottom:1px solid #f1f5f9; text-align:left;}
        </style></head><body>
            <div class="header"><div style="font-size:1.2rem;font-weight:bold;">AZUL CRÉDITO</div><div style="display:flex;gap:10px;"><a href="/perfil" style="color:white;text-decoration:none;font-weight:bold;border:1px solid white;padding:5px 15px;border-radius:8px;">⚙️ PERFIL</a><a href="/sair" style="color:white;text-decoration:none;font-weight:bold;border:1px solid white;padding:5px 15px;border-radius:8px;">SAIR</a></div></div>
            <div class="container"><h2>Olá, ${req.session.userName}! 👋</h2>
            <div class="card"><h3>💰 Solicitar Empréstimo</h3><form action="/enviar-proposta" method="POST" enctype="multipart/form-data">
            <label>VALOR DESEJADO (MÁX R$ 20.000)</label><input type="text" id="v_mask" placeholder="R$ 0,00" required><input type="hidden" id="v_real" name="valor">
            <label>PARCELAS (MÁX 24)</label><input type="number" id="parcelas" name="parcelas" placeholder="Ex: 12" min="1" max="24" required>
            <div id="resumo" class="resumo-box"><strong>Total a pagar: </strong><span id="total-txt" style="font-size:1.3rem; color:#1e3c72; font-weight:bold;">R$ 0,00</span><br><small>*Incluso taxa de 5% por parcela</small></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:15px;"><div><label>FOTO ID</label><input type="file" name="doc_id" required></div><div><label>RENDA</label><input type="file" name="doc_renda" required></div></div>
            <button type="submit" class="btn-blue">SOLICITAR CRÉDITO</button></form></div>
            <div class="card"><h3>📋 Meu Histórico</h3><table><thead><tr><th>DATA</th><th>VALOR</th><th>PARCELAS</th><th>MENSAL</th><th>PAGO</th><th>FALTA</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>
            ${result.rows.map((r, idx) => {
                const totalPago = parseFloat(pagamentosResults[idx].rows[0].total_pago || 0);
                const parcelas = parseInt(r.parcelas || 1);
                const totalValor = parseFloat(r.total);
                const valorMensal = totalValor / parcelas;
                const parcelasPagas = Math.floor(totalPago / valorMensal);
                const parcelasRestantes = parcelas - parcelasPagas;
                const faltaPagar = totalValor - totalPago;
                const percentualPago = ((totalPago / totalValor) * 100).toFixed(1);
                return `<tr><td>${new Date(r.criado_em).toLocaleDateString()}</td><td>${formatarMoeda(r.valor)}</td><td style="font-weight:bold;">${parcelasPagas}/${parcelas}</td><td>${formatarMoeda(valorMensal)}</td><td style="font-weight:bold;color:#2ecc71;">${formatarMoeda(totalPago)}<br><small style="color:#666;">(${percentualPago}%)</small></td><td style="font-weight:bold;color:#e74c3c;">${formatarMoeda(faltaPagar)}<br><small style="color:#666;">${parcelasRestantes} parcelas</small></td><td style="text-align:center;"><span class="badge st-${r.status.replace(/\s/g,'')}">${r.status}</span></td><td><button class="btn-pdf" onclick="gerarPDF(${r.id}, '${r.nome}', '${formatarMoeda(r.valor)}', '${formatarMoeda(r.total)}', '${r.status}', '${new Date(r.criado_em).toLocaleDateString()}')">📥 PDF</button><button class="btn-pdf" style="background:#27ae60;margin-left:5px;" onclick="verPagamentos(${r.id})">💰 Pagamentos</button></td></tr>`;
            }).join('')}
            </tbody></table></div></div>
            <div id="modalPagamentos" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;justify-content:center;align-items:center;overflow-y:auto;">
                <div style="background:white;padding:30px;border-radius:15px;width:min(600px,90%);margin:30px auto;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h3 style="margin:0;color:#1e3c72;">Histórico de Pagamentos</h3>
                        <button onclick="fecharModalPagamentos()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>
                    </div>
                    <div id="pagamentos-container" style="max-height:400px;overflow-y:auto;"></div>
                </div>
            </div>
            <script>
                function fecharModalPagamentos(){document.getElementById('modalPagamentos').style.display='none';}
                async function verPagamentos(id){
                    const modal=document.getElementById('modalPagamentos');
                    const container=document.getElementById('pagamentos-container');
                    container.innerHTML='<p style="text-align:center;">Carregando...</p>';
                    modal.style.display='flex';
                    try{
                        const resp=await fetch('/pagamentos/'+id);
                        const json=await resp.json();
                        if(json.ok&&json.pagamentos.length>0){
                            let html='<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f0f7ff;"><th style="padding:10px;text-align:left;border-bottom:2px solid #ddd;">Data</th><th style="padding:10px;text-align:left;border-bottom:2px solid #ddd;">Valor</th></tr></thead><tbody>';
                            json.pagamentos.forEach(p=>{html+=\`<tr><td style="padding:10px;border-bottom:1px solid #eee;">\${new Date(p.data_pagamento).toLocaleDateString()}</td><td style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;">R$ \${parseFloat(p.valor).toFixed(2).replace('.',',')}</td></tr>\`;});
                            html+='</tbody></table><div style="margin-top:20px;padding:15px;background:#f0fdf4;border-radius:8px;border-left:4px solid #2ecc71;"><strong>Total Pago:</strong> R$ '+parseFloat(json.total_pago).toFixed(2).replace('.',',')+' ✅</div>';
                            container.innerHTML=html;
                        }else{
                            container.innerHTML='<p style="text-align:center;color:#666;">Nenhum pagamento registrado</p>';
                        }
                    }catch(e){
                        container.innerHTML='<p style="text-align:center;color:red;">Erro ao carregar</p>';
                    }
                }
                const vM=document.getElementById("v_mask"), vR=document.getElementById("v_real"), pI=document.getElementById("parcelas"), res=document.getElementById("resumo"), txt=document.getElementById("total-txt");
                function calc(){
                    const val=parseFloat(vR.value)||0;
                    const par=parseInt(pI.value)||0;
                    if(val>0 && par>0){
                        const tot=val+(val*0.05*par);
                        const valorParcela=tot/par;
                        txt.innerHTML=\`<div style="margin-bottom:15px;"><strong>📊 Resumo da Simulação</strong></div>
                        <div style="margin-bottom:10px;padding:10px;background:#fff9e6;border-radius:8px;">
                            <div style="margin:8px 0;"><strong>Você pediu:</strong> R$ \${val.toFixed(2).replace('.',',')}</div>
                            <div style="margin:8px 0;"><strong>Parcelas:</strong> \${par}x</div>
                            <div style="margin:8px 0;"><strong>Taxa:</strong> 5% por parcela</div>
                            <div style="margin:8px 0;border-top:1px solid #ddd;padding-top:10px;"><strong>Valor de cada parcela:</strong> <span style="font-size:1.1rem;color:#1e3c72;font-weight:bold;">R$ \${valorParcela.toFixed(2).replace('.',',')}</span></div>
                            <div style="margin:8px 0;border-top:1px solid #ddd;padding-top:10px;"><strong>Total a pagar:</strong> <span style="font-size:1.3rem;color:#2ecc71;font-weight:bold;">R$ \${tot.toFixed(2).replace('.',',')}</span></div>
                        </div>\`;
                        res.style.display="block";
                    }else{res.style.display="none";}
                }
                vM.addEventListener("input",(e)=>{let v=e.target.value.replace(/\\D/g,"");if(parseInt(v)>2000000)v="2000000";v=(Number(v)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});e.target.value=v;vR.value=Number(e.target.value.replace(/\\D/g,""))/100; calc();});
                pI.addEventListener("input", calc);

                function gerarPDF(id, nome, valor, total, status, data) {
                    const html = \`
                        <div style="font-family:Arial;padding:40px;">
                            <div style="text-align:center;margin-bottom:40px;">
                                <h1 style="color:#1e3c72;margin:0;">AzulCrédito</h1>
                                <p style="color:#666;margin:5px 0 0 0;">Recibo de Proposta</p>
                            </div>
                            <div style="border:1px solid #ddd;padding:20px;border-radius:8px;margin-bottom:30px;">
                                <table style="width:100%;">
                                    <tr>
                                        <td><strong>ID da Proposta:</strong></td>
                                        <td>\${id}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Nome:</strong></td>
                                        <td>\${nome}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Valor Solicitado:</strong></td>
                                        <td>\${valor}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Valor Total (com juros):</strong></td>
                                        <td style="font-weight:bold;color:#1e3c72;">\${total}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Status:</strong></td>
                                        <td>\${status}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Data:</strong></td>
                                        <td>\${data}</td>
                                    </tr>
                                </table>
                            </div>
                            <div style="font-size:12px;color:#999;text-align:center;">
                                <p>Este é um recibo oficial de sua proposta de empréstimo.</p>
                                <p>Gerado em: \${new Date().toLocaleString('pt-BR')}</p>
                            </div>
                        </div>
                    \`;
                    const opt = {margin:10, filename:'recibo-azulcredito.pdf', image:{type:'jpeg', quality:0.98}, html2canvas:{scale:2}, jsPDF:{orientation:'portrait', unit:'mm', format:'a4'}};
                    html2pdf().set(opt).from(html).save();
                }
            </script></body></html>`);
    } catch (e) { res.status(500).send("Erro"); }
});

app.post('/enviar-proposta', upload.fields([{name:'doc_id'}, {name:'doc_renda'}]), async (req, res) => {
    try {
        const { valor, parcelas } = req.body;
        const vPedido = parseFloat(valor);
        const p = parseInt(parcelas);
        const user = await pool.query('SELECT nome, email, whatsapp FROM USUARIOS WHERE cpf = $1', [req.session.userCpf]);
        const vTotal = vPedido + (vPedido * 0.05 * p);

        console.log('💾 Salvando proposta:', { nome: user.rows[0].nome, email: user.rows[0].email, valor: vPedido });

        await pool.query('INSERT INTO SIMULACOES (NOME, CPF, VALOR, PARCELAS, VALOR_PARCELA, TOTAL, STATUS, DOCUMENTO_PATH, RENDA_PATH, EMAIL, WHATSAPP) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
            [user.rows[0].nome, req.session.userCpf, vPedido, p, vTotal/p, vTotal, 'EM ANÁLISE', req.files['doc_id'][0].filename, req.files['doc_renda'][0].filename, user.rows[0].email, user.rows[0].whatsapp]);

        console.log('✅ Proposta salva no BD. Enviando email...');

        // Enviar e-mail com blindagem: não causa erro 500 se falhar
        if (user.rows[0].email) {
            enviarEmailConfirmacao(user.rows[0].email, user.rows[0].nome, vPedido).catch(err => {
                console.error('⚠️ Email falhou, mas proposição foi salva:', err.message);
            });
        } else {
            console.warn('⚠️ Usuário sem email cadastrado');
        }
        res.send("<script>alert('Proposta enviada!'); window.location.href='/simulacoes';</script>");
    } catch (e) {
        console.error('❌ Erro em /enviar-proposta:', e);
        res.status(500).send("Erro ao processar.");
    }
});

// --- 5. ADMIN COM DASHBOARD ---
app.get('/admin-azul', adminAuth, async (req, res) => {
    try {
        const allSims = await pool.query('SELECT * FROM SIMULACOES ORDER BY CRIADO_EM DESC');

        // Cálculos para o dashboard
        const totalSolicitado = allSims.rows.reduce((acc, r) => acc + parseFloat(r.valor || 0), 0);
        const totalAprovado = allSims.rows.filter(r => r.status === 'PAGO').reduce((acc, r) => acc + parseFloat(r.total || 0), 0);
        const totalReprovado = allSims.rows.filter(r => r.status === 'REPROVADO').length;
        const emAnalise = allSims.rows.filter(r => r.status === 'EM ANÁLISE').length;
        const aprovados = allSims.rows.filter(r => r.status === 'PAGO').length;
        const taxaAprovacao = allSims.rows.length > 0 ? ((aprovados / allSims.rows.length) * 100).toFixed(1) : 0;

        // Dados por mês
        const porMes = {};
        allSims.rows.forEach(r => {
            const mes = new Date(r.criado_em).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            if (!porMes[mes]) porMes[mes] = 0;
            porMes[mes]++;
        });
        const meses = Object.keys(porMes).slice(-6);
        const quantidades = meses.map(m => porMes[m]);

        // Top clientes
        const topClientes = {};
        allSims.rows.forEach(r => {
            if (!topClientes[r.nome]) topClientes[r.nome] = { valor: 0, count: 0 };
            topClientes[r.nome].valor += parseFloat(r.total || 0);
            topClientes[r.nome].count++;
        });
        const top5 = Object.entries(topClientes)
            .sort((a, b) => b[1].valor - a[1].valor)
            .slice(0, 5)
            .map(([nome, dados]) => `<tr><td>${nome}</td><td>${dados.count}</td><td>${formatarMoeda(dados.valor)}</td></tr>`);

        const perfis = {};
        allSims.rows.forEach(r => {
            if (!perfis[r.cpf]) perfis[r.cpf] = { nome: r.nome, whatsapp: r.whatsapp, email: r.email, pedidos: [] };
            perfis[r.cpf].pedidos.push(r);
        });

        res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Admin AzulCrédito</title><script src="https://cdn.jsdelivr.net/npm/chart.js"></script><style>
            body{font-family:"Segoe UI",sans-serif;background:#f0f4f8;padding:20px;}
            .header{background:#1e3c72;color:white;padding:20px;border-radius:10px;margin-bottom:30px;display:flex;justify-content:space-between;align-items:center;}
            .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:40px;}
            .stat-card{background:white;padding:25px;border-radius:15px;border-left:5px solid #1e3c72;box-shadow:0 2px 10px rgba(0,0,0,0.05);}
            .stat-card h3{margin:0;font-size:0.9rem;color:#666;text-transform:uppercase;}
            .stat-card .valor{font-size:2rem;font-weight:bold;color:#1e3c72;margin-top:10px;}
            .stat-card.sucesso{border-left-color:#2ecc71;}.stat-card.sucesso .valor{color:#2ecc71;}
            .stat-card.analise{border-left-color:#f39c12;}.stat-card.analise .valor{color:#f39c12;}
            .stat-card.reprovado{border-left-color:#e74c3c;}.stat-card.reprovado .valor{color:#e74c3c;}
            .charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(500px,1fr));gap:30px;margin-bottom:40px;}
            .chart-container{background:white;padding:25px;border-radius:15px;box-shadow:0 2px 10px rgba(0,0,0,0.05);}
            .chart-container h3{margin-top:0;color:#1e3c72;}
            canvas{max-height:300px;}
            .top-clientes{background:white;padding:25px;border-radius:15px;box-shadow:0 2px 10px rgba(0,0,0,0.05);margin-bottom:40px;}
            .top-clientes h3{margin-top:0;color:#1e3c72;}
            table{width:100%;border-collapse:collapse;font-size:0.9rem;}
            table th{background:#f8f9fa;padding:12px;text-align:left;font-weight:600;color:#333;}
            table td{padding:12px;border-bottom:1px solid #f1f3f5;}
            .profile-card{background:white;border-radius:15px;margin-bottom:20px;box-shadow:0 2px 10px rgba(0,0,0,0.05);overflow:hidden;}
            .profile-header{background:#1e3c72;color:white;padding:15px 25px;display:flex;justify-content:space-between;align-items:center;}
            .btn-whatsapp{background:#25d366;color:white;padding:8px 16px;border-radius:50px;text-decoration:none;font-weight:bold;font-size:0.8rem;}
            .badge{padding:4px 12px;border-radius:50px;font-size:0.7rem;font-weight:bold;}
            .st-pago{background:#d4edda;color:#155724;}.st-analise{background:#fff3cd;color:#856404;}.st-reprovado{background:#f8d7da;color:#721c24;}
            .doc-link{text-decoration:none;font-weight:bold;color:#3498db;margin-right:10px;}
            select,button{padding:6px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;}
            button{background:#3a7bd5;color:white;border:none;font-weight:bold;}
            button:hover{background:#2a5fa5;}
        </style></head><body>
            <div class="header">
                <h1 style="margin:0;">📊 Painel de Gestão - AzulCrédito</h1>
                <div style="display:flex;gap:10px;">
                    <button onclick="limparDados()" style="background:#e74c3c;color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:bold;">🗑️ Limpar Dados</button>
                    <a href="/sair" style="color:white;text-decoration:none;font-weight:bold;border:1px solid white;padding:8px 16px;border-radius:8px;">SAIR</a>
                </div>
            </div>

            <div class="stats">
                <div class="stat-card">
                    <h3>💰 Solicitado</h3>
                    <div class="valor">${formatarMoeda(totalSolicitado)}</div>
                </div>
                <div class="stat-card sucesso">
                    <h3>✅ Aprovado</h3>
                    <div class="valor">${aprovados}</div>
                </div>
                <div class="stat-card analise">
                    <h3>⏳ Em Análise</h3>
                    <div class="valor">${emAnalise}</div>
                </div>
                <div class="stat-card reprovado">
                    <h3>❌ Reprovado</h3>
                    <div class="valor">${totalReprovado}</div>
                </div>
                <div class="stat-card sucesso">
                    <h3>📈 Taxa Aprovação</h3>
                    <div class="valor">${taxaAprovacao}%</div>
                </div>
                <div class="stat-card">
                    <h3>💵 Total Aprovado</h3>
                    <div class="valor">${formatarMoeda(totalAprovado)}</div>
                </div>
            </div>

            <div class="charts">
                <div class="chart-container">
                    <h3>Status das Propostas</h3>
                    <canvas id="chartStatus"></canvas>
                </div>
                <div class="chart-container">
                    <h3>Propostas por Mês</h3>
                    <canvas id="chartMes"></canvas>
                </div>
            </div>

            <div class="top-clientes">
                <h3>👥 Top 5 Clientes</h3>
                <table>
                    <thead><tr><th>Cliente</th><th>Propostas</th><th>Valor Total</th></tr></thead>
                    <tbody>${top5.join('')}</tbody>
                </table>
            </div>

            <h2 style="color:#1e3c72;margin-bottom:20px;">👥 Gerenciar Propostas</h2>` +
            (await Promise.all(Object.keys(perfis).map(async cpf => {
                const p = perfis[cpf];
                // Fetch payment totals for each proposal
                const pagamentosPromises = p.pedidos.map(ped =>
                    pool.query('SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1', [ped.id])
                );
                const pagamentosResults = await Promise.all(pagamentosPromises);

                return `<div class="profile-card"><div class="profile-header"><div><strong>👤 ${p.nome}</strong> <small style="margin-left:15px;opacity:0.8;">CPF: ${cpf}</small></div><a href="https://wa.me/${p.whatsapp}" target="_blank" class="btn-whatsapp">WHATSAPP</a></div><table><thead><tr><th>DATA</th><th>VALOR</th><th>TOTAL</th><th>PARCELAS</th><th>MENSAL</th><th>PAGO</th><th>FALTA</th><th>DOCS</th><th>AÇÃO</th></tr></thead><tbody>` +
                p.pedidos.map((ped, idx) => {
                    const st = ped.status === 'PAGO' ? 'st-pago' : (ped.status === 'REPROVADO' ? 'st-reprovado' : 'st-analise');
                    const totalPago = parseFloat(pagamentosResults[idx].rows[0].total_pago || 0);
                    const parcelas = parseInt(ped.parcelas || 1);
                    const valorMensal = parseFloat(ped.total) / parcelas;
                    const totalValor = parseFloat(ped.total);
                    const parcelasPagas = Math.floor(totalPago / valorMensal);
                    const parcelasRestantes = parcelas - parcelasPagas;
                    const faltaPagar = totalValor - totalPago;
                    const percentualPago = ((totalPago / totalValor) * 100).toFixed(1);
                    return `<tr><td>${new Date(ped.criado_em).toLocaleDateString()}</td><td>${formatarMoeda(ped.valor)}</td><td style="font-weight:bold;">${formatarMoeda(totalValor)}</td><td style="font-weight:bold;">${parcelasPagas}/${parcelas}</td><td>${formatarMoeda(valorMensal)}</td><td style="font-weight:bold;color:#2ecc71;">${formatarMoeda(totalPago)}<br><small style="color:#666;">(${percentualPago}%)</small></td><td style="font-weight:bold;color:#e74c3c;">${formatarMoeda(faltaPagar)}<br><small style="color:#666;">${parcelasRestantes} parcelas</small></td><td><a href="/ver-arquivo/${ped.documento_path}" target="_blank" class="doc-link">🗂️</a><a href="/ver-arquivo/${ped.renda_path}" target="_blank" class="doc-link">📄</a></td><td><span class="badge ${st}">${ped.status}</span><select id="st-${ped.id}"><option value="EM ANÁLISE" ${ped.status==='EM ANÁLISE'?'selected':''}>Análise</option><option value="PAGO" ${ped.status==='PAGO'?'selected':''}>Aprovar</option><option value="REPROVADO" ${ped.status==='REPROVADO'?'selected':''}>Reprovar</option></select><button onclick="salvar(${ped.id},'${p.whatsapp}','${p.nome}')">OK</button><button style="background:#27ae60;margin-left:5px;" onclick="abrirModalPagamento(${ped.id},'${formatarMoeda(ped.valor)}','${formatarMoeda(ped.total)}')">💰 Pagamento</button></td></tr>`;
                }).join('') + '</tbody></table></div>';
            }))).join('') +
            `<div id="modalPagamento" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;justify-content:center;align-items:center;">
                <div style="background:white;padding:30px;border-radius:15px;width:min(400px,90%);box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                    <h3 style="margin-top:0;color:#1e3c72;">Registrar Pagamento</h3>
                    <div style="margin:15px 0;">
                        <label style="display:block;font-weight:bold;margin-bottom:5px;color:#333;">Valor do Pagamento</label>
                        <input type="number" id="valor-pagamento" placeholder="Ex: 100.00" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;" step="0.01" min="0">
                    </div>
                    <div style="margin:15px 0;">
                        <label style="display:block;font-weight:bold;margin-bottom:5px;color:#333;">Data do Pagamento</label>
                        <input type="date" id="data-pagamento" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
                    </div>
                    <div style="display:flex;gap:10px;margin-top:25px;">
                        <button onclick="registrarPagamento()" style="flex:1;background:#27ae60;color:white;padding:10px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">✅ Registrar</button>
                        <button onclick="fecharModalPagamento()" style="flex:1;background:#95a5a6;color:white;padding:10px;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">✕ Cancelar</button>
                    </div>
                </div>
            </div>
            <script>
            let simIdAtual = null;
            function abrirModalPagamento(id,val,tot){simIdAtual=id;document.getElementById('modalPagamento').style.display='flex';document.getElementById('data-pagamento').valueAsDate=new Date();document.getElementById('valor-pagamento').focus();}
            function fecharModalPagamento(){document.getElementById('modalPagamento').style.display='none';}
            async function registrarPagamento(){const val=parseFloat(document.getElementById('valor-pagamento').value);const data=document.getElementById('data-pagamento').value;if(!val||!data){alert('Preencha todos os campos');return;}
            const resp=await fetch('/registrar-pagamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({simulacao_id:simIdAtual,valor:val,data_pagamento:data})});const json=await resp.json();if(json.ok){alert('✅ Pagamento registrado!');location.reload();}else{alert('❌ Erro ao registrar');}}
            async function limparDados(){if(confirm('⚠️ ATENÇÃO!\\n\\nVocê tem certeza que quer DELETAR TODOS os dados?\\n\\nEsta ação é IRREVERSÍVEL!')){const resp=await fetch('/admin-limpar-dados',{method:'POST',headers:{'Content-Type':'application/json'}});const json=await resp.json();if(json.ok){alert('✅ '+json.msg);location.reload();}else{alert('❌ '+json.msg);}}}
            async function salvar(id,whats,nome){const st=document.getElementById('st-'+id).value;await fetch('/atualizar-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:st})});if(st==='PAGO'){window.open("https://wa.me/"+whats+"?text="+encodeURIComponent("Olá "+nome+"! Seu empréstimo foi APROVADO! 🚀"),"_blank");}location.reload();}

            // Gráfico de Status
            const ctxStatus = document.getElementById('chartStatus').getContext('2d');
            new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: ['✅ Aprovado', '⏳ Em Análise', '❌ Reprovado'],
                    datasets: [{
                        data: [${aprovados}, ${emAnalise}, ${totalReprovado}],
                        backgroundColor: ['#2ecc71', '#f39c12', '#e74c3c'],
                        borderWidth: 0
                    }]
                },
                options: {responsive: true, plugins: {legend: {position: 'bottom'}}}
            });

            // Gráfico de Mês
            const ctxMes = document.getElementById('chartMes').getContext('2d');
            new Chart(ctxMes, {
                type: 'line',
                data: {
                    labels: ${JSON.stringify(meses)},
                    datasets: [{
                        label: 'Propostas',
                        data: ${JSON.stringify(quantidades)},
                        borderColor: '#1e3c72',
                        backgroundColor: 'rgba(30, 60, 114, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {responsive: true, plugins: {legend: {display: true}}, scales: {y: {beginAtZero: true}}}
            });
            </script></body></html>`);
    } catch (e) { console.error(e); res.status(500).send("Erro"); }
});

app.post('/atualizar-status', adminAuth, async (req, res) => {
    const { id, status } = req.body;
    try {
        console.log('📋 Atualizando status da simulação:', { id, status });
        const cli = await pool.query('SELECT nome, email FROM SIMULACOES WHERE ID = $1', [id]);
        await pool.query('UPDATE SIMULACOES SET STATUS = $1 WHERE ID = $2', [status, id]);

        console.log('✅ Status atualizado. Email:', cli.rows[0].email);

        // Enviar e-mails com blindagem: não causa erro 500 se falhar
        if (cli.rows[0].email) {
            if (status === 'PAGO') {
                console.log('📧 Enviando email de APROVAÇÃO...');
                enviarEmailAprovado(cli.rows[0].email, cli.rows[0].nome).catch(err => {
                    console.error('⚠️ Email de aprovação falhou:', err.message);
                });
            }
            if (status === 'REPROVADO') {
                console.log('📧 Enviando email de REPROVAÇÃO...');
                enviarEmailReprovado(cli.rows[0].email, cli.rows[0].nome).catch(err => {
                    console.error('⚠️ Email de reprovação falhou:', err.message);
                });
            }
        } else {
            console.warn('⚠️ Usuário sem email cadastrado');
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('❌ Erro em /atualizar-status:', err);
        res.status(500).json({ ok: false });
    }
});

// --- ROTAS DE PAGAMENTO ---
app.post('/registrar-pagamento', adminAuth, async (req, res) => {
    try {
        const { simulacao_id, valor, data_pagamento } = req.body;

        // Inserir pagamento
        await pool.query('INSERT INTO PAGAMENTOS (simulacao_id, valor, data_pagamento, status) VALUES ($1, $2, $3, $4)',
            [simulacao_id, valor, data_pagamento, 'CONFIRMADO']);

        console.log('💰 Pagamento registrado:', { simulacao_id, valor });

        // Buscar dados da simulação para enviar email
        const simResult = await pool.query('SELECT nome, email, total, parcelas FROM SIMULACOES WHERE id = $1', [simulacao_id]);
        if (simResult.rows.length > 0) {
            const sim = simResult.rows[0];

            // Calcular total pago até agora
            const pagtoResult = await pool.query('SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1', [simulacao_id]);
            const totalPago = parseFloat(pagtoResult.rows[0].total_pago);
            const totalDivida = parseFloat(sim.total);
            const valorMensal = totalDivida / parseInt(sim.parcelas);
            const parcelasRestantes = Math.ceil((totalDivida - totalPago) / valorMensal);

            // Enviar email com blindagem
            enviarEmailPagamento(
                sim.email,
                sim.nome,
                parseFloat(valor),
                totalPago,
                totalDivida,
                parseInt(sim.parcelas),
                parcelasRestantes
            ).catch(err => {
                console.error('⚠️ Email de pagamento falhou, mas pagamento foi registrado:', err.message);
            });
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('❌ Erro ao registrar pagamento:', err);
        res.status(500).json({ ok: false });
    }
});

app.get('/pagamentos/:simulacao_id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM PAGAMENTOS WHERE simulacao_id = $1 ORDER BY data_pagamento DESC', [req.params.simulacao_id]);
        const total_pago = result.rows.reduce((acc, r) => acc + parseFloat(r.valor || 0), 0);
        res.json({ ok: true, pagamentos: result.rows, total_pago });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

// --- ATUALIZAR PERFIL ---
app.post('/atualizar-perfil', async (req, res) => {
    if (!req.session.usuarioLogado) return res.status(401).json({ ok: false, msg: 'Não autenticado' });

    const { nome, email, whatsapp } = req.body;
    if (!nome || !email) return res.status(400).json({ ok: false, msg: 'Nome e Email são obrigatórios' });

    try {
        const cpf = req.session.userCpf;

        // Verificar se email já existe (para outro usuário)
        const emailExists = await pool.query('SELECT cpf FROM USUARIOS WHERE email = $1 AND cpf != $2', [email, cpf]);
        if (emailExists.rows.length > 0) {
            return res.status(400).json({ ok: false, msg: 'Este email já está cadastrado' });
        }

        await pool.query(
            'UPDATE USUARIOS SET nome = $1, email = $2, whatsapp = $3 WHERE cpf = $4',
            [nome, email, whatsapp || null, cpf]
        );

        // Atualizar nome na sessão
        req.session.userName = nome;

        console.log('✅ Perfil atualizado:', { cpf, nome, email });
        res.json({ ok: true, msg: 'Perfil atualizado com sucesso' });
    } catch (err) {
        console.error('❌ Erro ao atualizar perfil:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao atualizar perfil' });
    }
});

// --- TROCAR SENHA ---
app.post('/trocar-senha', async (req, res) => {
    if (!req.session.usuarioLogado) return res.status(401).json({ ok: false, msg: 'Não autenticado' });

    const { senha_atual, nova_senha } = req.body;
    if (!senha_atual || !nova_senha) return res.status(400).json({ ok: false, msg: 'Preencha todos os campos' });

    try {
        const cpf = req.session.userCpf;

        // Verificar se a senha atual está correta
        const result = await pool.query('SELECT senha FROM USUARIOS WHERE cpf = $1', [cpf]);
        if (result.rows.length === 0) return res.status(401).json({ ok: false, msg: 'Usuário não encontrado' });

        if (result.rows[0].senha !== senha_atual) {
            return res.status(401).json({ ok: false, msg: 'Senha atual incorreta' });
        }

        // Validar força da nova senha
        const validacao = validarSenha(nova_senha);
        if (!validacao.valida) {
            return res.status(400).json({ ok: false, msg: validacao.msg });
        }

        // Atualizar senha
        await pool.query('UPDATE USUARIOS SET senha = $1 WHERE cpf = $2', [nova_senha, cpf]);

        console.log('✅ Senha alterada:', { cpf });
        res.json({ ok: true, msg: 'Senha alterada com sucesso' });
    } catch (err) {
        console.error('❌ Erro ao trocar senha:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao trocar senha' });
    }
});

// --- LIMPAR DADOS (DELETE APENAS) ---
app.post('/admin-limpar-dados', adminAuth, async (req, res) => {
    try {
        console.log('🗑️ Limpando dados de teste...');

        // Deletar em ordem de dependência (por causa das foreign keys)
        const resultPag = await pool.query('DELETE FROM PAGAMENTOS');
        console.log(`✅ ${resultPag.rowCount} registros de PAGAMENTOS deletados`);

        const resultSim = await pool.query('DELETE FROM SIMULACOES');
        console.log(`✅ ${resultSim.rowCount} registros de SIMULACOES deletados`);

        const resultUsr = await pool.query('DELETE FROM USUARIOS');
        console.log(`✅ ${resultUsr.rowCount} registros de USUARIOS deletados`);

        res.json({
            ok: true,
            msg: `🗑️ Dados limpados!\n- ${resultPag.rowCount} pagamentos\n- ${resultSim.rowCount} propostas\n- ${resultUsr.rowCount} usuários`
        });
    } catch (err) {
        console.error('❌ Erro ao limpar dados:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao limpar dados' });
    }
});

app.listen(PORT, () => { console.log('🚀 Servidor AzulCrédito ON: http://localhost:' + PORT); });