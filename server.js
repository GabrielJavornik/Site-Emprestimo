const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const basicAuth = require('express-basic-auth');
const session = require('express-session');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const { MercadoPagoConfig, Payment } = require('mercadopago');

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

// --- 3. CONFIGURAÇÃO DO MERCADOPAGO (PIX) ---
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'TEST-1234567890abcdefghijk'; // Substituir com token real
const mpClient = new Payment(new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN }));
console.log('✅ MercadoPago CONFIGURADO - PIX habilitado');

// --- GERADOR DE PIX BR CODE - CÓDIGO VALIDADO ---
function gerarPixBrCode(pixKey, valor) {
    // Usar código PIX estático validado pelo Banco Central
    // Código fornecido pelo usuário que funciona perfeitamente
    const pixCode = '00020101021126330014br.gov.bcb.pix0111038286430195204000053039865802BR5923GABRIEL NOVELO JAVORNIK6007ERECHIM62070503***63045AF3';

    // Retornar código PIX validado
    return pixCode;
}

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
        const percentualPago = Math.min(((totalPago / totalDivida) * 100).toFixed(1), 100);
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

async function enviarEmailQuitado(dest, nome) {
    console.log('\n📧 [QUITADO] Enviando para:', dest);
    try {
        await sgMail.send({
            to: dest,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: '🎉 Parabéns! Seu Crédito foi Totalmente Quitado - AzulCrédito',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #bfdbfe;padding:25px;border-radius:15px;background-color:#eff6ff;">
                    <h2 style="color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:10px;">🎉 Crédito Quitado!</h2>
                    <p>Parabéns, <strong>${nome}</strong>!</p>
                    <p>Seu crédito foi totalmente quitado! Obrigado por manter seus pagamentos em dia.</p>

                    <div style="background:#dbeafe;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #1e40af;text-align:center;">
                        <div style="font-size:2rem;margin:10px 0;">✅ 100% PAGO</div>
                        <div style="font-size:1.2rem;color:#1e40af;font-weight:bold;">Crédito Finalizado</div>
                    </div>

                    <p>Você é um cliente importante para a AzulCrédito. Qualquer dúvida ou necessidade de novo crédito, estaremos à disposição!</p>
                    <p style="font-size:0.9rem;color:#666;margin-top:20px;">Equipe AzulCrédito</p>
                    </div>`
        });
        console.log('✅ Email de quitação enviado com sucesso!');
    } catch (e) {
        console.error('❌ Erro ao enviar email de quitação:', e.response?.body || e.message);
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

// Criar tabela PIX_COBRANCAS para MercadoPago
pool.query(`
    CREATE TABLE IF NOT EXISTS PIX_COBRANCAS (
        id SERIAL PRIMARY KEY,
        simulacao_id INT NOT NULL,
        mp_payment_id VARCHAR(100),
        qr_code TEXT,
        qr_code_base64 TEXT,
        valor DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDENTE',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (simulacao_id) REFERENCES SIMULACOES(id) ON DELETE CASCADE
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela PIX_COBRANCAS:', err.message));

// Criar tabela de notificações PIX para o admin
pool.query(`
    CREATE TABLE IF NOT EXISTS NOTIFICACOES_PIX (
        id SERIAL PRIMARY KEY,
        simulacao_id INT NOT NULL,
        cliente_nome VARCHAR(255) NOT NULL,
        cliente_email VARCHAR(255) NOT NULL,
        valor DECIMAL(10, 2) NOT NULL,
        lida BOOLEAN DEFAULT FALSE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (simulacao_id) REFERENCES SIMULACOES(id) ON DELETE CASCADE
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela NOTIFICACOES_PIX:', err.message));

// Criar tabela para cupons usados
pool.query(`
    CREATE TABLE IF NOT EXISTS CUPONS_USADOS (
        id SERIAL PRIMARY KEY,
        cpf VARCHAR(20) NOT NULL UNIQUE,
        cupom VARCHAR(50) NOT NULL,
        desconto DECIMAL(10, 2) NOT NULL,
        usado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela CUPONS_USADOS:', err.message));

pool.query(`
    CREATE TABLE IF NOT EXISTS PAGAMENTOS_VISTOS (
        pagamento_id INT PRIMARY KEY,
        visto_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pagamento_id) REFERENCES PAGAMENTOS(id) ON DELETE CASCADE
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela PAGAMENTOS_VISTOS:', err.message));

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

// --- VERIFICAÇÃO DE CRÉDITO CPF (GRATUITA) ---
function validarFormatoCPF(cpf) {
    const limpo = soNumeros(cpf);
    if (limpo.length !== 11) return false;

    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(limpo)) return false;

    // Validação usando Luhn modificado (algoritmo brasileira)
    let sum = 0, resto;
    for (let i = 1; i <= 9; i++) sum += parseInt(limpo.substring(i - 1, i)) * (11 - i);
    resto = (sum * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(limpo.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(limpo.substring(i - 1, i)) * (12 - i);
    resto = (sum * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(limpo.substring(10, 11))) return false;

    return true;
}

// Simular status de crédito (gratuito) baseado em hash do CPF
function verificarStatusCredito(cpf) {
    const limpo = soNumeros(cpf);
    const hash = parseInt(limpo.split('').reduce((a, b) => String((parseInt(a) + parseInt(b)) % 10), 0));

    // Lógica simples: CPFs com soma terminada em 0-2 = LIMPO, 3-9 = SUJO (nome sujo)
    // Isso garante que o mesmo CPF sempre retorna o mesmo resultado
    if (hash <= 2) {
        return { status: 'LIMPO', descricao: 'CPF sem problemas no cadastro de negativados' };
    } else {
        return { status: 'SUJO', descricao: 'CPF com restrições - nome negativado em órgãos reguladores' };
    }
}

app.get('/ver-arquivo/:nome', adminAuth, (req, res) => {
    const caminho = path.join(__dirname, 'uploads', req.params.nome);
    if (fs.existsSync(caminho)) res.sendFile(caminho);
    else res.status(404).send("Arquivo não encontrado.");
});

// --- 4. ROTAS ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/sair', (req, res) => { req.session.destroy(); res.redirect('/'); });

// Verificar status de crédito por CPF (GRATUITO)
app.get('/verificar-cpf/:cpf', (req, res) => {
    try {
        const cpf = req.params.cpf;

        // Validar formato CPF
        if (!validarFormatoCPF(cpf)) {
            return res.json({ ok: false, erro: 'CPF inválido' });
        }

        // Obter status do crédito
        const status = verificarStatusCredito(cpf);

        res.json({
            ok: true,
            cpf: soNumeros(cpf),
            status: status.status,
            descricao: status.descricao,
            cor: status.status === 'LIMPO' ? '#2ecc71' : '#e74c3c'
        });
    } catch (e) {
        console.error('Erro ao verificar CPF:', e);
        res.json({ ok: false, erro: 'Erro ao processar' });
    }
});

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

        // Validar WhatsApp: deve ter 10-11 dígitos (DDD + número)
        const whatsappLimpo = soNumeros(whatsapp);
        if (whatsappLimpo.length < 10 || whatsappLimpo.length > 11) {
            return res.status(400).json({ ok: false, msg: 'WhatsApp inválido. Use DDD + número (10 ou 11 dígitos).' });
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
            .st-PAGO{background:#dcfce7;color:#166534;}.st-ANÁLISE{background:#fef9c3;color:#854d0e;}.st-REPROVADO{background:#fee2e2;color:#991b1b;}.st-QUITADO{background:#dbeafe;color:#1e40af;}
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
                const btnPix = r.status === 'PAGO' && totalPago < totalValor ? `<button class="btn-pdf" style="background:#0066cc;margin-right:5px;" onclick="abrirModalEscolhaPagamento(${r.id}, ${valorMensal}, ${faltaPagar})">💙 Pagar PIX</button>` : '';
                return `<tr><td>${new Date(r.criado_em).toLocaleDateString()}</td><td>${formatarMoeda(r.valor)}</td><td style="font-weight:bold;">${parcelasPagas}/${parcelas}</td><td>${formatarMoeda(valorMensal)}</td><td style="font-weight:bold;color:#2ecc71;">${formatarMoeda(totalPago)}<br><small style="color:#666;">(${percentualPago}%)</small></td><td style="font-weight:bold;color:#e74c3c;">${formatarMoeda(faltaPagar)}<br><small style="color:#666;">${parcelasRestantes} parcelas</small></td><td style="text-align:center;"><span class="badge st-${r.status.replace(/\s/g,'')}">${r.status}</span></td><td>${btnPix}<button class="btn-pdf" style="background:#27ae60;" onclick="verPagamentos(${r.id})">💰 Pagamentos</button></td></tr>`;
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

            <div id="modalEscolhaPagamento" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;justify-content:center;align-items:center;overflow-y:auto;">
                <div style="background:white;padding:30px;border-radius:15px;width:min(500px,90%);margin:30px auto;box-shadow:0 10px 40px rgba(0,0,0,0.2);position:relative;">
                    <button onclick="fecharModalEscolha()" style="position:absolute;top:15px;right:15px;background:none;border:none;font-size:28px;cursor:pointer;color:#999;width:35px;height:35px;display:flex;align-items:center;justify-content:center;">✕</button>
                    <div style="margin-bottom:20px;">
                        <h3 style="margin:0;color:#1e3c72;">💙 Escolha o Valor a Pagar</h3>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:15px;">
                        <div id="opcao-parcela" style="padding:20px;border:2px solid #0066cc;border-radius:12px;cursor:pointer;background:#f0f7ff;transition:all 0.3s;" onclick="selecionarOpcao('parcela')">
                            <p style="margin:0;font-weight:bold;color:#1e3c72;font-size:1.2rem;margin-bottom:5px;">📅 Pagar Parcela do Mês</p>
                            <p style="margin:0;color:#666;font-size:0.9rem;">Valor: <span id="valor-parcela" style="font-weight:bold;color:#0066cc;"></span></p>
                            <p style="margin:5px 0 0 0;color:#999;font-size:0.8rem;">Você ainda terá <span id="parcelas-restantes"></span> parcelas</p>
                        </div>
                        <div id="opcao-total" style="padding:20px;border:2px solid #27ae60;border-radius:12px;cursor:pointer;background:#f0fdf4;transition:all 0.3s;" onclick="selecionarOpcao('total')">
                            <p style="margin:0;font-weight:bold;color:#166534;font-size:1.2rem;margin-bottom:5px;">🎁 Pagar Tudo com 10% de Desconto!</p>
                            <p style="margin:0;color:#666;font-size:0.9rem;">Valor Total: <span id="valor-total-original" style="text-decoration:line-through;color:#999;"></span></p>
                            <p style="margin:5px 0 0 0;color:#166534;font-size:1rem;font-weight:bold;">Com Desconto: <span id="valor-total-desconto" style="color:#2ecc71;font-size:1.3rem;"></span></p>
                        </div>
                    </div>
                    <div style="margin-top:25px;padding:20px;background:linear-gradient(135deg, #f0f9ff 0%, #e3f2fd 100%);border-radius:15px;border:2px solid #0066cc;box-shadow:0 4px 12px rgba(0,102,204,0.1);">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
                            <span style="font-size:24px;">🎟️</span>
                            <p style="margin:0;color:#1e3c72;font-weight:bold;font-size:1.1rem;">Cupom de Desconto (5% OFF)</p>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 110px 40px;gap:10px;">
                            <input type="text" id="campo-cupom" placeholder="OFF5" style="padding:14px 16px;border:2px solid #0066cc;border-radius:10px;font-size:1rem;font-weight:bold;box-sizing:border-box;background:white;color:#1e3c72;" maxlength="20">
                            <button onclick="aplicarCupom()" id="btn-aplicar-cupom" style="padding:14px 20px;background:linear-gradient(135deg, #0066cc 0%, #003d99 100%);color:white;border:none;border-radius:10px;cursor:pointer;font-weight:bold;font-size:0.9rem;transition:all 0.3s;box-shadow:0 4px 8px rgba(0,102,204,0.3);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 12px rgba(0,102,204,0.4)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 8px rgba(0,102,204,0.3)'">
                                Aplicar
                            </button>
                            <button onclick="limparCupom()" id="btn-limpar-cupom" style="padding:14px 10px;background:#999;color:white;border:none;border-radius:10px;cursor:pointer;font-weight:bold;font-size:1.1rem;display:none;transition:all 0.3s;">✕</button>
                        </div>
                        <p id="msg-cupom" style="margin:12px 0 0 0;font-size:0.95rem;color:#666;font-weight:bold;min-height:20px;"></p>
                    </div>
                </div>
            </div>

            <div id="modalPix" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;justify-content:center;align-items:center;overflow-y:auto;">
                <div style="background:linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%);padding:40px;border-radius:20px;width:min(550px,95%);margin:30px auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;">
                        <h3 style="margin:0;color:#1e3c72;font-size:24px;font-weight:bold;">💙 Pagar via PIX</h3>
                        <button onclick="fecharModalPix()" style="background:#f0f0f0;border:none;font-size:28px;cursor:pointer;color:#666;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;transition:all 0.3s;hover:background:#e0e0e0;">✕</button>
                    </div>
                    <div id="pix-container" style="padding:20px;background:white;border-radius:15px;margin:20px 0;border:2px solid #f0f7ff;">
                        <p style="color:#666;margin:20px 0;">Carregando QR Code...</p>
                    </div>
                    <div style="background:#f9fafb;padding:15px;border-radius:12px;margin:20px 0;border-left:4px solid #2ecc71;">
                        <p style="margin:0;font-size:13px;color:#666;">⏰ QR Code válido por <span id="timer" style="font-weight:bold;color:#1e3c72;">30:00</span></p>
                    </div>
                    <button onclick="confirmarPagamentoPix()" style="width:100%;padding:15px;background:linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);color:white;border:none;border-radius:10px;cursor:pointer;font-weight:bold;font-size:16px;margin-top:15px;transition:transform 0.2s,box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 10px 25px rgba(46,204,113,0.3)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
                        ✅ Já fiz o Pagamento PIX
                    </button>
                    <p style="font-size:12px;color:#999;margin-top:15px;">Após confirmar, o administrador será notificado para validar seu pagamento</p>
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

                // SELEÇÃO DE VALOR DE PAGAMENTO
                let simIdSelecionado, valorParcelaSelecionado, saldoDevidoSelecionado, opcaoSelecionada = null;

                function fecharModalEscolha(){
                    document.getElementById('modalEscolhaPagamento').style.display='none';
                    document.getElementById('opcao-parcela').style.borderColor='#0066cc';
                    document.getElementById('opcao-total').style.borderColor='#27ae60';
                    // Nota: NÃO resetar cupomAplicado aqui - é preservado até confirmarPagamentoPix()
                }

                async function abrirModalEscolhaPagamento(simulacaoId, valorParcela, saldoDevido){
                    // Resetar cupom e verificar se já foi usado
                    limparCupom();
                    cupomAplicado = false;

                    try{
                        const resp = await fetch('/api/cupom-ja-usado', {method:'GET'});
                        const json = await resp.json();

                        if(json.jaUsado){
                            console.log('⚠️ Cupom OFF5 já foi utilizado');
                            const cupomInput = document.getElementById('campo-cupom');
                            const msgCupom = document.getElementById('msg-cupom');
                            const btnAplicar = document.getElementById('btn-aplicar-cupom');
                            const btnLimpar = document.getElementById('btn-limpar-cupom');

                            cupomInput.value = 'OFF5';
                            cupomInput.disabled = true;
                            cupomInput.style.background = '#ffebee';
                            cupomInput.style.borderColor = '#e74c3c';
                            cupomInput.style.color = '#c62828';
                            msgCupom.style.color = '#e74c3c';
                            msgCupom.innerText = '❌ Cupom já foi utilizado nesta conta';
                            btnAplicar.style.display = 'none';
                            btnLimpar.style.display = 'block';
                        }
                    }catch(e){
                        console.log('Verificação de cupom');
                    }

                    simIdSelecionado = simulacaoId;
                    valorParcelaSelecionado = valorParcela;
                    saldoDevidoSelecionado = saldoDevido;
                    opcaoSelecionada = null;

                    document.getElementById('valor-parcela').innerText = 'R$ ' + valorParcela.toFixed(2).replace('.', ',');
                    document.getElementById('valor-total-original').innerText = 'R$ ' + saldoDevido.toFixed(2).replace('.', ',');

                    const valorComDesconto = saldoDevido * 0.9; // 10% de desconto
                    document.getElementById('valor-total-desconto').innerText = 'R$ ' + valorComDesconto.toFixed(2).replace('.', ',');

                    const parcelasRestantes = Math.ceil(saldoDevido / valorParcela);
                    document.getElementById('parcelas-restantes').innerText = parcelasRestantes;

                    document.getElementById('modalEscolhaPagamento').style.display='flex';
                }

                async function selecionarOpcao(opcao){
                    // Verificar cupom no servidor
                    try{
                        const resp = await fetch('/api/cupom-ja-usado', {method:'GET'});
                        const json = await resp.json();

                        if(json.jaUsado){
                            alert('❌ Este cupom já foi utilizado! Você não pode usar novamente.');
                            return;
                        }
                    }catch(e){
                        console.log('Erro ao verificar cupom');
                    }

                    opcaoSelecionada = opcao;

                    document.getElementById('opcao-parcela').style.borderColor = opcao === 'parcela' ? '#0066cc' : '#0066cc';
                    document.getElementById('opcao-parcela').style.background = opcao === 'parcela' ? '#dbeafe' : '#f0f7ff';

                    document.getElementById('opcao-total').style.borderColor = opcao === 'total' ? '#27ae60' : '#27ae60';
                    document.getElementById('opcao-total').style.background = opcao === 'total' ? '#dcfce7' : '#f0fdf4';

                    let valorPagar = opcao === 'parcela' ? valorParcelaSelecionado : (saldoDevidoSelecionado * 0.9);
                    let textoValor = valorPagar.toFixed(2).replace('.',',');

                    // Aplicar cupom se foi aplicado com sucesso
                    if(cupomAplicado && document.getElementById('msg-cupom').innerText.includes('Cupom aplicado')){
                        const desconto = valorPagar * 0.05;
                        const valorComDesconto = valorPagar - desconto;
                        console.log('💚 Cupom OFF5 aplicado: R$ '+valorPagar.toFixed(2)+' → R$ '+valorComDesconto.toFixed(2));
                        valorPagar = valorComDesconto;
                        textoValor = '(com 5% desconto) R$ ' + valorComDesconto.toFixed(2).replace('.',',');
                    }

                    // Fechar modal de escolha e abrir PIX
                    fecharModalEscolha();
                    abrirModalPix(simIdSelecionado, valorPagar, opcao === 'total', textoValor);
                }

                // SISTEMA DE CUPOM
                let cupomAplicado = false;

                function limparCupom(){
                    const cupomInput = document.getElementById('campo-cupom');
                    const msgCupom = document.getElementById('msg-cupom');
                    const btnAplicar = document.getElementById('btn-aplicar-cupom');
                    const btnLimpar = document.getElementById('btn-limpar-cupom');

                    cupomInput.value = '';
                    cupomInput.disabled = false;
                    cupomInput.style.background = 'white';
                    cupomInput.style.borderColor = '#0066cc';
                    cupomInput.style.color = '#1e3c72';
                    msgCupom.innerText = '';
                    btnAplicar.style.display = 'block';
                    btnLimpar.style.display = 'none';
                    cupomAplicado = false;
                }

                async function verificarCupomJaUsado(){
                    try{
                        console.log('🔍 Verificando se cupom OFF5 já foi utilizado...');
                        const resp = await fetch('/api/cupom-ja-usado', {
                            method:'GET',
                            headers:{'Content-Type':'application/json'}
                        });
                        const json = await resp.json();
                        console.log('Resposta verificação cupom:', json);

                        if(json.jaUsado){
                            console.log('⚠️ Cupom OFF5 já foi utilizado nesta conta');
                            const cupomInput = document.getElementById('campo-cupom');
                            const msgCupom = document.getElementById('msg-cupom');
                            const btnAplicar = document.getElementById('btn-aplicar-cupom');
                            const btnLimpar = document.getElementById('btn-limpar-cupom');

                            cupomInput.value = 'OFF5';
                            cupomInput.disabled = true;
                            cupomInput.style.background = '#ffebee';
                            cupomInput.style.borderColor = '#e74c3c';
                            cupomInput.style.color = '#c62828';
                            msgCupom.style.color = '#e74c3c';
                            msgCupom.innerText = '❌ Cupom já foi utilizado nesta conta';
                            btnAplicar.style.display = 'none';
                            btnLimpar.style.display = 'block';
                            cupomAplicado = false;
                        } else {
                            console.log('✅ Cupom OFF5 disponível para usar');
                        }
                    }catch(e){
                        console.error('Erro ao verificar cupom:', e);
                    }
                }

                async function aplicarCupom(){
                    console.log('🎟️ Validando cupom...');
                    const cupomInput = document.getElementById('campo-cupom');
                    const cupom = cupomInput.value.trim().toUpperCase();
                    const msgCupom = document.getElementById('msg-cupom');
                    const btnAplicar = document.getElementById('btn-aplicar-cupom');
                    const btnLimpar = document.getElementById('btn-limpar-cupom');

                    console.log('Cupom digitado:', cupom);

                    if(!cupom || cupom.length === 0){
                        msgCupom.style.color = '#e74c3c';
                        msgCupom.innerText = '❌ Digite um cupom válido';
                        console.log('Cupom vazio');
                        return;
                    }

                    try{
                        const resp = await fetch('/api/validar-cupom', {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({cupom: cupom})
                        });
                        const json = await resp.json();
                        console.log('Resposta do servidor:', json);

                        if(json.ok){
                            cupomAplicado = true;
                            msgCupom.style.color = '#2ecc71';
                            msgCupom.innerText = '✅ Cupom aplicado! 5% de desconto será debitado';
                            cupomInput.disabled = true;
                            cupomInput.style.background = '#e8f5e9';
                            cupomInput.style.borderColor = '#2ecc71';
                            cupomInput.style.color = '#2ecc71';
                            btnAplicar.style.display = 'none';
                            btnLimpar.style.display = 'block';
                            console.log('✅ Cupom validado com sucesso!');
                        } else {
                            cupomAplicado = false;
                            msgCupom.style.color = '#e74c3c';
                            msgCupom.innerText = json.msg || '❌ Cupom inválido ou já utilizado';
                            console.log('❌ Cupom rejeitado:', json.msg);
                        }
                    }catch(e){
                        msgCupom.style.color = '#e74c3c';
                        msgCupom.innerText = '❌ Erro ao validar cupom';
                        console.error('Erro:', e.message);
                    }
                }

                // PIX QR CODE
                function fecharModalPix(){document.getElementById('modalPix').style.display='none';}
                let timerInterval, pixPaymentIdAtual, simIdAtual, valorPixAtual;

                async function confirmarPagamentoPix(){
                    console.log('🔵 confirmarPagamentoPix() CHAMADA');
                    console.log('cupomAplicado atual:', cupomAplicado);

                    if(!simIdAtual){
                        alert('Erro: ID da simulação não encontrado');
                        return;
                    }
                    try{
                        // Se cupom foi aplicado, registrar ANTES de notificar pagamento
                        if(cupomAplicado === true){
                            const desconto = valorPixAtual * 0.05;
                            console.log('💾 CUPOM APLICADO - Registrando cupom OFF5 como usado');
                            console.log('  - Cupom: OFF5');
                            console.log('  - Valor: R$ ' + valorPixAtual.toFixed(2));
                            console.log('  - Desconto: R$ ' + desconto.toFixed(2));

                            const respCupom = await fetch('/api/registrar-cupom-usado', {
                                method:'POST',
                                headers:{'Content-Type':'application/json'},
                                body:JSON.stringify({cupom:'OFF5', desconto:desconto})
                            });
                            const jsonCupom = await respCupom.json();
                            console.log('✅ RESPOSTA DO SERVIDOR:', jsonCupom);

                            if(!jsonCupom.ok){
                                console.error('❌ ERRO ao registrar cupom:', jsonCupom);
                            }
                        } else {
                            console.log('⚠️ Cupom NÃO estava aplicado (cupomAplicado = ' + cupomAplicado + ')');
                        }

                        const resp=await fetch('/notificar-pagamento-pix', {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({simulacao_id:simIdAtual, valor:valorPixAtual})
                        });
                        const json=await resp.json();
                        if(json.ok){
                            alert('✅ Pagamento registrado! O administrador foi notificado e irá conferir em breve.');
                            fecharModalPix();
                            fecharModalEscolha();
                            cupomAplicado = false;
                            limparCupom();
                        }else{
                            alert('❌ Erro: '+json.msg);
                        }
                    }catch(e){
                        console.error('❌ ERRO NA CONFIRMAÇÃO:', e);
                        alert('❌ Erro ao registrar pagamento: '+e.message);
                    }
                }

                async function abrirModalPix(simulacaoId, valorPagar, temDesconto, textoValor){
                    simIdAtual=simulacaoId;
                    valorPixAtual=valorPagar;
                    const modal=document.getElementById('modalPix');
                    const container=document.getElementById('pix-container');
                    container.innerHTML='<p style="color:#666;">Gerando QR Code...</p>';
                    modal.style.display='flex';

                    // Preservar o estado do cupomAplicado para exibir a mensagem de desconto no modal PIX

                    try{
                        const resp=await fetch('/pix/gerar', {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({simulacao_id:simulacaoId, valor:valorPagar, temDesconto:temDesconto})
                        });
                        const json=await resp.json();
                        if(json.ok){
                            pixPaymentIdAtual=json.mp_payment_id;
                            const expiracao=new Date(json.expiracao);
                            const avisoDesconto = temDesconto ? '<div style="margin:20px 0;padding:15px;background:#dcfce7;border:2px solid #2ecc71;border-radius:8px;"><p style="margin:0;color:#166534;font-weight:bold;font-size:1.2rem;">🎁 10% de Desconto Aplicado!</p><p style="margin:5px 0 0 0;color:#166534;font-size:0.9rem;">Você está quitando antecipadamente</p></div>' : '';
                            const valorExibido = textoValor || ('R$ ' + valorPagar.toFixed(2).replace('.',','));
                            const avisoDesconto5pct = cupomAplicado ? '<div style="margin:20px 0;padding:15px;background:#dcfce7;border:2px solid #2ecc71;border-radius:8px;"><p style="margin:0;color:#166534;font-weight:bold;font-size:1.2rem;">💚 5% de Desconto Aplicado!</p><p style="margin:5px 0 0 0;color:#166534;font-size:0.9rem;">Cupom OFF5 foi aplicado</p></div>' : '';
                            container.innerHTML=\`
                                <div style="margin:20px 0;"><strong>Valor a Pagar:</strong> <span style="font-size:1.5rem;color:#2ecc71;font-weight:bold;">\${valorExibido}</span></div>
                                \${avisoDesconto5pct}
                                \${avisoDesconto}
                                <img src="\${json.qr_code_base64}" style="width:250px;height:250px;margin:20px auto;border:2px solid #1e3c72;border-radius:8px;">
                                <div style="margin:20px 0;padding:15px;background:#f0f7ff;border-radius:8px;">
                                    <p style="margin:0 0 10px 0;color:#666;font-size:0.9rem;">📋 Código (copia e cola):</p>
                                    <p style="margin:0;padding:10px;background:white;border:1px solid #ddd;border-radius:4px;font-family:monospace;word-break:break-all;cursor:pointer;font-size:11px;" onclick="navigator.clipboard.writeText('\${json.qr_code}');alert('Código copiado!');">\${json.qr_code}</p>
                                </div>
                            \`;

                            // Timer
                            let segundos=1800;
                            clearInterval(timerInterval);
                            timerInterval=setInterval(()=>{
                                segundos--;
                                const min=Math.floor(segundos/60);
                                const seg=segundos%60;
                                document.getElementById('timer').innerText=\`\${min}:\${seg.toString().padStart(2,'0')}\`;
                                if(segundos<=0){
                                    clearInterval(timerInterval);
                                    fecharModalPix();
                                    alert('QR Code expirou');
                                }
                            }, 1000);
                        }else{
                            container.innerHTML='<p style="color:red;">Erro ao gerar QR Code</p>';
                        }
                    }catch(e){
                        container.innerHTML='<p style="color:red;">Erro: '+e.message+'</p>';
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

                // ATUALIZAÇÃO AUTOMÁTICA EM TEMPO REAL
                setInterval(async ()=>{
                    try{
                        const resp=await fetch('/api/simulacoes-cliente');
                        const json=await resp.json();
                        if(json.ok && json.simulacoes){
                            const tabela=document.querySelector('tbody');
                            if(!tabela) return;
                            const linhas=tabela.querySelectorAll('tr');
                            json.simulacoes.forEach((sim, idx)=>{
                                const linha=linhas[idx];
                                if(linha){
                                    const statusBadge=linha.querySelector('.badge');
                                    const statusAtual=statusBadge?.innerText.trim()||'';
                                    const novoStatus=sim.status;
                                    if(statusAtual!==novoStatus){
                                        console.log('✅ Status atualizado de '+statusAtual+' para '+novoStatus);
                                        location.reload();
                                    }
                                }
                            });
                        }
                    }catch(e){
                        console.log('Verificando atualizações...');
                    }
                }, 5000);
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
        // Query otimizada: JOIN para evitar N+1
        const allSimsResult = await pool.query(`
            SELECT s.*, COALESCE(SUM(p.valor), 0) as total_pago
            FROM SIMULACOES s
            LEFT JOIN PAGAMENTOS p ON p.simulacao_id = s.id
            GROUP BY s.id
            ORDER BY s.criado_em DESC
        `);
        const allSims = { rows: allSimsResult.rows };

        // Query receita real (últimos 6 meses)
        const receitaResult = await pool.query(`
            SELECT DATE_TRUNC('month', data_pagamento)::date as mes,
                   SUM(valor) as receita
            FROM PAGAMENTOS
            GROUP BY DATE_TRUNC('month', data_pagamento)
            ORDER BY mes DESC LIMIT 6
        `);

        // Cálculos para o dashboard
        const totalSolicitado = allSims.rows.reduce((acc, r) => acc + parseFloat(r.valor || 0), 0);
        const totalAprovado = allSims.rows.filter(r => r.status === 'PAGO').reduce((acc, r) => acc + parseFloat(r.total || 0), 0);
        const totalReprovado = allSims.rows.filter(r => r.status === 'REPROVADO').length;
        const emAnalise = allSims.rows.filter(r => r.status === 'EM ANÁLISE').length;
        const aprovados = allSims.rows.filter(r => r.status === 'PAGO').length;
        const quitados = allSims.rows.filter(r => r.status === 'QUITADO').length;
        const taxaAprovacao = allSims.rows.length > 0 ? ((aprovados / allSims.rows.length) * 100).toFixed(1) : 0;

        // Novos cálculos
        const totalArrecadado = allSims.rows.reduce((acc, r) => acc + parseFloat(r.total_pago || 0), 0);
        const ticketMedio = allSims.rows.length > 0 ? (totalSolicitado / allSims.rows.length).toFixed(2) : 0;
        const inadimplentes = allSims.rows.filter(r => r.status === 'PAGO' && parseFloat(r.total_pago || 0) === 0 && new Date(r.criado_em).getTime() < Date.now() - 30*24*60*60*1000).length;

        // Taxa de quitação
        const taxaQuitacao = allSims.rows.length > 0 ? ((quitados / allSims.rows.length) * 100).toFixed(1) : 0;

        // Dados por mês
        const porMes = {};
        allSims.rows.forEach(r => {
            const mes = new Date(r.criado_em).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
            if (!porMes[mes]) porMes[mes] = 0;
            porMes[mes]++;
        });
        const meses = Object.keys(porMes).slice(-6);
        const quantidades = meses.map(m => porMes[m]);

        // Dados de receita por mês (dos pagamentos)
        const mesesReceita = receitaResult.rows.reverse().map(r => new Date(r.mes).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }));
        const valoresReceita = receitaResult.rows.reverse().map(r => parseFloat(r.receita || 0));

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
            .st-pago{background:#d4edda;color:#155724;}.st-analise{background:#fff3cd;color:#856404;}.st-reprovado{background:#f8d7da;color:#721c24;}.st-quitado{background:#dbeafe;color:#1e40af;}
            .doc-link{text-decoration:none;font-weight:bold;color:#3498db;margin-right:10px;}
            select,button{padding:6px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;}
            button{background:#3a7bd5;color:white;border:none;font-weight:bold;}
            button:hover{background:#2a5fa5;}
        </style></head><body>
            <div class="header">
                <h1 style="margin:0;">📊 Painel de Gestão - AzulCrédito</h1>
                <div style="display:flex;gap:10px;align-items:center;">
                    <div style="position:relative;cursor:pointer;" onclick="toggleNotificacoes()">
                        <div style="font-size:28px;transition:transform 0.2s;">🔔</div>
                        <div id="badge-notificacoes" style="position:absolute;top:-8px;right:-8px;background:#e74c3c;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;display:none;">0</div>
                    </div>
                    <button onclick="limparDados()" style="background:#e74c3c;color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:bold;">🗑️ Limpar Dados</button>
                    <a href="/sair" style="color:white;text-decoration:none;font-weight:bold;border:1px solid white;padding:8px 16px;border-radius:8px;">SAIR</a>
                </div>
            </div>

            <div id="painel-notificacoes" style="display:none;position:fixed;top:80px;right:20px;background:white;border-radius:10px;box-shadow:0 5px 30px rgba(0,0,0,0.3);z-index:10000;min-width:350px;max-height:500px;overflow-y:auto;">
                <div style="background:#e74c3c;color:white;padding:15px;border-radius:10px 10px 0 0;font-weight:bold;display:flex;justify-content:space-between;align-items:center;">
                    <span>🔔 Notificações de Pagamento PIX</span>
                    <button onclick="toggleNotificacoes()" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;">✕</button>
                </div>
                <div id="lista-notificacoes" style="padding:15px;color:#666;text-align:center;">
                    Carregando notificações...
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
                <div class="stat-card sucesso">
                    <h3>💚 Total Arrecadado</h3>
                    <div class="valor">${formatarMoeda(totalArrecadado)}</div>
                </div>
                <div class="stat-card">
                    <h3>📊 Ticket Médio</h3>
                    <div class="valor">${formatarMoeda(ticketMedio)}</div>
                </div>
                <div class="stat-card reprovado">
                    <h3>⚠️ Inadimplentes</h3>
                    <div class="valor">${inadimplentes}</div>
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
                <div class="chart-container">
                    <h3>Receita Real (Pagamentos)</h3>
                    <canvas id="chartReceita"></canvas>
                </div>
                <div class="chart-container">
                    <h3>Taxa de Quitação</h3>
                    <canvas id="chartQuitacao"></canvas>
                </div>
            </div>

            <div class="top-clientes">
                <h3>👥 Top 5 Clientes</h3>
                <table>
                    <thead><tr><th>Cliente</th><th>Propostas</th><th>Valor Total</th></tr></thead>
                    <tbody>${top5.join('')}</tbody>
                </table>
            </div>

            <h2 style="color:#1e3c72;margin-bottom:20px;">👥 Gerenciar Propostas</h2>
            <div style="background:white;padding:20px;border-radius:15px;margin-bottom:20px;display:flex;gap:15px;align-items:center;flex-wrap:wrap;">
                <div style="display:flex;gap:10px;align-items:center;">
                    <label style="font-weight:bold;color:#333;">Filtrar por Status:</label>
                    <select id="filtroStatus" onchange="aplicarFiltros()" style="padding:8px;border:1px solid #ddd;border-radius:6px;">
                        <option value="">Todos</option>
                        <option value="EM ANÁLISE">Em Análise</option>
                        <option value="PAGO">Aprovado</option>
                        <option value="REPROVADO">Reprovado</option>
                        <option value="QUITADO">Quitado</option>
                    </select>
                </div>
                <div style="display:flex;gap:10px;align-items:center;">
                    <label style="font-weight:bold;color:#333;">Valor Mín:</label>
                    <input type="number" id="filtroValorMin" onkeyup="aplicarFiltros()" placeholder="0" style="padding:8px;border:1px solid #ddd;border-radius:6px;width:100px;">
                </div>
                <div style="display:flex;gap:10px;align-items:center;">
                    <label style="font-weight:bold;color:#333;">Valor Máx:</label>
                    <input type="number" id="filtroValorMax" onkeyup="aplicarFiltros()" placeholder="999999" style="padding:8px;border:1px solid #ddd;border-radius:6px;width:100px;">
                </div>
                <div style="display:flex;gap:10px;align-items:center;">
                    <label style="font-weight:bold;color:#333;">De:</label>
                    <input type="date" id="filtroDataInicio" onchange="aplicarFiltros()" style="padding:8px;border:1px solid #ddd;border-radius:6px;">
                </div>
                <div style="display:flex;gap:10px;align-items:center;">
                    <label style="font-weight:bold;color:#333;">Até:</label>
                    <input type="date" id="filtroDataFim" onchange="aplicarFiltros()" style="padding:8px;border:1px solid #ddd;border-radius:6px;">
                </div>
                <div style="display:flex;gap:10px;align-items:center;flex-grow:1;">
                    <label style="font-weight:bold;color:#333;">🔍 Buscar:</label>
                    <input type="text" id="filtrowBusca" onkeyup="aplicarFiltros()" placeholder="Nome ou CPF..." style="padding:8px;border:1px solid #ddd;border-radius:6px;flex:1;max-width:300px;">
                </div>
                <button onclick="exportarCSV()" style="background:#16a34a;padding:8px 16px;border:none;border-radius:6px;color:white;font-weight:bold;cursor:pointer;">📥 Exportar CSV</button>
                <button onclick="exportarPDF()" style="background:#3b82f6;padding:8px 16px;border:none;border-radius:6px;color:white;font-weight:bold;cursor:pointer;">📄 Exportar PDF</button>
            </div>` +
            (await Promise.all(Object.keys(perfis).map(async cpf => {
                const p = perfis[cpf];
                // Fetch payment totals for each proposal
                const pagamentosPromises = p.pedidos.map(ped =>
                    pool.query('SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1', [ped.id])
                );
                const pagamentosResults = await Promise.all(pagamentosPromises);

                return `<div class="profile-card"><div class="profile-header"><div><strong>👤 ${p.nome}</strong> <small style="margin-left:15px;opacity:0.8;">CPF: ${cpf}</small></div><a href="https://wa.me/${p.whatsapp}" target="_blank" class="btn-whatsapp">WHATSAPP</a></div><table><thead><tr><th>DATA</th><th>VALOR</th><th>TOTAL</th><th>PARCELAS</th><th>MENSAL</th><th>PAGO</th><th>FALTA</th><th>DOCS</th><th>AÇÃO</th></tr></thead><tbody>` +
                p.pedidos.map((ped, idx) => {
                    const st = ped.status === 'PAGO' ? 'st-pago' : (ped.status === 'REPROVADO' ? 'st-reprovado' : (ped.status === 'QUITADO' ? 'st-quitado' : 'st-analise'));
                    const totalPago = parseFloat(pagamentosResults[idx].rows[0].total_pago || 0);
                    const parcelas = parseInt(ped.parcelas || 1);
                    const valorMensal = parseFloat(ped.total) / parcelas;
                    const totalValor = parseFloat(ped.total);
                    const parcelasPagas = Math.floor(totalPago / valorMensal);
                    const parcelasRestantes = parcelas - parcelasPagas;
                    const faltaPagar = totalValor - totalPago;
                    const percentualPago = ((totalPago / totalValor) * 100).toFixed(1);
                    const isQuitado = ped.status === 'QUITADO';
                    return `<tr><td>${new Date(ped.criado_em).toLocaleDateString()}</td><td>${formatarMoeda(ped.valor)}</td><td style="font-weight:bold;">${formatarMoeda(totalValor)}</td><td style="font-weight:bold;">${parcelasPagas}/${parcelas}</td><td>${formatarMoeda(valorMensal)}</td><td style="font-weight:bold;color:#2ecc71;">${formatarMoeda(totalPago)}<br><small style="color:#666;">(${percentualPago}%)</small></td><td style="font-weight:bold;color:#e74c3c;">${formatarMoeda(faltaPagar)}<br><small style="color:#666;">${parcelasRestantes} parcelas</small></td><td><a href="/ver-arquivo/${ped.documento_path}" target="_blank" class="doc-link">🗂️</a><a href="/ver-arquivo/${ped.renda_path}" target="_blank" class="doc-link">📄</a></td><td><span class="badge ${st}">${ped.status}</span><select id="st-${ped.id}" ${isQuitado ? 'disabled' : ''}><option value="EM ANÁLISE" ${ped.status==='EM ANÁLISE'?'selected':''}>Análise</option><option value="PAGO" ${ped.status==='PAGO'?'selected':''}>Aprovar</option><option value="REPROVADO" ${ped.status==='REPROVADO'?'selected':''}>Reprovar</option><option value="QUITADO" ${ped.status==='QUITADO'?'selected':''}>Quitado</option></select><button onclick="salvar(${ped.id},'${p.whatsapp}','${p.nome}')" ${isQuitado ? 'disabled style="opacity:0.5;"' : ''}>OK</button><button style="background:#27ae60;margin-left:5px;" ${isQuitado ? 'disabled style="opacity:0.5;"' : ''} onclick="abrirModalPagamento(${ped.id},'${formatarMoeda(ped.valor)}','${formatarMoeda(ped.total)}')">💰 Pagamento</button></td></tr>`;
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

            // Gráfico de Receita Real (Pagamentos)
            const ctxReceita = document.getElementById('chartReceita').getContext('2d');
            new Chart(ctxReceita, {
                type: 'bar',
                data: {
                    labels: ${JSON.stringify(mesesReceita)},
                    datasets: [{
                        label: 'Receita (R$)',
                        data: ${JSON.stringify(valoresReceita)},
                        backgroundColor: '#2ecc71',
                        borderColor: '#27ae60',
                        borderWidth: 1
                    }]
                },
                options: {responsive: true, plugins: {legend: {display: true}}, scales: {y: {beginAtZero: true}}}
            });

            // Gráfico de Taxa Quitação
            const ctxQuitacao = document.getElementById('chartQuitacao').getContext('2d');
            new Chart(ctxQuitacao, {
                type: 'bar',
                data: {
                    labels: ['Quitados', 'Em Andamento'],
                    datasets: [{
                        label: 'Quantidade',
                        data: [${quitados}, ${allSims.rows.length - quitados}],
                        backgroundColor: ['#2ecc71', '#f39c12'],
                        borderWidth: 0
                    }]
                },
                options: {responsive: true, indexAxis: 'y', plugins: {legend: {display: false}}, scales: {x: {beginAtZero: true}}}
            });

            // Filtros e busca avançada
            function aplicarFiltros(){
                const statusFiltro=document.getElementById('filtroStatus').value.toLowerCase();
                const buscaFiltro=document.getElementById('filtrowBusca').value.toLowerCase();
                const valorMin=parseFloat(document.getElementById('filtroValorMin').value)||0;
                const valorMax=parseFloat(document.getElementById('filtroValorMax').value)||999999999;
                const dataInicio=document.getElementById('filtroDataInicio').value;
                const dataFim=document.getElementById('filtroDataFim').value;

                const cards=document.querySelectorAll('.profile-card');
                cards.forEach(card=>{
                    const header=card.querySelector('.profile-header').innerText.toLowerCase();
                    const badges=card.querySelectorAll('.badge');
                    let statusMatch=!statusFiltro;
                    badges.forEach(b=>{if(b.innerText.toLowerCase()===statusFiltro){statusMatch=true;}});
                    const buscaMatch=header.includes(buscaFiltro);

                    // Verificar filtros de data e valor nos rows da tabela
                    let temMatch=statusMatch && buscaMatch;
                    let temRegistros=false;
                    if(temMatch){
                        card.querySelectorAll('tbody tr').forEach(row=>{
                            const tds=row.querySelectorAll('td');
                            if(tds.length>0){
                                const data=tds[0].innerText.trim();
                                const valor=parseFloat(tds[1].innerText.replace(/[^\\d.,]/g,'').replace(',','.'))||0;
                                let dataMatch=true;
                                if(dataInicio || dataFim){
                                    const [d,m,a]=data.split('/');
                                    const dataProp=new Date(a,m-1,d);
                                    if(dataInicio && dataProp < new Date(dataInicio)) dataMatch=false;
                                    if(dataFim && dataProp > new Date(dataFim)) dataMatch=false;
                                }
                                const valorMatch=(valor>=valorMin && valor<=valorMax);
                                row.style.display=(dataMatch && valorMatch)?'table-row':'none';
                                if(dataMatch && valorMatch) temRegistros=true;
                            }
                        });
                    }
                    card.style.display=(temMatch && temRegistros)?'block':'none';
                });
            }

            // Exportar CSV
            function exportarCSV(){
                let csv='Data,Nome,CPF,Valor,Parcelas,Total,Status,Total Pago\\n';
                document.querySelectorAll('.profile-card').forEach(card=>{
                    if(card.style.display!=='none'){
                        const header=card.querySelector('.profile-header').innerText;
                        const nomeParts=header.match(/👤 (.+?) /);
                        const cpfParts=header.match(/CPF: ([\\d.\\-]+)/);
                        const nome=nomeParts?nomeParts[1]:'';
                        const cpf=cpfParts?cpfParts[1]:'';
                        card.querySelectorAll('tbody tr').forEach(row=>{
                            const tds=row.querySelectorAll('td');
                            if(tds.length>0 && row.style.display!=='none'){
                                const data=tds[0].innerText;
                                const valor=tds[1].innerText;
                                const total=tds[2].innerText;
                                const parcelas=tds[3].innerText;
                                const mensal=tds[4].innerText;
                                const pago=tds[5].innerText;
                                const falta=tds[6].innerText;
                                const status=tds[8].querySelector('.badge')?.innerText||'';
                                csv+=\`"\${data}",""\${nome}"",""\${cpf}"",""\${valor}"",""\${parcelas}"",""\${total}"",""\${status}"",""\${pago}"\\n\`;
                            }
                        });
                    }
                });
                const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
                const link=document.createElement('a');
                const url=URL.createObjectURL(blob);
                link.setAttribute('href',url);
                link.setAttribute('download','propostas-azulcredito.csv');
                link.click();
            }

            // Exportar PDF
            function exportarPDF(){
                let html='<h2 style="text-align:center;color:#1e3c72;margin-bottom:30px;">Relatório de Propostas - AzulCrédito</h2>';
                html+='<p style="text-align:center;font-size:12px;color:#999;">Gerado em '+new Date().toLocaleString('pt-BR')+'</p>';
                html+='<table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:11px;">';
                html+='<thead><tr style="background:#1e3c72;color:white;"><th style="border:1px solid #ddd;padding:8px;">Data</th><th style="border:1px solid #ddd;padding:8px;">Nome</th><th style="border:1px solid #ddd;padding:8px;">CPF</th><th style="border:1px solid #ddd;padding:8px;">Valor</th><th style="border:1px solid #ddd;padding:8px;">Parcelas</th><th style="border:1px solid #ddd;padding:8px;">Total</th><th style="border:1px solid #ddd;padding:8px;">Status</th><th style="border:1px solid #ddd;padding:8px;">Total Pago</th></tr></thead><tbody>';
                document.querySelectorAll('.profile-card').forEach(card=>{
                    if(card.style.display!=='none'){
                        const header=card.querySelector('.profile-header').innerText;
                        const nomeParts=header.match(/👤 (.+?) /);
                        const cpfParts=header.match(/CPF: ([\\d.\\-]+)/);
                        const nome=nomeParts?nomeParts[1]:'';
                        const cpf=cpfParts?cpfParts[1]:'';
                        card.querySelectorAll('tbody tr').forEach(row=>{
                            const tds=row.querySelectorAll('td');
                            if(tds.length>0 && row.style.display!=='none'){
                                const data=tds[0].innerText;
                                const valor=tds[1].innerText;
                                const total=tds[2].innerText;
                                const parcelas=tds[3].innerText;
                                const pago=tds[5].innerText;
                                const status=tds[8].querySelector('.badge')?.innerText||'';
                                html+=\`<tr><td style="border:1px solid #ddd;padding:8px;">\${data}</td><td style="border:1px solid #ddd;padding:8px;">\${nome}</td><td style="border:1px solid #ddd;padding:8px;">\${cpf}</td><td style="border:1px solid #ddd;padding:8px;">\${valor}</td><td style="border:1px solid #ddd;padding:8px;">\${parcelas}</td><td style="border:1px solid #ddd;padding:8px;">\${total}</td><td style="border:1px solid #ddd;padding:8px;">\${status}</td><td style="border:1px solid #ddd;padding:8px;">\${pago}</td></tr>\`;
                            }
                        });
                    }
                });
                html+='</tbody></table>';
                const printWindow=window.open('','','height=600,width=800');
                printWindow.document.write('<html><head><title>Relatório de Propostas</title></head><body>');
                printWindow.document.write(html);
                printWindow.document.write('</body></html>');
                printWindow.document.close();
                setTimeout(()=>{printWindow.print();},500);
            }

            // SISTEMA DE NOTIFICAÇÕES PIX
            let notificacoesAberto = false;

            function toggleNotificacoes(){
                notificacoesAberto = !notificacoesAberto;
                document.getElementById('painel-notificacoes').style.display = notificacoesAberto ? 'block' : 'none';
                if(notificacoesAberto) carregarNotificacoes();
            }

            async function carregarNotificacoes(){
                try{
                    const resp = await fetch('/api/notificacoes-pix');
                    const json = await resp.json();

                    const badge = document.getElementById('badge-notificacoes');
                    if(json.total > 0){
                        badge.style.display = 'flex';
                        badge.innerText = json.total;
                    } else {
                        badge.style.display = 'none';
                    }

                    const lista = document.getElementById('lista-notificacoes');
                    if(json.notificacoes.length === 0){
                        lista.innerHTML = '<p style="color:#999;padding:20px;">✅ Nenhuma notificação pendente</p>';
                        return;
                    }

                    let html = '';
                    json.notificacoes.forEach(notif => {
                        const data = new Date(notif.criado_em).toLocaleString('pt-BR');
                        html += \`
                            <div style="padding:15px;border-bottom:1px solid #f1f3f5;border-radius:8px;">
                                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                                    <strong style="color:#1e3c72;">\${notif.cliente_nome}</strong>
                                    <button onclick="marcarComoLida(\${notif.id})" style="background:#2ecc71;color:white;border:none;padding:4px 12px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold;">✓ Confirmar</button>
                                </div>
                                <p style="margin:5px 0;color:#666;font-size:12px;">📧 \${notif.cliente_email}</p>
                                <p style="margin:5px 0;color:#2ecc71;font-weight:bold;">R$ \${parseFloat(notif.valor).toFixed(2)}</p>
                                <p style="margin:5px 0;color:#999;font-size:11px;">🕐 \${data}</p>
                            </div>
                        \`;
                    });
                    lista.innerHTML = html;
                }catch(e){
                    console.error('Erro ao carregar notificações:', e);
                }
            }

            async function marcarComoLida(notificacaoId){
                try{
                    await fetch('/api/marcar-notificacao-lida', {
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({notificacao_id:notificacaoId})
                    });
                    console.log('✅ Pagamento PIX confirmado - Atualizando tabela...');
                    carregarNotificacoes();
                    // Recarregar tabela de propostas após confirmar pagamento
                    setTimeout(()=>{location.reload();}, 800);
                }catch(e){
                    console.error('Erro ao marcar notificação:', e);
                }
            }

            // Verificar notificações a cada 5 segundos
            setInterval(carregarNotificacoes, 5000);
            // Carregar na inicial
            carregarNotificacoes();
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
            if (status === 'QUITADO') {
                console.log('📧 Enviando email de QUITAÇÃO...');
                enviarEmailQuitado(cli.rows[0].email, cli.rows[0].nome).catch(err => {
                    console.error('⚠️ Email de quitação falhou:', err.message);
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
        const valorPagamento = parseFloat(valor);

        // Validar se valor é positivo
        if (valorPagamento <= 0) {
            return res.status(400).json({ ok: false, msg: 'Valor deve ser maior que zero' });
        }

        // Buscar dados da simulação para validar
        const simResult = await pool.query('SELECT nome, email, total, parcelas FROM SIMULACOES WHERE id = $1', [simulacao_id]);
        if (simResult.rows.length === 0) {
            return res.status(404).json({ ok: false, msg: 'Simulação não encontrada' });
        }

        const sim = simResult.rows[0];
        const totalDivida = parseFloat(sim.total);

        // Calcular total pago até agora
        const pagtoResult = await pool.query('SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1', [simulacao_id]);
        const totalPagoAtual = parseFloat(pagtoResult.rows[0].total_pago);
        const totalPagoApos = totalPagoAtual + valorPagamento;

        // VALIDAR: não permitir pagamento que ultrapasse o valor total devido
        if (totalPagoApos > totalDivida) {
            const restante = (totalDivida - totalPagoAtual).toFixed(2);
            return res.status(400).json({
                ok: false,
                msg: `Valor inválido! Ainda faltam apenas R$ ${restante.replace('.', ',')} para quitar este crédito.`
            });
        }

        // Inserir pagamento
        await pool.query('INSERT INTO PAGAMENTOS (simulacao_id, valor, data_pagamento, status) VALUES ($1, $2, $3, $4)',
            [simulacao_id, valorPagamento, data_pagamento, 'CONFIRMADO']);

        console.log('💰 Pagamento registrado:', { simulacao_id, valor: valorPagamento });

        const valorMensal = totalDivida / parseInt(sim.parcelas);
        const parcelasRestantes = Math.ceil((totalDivida - totalPagoApos) / valorMensal);

        // Auto-QUITADO: Se totalmente pago, atualizar status
        if (totalPagoApos >= totalDivida) {
            await pool.query('UPDATE SIMULACOES SET STATUS = $1 WHERE id = $2', ['QUITADO', simulacao_id]);
            console.log('✅ Proposta marcada como QUITADA automaticamente:', simulacao_id);

            // Enviar email de parabéns
            enviarEmailQuitado(sim.email, sim.nome).catch(err => {
                console.error('⚠️ Email de quitação falhou:', err.message);
            });
        } else {
            // Enviar email de pagamento normal
            enviarEmailPagamento(
                sim.email,
                sim.nome,
                valorPagamento,
                totalPagoApos,
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

app.get('/simulacao/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM SIMULACOES WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ ok: false, msg: 'Simulação não encontrada' });
        res.json({ ok: true, simulacao: result.rows[0] });
    } catch (err) {
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

// --- PIX QR CODE MOCK (SIMULADO PARA AULA) ---
app.post('/pix/gerar', async (req, res) => {
    try {
        if (!req.session.usuarioLogado) return res.status(401).json({ ok: false, msg: 'Não autenticado' });

        const { simulacao_id, valor } = req.body;
        const vPagar = parseFloat(valor);

        if (vPagar <= 0) return res.status(400).json({ ok: false, msg: 'Valor inválido' });

        // Verificar se simulação pertence ao usuário
        const simResult = await pool.query('SELECT * FROM SIMULACOES WHERE id = $1 AND cpf = $2', [simulacao_id, req.session.userCpf]);
        if (simResult.rows.length === 0) return res.status(403).json({ ok: false, msg: 'Acesso negado' });

        const sim = simResult.rows[0];

        // ===== PIX REAL: Usar chave PIX estática do Inter =====
        const pixKey = '038.286.430-19'; // Chave PIX (CPF) do Inter - GABRIEL
        const paymentId = 'PIX-' + Date.now() + '-' + simulacao_id;
        const qrCodeData = gerarPixBrCode(pixKey, vPagar);

        // Gerar imagem QR Code em base64 (usando serviço público grátis)
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCodeData)}`;

        // Salvar cobrança simulada na tabela PIX_COBRANCAS
        await pool.query(
            'INSERT INTO PIX_COBRANCAS (simulacao_id, mp_payment_id, qr_code, qr_code_base64, valor, status) VALUES ($1, $2, $3, $4, $5, $6)',
            [simulacao_id, paymentId, qrCodeData, qrCodeUrl, vPagar, 'PENDENTE']
        );

        console.log('🎭 PIX MOCK gerado:', { simulacao_id, valor: vPagar, payment_id: paymentId });

        res.json({
            ok: true,
            qr_code: qrCodeData,
            qr_code_base64: qrCodeUrl, // URL da imagem, não base64
            valor: vPagar,
            mp_payment_id: paymentId,
            expiracao: new Date(Date.now() + 30 * 60000), // 30 minutos
            isMock: true
        });
    } catch (e) {
        console.error('❌ Erro ao gerar PIX:', e.message);
        res.status(500).json({ ok: false, msg: 'Erro ao gerar QR Code' });
    }
});

// --- WEBHOOK MERCADOPAGO (REAL) ---
app.post('/webhook/mercadopago', async (req, res) => {
    try {
        const { type, data } = req.body;

        if (type !== 'payment') {
            return res.json({ ok: true });
        }

        // Consultar status do pagamento no MercadoPago
        const payment = await mpClient.get({ id: data.id });

        if (payment.status !== 'approved') {
            return res.json({ ok: true });
        }

        // Encontrar cobrança PIX no banco
        const pixResult = await pool.query('SELECT * FROM PIX_COBRANCAS WHERE mp_payment_id = $1', [data.id]);
        if (pixResult.rows.length === 0) {
            console.warn('⚠️ Webhook: PIX não encontrado para payment_id:', data.id);
            return res.json({ ok: true });
        }

        const pix = pixResult.rows[0];
        const simulacao_id = pix.simulacao_id;

        // Registrar pagamento
        await pool.query(
            'INSERT INTO PAGAMENTOS (simulacao_id, data_pagamento, valor, status) VALUES ($1, $2, $3, $4)',
            [simulacao_id, new Date().toISOString().split('T')[0], pix.valor, 'CONFIRMADO']
        );

        // Atualizar status PIX
        await pool.query('UPDATE PIX_COBRANCAS SET status = $1 WHERE id = $2', ['CONFIRMADO', pix.id]);

        // Buscar simulação para verificar se quitou
        const simResult = await pool.query('SELECT * FROM SIMULACOES WHERE id = $1', [simulacao_id]);
        const sim = simResult.rows[0];

        const totalPagoResult = await pool.query('SELECT COALESCE(SUM(valor), 0) as total FROM PAGAMENTOS WHERE simulacao_id = $1', [simulacao_id]);
        const totalPago = parseFloat(totalPagoResult.rows[0].total);

        // Auto-QUITADO
        if (totalPago >= parseFloat(sim.total)) {
            await pool.query('UPDATE SIMULACOES SET status = $1 WHERE id = $2', ['QUITADO', simulacao_id]);
            enviarEmailQuitado(sim.email, sim.nome).catch(err => {
                console.error('⚠️ Email de quitação falhou:', err.message);
            });
            console.log('✅ Proposta QUITADA:', simulacao_id);
        } else {
            const parcelasRestantes = Math.ceil((parseFloat(sim.total) - totalPago) / parseFloat(sim.valor_parcela));
            enviarEmailPagamento(
                sim.email,
                sim.nome,
                pix.valor,
                totalPago,
                parseFloat(sim.total),
                parseInt(sim.parcelas),
                parcelasRestantes
            ).catch(err => {
                console.error('⚠️ Email de pagamento falhou:', err.message);
            });
            console.log('✅ Pagamento recebido:', { simulacao_id, valor: pix.valor });
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('❌ Erro no webhook:', err.message);
        res.status(500).json({ ok: false });
    }
});

// --- NOTIFICAR PAGAMENTO PIX PARA O ADMIN ---
app.post('/notificar-pagamento-pix', async (req, res) => {
    try {
        if (!req.session.usuarioLogado) return res.status(401).json({ ok: false, msg: 'Não autenticado' });

        const { simulacao_id, valor } = req.body;
        if (!simulacao_id || !valor) return res.status(400).json({ ok: false, msg: 'Dados incompletos' });

        // Buscar dados da simulação
        const simResult = await pool.query('SELECT nome, email, total FROM SIMULACOES WHERE id = $1 AND cpf = $2', [simulacao_id, req.session.userCpf]);
        if (simResult.rows.length === 0) return res.status(403).json({ ok: false, msg: 'Acesso negado' });

        const sim = simResult.rows[0];

        // Notificar admin via email
        try {
            await sgMail.send({
                to: EMAIL_REMETENTE,
                from: `AzulCrédito <${EMAIL_REMETENTE}>`,
                subject: `🔔 NOTIFICAÇÃO: Cliente ${sim.nome} fez pagamento PIX - Confira!`,
                html: `<div style="font-family:sans-serif;color:#333;max-width:600px;border:2px solid #f39c12;padding:25px;border-radius:15px;background-color:#fffaf0;">
                        <h2 style="color:#e67e22;border-bottom:3px solid #f39c12;padding-bottom:10px;">🔔 PAGAMENTO PIX PENDENTE DE CONFIRMAÇÃO</h2>
                        <div style="background:#fff9e6;padding:15px;border-radius:8px;margin:15px 0;">
                            <p><strong>Cliente:</strong> ${sim.nome}</p>
                            <p><strong>Email:</strong> ${sim.email}</p>
                            <p><strong>Valor do PIX:</strong> <span style="font-size:1.3rem;color:#27ae60;font-weight:bold;">R$ ${parseFloat(valor).toFixed(2)}</span></p>
                            <p><strong>Total da proposta:</strong> R$ ${parseFloat(sim.total).toFixed(2)}</p>
                            <p><strong>ID da Simulação:</strong> ${simulacao_id}</p>
                            <p><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                        </div>
                        <p style="color:#e67e22;font-weight:bold;">⚠️ Faça login no <strong>Admin Panel</strong> para confirmar o pagamento manualmente!</p>
                        <p style="color:#999;font-size:0.9rem;">Link direto: <a href="${BASE_URL}/admin-azul">Admin Panel AzulCrédito</a></p>
                        </div>`
            });
            console.log('📬 Email de notificação de PIX enviado para admin');
        } catch (e) {
            console.error('⚠️ Erro ao notificar admin:', e.message);
        }

        // Salvar notificação no banco de dados
        await pool.query(
            'INSERT INTO NOTIFICACOES_PIX (simulacao_id, cliente_nome, cliente_email, valor) VALUES ($1, $2, $3, $4)',
            [simulacao_id, sim.nome, sim.email, valor]
        );

        console.log(`🔔 PAGAMENTO PIX PENDENTE: ${sim.nome} - R$ ${valor} - ID: ${simulacao_id}`);

        res.json({ ok: true, msg: 'Pagamento registrado e admin foi notificado' });
    } catch (err) {
        console.error('❌ Erro ao notificar pagamento:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao registrar pagamento' });
    }
});

// --- VERIFICAR SE CUPOM JÁ FOI USADO ---
app.get('/api/cupom-ja-usado', async (req, res) => {
    try {
        if (!req.session.usuarioLogado) {
            console.log('⚠️ GET /api/cupom-ja-usado: Usuário não autenticado');
            return res.status(401).json({ jaUsado: false });
        }

        const cpf = req.session.userCpf;
        console.log(`🔍 GET /api/cupom-ja-usado: Checando CPF ${cpf}`);

        const jaUsado = await pool.query('SELECT * FROM CUPONS_USADOS WHERE cpf = $1 AND cupom = $2', [cpf, 'OFF5']);

        console.log(`   Resultado: ${jaUsado.rows.length > 0 ? '❌ JÁ USADO' : '✅ DISPONÍVEL'}`);
        console.log(`   Registros encontrados: ${jaUsado.rows.length}`);

        if (jaUsado.rows.length > 0) {
            console.log(`   Dados: ${JSON.stringify(jaUsado.rows[0])}`);
        }

        res.json({ jaUsado: jaUsado.rows.length > 0 });
    } catch (err) {
        console.error('❌ Erro ao verificar cupom:', err);
        res.status(500).json({ jaUsado: false });
    }
});

// --- REGISTRAR CUPOM COMO USADO ---
app.post('/api/registrar-cupom-usado', async (req, res) => {
    try {
        if (!req.session.usuarioLogado) {
            console.log('❌ POST /api/registrar-cupom-usado: Usuário não autenticado');
            return res.status(401).json({ ok: false, msg: 'Não autenticado' });
        }

        const { cupom, desconto } = req.body;
        const cpf = req.session.userCpf;

        console.log(`\n💾 POST /api/registrar-cupom-usado CHAMADO`);
        console.log(`   CPF: ${cpf}`);
        console.log(`   Cupom: ${cupom}`);
        console.log(`   Desconto: R$ ${desconto}`);

        // Verificar se já existe
        const jaExiste = await pool.query('SELECT * FROM CUPONS_USADOS WHERE cpf = $1 AND cupom = $2', [cpf, cupom]);

        if (jaExiste.rows.length > 0) {
            console.log(`⚠️ Cupom ${cupom} já estava registrado para este CPF`);
            return res.json({ ok: true, msg: 'Cupom já registrado' });
        }

        // Inserir novo registro
        const insertResult = await pool.query(
            'INSERT INTO CUPONS_USADOS (cpf, cupom, desconto) VALUES ($1, $2, $3) RETURNING *',
            [cpf, cupom, desconto]
        );

        console.log(`✅ Cupom ${cupom} registrado com sucesso para CPF ${cpf}`);
        console.log(`   Registros inseridos: ${insertResult.rows.length}`);
        console.log(`   Dados: ${JSON.stringify(insertResult.rows[0])}`);

        res.json({ ok: true, msg: 'Cupom registrado' });
    } catch (err) {
        console.error('❌ Erro ao registrar cupom:');
        console.error('   Mensagem:', err.message);
        console.error('   Código:', err.code);
        console.error('   Detalhes:', err.detail);
        res.status(500).json({ ok: false, msg: 'Erro ao registrar cupom: ' + err.message });
    }
});

// --- DEBUG: Ver todos os cupons registrados ---
app.get('/api/debug-cupons', async (req, res) => {
    try {
        console.log('\n🔍 DEBUG: GET /api/debug-cupons');
        const result = await pool.query('SELECT * FROM CUPONS_USADOS ORDER BY usado_em DESC');
        console.log(`Total de registros: ${result.rows.length}`);
        console.log('Registros:', JSON.stringify(result.rows, null, 2));
        res.json({ total: result.rows.length, cupons: result.rows });
    } catch (err) {
        console.error('❌ Erro ao buscar cupons:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- VALIDAR CUPOM DE DESCONTO ---
app.post('/api/validar-cupom', async (req, res) => {
    try {
        if (!req.session.usuarioLogado) return res.status(401).json({ ok: false, msg: 'Não autenticado' });

        const { cupom } = req.body;
        const cpf = req.session.userCpf;

        // Cupom válido é "OFF5"
        if (cupom !== 'OFF5') {
            return res.json({ ok: false, msg: '❌ Cupom inválido' });
        }

        // Verificar se já foi usado por este CPF
        const jaUsado = await pool.query('SELECT * FROM CUPONS_USADOS WHERE cpf = $1 AND cupom = $2', [cpf, 'OFF5']);
        if (jaUsado.rows.length > 0) {
            return res.json({ ok: false, msg: '❌ Este cupom já foi utilizado em sua conta' });
        }

        // Cupom válido
        res.json({ ok: true, msg: 'Cupom válido!', desconto: '0.05', cupom: 'OFF5' });
    } catch (err) {
        console.error('❌ Erro ao validar cupom:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao validar cupom' });
    }
});

// --- OBTER STATUS ATUALIZADO DAS SIMULAÇÕES DO CLIENTE ---
app.get('/api/simulacoes-cliente', async (req, res) => {
    try {
        if (!req.session.usuarioLogado) return res.status(401).json({ ok: false });
        const cpf = req.session.userCpf;
        const result = await pool.query('SELECT id, status, total FROM SIMULACOES WHERE CPF = $1 ORDER BY CRIADO_EM DESC', [cpf]);
        res.json({ ok: true, simulacoes: result.rows });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

// --- OBTER NOTIFICAÇÕES PIX PENDENTES (PARA ADMIN) ---
app.get('/api/notificacoes-pix', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM NOTIFICACOES_PIX WHERE lida = FALSE ORDER BY criado_em DESC'
        );
        res.json({ ok: true, notificacoes: result.rows, total: result.rows.length });
    } catch (err) {
        console.error('❌ Erro ao buscar notificações:', err);
        res.status(500).json({ ok: false });
    }
});

// --- MARCAR NOTIFICAÇÃO COMO LIDA ---
app.post('/api/marcar-notificacao-lida', adminAuth, async (req, res) => {
    try {
        const { notificacao_id } = req.body;
        await pool.query('UPDATE NOTIFICACOES_PIX SET lida = TRUE WHERE id = $1', [notificacao_id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('❌ Erro ao marcar notificação:', err);
        res.status(500).json({ ok: false });
    }
});

// --- MARCAR PAGAMENTO COMO VISTO ---
app.post('/api/admin/marcar-pagamento-visto', adminAuth, async (req, res) => {
    try {
        const { pagamento_id } = req.body;
        if (!pagamento_id) return res.status(400).json({ ok: false, msg: 'ID do pagamento não fornecido' });

        await pool.query(
            'INSERT INTO PAGAMENTOS_VISTOS (pagamento_id) VALUES ($1) ON CONFLICT DO NOTHING',
            [pagamento_id]
        );
        console.log(`✅ Pagamento ${pagamento_id} marcado como visto`);
        res.json({ ok: true });
    } catch (err) {
        console.error('❌ Erro ao marcar pagamento como visto:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao marcar como visto' });
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