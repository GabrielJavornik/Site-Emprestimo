require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const session = require('express-session');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const cron = require('node-cron');

const app = express();
const PORT = 8080;
const BASE_URL = process.env.BASE_URL || 'http://192.168.0.17:8080';
// Exemplo: 'http://192.168.1.100:8080'

// --- 1. SEGURANÇA ADMIN ---
// Middleware customizado para autenticação de admin com sessão
const adminAuth = (req, res, next) => {
    if (req.session.adminLogado && req.session.adminUser === 'admin') {
        return next();
    }
    return res.redirect('/admin-login');
};

// Credenciais admin
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Azul2026';

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

// --- LEMBRETES DE VENCIMENTO ---
async function enviarEmailLembrete(dest, nome, valorParcela, dataVencimento) {
    console.log('\n📧 [LEMBRETE] Enviando para:', dest);
    try {
        const dataFormatada = new Date(dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
        await sgMail.send({
            to: dest,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: '⚠️ Lembrete: Sua Parcela Vence em 3 Dias!',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:2px solid #f39c12;padding:25px;border-radius:15px;background-color:#fffaf0;">
                    <h2 style="color:#e67e22;">⚠️ Olá, ${nome}!</h2>
                    <p>Sua próxima parcela vence em <strong>3 dias</strong>.</p>
                    <div style="background:#fff3cd;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #f39c12;">
                        <p style="margin:0;"><strong>📅 Data de Vencimento:</strong> ${dataFormatada}</p>
                        <p style="margin:5px 0 0 0;"><strong>💰 Valor:</strong> R$ ${parseFloat(valorParcela).toFixed(2).replace('.',',')}</p>
                    </div>
                    <p>Evite juros e atrasos. Pague até a data de vencimento.</p>
                    <p style="font-size:0.9rem;color:#666;margin-top:20px;">Equipe AzulCrédito</p>
                    </div>`
        });
        console.log('✅ Email de lembrete enviado com sucesso!');
    } catch (e) {
        console.error('❌ Erro ao enviar email de lembrete:', e.response?.body || e.message);
    }
}

async function enviarWhatsAppLembrete(numero, nome, valorParcela, dataVencimento) {
    try {
        const dataFormatada = new Date(dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
        const msg = `Olá ${nome}! ⚠️ Sua parcela de R$ ${parseFloat(valorParcela).toFixed(2).replace('.',',')} vence em 3 dias (${dataFormatada}). Pague para evitar juros - AzulCrédito`;
        const numLimpo = numero.replace(/\D/g, '');

        // Chamar CallMeBot API para enviar mensagem WhatsApp
        const apikey = process.env.CALLMEBOT_API_KEY || ''; // API key opcional para melhor confiabilidade

        const urlParams = new URLSearchParams();
        urlParams.append('phone', `55${numLimpo}`);
        urlParams.append('text', msg);
        if (apikey) urlParams.append('apikey', apikey);

        const url = `https://api.callmebot.com/whatsapp.php?${urlParams.toString()}`;

        const response = await fetch(url, { method: 'GET', timeout: 5000 });

        if (response.ok) {
            console.log(`✅ WhatsApp enviado com sucesso para ${numLimpo}`);
        } else {
            console.warn(`⚠️ CallMeBot retornou status ${response.status} para ${numLimpo}. Mensagem pode não ter sido entregue. Detalhes: ${await response.text()}`);
        }
    } catch (err) {
        console.error(`❌ Erro ao enviar WhatsApp para ${numero.replace(/\D/g, '')}: ${err.message}`);
        console.log(`   → Número: ${numero.replace(/\D/g, '')}`);
        console.log(`   → Mensagem será registrada no banco mesmo se falhar`);
    }
}

// Função principal para verificar vencimentos
async function verificarVencimentos() {
    try {
        console.log('🔍 Verificando vencimentos de parcelas...');

        // Buscar todas as propostas PAGO (aprovadas) que não foram quitadas
        const sims = await pool.query(`
            SELECT * FROM SIMULACOES
            WHERE status = 'PAGO' AND aprovado_em IS NOT NULL
            ORDER BY id DESC
        `);

        if (sims.rows.length === 0) {
            console.log('✅ Nenhuma proposta ativa para verificar');
            return;
        }

        const hoje = new Date();
        const em3Dias = new Date();
        em3Dias.setDate(hoje.getDate() + 3);
        const em3DiasStr = em3Dias.toISOString().split('T')[0]; // YYYY-MM-DD

        for (const sim of sims.rows) {
            // Contar parcelas já pagas
            const pagoResult = await pool.query(
                'SELECT COUNT(*) as qtd FROM PAGAMENTOS WHERE simulacao_id = $1 AND status = $2',
                [sim.id, 'CONFIRMADO']
            );
            const parcPagas = parseInt(pagoResult.rows[0].qtd || 0);
            const parcTotal = parseInt(sim.parcelas);

            // Se todas as parcelas foram pagas, pular
            if (parcPagas >= parcTotal) {
                console.log(`✅ Simulação ${sim.id} (${sim.nome}) já foi totalmente quitada`);
                continue;
            }

            // Calcular próximo vencimento: aprovado_em + (parcPagas + 1) * 30 dias
            const aprovadoEm = new Date(sim.aprovado_em);
            const proximoVencimento = new Date(aprovadoEm);
            proximoVencimento.setDate(aprovadoEm.getDate() + ((parcPagas + 1) * 30));
            const vencStr = proximoVencimento.toISOString().split('T')[0];

            // Verificar se faltam exatamente 3 dias para este vencimento
            if (vencStr !== em3DiasStr) {
                continue;
            }

            // Verificar se email já foi enviado para este vencimento
            const jaEnviado = await pool.query(
                'SELECT id FROM LEMBRETES_ENVIADOS WHERE simulacao_id=$1 AND data_vencimento=$2 AND tipo=$3',
                [sim.id, vencStr, 'EMAIL']
            );

            if (jaEnviado.rows.length > 0) {
                console.log(`⏭️ Lembrete para simulação ${sim.id} já foi enviado`);
                continue;
            }

            console.log(`📧 Enviando lembrete para simulação ${sim.id} (${sim.nome})`);

            // Enviar email
            if (sim.email) {
                await enviarEmailLembrete(sim.email, sim.nome, sim.valor_parcela, vencStr);

                // Marcar como enviado
                await pool.query(
                    'INSERT INTO LEMBRETES_ENVIADOS (simulacao_id, data_vencimento, tipo) VALUES ($1, $2, $3)',
                    [sim.id, vencStr, 'EMAIL']
                );
            }

            // Enviar WhatsApp
            if (sim.whatsapp) {
                await enviarWhatsAppLembrete(sim.whatsapp, sim.nome, sim.valor_parcela, vencStr);

                // Marcar como enviado
                await pool.query(
                    'INSERT INTO LEMBRETES_ENVIADOS (simulacao_id, data_vencimento, tipo) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                    [sim.id, vencStr, 'WHATSAPP']
                );
            }
        }

        console.log('✅ Verificação de vencimentos concluída');
    } catch (err) {
        console.error('❌ Erro ao verificar vencimentos:', err.message);
    }
}

// Enviar email de atraso
async function enviarEmailAtraso(dest, nome, numParcela, valorOriginal, dataVenc, multa, juros, totalDevido) {
    try {
        const dataFormatada = new Date(dataVenc + 'T12:00:00').toLocaleDateString('pt-BR');
        await sgMail.send({
            to: dest,
            from: `AzulCrédito <${EMAIL_REMETENTE}>`,
            subject: `URGENTE: Parcela ${numParcela} em atraso - AzulCrédito`,
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:2px solid #dc2626;padding:25px;border-radius:15px;background:#fef2f2;">
                    <h2 style="color:#dc2626;">⚠️ Parcela ${numParcela} em Atraso</h2>
                    <p>Olá, <strong>${nome}</strong>! Identificamos que sua parcela venceu sem pagamento.</p>
                    <div style="background:#fee2e2;padding:15px;border-radius:8px;border-left:4px solid #dc2626;margin:15px 0;">
                        <p style="margin:8px 0;"><strong>📅 Vencimento:</strong> ${dataFormatada}</p>
                        <p style="margin:8px 0;"><strong>💵 Valor original:</strong> R$ ${parseFloat(valorOriginal).toFixed(2).replace('.',',')}</p>
                        <p style="margin:8px 0;"><strong>📌 Multa (2%):</strong> R$ ${multa.toFixed(2).replace('.',',')}</p>
                        <p style="margin:8px 0;"><strong>📊 Juros:</strong> R$ ${juros.toFixed(2).replace('.',',')}</p>
                        <p style="margin:8px 0;font-size:1.2rem;font-weight:bold;color:#dc2626;"><strong>💸 TOTAL A PAGAR:</strong> R$ ${totalDevido.toFixed(2).replace('.',',')}</p>
                    </div>
                    <p style="color:#dc2626;font-weight:bold;">Regularize sua situação o quanto antes para evitar acúmulo de juros!</p>
                    <p style="font-size:0.9rem;color:#666;margin-top:20px;">Equipe AzulCrédito</p></div>`
        });
        console.log(`✅ Email de atraso enviado para ${dest}`);
    } catch (e) {
        console.error('❌ Erro ao enviar email de atraso:', e.message);
    }
}

// Enviar WhatsApp de atraso
async function enviarWhatsAppAtraso(numero, nome, numParcela, valorOriginal, totalDevido) {
    try {
        const numLimpo = numero.replace(/\D/g, '');
        const msg = `ATENÇÃO ${nome}! ⚠️ Sua parcela ${numParcela} está em ATRASO. ` +
            `Valor original: R$ ${parseFloat(valorOriginal).toFixed(2).replace('.',',')}. ` +
            `Com multa e juros: R$ ${totalDevido.toFixed(2).replace('.',',')}. ` +
            `Regularize agora para evitar mais juros - AzulCrédito`;

        const url = `https://api.callmebot.com/whatsapp.php?phone=55${numLimpo}&text=${encodeURIComponent(msg)}&apikey=${process.env.CALLMEBOT_API_KEY || ''}`;
        const response = await fetch(url, { method: 'GET', timeout: 5000 });

        if (response.ok) {
            console.log(`✅ WhatsApp de atraso enviado para ${numLimpo}`);
        } else {
            console.warn(`⚠️ Falha ao enviar WhatsApp de atraso: status ${response.status}`);
        }
    } catch (e) {
        console.error(`❌ Erro ao enviar WhatsApp de atraso: ${e.message}`);
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

// Criar tabela de configurações do sistema
pool.query(`
    CREATE TABLE IF NOT EXISTS CONFIGURACOES (
        id SERIAL PRIMARY KEY,
        chave VARCHAR(100) UNIQUE NOT NULL,
        valor VARCHAR(500) NOT NULL,
        descricao TEXT,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela CONFIGURACOES:', err.message));

// Inserir taxa de juros padrão se não existir
pool.query(`
    INSERT INTO CONFIGURACOES (chave, valor, descricao)
    VALUES ('TAXA_JUROS', '0.05', 'Taxa de juros por parcela (ex: 0.05 = 5%)')
    ON CONFLICT (chave) DO NOTHING
`).catch(err => console.error('⚠️ Erro ao inserir taxa de juros padrão:', err.message));

// Adicionar coluna aprovado_em à tabela SIMULACOES se não existir
pool.query(`
    ALTER TABLE SIMULACOES ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP
`).catch(err => console.error('⚠️ Erro ao adicionar coluna aprovado_em:', err.message));

// Adicionar colunas de endereço à tabela USUARIOS
pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS cep VARCHAR(10)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna cep:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS rua VARCHAR(200)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna rua:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS bairro VARCHAR(100)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna bairro:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS cidade VARCHAR(100)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna cidade:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS estado VARCHAR(2)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna estado:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS numero_casa VARCHAR(20)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna numero_casa:', err.message));

// Adicionar colunas de dados bancários à tabela USUARIOS
pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS banco_codigo VARCHAR(10)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna banco_codigo:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS banco_nome VARCHAR(100)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna banco_nome:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS agencia VARCHAR(10)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna agencia:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS conta VARCHAR(20)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna conta:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS conta_digito VARCHAR(3)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna conta_digito:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS conta_tipo VARCHAR(20)
`).catch(err => console.error('⚠️ Erro ao adicionar coluna conta_tipo:', err.message));

// Adicionar colunas de bloqueio granular
pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS bloqueado_login BOOLEAN DEFAULT FALSE
`).catch(err => console.error('⚠️ Erro ao adicionar coluna bloqueado_login:', err.message));

pool.query(`
    ALTER TABLE USUARIOS ADD COLUMN IF NOT EXISTS bloqueado_emprestimo BOOLEAN DEFAULT FALSE
`).catch(err => console.error('⚠️ Erro ao adicionar coluna bloqueado_emprestimo:', err.message));

// Tabela para controlar lembretes enviados
pool.query(`
    CREATE TABLE IF NOT EXISTS LEMBRETES_ENVIADOS (
        id SERIAL PRIMARY KEY,
        simulacao_id INT NOT NULL,
        data_vencimento DATE NOT NULL,
        tipo VARCHAR(20) DEFAULT 'EMAIL',
        enviado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(simulacao_id, data_vencimento, tipo),
        FOREIGN KEY (simulacao_id) REFERENCES SIMULACOES(id) ON DELETE CASCADE
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela LEMBRETES_ENVIADOS:', err.message));

// Tabela para registrar multas por atraso
pool.query(`
    CREATE TABLE IF NOT EXISTS MULTAS (
        id SERIAL PRIMARY KEY,
        simulacao_id INT NOT NULL,
        parcela_num INT NOT NULL,
        data_vencimento DATE NOT NULL,
        valor_original DECIMAL(10,2) NOT NULL,
        multa DECIMAL(10,2) NOT NULL DEFAULT 0,
        juros DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_devido DECIMAL(10,2) NOT NULL,
        dias_atraso INT NOT NULL DEFAULT 0,
        status VARCHAR(20) DEFAULT 'ATIVA',
        notificado_em TIMESTAMP,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(simulacao_id, parcela_num),
        FOREIGN KEY (simulacao_id) REFERENCES SIMULACOES(id) ON DELETE CASCADE
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela MULTAS:', err.message));

pool.query(`CREATE INDEX IF NOT EXISTS idx_multas_simulacao ON MULTAS(simulacao_id)`)
    .catch(() => {});

// Tabela para renegociação de dívidas
pool.query(`
    CREATE TABLE IF NOT EXISTS RENEGOCIACOES (
        id SERIAL PRIMARY KEY,
        simulacao_id INT NOT NULL,
        cpf VARCHAR(11) NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDENTE',
        novo_prazo INT NOT NULL,
        motivo TEXT,
        respondido_em TIMESTAMP,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (simulacao_id) REFERENCES SIMULACOES(id) ON DELETE CASCADE
    )
`).catch(err => console.error('⚠️ Erro ao criar tabela RENEGOCIACOES:', err.message));

const soNumeros = (str) => String(str || '').replace(/\D/g, '');
const formatarMoeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Calcular juros e multa por atraso
function calcularJurosMulta(valorParcela, dataVencimento) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const venc = new Date(dataVencimento + 'T12:00:00');
    venc.setHours(0, 0, 0, 0);

    const diasAtraso = Math.floor((hoje - venc) / (1000 * 60 * 60 * 24));

    if (diasAtraso <= 0) {
        return { multa: 0, juros: 0, total: parseFloat(valorParcela), diasAtraso: 0 };
    }

    const valor = parseFloat(valorParcela);
    const multa = valor * 0.02;
    const juros = valor * 0.00033 * diasAtraso;
    const total = valor + multa + juros;

    return {
        multa: parseFloat(multa.toFixed(2)),
        juros: parseFloat(juros.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        diasAtraso
    };
}

// Calcular todas as parcelas de uma simulação
function calcularParcelasSimulacao(sim, totalPagoAcumulado) {
    const aprovadoEm = new Date(sim.aprovado_em);
    aprovadoEm.setHours(0, 0, 0, 0);
    const parcelas = parseInt(sim.parcelas);
    const valorMensal = parseFloat(sim.total) / parcelas;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let saldoPago = parseFloat(totalPagoAcumulado || 0);
    const resultado = [];

    for (let n = 1; n <= parcelas; n++) {
        const venc = new Date(aprovadoEm);
        venc.setDate(aprovadoEm.getDate() + (n * 30));
        const vencStr = venc.toISOString().split('T')[0];

        let statusParcela;
        if (saldoPago >= valorMensal) {
            statusParcela = 'PAGA';
            saldoPago -= valorMensal;
        } else if (venc < hoje) {
            statusParcela = 'ATRASADA';
        } else {
            statusParcela = 'PENDENTE';
        }

        const { multa, juros, total: totalDevido, diasAtraso } = calcularJurosMulta(valorMensal, vencStr);

        resultado.push({
            numero: n,
            total: parcelas,
            dataVencimento: vencStr,
            valorOriginal: parseFloat(valorMensal.toFixed(2)),
            multa: statusParcela === 'ATRASADA' ? multa : 0,
            juros: statusParcela === 'ATRASADA' ? juros : 0,
            totalDevido: statusParcela === 'ATRASADA' ? totalDevido : parseFloat(valorMensal.toFixed(2)),
            diasAtraso: statusParcela === 'ATRASADA' ? diasAtraso : 0,
            status: statusParcela
        });
    }

    return resultado;
}

// Validar CPF matematicamente (verifica dígitos verificadores)
function validarCPFMath(cpf) {
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(d[i]) * (10 - i);
    let r = (soma * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    if (r !== parseInt(d[9])) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(d[i]) * (11 - i);
    r = (soma * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    return r === parseInt(d[10]);
}

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

// --- ADMIN LOGIN ---
app.get('/admin-login', (req, res) => {
    if (req.session.adminLogado) return res.redirect('/admin-azul');

    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin AzulCrédito - Login</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 20px;
                }
                .login-container {
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 25px 80px rgba(0,0,0,0.3);
                    padding: 50px 40px;
                    width: 100%;
                    max-width: 420px;
                    animation: slideUp 0.6s ease-out;
                }
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .logo-area {
                    text-align: center;
                    margin-bottom: 40px;
                }
                .logo {
                    font-size: 32px;
                    font-weight: bold;
                    color: #1e3c72;
                    margin-bottom: 10px;
                }
                .logo span {
                    color: #667eea;
                }
                .logo-subtitle {
                    font-size: 0.9rem;
                    color: #999;
                    margin-top: 5px;
                }
                .admin-badge {
                    display: inline-block;
                    background: #667eea;
                    color: white;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: bold;
                    margin-top: 10px;
                }
                .form-group {
                    margin-bottom: 20px;
                }
                label {
                    display: block;
                    margin-bottom: 8px;
                    color: #333;
                    font-weight: 600;
                    font-size: 0.95rem;
                }
                input[type="text"],
                input[type="password"] {
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                }
                input[type="text"]:focus,
                input[type="password"]:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                }
                .btn-login {
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 1rem;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-top: 25px;
                    box-shadow: 0 5px 20px rgba(102, 126, 234, 0.3);
                }
                .btn-login:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 30px rgba(102, 126, 234, 0.4);
                }
                .btn-login:active {
                    transform: translateY(0);
                }
                .error-message {
                    display: none;
                    background: #fee2e2;
                    color: #991b1b;
                    padding: 12px 15px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                    font-size: 0.9rem;
                    border-left: 4px solid #dc2626;
                }
                .loading-spinner {
                    display: none;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #fff;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                    margin: 0 auto;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .btn-login:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                .back-link {
                    text-align: center;
                    margin-top: 20px;
                }
                .back-link a {
                    color: #667eea;
                    text-decoration: none;
                    font-size: 0.9rem;
                    transition: color 0.3s;
                }
                .back-link a:hover {
                    color: #764ba2;
                }
                .security-info {
                    background: #f0f4f8;
                    padding: 12px 15px;
                    border-radius: 10px;
                    font-size: 0.8rem;
                    color: #666;
                    margin-top: 20px;
                    text-align: center;
                    border-left: 3px solid #667eea;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="logo-area">
                    <div class="logo">Azul<span>Crédito</span></div>
                    <div class="logo-subtitle">Painel Administrativo</div>
                    <div class="admin-badge">👤 ADMIN</div>
                </div>

                <div id="errorMsg" class="error-message"></div>

                <form id="adminLoginForm">
                    <div class="form-group">
                        <label for="adminUser">👤 Usuário</label>
                        <input type="text" id="adminUser" name="user" placeholder="Seu usuário admin" required autocomplete="off">
                    </div>

                    <div class="form-group">
                        <label for="adminPass">🔐 Senha</label>
                        <input type="password" id="adminPass" name="pass" placeholder="Sua senha" required autocomplete="off">
                    </div>

                    <button type="submit" class="btn-login">
                        <span id="btnText">Entrar no Painel</span>
                        <div id="spinner" class="loading-spinner"></div>
                    </button>
                </form>

                <div class="security-info">
                    🔒 Conexão segura e criptografada
                </div>

                <div class="back-link">
                    <a href="/">← Voltar para Home</a>
                </div>
            </div>

            <script>
                document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const user = document.getElementById('adminUser').value;
                    const pass = document.getElementById('adminPass').value;
                    const errorMsg = document.getElementById('errorMsg');
                    const btn = e.target.querySelector('.btn-login');
                    const btnText = document.getElementById('btnText');
                    const spinner = document.getElementById('spinner');

                    errorMsg.style.display = 'none';
                    btn.disabled = true;
                    btnText.style.display = 'none';
                    spinner.style.display = 'block';

                    try {
                        const res = await fetch('/admin-login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user, pass })
                        });

                        const data = await res.json();
                        if (data.ok) {
                            // Sucesso - redirecionar com animação
                            setTimeout(() => window.location.href = '/admin-azul', 300);
                        } else {
                            errorMsg.innerText = '❌ ' + data.msg;
                            errorMsg.style.display = 'block';
                        }
                    } catch (err) {
                        errorMsg.innerText = '❌ Erro ao conectar ao servidor.';
                        errorMsg.style.display = 'block';
                    } finally {
                        btn.disabled = false;
                        btnText.style.display = 'inline';
                        spinner.style.display = 'none';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

app.post('/admin-login', async (req, res) => {
    const { user, pass } = req.body;

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        req.session.adminLogado = true;
        req.session.adminUser = ADMIN_USER;
        return res.json({ ok: true, msg: 'Login realizado com sucesso!' });
    }

    res.json({ ok: false, msg: 'Usuário ou senha incorretos.' });
});

app.get('/admin-logout', (req, res) => {
    req.session.adminLogado = false;
    req.session.adminUser = null;
    res.redirect('/admin-login');
});

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
        const { nome, email, whatsapp, cpf, senha, cep, rua, bairro, cidade, estado, numero_casa } = req.body;

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

        // Validar CPF matematicamente
        if (!validarCPFMath(cpf)) {
            return res.status(400).json({ ok: false, msg: 'CPF inválido. Verifique os dígitos verificadores.' });
        }

        const cpfLimpo = soNumeros(cpf);
        const tokenEmail = require('crypto').randomBytes(32).toString('hex');

        await pool.query('INSERT INTO USUARIOS (nome, cpf, senha, email, whatsapp, email_verificado, token_email, cep, rua, bairro, cidade, estado, numero_casa) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
        [nome, cpfLimpo, senha, email, soNumeros(whatsapp), false, tokenEmail, cep || null, rua || null, bairro || null, cidade || null, estado || null, numero_casa || null]);

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
        if (result.rows[0].bloqueado_login === true) {
            console.log(`❌ Tentativa de login de cliente com acesso bloqueado: ${result.rows[0].cpf}`);
            return res.status(403).json({ ok: false, msg: '🚫 Sua conta foi bloqueada. Entre em contato com o suporte.' });
        }
        req.session.usuarioLogado = true; req.session.userCpf = result.rows[0].cpf; req.session.userName = result.rows[0].nome;
        res.json({ ok: true });
    } else { res.status(401).json({ ok: false }); }
});

app.post('/simular', async (req, res) => {
    try {
        const { nome, cpf, valor, parcelas } = req.body;

        // Obter taxa de juros dinâmica
        const taxaResult = await pool.query('SELECT valor FROM CONFIGURACOES WHERE chave = $1', ['TAXA_JUROS']);
        const taxa = taxaResult.rows.length > 0 ? parseFloat(taxaResult.rows[0].valor) : 0.05;

        const vTotal = valor + (valor * taxa * parcelas);
        res.json({ ok: true, nome, cpf, valor, parcelas, vTotal, taxa });
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
        const result = await pool.query('SELECT nome, email, whatsapp, cep, rua, bairro, cidade, estado, numero_casa, banco_codigo, banco_nome, agencia, conta, conta_digito, conta_tipo FROM USUARIOS WHERE cpf = $1', [cpf]);
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
                    <h2>📍 Meu Endereço</h2>
                    <div id="resultado-endereco"></div>
                    <label>CEP</label>
                    <input type="text" id="cep" value="${user.cep || ''}" placeholder="00000-000" maxlength="9" onblur="buscarCEPPerfil()">

                    <label>Rua/Avenida</label>
                    <input type="text" id="rua" value="${user.rua || ''}" placeholder="Rua, Avenida...">

                    <label>Bairro</label>
                    <input type="text" id="bairro" value="${user.bairro || ''}" placeholder="Bairro">

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <label>Cidade</label>
                            <input type="text" id="cidade" value="${user.cidade || ''}" placeholder="Cidade">
                        </div>
                        <div>
                            <label>Estado</label>
                            <input type="text" id="estado" value="${user.estado || ''}" placeholder="UF" maxlength="2">
                        </div>
                    </div>

                    <label>Número</label>
                    <input type="text" id="numero_casa" value="${user.numero_casa || ''}" placeholder="123">

                    <button onclick="atualizarEndereco()" style="background:#27ae60;">🏠 Salvar Endereço</button>
                </div>

                <div class="card">
                    <h2>🏦 Dados Bancários</h2>
                    <div id="resultado-banco"></div>
                    <label>Banco</label>
                    <select id="banco" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">
                        <option value="">Selecione seu banco</option>
                        <option value="001">Banco do Brasil (001)</option>
                        <option value="033">Banco Santander (033)</option>
                        <option value="104">Caixa Econômica Federal (104)</option>
                        <option value="237">Banco Bradesco (237)</option>
                        <option value="260">Nu Pagamentos S.A. - Nubank (260)</option>
                        <option value="077">Banco Inter (077)</option>
                        <option value="341">Itaú Unibanco (341)</option>
                        <option value="745">Banco Citibank (745)</option>
                        <option value="399">HSBC Bank Brasil (399)</option>
                        <option value="072">Banco Bmg (072)</option>
                    </select>

                    <label>Agência (sem dígito)</label>
                    <input type="text" id="agencia" placeholder="0000" maxlength="5">

                    <label>Conta (sem dígito)</label>
                    <input type="text" id="conta" placeholder="0000000" maxlength="14">

                    <label>Dígito da Conta</label>
                    <input type="text" id="conta-digito" placeholder="0" maxlength="3">

                    <label>Tipo de Conta</label>
                    <select id="conta-tipo" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">
                        <option value="">Selecione o tipo</option>
                        <option value="corrente">Conta Corrente</option>
                        <option value="poupanca">Conta Poupança</option>
                    </select>

                    <button onclick="salvarDadosBancarios()">💾 Salvar Dados Bancários</button>
                    <div class="info" style="background:#e8f4f8;border-left-color:#0066cc;">
                        <strong>ℹ️ Informações:</strong>
                        <p style="margin:8px 0;">Seus dados bancários são armazenados de forma segura e serão usados para transferências futuras.</p>
                    </div>
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
                // Buscar endereço por CEP na página de perfil
                async function buscarCEPPerfil() {
                    const cepInput = document.getElementById('cep');
                    const cep = cepInput.value.replace(/\D/g, '');
                    if (cep.length !== 8) return;

                    try {
                        const resp = await fetch(\`/api/cep/\${cep}\`);
                        const data = await resp.json();

                        if (data.ok) {
                            document.getElementById('rua').value = data.rua || '';
                            document.getElementById('bairro').value = data.bairro || '';
                            document.getElementById('cidade').value = data.cidade || '';
                            document.getElementById('estado').value = data.estado || '';
                            document.getElementById('numero_casa').focus();
                        } else {
                            alert('⚠️ ' + data.msg);
                        }
                    } catch (e) {
                        console.error('❌ Erro ao buscar CEP:', e);
                        alert('❌ Erro ao buscar endereço');
                    }
                }

                // Preencher select de banco com dados salvos
                window.addEventListener('load', () => {
                    if ('${user.banco_codigo}') {
                        document.getElementById('banco').value = '${user.banco_codigo}';
                        document.getElementById('agencia').value = '${user.agencia || ''}';
                        document.getElementById('conta').value = '${user.conta || ''}';
                        document.getElementById('conta-digito').value = '${user.conta_digito || ''}';
                        document.getElementById('conta-tipo').value = '${user.conta_tipo || ''}';
                    }
                });

                async function salvarDadosBancarios() {
                    const banco_codigo = document.getElementById('banco').value;
                    const banco_nome = document.getElementById('banco').options[document.getElementById('banco').selectedIndex]?.text || '';
                    const agencia = document.getElementById('agencia').value.trim();
                    const conta = document.getElementById('conta').value.trim();
                    const conta_digito = document.getElementById('conta-digito').value.trim();
                    const conta_tipo = document.getElementById('conta-tipo').value;

                    const resultado = document.getElementById('resultado-banco');

                    if (!banco_codigo || !agencia || !conta || !conta_tipo) {
                        resultado.innerHTML = '<p class="error">❌ Preencha todos os campos obrigatórios!</p>';
                        return;
                    }

                    try {
                        // Validar conta primeiro
                        const validResp = await fetch('/api/validar-conta', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ banco_codigo, agencia, conta, conta_tipo })
                        });
                        const validJson = await validResp.json();
                        if (!validJson.ok) {
                            resultado.innerHTML = '<p class="error">❌ ' + validJson.msg + '</p>';
                            return;
                        }

                        // Salvar dados
                        const resp = await fetch('/salvar-dados-bancarios', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ banco_codigo, banco_nome, agencia, conta, conta_digito, conta_tipo })
                        });

                        const json = await resp.json();
                        if (json.ok) {
                            resultado.innerHTML = '<p class="success">' + json.msg + '</p>';
                        } else {
                            resultado.innerHTML = '<p class="error">❌ ' + (json.msg || 'Erro ao salvar') + '</p>';
                        }
                    } catch (e) {
                        resultado.innerHTML = '<p class="error">❌ Erro ao conectar ao servidor</p>';
                        console.error(e);
                    }
                }

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

                async function atualizarEndereco() {
                    const cep = document.getElementById('cep').value.trim();
                    const rua = document.getElementById('rua').value.trim();
                    const bairro = document.getElementById('bairro').value.trim();
                    const cidade = document.getElementById('cidade').value.trim();
                    const estado = document.getElementById('estado').value.trim();
                    const numero_casa = document.getElementById('numero_casa').value.trim();
                    const nome = document.getElementById('nome').value.trim();
                    const email = document.getElementById('email').value.trim();
                    const whatsapp = document.getElementById('whatsapp').value.trim();

                    const resultado = document.getElementById('resultado-endereco');

                    // Validação básica
                    if (!nome || !email) {
                        resultado.innerHTML = '<p class="error">❌ Nome e Email são obrigatórios!</p>';
                        return;
                    }

                    console.log('📤 Enviando dados:', { nome, email, whatsapp, cep, rua, bairro, cidade, estado, numero_casa });

                    try {
                        const resp = await fetch('/atualizar-perfil', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nome, email, whatsapp, cep, rua, bairro, cidade, estado, numero_casa })
                        });

                        const json = await resp.json();
                        console.log('📥 Resposta do servidor:', json);

                        if (json.ok) {
                            resultado.innerHTML = '<p class="success">✅ Endereço salvo com sucesso!</p>';
                            setTimeout(() => resultado.innerHTML = '', 3000);
                        } else {
                            resultado.innerHTML = '<p class="error">❌ Erro ao salvar: ' + (json.msg || 'Erro ao atualizar') + '</p>';
                        }
                    } catch (err) {
                        console.error('❌ Erro ao salvar endereço:', err);
                        resultado.innerHTML = '<p class="error">❌ Erro de conexão ao salvar endereço</p>';
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

        // Buscar também status de bloqueio e check de renegociação
        const usuarioResult = await pool.query('SELECT bloqueado_login, bloqueado_emprestimo FROM USUARIOS WHERE cpf = $1', [cpf]);
        const bloqueado_login = usuarioResult.rows.length > 0 ? usuarioResult.rows[0].bloqueado_login : false;
        const bloqueado_emprestimo = usuarioResult.rows.length > 0 ? usuarioResult.rows[0].bloqueado_emprestimo : false;

        // Fetch total paid and penalties for each simulation
        const pagamentosPromises = result.rows.map(r =>
            pool.query('SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1 AND status = $2', [r.id, 'CONFIRMADO'])
        );
        const multasPromises = result.rows.map(r =>
            pool.query('SELECT COUNT(*) as qtd FROM MULTAS WHERE simulacao_id = $1 AND status = $2', [r.id, 'ATIVA'])
        );
        const renegPromises = result.rows.map(r =>
            pool.query('SELECT status FROM RENEGOCIACOES WHERE simulacao_id = $1 ORDER BY criado_em DESC LIMIT 1', [r.id])
        );
        const [pagamentosResults, multasResults, renegResults] = await Promise.all([
            Promise.all(pagamentosPromises),
            Promise.all(multasPromises),
            Promise.all(renegPromises)
        ]);
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
            <div id="resumo" class="resumo-box"><strong>Total a pagar: </strong><span id="total-txt" style="font-size:1.3rem; color:#1e3c72; font-weight:bold;">R$ 0,00</span><br><small id="taxa-texto">*Incluso taxa de 5% por parcela</small></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:15px;"><div><label>FOTO ID</label><input type="file" name="doc_id" required></div><div><label>RENDA</label><input type="file" name="doc_renda" required></div></div>
            <button type="submit" class="btn-blue">SOLICITAR CRÉDITO</button></form></div>
            <div class="card"><h3>📋 Meu Histórico</h3><table><thead><tr><th>DATA</th><th>VALOR</th><th>PARCELAS</th><th>MENSAL</th><th>PAGO</th><th>FALTA</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>
            ${result.rows.map((r, idx) => {
                const totalPago = parseFloat(pagamentosResults[idx].rows[0].total_pago || 0);
                const temMultaAtiva = parseInt(multasResults[idx].rows[0].qtd || 0) > 0;
                const renegStatus = renegResults[idx].rows.length > 0 ? renegResults[idx].rows[0].status : null;
                const parcelas = parseInt(r.parcelas || 1);
                const totalValor = parseFloat(r.total);
                const valorMensal = totalValor / parcelas;
                const parcelasPagas = Math.floor(totalPago / valorMensal);
                const parcelasRestantes = parcelas - parcelasPagas;
                const faltaPagar = totalValor - totalPago;
                const percentualPago = ((totalPago / totalValor) * 100).toFixed(1);
                const alertaMulta = temMultaAtiva ? `<div style="background:#fee2e2;color:#991b1b;padding:8px 12px;border-radius:8px;font-size:0.85rem;font-weight:bold;margin-bottom:8px;border-left:3px solid #dc2626;">⚠️ Parcela(s) atrasada(s)!</div>` : '';
                const btnPix = r.status === 'PAGO' && totalPago < totalValor ? `<button class="btn-pdf" style="background:#0066cc;margin-right:5px;" onclick="abrirModalEscolhaPagamento(${r.id}, ${valorMensal}, ${faltaPagar})">💙 Pagar PIX</button>` : '';
                const btnRenegociar = r.status === 'PAGO' && temMultaAtiva && !renegStatus ? `<button class="btn-pdf" style="background:#ff9800;margin-right:5px;" onclick="abrirModalRenegociar(${r.id}, ${parcelas}, ${faltaPagar})">📝 Renegociar</button>` : (renegStatus ? `<span style="background:#e3f2fd;color:#1e40af;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:bold;">${renegStatus === 'PENDENTE' ? '⏳ Pendente' : renegStatus === 'APROVADA' ? '✅ Aprovada' : '❌ Rejeitada'}</span>` : '');
                return `<tr><td>${new Date(r.criado_em).toLocaleDateString()}</td><td>${formatarMoeda(r.valor)}</td><td style="font-weight:bold;">${parcelasPagas}/${parcelas}</td><td>${formatarMoeda(valorMensal)}</td><td style="font-weight:bold;color:#2ecc71;">${formatarMoeda(totalPago)}<br><small style="color:#666;">(${percentualPago}%)</small></td><td style="font-weight:bold;color:#e74c3c;">${formatarMoeda(faltaPagar)}<br><small style="color:#666;">${parcelasRestantes} parcelas</small></td><td style="text-align:center;"><span class="badge st-${r.status.replace(/\s/g,'')}">${r.status}</span></td><td>${alertaMulta}${btnPix}${btnRenegociar}<button class="btn-pdf" style="background:#27ae60;" onclick="verHistorico(${r.id})">📊 Histórico</button></td></tr>`;
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

            <div id="modalRenegociar" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10001;justify-content:center;align-items:center;overflow-y:auto;">
                <div style="background:white;padding:30px;border-radius:15px;width:min(500px,90%);margin:30px auto;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h3 style="margin:0;color:#ff9800;">📝 Solicitar Renegociação</h3>
                        <button onclick="fecharModalRenegociar()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>
                    </div>
                    <div id="reneg-resultado" style="margin-bottom:15px;"></div>
                    <div style="background:#fff3e0;padding:12px;border-radius:8px;margin-bottom:15px;border-left:3px solid #ff9800;font-size:0.9rem;color:#e65100;">
                        <strong>ℹ️ Informação:</strong> Você pode aumentar o prazo para reduzir as parcelas mensais.
                    </div>
                    <label style="font-weight:bold;color:#333;display:block;margin-bottom:5px;">Novo Prazo (parcelas)</label>
                    <input type="number" id="reneg-novo-prazo" placeholder="Ex: 15" min="1" max="60" style="width:100%;padding:10px;border:2px solid #ddd;border-radius:8px;margin-bottom:15px;box-sizing:border-box;">
                    <label style="font-weight:bold;color:#333;display:block;margin-bottom:5px;">Motivo (opcional)</label>
                    <textarea id="reneg-motivo" placeholder="Explique brevemente o motivo da solicitação..." style="width:100%;padding:10px;border:2px solid #ddd;border-radius:8px;margin-bottom:15px;box-sizing:border-box;height:100px;font-family:inherit;"></textarea>
                    <button onclick="enviarSolicitacaoRenegociacao()" style="width:100%;padding:12px;background:#ff9800;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:1rem;">📤 Enviar Solicitação</button>
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
                async function verHistorico(id){
                    const modal=document.getElementById('modalPagamentos');
                    const container=document.getElementById('pagamentos-container');
                    container.innerHTML='<p style="text-align:center;color:#666;">Carregando...</p>';
                    modal.style.display='flex';
                    try{
                        const resp=await fetch('/historico/'+id);
                        const json=await resp.json();
                        if(!json.ok){container.innerHTML='<p style="text-align:center;color:red;">Erro ao carregar</p>';return;}

                        const {parcelas,totalPago,totalDivida}=json;
                        const pct=Math.min((totalPago/totalDivida*100).toFixed(1),100);
                        let html=\`<div style="background:#f0f7ff;padding:15px;border-radius:10px;margin-bottom:15px;"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span><strong>Pago:</strong> R$ \${totalPago.toFixed(2).replace('.',',')}</span><span><strong>Falta:</strong> R$ \${(totalDivida-totalPago).toFixed(2).replace('.',',')}</span></div><div style="background:#ddd;border-radius:50px;height:10px;"><div style="background:#2ecc71;height:10px;border-radius:50px;width:\${pct}%;transition:width 0.5s;"></div></div><small style="color:#666;">\${pct}% concluído</small></div><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f0f7ff;"><th style="padding:10px;text-align:left;border-bottom:2px solid #ddd;">Parcela</th><th style="padding:10px;text-align:left;border-bottom:2px solid #ddd;">Vencimento</th><th style="padding:10px;text-align:right;border-bottom:2px solid #ddd;">Valor</th><th style="padding:10px;text-align:center;border-bottom:2px solid #ddd;">Status</th></tr></thead><tbody>\`;
                        const badgeStyle={PAGA:'background:#dcfce7;color:#166534;',PENDENTE:'background:#fef9c3;color:#854d0e;',ATRASADA:'background:#fee2e2;color:#991b1b;'};
                        parcelas.forEach(p=>{
                            const dataFmt=new Date(p.dataVencimento+'T12:00:00').toLocaleDateString('pt-BR');
                            const valorExibido=p.status==='ATRASADA'?\`<span style="text-decoration:line-through;color:#999;font-size:0.85rem;">R$ \${p.valorOriginal.toFixed(2).replace('.',',')}</span><br><strong style="color:#dc2626;">R$ \${p.totalDevido.toFixed(2).replace('.',',')} <small>(+multa/juros)</small></strong>\`:\`R$ \${p.valorOriginal.toFixed(2).replace('.',',')}\`;
                            const rowBg=p.status==='ATRASADA'?'background:#fff5f5;':'';
                            html+=\`<tr style="\${rowBg}"><td style="padding:10px;border-bottom:1px solid #eee;">\${p.numero}/\${p.total}</td><td style="padding:10px;border-bottom:1px solid #eee;">\${dataFmt}</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">\${valorExibido}</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:center;"><span style="padding:4px 10px;border-radius:50px;font-size:0.8rem;font-weight:bold;\${badgeStyle[p.status]}">\${p.status}</span></td></tr>\`;
                        });
                        html+='</tbody></table>';
                        container.innerHTML=html;
                    }catch(e){
                        container.innerHTML='<p style="text-align:center;color:red;">Erro ao carregar histórico</p>';
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

                // RENEGOCIAÇÃO
                let reneg_simId;
                function abrirModalRenegociar(simulacaoId, parcelasAtual, saldoDevido){
                    reneg_simId = simulacaoId;
                    document.getElementById('reneg-novo-prazo').value = '';
                    document.getElementById('reneg-motivo').value = '';
                    document.getElementById('reneg-resultado').innerHTML = '';
                    const novoPrazoMin = parcelasAtual + 1;
                    document.getElementById('reneg-novo-prazo').min = novoPrazoMin;
                    document.getElementById('modalRenegociar').style.display = 'flex';
                    console.log('Modal de renegociação aberto:', {simulacaoId, parcelasAtual, saldoDevido});
                }
                function fecharModalRenegociar(){
                    document.getElementById('modalRenegociar').style.display = 'none';
                }
                async function enviarSolicitacaoRenegociacao(){
                    const novoPrazo = parseInt(document.getElementById('reneg-novo-prazo').value);
                    const motivo = document.getElementById('reneg-motivo').value;
                    const resultado = document.getElementById('reneg-resultado');

                    if(!novoPrazo || novoPrazo < 1){
                        resultado.innerHTML = '<p style="color:#e74c3c;font-weight:bold;">❌ Novo prazo é obrigatório!</p>';
                        return;
                    }

                    try{
                        const resp = await fetch('/solicitar-renegociacao', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({simulacao_id: reneg_simId, novo_prazo: novoPrazo, motivo: motivo || null})
                        });
                        const json = await resp.json();

                        if(json.ok){
                            resultado.innerHTML = '<p style="color:#2ecc71;font-weight:bold;">✅ Solicitação enviada com sucesso!</p>';
                            console.log('✅ Renegociação solicitada:', {simulacaoId: reneg_simId, novoPrazo});
                            setTimeout(() => {
                                fecharModalRenegociar();
                                location.reload();
                            }, 2000);
                        } else {
                            resultado.innerHTML = '<p style="color:#e74c3c;font-weight:bold;">❌ ' + json.msg + '</p>';
                        }
                    } catch(e){
                        console.error('❌ Erro ao solicitar renegociação:', e);
                        resultado.innerHTML = '<p style="color:#e74c3c;font-weight:bold;">❌ Erro ao enviar solicitação</p>';
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

                let taxaJuros = 0.05; // Valor padrão

                const vM=document.getElementById("v_mask"), vR=document.getElementById("v_real"), pI=document.getElementById("parcelas"), res=document.getElementById("resumo"), txt=document.getElementById("total-txt"), taxaTexto=document.getElementById("taxa-texto");

                // Carregar taxa de juros ao carregar página (sem cache)
                fetch('/api/config/taxa-juros?t='+Date.now()).then(r=>r.json()).then(d=>{
                    if(d.ok){
                        taxaJuros=d.taxa;
                        if(taxaTexto) taxaTexto.innerText='*Incluso taxa de '+(taxaJuros*100).toFixed(1)+'% por parcela';
                        calc();
                        console.log('✅ Taxa de juros carregada:',d.taxa*100+'%');
                    }
                }).catch(e=>console.log('⚠️ Usando taxa padrão 5%'));

                function calc(){
                    const val=parseFloat(vR.value)||0;
                    const par=parseInt(pI.value)||0;
                    if(val>0 && par>0){
                        const tot=val+(val*taxaJuros*par);
                        const valorParcela=tot/par;
                        txt.innerHTML=\`<div style="margin-bottom:15px;"><strong>📊 Resumo da Simulação</strong></div>
                        <div style="margin-bottom:10px;padding:10px;background:#fff9e6;border-radius:8px;">
                            <div style="margin:8px 0;"><strong>Você pediu:</strong> R$ \${val.toFixed(2).replace('.',',')}</div>
                            <div style="margin:8px 0;"><strong>Parcelas:</strong> \${par}x</div>
                            <div style="margin:8px 0;"><strong>Taxa:</strong> \${(taxaJuros*100).toFixed(1)}% por parcela</div>
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
        const user = await pool.query('SELECT nome, email, whatsapp, bloqueado_login, bloqueado_emprestimo FROM USUARIOS WHERE cpf = $1', [req.session.userCpf]);

        // Verificar se cliente está bloqueado para empréstimos
        if (user.rows.length > 0 && user.rows[0].bloqueado_emprestimo === true) {
            console.log(`❌ Cliente com empréstimos bloqueados tentou enviar proposta: ${req.session.userCpf}`);
            const whatsapp = user.rows[0].whatsapp || '5585999999999';
            return res.send(`<!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Conta Bloqueada - AzulCrédito</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        padding: 60px 40px;
                        max-width: 500px;
                        text-align: center;
                    }
                    .icon {
                        font-size: 80px;
                        margin-bottom: 20px;
                        animation: shake 0.5s infinite;
                    }
                    @keyframes shake {
                        0%, 100% { transform: translateX(0); }
                        25% { transform: translateX(-10px); }
                        75% { transform: translateX(10px); }
                    }
                    h1 {
                        color: #dc2626;
                        font-size: 28px;
                        margin-bottom: 15px;
                        font-weight: 700;
                    }
                    p {
                        color: #666;
                        font-size: 16px;
                        line-height: 1.6;
                        margin-bottom: 15px;
                    }
                    .warning-box {
                        background: #fee2e2;
                        border: 2px solid #dc2626;
                        border-radius: 12px;
                        padding: 20px;
                        margin: 30px 0;
                        color: #991b1b;
                    }
                    .warning-box strong {
                        display: block;
                        margin-bottom: 8px;
                        font-size: 14px;
                    }
                    .buttons {
                        display: flex;
                        gap: 12px;
                        margin-top: 30px;
                        flex-direction: column;
                    }
                    .btn {
                        padding: 14px 24px;
                        border: none;
                        border-radius: 10px;
                        font-size: 16px;
                        font-weight: bold;
                        cursor: pointer;
                        text-decoration: none;
                        display: inline-block;
                        transition: all 0.3s;
                    }
                    .btn-whatsapp {
                        background: linear-gradient(135deg, #25d366 0%, #20ba5a 100%);
                        color: white;
                        box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);
                    }
                    .btn-whatsapp:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4);
                    }
                    .btn-home {
                        background: #f0f0f0;
                        color: #333;
                        border: 2px solid #ddd;
                    }
                    .btn-home:hover {
                        background: #e0e0e0;
                    }
                    .info-text {
                        font-size: 13px;
                        color: #999;
                        margin-top: 20px;
                        line-height: 1.5;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">🚫</div>
                    <h1>Solicitações Bloqueadas</h1>
                    <p>Sua conta foi temporariamente bloqueada para novas solicitações de empréstimo.</p>

                    <div class="warning-box">
                        <strong>⚠️ Por que isso aconteceu?</strong>
                        Você pode estar com restrições no seu cadastro. Entre em contato com nosso suporte para mais informações.
                    </div>

                    <p style="color: #1e3c72; font-weight: bold; margin: 20px 0;">Não se preocupe! Estamos aqui para ajudar! 😊</p>

                    <div class="buttons">
                        <a href="https://wa.me/55${whatsapp.replace(/\\D/g, '')}" target="_blank" class="btn btn-whatsapp">
                            💚 Falar com Suporte no WhatsApp
                        </a>
                        <a href="/simulacoes" class="btn btn-home">
                            ← Voltar para Minhas Propostas
                        </a>
                    </div>

                    <div class="info-text">
                        <p>Tempo de resposta: até 24 horas</p>
                        <p>Segunda a sexta, das 8h às 18h</p>
                    </div>
                </div>
            </body>
            </html>`);
        }

        // Obter taxa de juros dinâmica
        const taxaResult = await pool.query('SELECT valor FROM CONFIGURACOES WHERE chave = $1', ['TAXA_JUROS']);
        const taxa = taxaResult.rows.length > 0 ? parseFloat(taxaResult.rows[0].valor) : 0.05;

        const vTotal = vPedido + (vPedido * taxa * p);

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
        // Enviar página bonita de sucesso antes de redirecionar
        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Proposta Enviada - AzulCrédito</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        padding: 60px 40px;
                        text-align: center;
                        max-width: 500px;
                        animation: slideUp 0.6s ease-out;
                    }
                    @keyframes slideUp {
                        from {
                            opacity: 0;
                            transform: translateY(30px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    .checkmark {
                        width: 80px;
                        height: 80px;
                        margin: 0 auto 20px;
                        background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 48px;
                        animation: pop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                    }
                    @keyframes pop {
                        0% {
                            transform: scale(0);
                        }
                        50% {
                            transform: scale(1.2);
                        }
                        100% {
                            transform: scale(1);
                        }
                    }
                    h1 {
                        color: #1e3c72;
                        margin-bottom: 15px;
                        font-size: 32px;
                    }
                    p {
                        color: #666;
                        font-size: 16px;
                        line-height: 1.6;
                        margin-bottom: 10px;
                    }
                    .info {
                        background: #f0f7ff;
                        border-left: 4px solid #0066cc;
                        padding: 20px;
                        border-radius: 8px;
                        margin: 30px 0;
                        text-align: left;
                    }
                    .info p {
                        margin: 8px 0;
                        font-size: 14px;
                    }
                    .button {
                        display: inline-block;
                        background: linear-gradient(135deg, #0066cc 0%, #003d99 100%);
                        color: white;
                        padding: 15px 40px;
                        border-radius: 10px;
                        text-decoration: none;
                        font-weight: bold;
                        margin-top: 20px;
                        transition: transform 0.2s, box-shadow 0.2s;
                        cursor: pointer;
                        border: none;
                        font-size: 16px;
                    }
                    .button:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 10px 20px rgba(0, 102, 204, 0.3);
                    }
                    .logo {
                        font-size: 24px;
                        font-weight: bold;
                        color: #1e3c72;
                        margin-bottom: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo">AzulCrédito</div>
                    <div class="checkmark">✓</div>
                    <h1>Proposta Enviada!</h1>
                    <p>Sua solicitação foi recebida com sucesso.</p>

                    <div class="info">
                        <p><strong>✅ Próximos Passos:</strong></p>
                        <p>• Nossa equipe analisará sua proposta em breve</p>
                        <p>• Você receberá atualizações por email</p>
                        <p>• Acompanhe o status na sua área do cliente</p>
                    </div>

                    <p style="color: #999; font-size: 14px;">Você será redirecionado em 3 segundos...</p>
                    <button onclick="window.location.href='/simulacoes'" class="button">
                        Ir para Minhas Propostas
                    </button>
                </div>

                <script>
                    setTimeout(() => {
                        window.location.href = '/simulacoes';
                    }, 3000);
                </script>
            </body>
            </html>
        `);
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
            SELECT s.*, u.cidade, u.estado, u.banco_nome, u.banco_codigo, u.agencia, u.conta, u.conta_digito, u.conta_tipo,
                   COALESCE(pag.total_pago, 0) as total_pago
            FROM SIMULACOES s
            LEFT JOIN USUARIOS u ON u.cpf = s.cpf
            LEFT JOIN (
                SELECT simulacao_id, SUM(valor) as total_pago
                FROM PAGAMENTOS
                GROUP BY simulacao_id
            ) pag ON pag.simulacao_id = s.id
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

        // Buscar count real de inadimplentes na tabela MULTAS
        const inadimpResult = await pool.query(`SELECT COUNT(DISTINCT simulacao_id) as total FROM MULTAS WHERE status = 'ATIVA'`);
        const inadimplentes = parseInt(inadimpResult.rows[0].total || 0);

        // Taxa de quitação
        const taxaQuitacao = allSims.rows.length > 0 ? ((quitados / allSims.rows.length) * 100).toFixed(1) : 0;

        // Buscar detalhes dos inadimplentes
        const inadimplentesDetalheResult = await pool.query(`
            SELECT s.id, s.nome, s.cpf, s.whatsapp, s.email,
                   COUNT(m.id) as qtd_parcelas_atrasadas,
                   SUM(m.total_devido) as total_em_atraso,
                   MAX(m.dias_atraso) as max_dias_atraso
            FROM MULTAS m
            JOIN SIMULACOES s ON s.id = m.simulacao_id
            WHERE m.status = 'ATIVA'
            GROUP BY s.id, s.nome, s.cpf, s.whatsapp, s.email
            ORDER BY max_dias_atraso DESC
        `);
        const inadimplentesDetalhe = inadimplentesDetalheResult.rows;

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
            if (!perfis[r.cpf]) perfis[r.cpf] = { nome: r.nome, whatsapp: r.whatsapp, email: r.email, cidade: r.cidade, estado: r.estado, banco_nome: r.banco_nome, banco_codigo: r.banco_codigo, agencia: r.agencia, conta: r.conta, conta_digito: r.conta_digito, conta_tipo: r.conta_tipo, bloqueado_login: r.bloqueado_login, bloqueado_emprestimo: r.bloqueado_emprestimo, pedidos: [] };
            perfis[r.cpf].pedidos.push(r);
        });

        // Buscar renegociações pendentes
        const renegPendResult = await pool.query(`
            SELECT r.*, s.total, s.parcelas
            FROM RENEGOCIACOES r
            JOIN SIMULACOES s ON r.simulacao_id = s.id
            WHERE r.status = 'PENDENTE'
            ORDER BY r.criado_em DESC
        `);
        const renegociacoesPendentes = renegPendResult.rows;

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
                    <a href="/admin-logout" style="color:white;text-decoration:none;font-weight:bold;border:1px solid white;padding:8px 16px;border-radius:8px;">SAIR</a>
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

            <div style="background:white;border-radius:15px;padding:25px;margin-bottom:25px;border-left:5px solid #27ae60;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                <h3 style="margin-top:0;color:#27ae60;">⚙️ Configurações - Taxa de Juros</h3>
                <div id="resultado-taxa" style="margin-bottom:15px;"></div>
                <div style="display:flex;gap:15px;align-items:center;flex-wrap:wrap;">
                    <div style="flex:1;min-width:250px;">
                        <label style="display:block;font-weight:bold;color:#333;margin-bottom:8px;">Taxa de Juros por Parcela</label>
                        <div style="display:flex;gap:10px;align-items:center;">
                            <input type="number" id="taxa-juros-input" placeholder="0.05" min="0" max="1" step="0.01" style="padding:10px;border:2px solid #ddd;border-radius:6px;flex:1;font-size:1rem;">
                            <span style="font-weight:bold;color:#666;min-width:50px;" id="taxa-porcentagem">5%</span>
                        </div>
                        <small style="color:#666;display:block;margin-top:5px;">*Digite em decimal (ex: 0.05 = 5%, 0.10 = 10%)</small>
                    </div>
                    <button onclick="alterarTaxaJuros()" style="background:#27ae60;padding:10px 30px;height:fit-content;margin-top:20px;font-weight:bold;">✅ Salvar Taxa</button>
                </div>
            </div>

            <div style="background:white;border-radius:15px;padding:25px;margin-bottom:25px;border-left:5px solid #ff9800;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                <h3 style="margin-top:0;color:#ff9800;">📝 Renegociações Pendentes</h3>
                ${renegociacoesPendentes.length === 0
                    ? '<p style="color:#666;">Nenhuma renegociação pendente</p>'
                    : '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#fff3e0;"><th style="padding:12px;text-align:left;border-bottom:2px solid #ffe0b2;">Cliente</th><th style="padding:12px;text-align:left;border-bottom:2px solid #ffe0b2;">CPF</th><th style="padding:12px;text-align:center;border-bottom:2px solid #ffe0b2;">Empréstimo</th><th style="padding:12px;text-align:center;border-bottom:2px solid #ffe0b2;">Prazo Atual</th><th style="padding:12px;text-align:center;border-bottom:2px solid #ffe0b2;">Novo Prazo</th><th style="padding:12px;text-align:left;border-bottom:2px solid #ffe0b2;">Motivo</th><th style="padding:12px;text-align:center;border-bottom:2px solid #ffe0b2;">Ação</th></tr></thead><tbody>' + renegociacoesPendentes.map(r => '<tr style="border-bottom:1px solid #ffe0b2;"><td style="padding:12px;"><strong>'+r.nome+'</strong></td><td style="padding:12px;font-family:monospace;font-size:0.9rem;">'+r.cpf+'</td><td style="padding:12px;text-align:center;">R$ '+r.total.toFixed(2).replace(".",",")+'</td><td style="padding:12px;text-align:center;font-weight:bold;">'+r.parcelas+'x</td><td style="padding:12px;text-align:center;font-weight:bold;color:#ff9800;">'+r.novo_prazo+'x</td><td style="padding:12px;font-size:0.9rem;max-width:200px;"><small>'+(r.motivo || '-')+'</small></td><td style="padding:12px;text-align:center;"><button onclick="apenasAprovarRenegociacao('+r.id+','+r.simulacao_id+')" style="background:#2ecc71;color:white;padding:6px 12px;border:none;border-radius:6px;cursor:pointer;font-weight:bold;margin-right:5px;">✅ Aprovar</button><button onclick="apenasRejeitarRenegociacao('+r.id+')" style="background:#e74c3c;color:white;padding:6px 12px;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">❌ Rejeitar</button></td></tr>').join('') + '</tbody></table>'
                }
            </div>

            <div style="background:white;border-radius:15px;padding:25px;margin-bottom:25px;border-left:5px solid #dc2626;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                <h3 style="margin-top:0;color:#dc2626;">⚠️ Clientes Inadimplentes</h3>
                ${inadimplentesDetalhe.length === 0
                    ? '<p style="color:#666;">Nenhum cliente inadimplente</p>'
                    : '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#fef2f2;"><th style="padding:12px;text-align:left;border-bottom:2px solid #fee2e2;">Cliente</th><th style="padding:12px;text-align:left;border-bottom:2px solid #fee2e2;">CPF</th><th style="padding:12px;text-align:center;border-bottom:2px solid #fee2e2;color:#dc2626;font-weight:bold;">Parcelas</th><th style="padding:12px;text-align:right;border-bottom:2px solid #fee2e2;color:#dc2626;font-weight:bold;">Atraso</th><th style="padding:12px;text-align:center;border-bottom:2px solid #fee2e2;">Dias</th><th style="padding:12px;text-align:center;border-bottom:2px solid #fee2e2;">Ação</th></tr></thead><tbody>' + inadimplentesDetalhe.map(r => '<tr style="border-bottom:1px solid #fee2e2;"><td style="padding:12px;">'+r.nome+'</td><td style="padding:12px;font-family:monospace;font-size:0.9rem;">'+r.cpf+'</td><td style="padding:12px;text-align:center;font-weight:bold;color:#dc2626;">'+r.qtd_parcelas_atrasadas+'</td><td style="padding:12px;text-align:right;font-weight:bold;color:#dc2626;">'+formatarMoeda(r.total_em_atraso)+'</td><td style="padding:12px;text-align:center;"><span style="background:#fee2e2;color:#991b1b;padding:4px 12px;border-radius:50px;font-weight:bold;font-size:0.85rem;">'+r.max_dias_atraso+'d</span></td><td style="padding:12px;text-align:center;"><a href="https://wa.me/55'+soNumeros(r.whatsapp)+'" target="_blank" style="background:#25d366;color:white;padding:6px 14px;border-radius:6px;text-decoration:none;font-size:0.85rem;font-weight:bold;">WhatsApp</a></td></tr>').join('') + '</tbody></table>'
                }
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
                // Fetch payment totals and last payment for each proposal
                const pagamentosPromises = p.pedidos.map(ped =>
                    Promise.all([
                        pool.query('SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1 AND status = $2', [ped.id, 'CONFIRMADO']),
                        pool.query('SELECT * FROM PAGAMENTOS WHERE simulacao_id = $1 AND status = $2 ORDER BY data_pagamento DESC LIMIT 1', [ped.id, 'CONFIRMADO'])
                    ])
                );
                const pagamentosResults = await Promise.all(pagamentosPromises);

                const endereco = p.cidade ? `${p.cidade}, ${p.estado}` : '-';
                const banco = p.banco_nome ? `${p.banco_nome.split('(')[0].trim()} ****${p.conta ? p.conta.slice(-4) : ''}` : '-';
                const badgeLogin = p.bloqueado_login ? '<span style="background:#e74c3c;color:white;padding:3px 8px;border-radius:4px;font-size:0.65rem;font-weight:bold;margin-left:5px;">🚫 ACESSO</span>' : '';
                const badgeEmprestimo = p.bloqueado_emprestimo ? '<span style="background:#f39c12;color:white;padding:3px 8px;border-radius:4px;font-size:0.65rem;font-weight:bold;margin-left:5px;">🚫 EMPRÉS.</span>' : '';
                const btnsControle = `<div style="display:flex;gap:5px;">
                    <button onclick="bloquearCliente('${cpf}', 'login', true)" style="background:#e74c3c;color:white;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:0.75rem;" title="Bloquear acesso">🔐 Bloquear Acesso</button>
                    <button onclick="desbloquearCliente('${cpf}', 'login', false)" style="background:#2ecc71;color:white;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:0.75rem;" title="Desbloquear acesso">🔓 Liberar Acesso</button>
                    <button onclick="bloquearCliente('${cpf}', 'emprestimo', true)" style="background:#f39c12;color:white;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:0.75rem;" title="Bloquear empréstimos">🚫 Bloquear Emprés.</button>
                    <button onclick="desbloquearCliente('${cpf}', 'emprestimo', false)" style="background:#3498db;color:white;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:0.75rem;" title="Desbloquear empréstimos">✅ Liberar Emprés.</button>
                </div>`;
                return `<div class="profile-card"><div class="profile-header"><div><strong>👤 ${p.nome}</strong> <small style="margin-left:15px;opacity:0.8;">CPF: ${cpf}</small>${badgeLogin}${badgeEmprestimo}</div><div style="display:flex;gap:5px;flex-wrap:wrap;"><a href="https://wa.me/${p.whatsapp}" target="_blank" class="btn-whatsapp">WHATSAPP</a></div></div><div style="padding:10px 15px;background:#f8f9fa;border-bottom:1px solid #eee;font-size:0.85rem;color:#666;display:grid;grid-template-columns:auto auto 1fr;gap:20px;"><div><strong>📍</strong> ${endereco}</div><div><strong>🏦</strong> ${banco}</div></div><div style="padding:10px 15px;border-bottom:1px solid #eee;display:flex;gap:5px;flex-wrap:wrap;">${btnsControle}</div><table><thead><tr><th>DATA</th><th>VALOR</th><th>TOTAL</th><th>PARCELAS</th><th>MENSAL</th><th>PAGO</th><th>FALTA</th><th>ÚLTIMA PAGA</th><th>PRÓX. VENCIMENTO</th><th>DOCS</th><th>AÇÃO</th></tr></thead><tbody>` +
                p.pedidos.map((ped, idx) => {
                    const st = ped.status === 'PAGO' ? 'st-pago' : (ped.status === 'REPROVADO' ? 'st-reprovado' : (ped.status === 'QUITADO' ? 'st-quitado' : 'st-analise'));
                    const [pagtoResult, ultimaPagResult] = pagamentosResults[idx];
                    const totalPago = parseFloat(pagtoResult.rows[0].total_pago || 0);
                    const parcelas = parseInt(ped.parcelas || 1);
                    const valorMensal = parseFloat(ped.total) / parcelas;
                    const totalValor = parseFloat(ped.total);
                    const parcelasPagas = Math.floor(totalPago / valorMensal);
                    const parcelasRestantes = parcelas - parcelasPagas;
                    const faltaPagar = totalValor - totalPago;
                    const percentualPago = ((totalPago / totalValor) * 100).toFixed(1);
                    const isQuitado = ped.status === 'QUITADO';

                    // Calcular última paga e próxima vencimento
                    const ultimaPagaDate = ultimaPagResult.rows.length > 0 ? new Date(ultimaPagResult.rows[0].data_pagamento).toLocaleDateString('pt-BR') : '-';
                    const ultimaPagaNum = ultimaPagResult.rows.length > 0 ? parcelasPagas : '-';

                    let proximaVencimentoStr = '-';
                    if (ped.aprovado_em && parcelasRestantes > 0) {
                        const aprovadoEm = new Date(ped.aprovado_em);
                        const proximaVenc = new Date(aprovadoEm);
                        proximaVenc.setDate(aprovadoEm.getDate() + ((parcelasPagas + 1) * 30));
                        proximaVencimentoStr = proximaVenc.toLocaleDateString('pt-BR');
                    }
                    return `<tr><td>${new Date(ped.criado_em).toLocaleDateString()}</td><td>${formatarMoeda(ped.valor)}</td><td style="font-weight:bold;">${formatarMoeda(totalValor)}</td><td style="font-weight:bold;">${parcelasPagas}/${parcelas}</td><td>${formatarMoeda(valorMensal)}</td><td style="font-weight:bold;color:#2ecc71;">${formatarMoeda(totalPago)}<br><small style="color:#666;">(${percentualPago}%)</small></td><td style="font-weight:bold;color:#e74c3c;">${formatarMoeda(faltaPagar)}<br><small style="color:#666;">${parcelasRestantes} parcelas</small></td><td style="font-size:0.85rem;"><strong>${ultimaPagaNum}</strong><br><small style="color:#666;">${ultimaPagaDate}</small></td><td style="font-size:0.85rem;font-weight:bold;color:#0066cc;">${proximaVencimentoStr}</td><td><a href="/ver-arquivo/${ped.documento_path}" target="_blank" class="doc-link">🗂️</a><a href="/ver-arquivo/${ped.renda_path}" target="_blank" class="doc-link">📄</a></td><td><span class="badge ${st}">${ped.status}</span><select id="st-${ped.id}" ${isQuitado ? 'disabled' : ''}><option value="EM ANÁLISE" ${ped.status==='EM ANÁLISE'?'selected':''}>Análise</option><option value="PAGO" ${ped.status==='PAGO'?'selected':''}>Aprovar</option><option value="REPROVADO" ${ped.status==='REPROVADO'?'selected':''}>Reprovar</option><option value="QUITADO" ${ped.status==='QUITADO'?'selected':''}>Quitado</option></select><button onclick="salvar(${ped.id},'${p.whatsapp}','${p.nome}')" ${isQuitado ? 'disabled style="opacity:0.5;"' : ''}>OK</button><button style="background:#27ae60;margin-left:5px;" ${isQuitado ? 'disabled style="opacity:0.5;"' : ''} onclick="abrirModalPagamento(${ped.id},'${formatarMoeda(ped.valor)}','${formatarMoeda(ped.total)}')">💰 Pagamento</button></td></tr>`;
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

            // Bloquear Cliente (acesso ou empréstimo)
            async function bloquearCliente(cpf, tipo, bloqueado){
                const tipoNome = tipo === 'login' ? 'acesso a conta' : 'solicitacoes de emprestimo';
                if(!confirm('Bloquear ' + tipoNome + ' do cliente?')) return;
                try{
                    const resp = await fetch('/api/admin/bloquear-cliente', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({cpf, tipo, bloqueado})
                    });
                    const data = await resp.json();
                    if(data.ok){
                        console.log('✅ '+data.msg);
                        location.reload();
                    } else {
                        alert('❌ Erro: '+data.msg);
                    }
                }catch(e){
                    console.error('❌ Erro:', e);
                    alert('❌ Erro ao bloquear cliente');
                }
            }

            // Desbloquear Cliente (acesso ou emprestimo)
            async function desbloquearCliente(cpf, tipo, bloqueado){
                const tipoNome = tipo === 'login' ? 'acesso a conta' : 'solicitacoes de emprestimo';
                if(!confirm('Desbloquear ' + tipoNome + ' do cliente?')) return;
                try{
                    const resp = await fetch('/api/admin/bloquear-cliente', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({cpf, tipo, bloqueado})
                    });
                    const data = await resp.json();
                    if(data.ok){
                        console.log('✅ '+data.msg);
                        location.reload();
                    } else {
                        alert('❌ Erro: '+data.msg);
                    }
                }catch(e){
                    console.error('❌ Erro:', e);
                    alert('❌ Erro ao desbloquear cliente');
                }
            }

            // Aprovar Renegociação
            async function apenasAprovarRenegociacao(renegId, simId){
                if(!confirm('Aprovar esta renegociação?')) return;
                try{
                    const resp = await fetch('/api/admin/responder-renegociacao', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({renegociacao_id: renegId, aprovar: true})
                    });
                    const data = await resp.json();
                    if(data.ok){
                        console.log('✅ Renegociação aprovada');
                        alert('✅ Renegociação aprovada! Parcelas atualizadas.');
                        location.reload();
                    } else {
                        alert('❌ Erro: ' + data.msg);
                    }
                }catch(e){
                    console.error('❌ Erro:', e);
                    alert('❌ Erro ao aprovar renegociação');
                }
            }

            // Rejeitar Renegociação
            async function apenasRejeitarRenegociacao(renegId){
                if(!confirm('Rejeitar esta renegociação?')) return;
                try{
                    const resp = await fetch('/api/admin/responder-renegociacao', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({renegociacao_id: renegId, aprovar: false})
                    });
                    const data = await resp.json();
                    if(data.ok){
                        console.log('❌ Renegociação rejeitada');
                        alert('❌ Renegociação rejeitada.');
                        location.reload();
                    } else {
                        alert('❌ Erro: ' + data.msg);
                    }
                }catch(e){
                    console.error('❌ Erro:', e);
                    alert('❌ Erro ao rejeitar renegociação');
                }
            }

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

            // Carregar taxa de juros atual
            async function carregarTaxaJuros(){
                try{
                    const resp=await fetch('/api/config/taxa-juros');
                    const data=await resp.json();
                    if(data.ok){
                        const taxa=data.taxa;
                        document.getElementById('taxa-juros-input').value=taxa.toFixed(2);
                        document.getElementById('taxa-porcentagem').innerText=(taxa*100).toFixed(1)+'%';
                    }
                }catch(err){
                    console.error('Erro ao carregar taxa de juros:',err);
                }
            }

            // Alterar taxa de juros
            async function alterarTaxaJuros(){
                const input=document.getElementById('taxa-juros-input');
                const taxa=parseFloat(input.value);
                const resultado=document.getElementById('resultado-taxa');

                if(isNaN(taxa) || taxa<0 || taxa>1){
                    resultado.innerHTML='<p style="color:#e74c3c;font-weight:bold;">❌ Taxa deve estar entre 0 e 1</p>';
                    return;
                }

                try{
                    const resp=await fetch('/api/admin/config/taxa-juros',{
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({taxa:taxa})
                    });
                    const data=await resp.json();

                    if(data.ok){
                        document.getElementById('taxa-porcentagem').innerText=(taxa*100).toFixed(1)+'%';
                        resultado.innerHTML='<p style="color:#27ae60;font-weight:bold;">✅ Taxa alterada com sucesso!</p>';
                        setTimeout(()=>{resultado.innerHTML=''},3000);
                        console.log('✅ Taxa de juros alterada para:',(taxa*100)+'%');
                    }else{
                        resultado.innerHTML='<p style="color:#e74c3c;font-weight:bold;">❌ '+data.msg+'</p>';
                    }
                }catch(err){
                    console.error('Erro:',err);
                    resultado.innerHTML='<p style="color:#e74c3c;font-weight:bold;">❌ Erro ao alterar taxa</p>';
                }
            }

            // Event listener para atualizar porcentagem em tempo real
            document.addEventListener('input',(e)=>{
                if(e.target.id==='taxa-juros-input'){
                    const taxa=parseFloat(e.target.value)||0;
                    document.getElementById('taxa-porcentagem').innerText=(taxa*100).toFixed(1)+'%';
                }
            });

            // Carregar taxa ao abrir página
            window.addEventListener('load',()=>{
                carregarTaxaJuros();
            });

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

        // Se status é 'PAGO', salvar data de aprovação para cálculo de vencimentos
        if (status === 'PAGO') {
            await pool.query('UPDATE SIMULACOES SET STATUS = $1, aprovado_em = NOW() WHERE ID = $2', [status, id]);
        } else {
            await pool.query('UPDATE SIMULACOES SET STATUS = $1 WHERE ID = $2', [status, id]);
        }

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

// --- ROTAS DE VALIDAÇÃO DE DADOS ---

// Buscar endereço via CEP (ViaCEP API)
app.get('/api/cep/:cep', async (req, res) => {
    try {
        const cep = req.params.cep.replace(/\D/g, '');
        if (cep.length !== 8) return res.status(400).json({ ok: false, msg: 'CEP inválido' });

        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();

        if (data.erro) return res.json({ ok: false, msg: 'CEP não encontrado' });

        res.json({
            ok: true,
            cep: data.cep,
            rua: data.logradouro,
            bairro: data.bairro,
            cidade: data.localidade,
            estado: data.uf
        });
    } catch (e) {
        console.error('❌ Erro ao consultar CEP:', e.message);
        res.status(500).json({ ok: false, msg: 'Erro ao consultar CEP' });
    }
});

// Validar dados bancários
app.post('/api/validar-conta', (req, res) => {
    try {
        const { banco_codigo, agencia, conta, conta_tipo } = req.body;
        const ag = soNumeros(agencia);
        const ct = soNumeros(conta);

        if (!banco_codigo) return res.json({ ok: false, msg: 'Selecione o banco' });
        if (ag.length < 4 || ag.length > 5) return res.json({ ok: false, msg: 'Agência inválida (4-5 dígitos)' });
        if (ct.length < 4 || ct.length > 14) return res.json({ ok: false, msg: 'Conta inválida (4-14 dígitos)' });
        if (!conta_tipo) return res.json({ ok: false, msg: 'Selecione o tipo de conta' });

        res.json({ ok: true, msg: 'Dados bancários válidos' });
    } catch (e) {
        res.status(500).json({ ok: false, msg: 'Erro ao validar conta' });
    }
});

// Salvar dados bancários
app.post('/salvar-dados-bancarios', async (req, res) => {
    try {
        if (!req.session.usuarioLogado) return res.status(401).json({ ok: false, msg: 'Não autenticado' });

        const { banco_codigo, banco_nome, agencia, conta, conta_digito, conta_tipo } = req.body;
        const ag = soNumeros(agencia);
        const ct = soNumeros(conta);
        const dg = soNumeros(conta_digito);

        // Validações
        if (!banco_codigo) return res.json({ ok: false, msg: 'Selecione o banco' });
        if (ag.length < 4 || ag.length > 5) return res.json({ ok: false, msg: 'Agência inválida' });
        if (ct.length < 4 || ct.length > 14) return res.json({ ok: false, msg: 'Conta inválida' });
        if (!conta_tipo) return res.json({ ok: false, msg: 'Selecione o tipo de conta' });

        await pool.query(
            'UPDATE USUARIOS SET banco_codigo=$1, banco_nome=$2, agencia=$3, conta=$4, conta_digito=$5, conta_tipo=$6 WHERE cpf=$7',
            [banco_codigo, banco_nome, ag, ct, dg, conta_tipo, req.session.userCpf]
        );

        res.json({ ok: true, msg: '✅ Dados bancários salvos com sucesso!' });
    } catch (e) {
        console.error('❌ Erro ao salvar dados bancários:', e.message);
        res.status(500).json({ ok: false, msg: 'Erro ao salvar dados bancários' });
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

// Rota de histórico detalhado de parcelas
app.get('/historico/:simulacao_id', async (req, res) => {
    try {
        const simId = parseInt(req.params.simulacao_id);

        const simResult = await pool.query('SELECT * FROM SIMULACOES WHERE id = $1', [simId]);
        if (simResult.rows.length === 0) return res.status(404).json({ ok: false, msg: 'Não encontrado' });

        const sim = simResult.rows[0];

        // Verificação de autenticação
        if (req.session.usuarioLogado && sim.cpf !== req.session.userCpf) {
            return res.status(403).json({ ok: false, msg: 'Acesso negado' });
        }

        if (!req.session.usuarioLogado && !req.session.adminLogado) {
            return res.status(401).json({ ok: false, msg: 'Não autenticado' });
        }

        if (!sim.aprovado_em) {
            return res.json({ ok: true, parcelas: [], totalPago: 0, totalDivida: 0 });
        }

        const pagtoResult = await pool.query(
            'SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1 AND status = $2',
            [simId, 'CONFIRMADO']
        );
        const totalPago = parseFloat(pagtoResult.rows[0].total_pago);

        // Buscar multas já registradas
        const multasResult = await pool.query(
            'SELECT * FROM MULTAS WHERE simulacao_id = $1', [simId]
        );
        const multasMap = {};
        multasResult.rows.forEach(m => { multasMap[m.parcela_num] = m; });

        const parcelas = calcularParcelasSimulacao(sim, totalPago);

        // Enriquecer com dados da tabela MULTAS
        parcelas.forEach(p => {
            if (multasMap[p.numero]) {
                p.multa = parseFloat(multasMap[p.numero].multa);
                p.juros = parseFloat(multasMap[p.numero].juros);
                p.totalDevido = parseFloat(multasMap[p.numero].total_devido);
                p.diasAtraso = multasMap[p.numero].dias_atraso;
            }
        });

        res.json({
            ok: true,
            simulacao: {
                id: sim.id,
                nome: sim.nome,
                valor: parseFloat(sim.valor),
                total: parseFloat(sim.total),
                parcelas: parseInt(sim.parcelas),
                aprovadoEm: sim.aprovado_em,
                status: sim.status
            },
            totalPago,
            totalDivida: parseFloat(sim.total),
            parcelasPagas: parcelas.filter(p => p.status === 'PAGA').length,
            parcelasAtrasadas: parcelas.filter(p => p.status === 'ATRASADA').length,
            parcelas
        });
    } catch (err) {
        console.error('❌ Erro ao buscar histórico:', err.message);
        res.status(500).json({ ok: false });
    }
});

// Rota de multas ativas
app.get('/api/multas/:simulacao_id', async (req, res) => {
    try {
        if (!req.session.usuarioLogado && !req.session.adminLogado) {
            return res.status(401).json({ ok: false });
        }

        const simId = parseInt(req.params.simulacao_id);

        if (req.session.usuarioLogado) {
            const check = await pool.query('SELECT cpf FROM SIMULACOES WHERE id = $1', [simId]);
            if (!check.rows.length || check.rows[0].cpf !== req.session.userCpf) {
                return res.status(403).json({ ok: false });
            }
        }

        const result = await pool.query(
            `SELECT * FROM MULTAS WHERE simulacao_id = $1 AND status = 'ATIVA' ORDER BY parcela_num ASC`,
            [simId]
        );

        res.json({ ok: true, multas: result.rows });
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

// --- OBTER TAXA DE JUROS ---
app.get('/api/config/taxa-juros', async (req, res) => {
    try {
        const result = await pool.query('SELECT valor FROM CONFIGURACOES WHERE chave = $1', ['TAXA_JUROS']);
        const taxaJuros = result.rows.length > 0 ? parseFloat(result.rows[0].valor) : 0.05;
        res.json({ ok: true, taxa: taxaJuros });
    } catch (err) {
        console.error('❌ Erro ao obter taxa de juros:', err);
        res.status(500).json({ ok: false, taxa: 0.05 });
    }
});

// --- ALTERAR TAXA DE JUROS (ADMIN) ---
app.post('/api/admin/config/taxa-juros', adminAuth, async (req, res) => {
    try {
        const { taxa } = req.body;
        const taxaNum = parseFloat(taxa);

        if (isNaN(taxaNum) || taxaNum < 0 || taxaNum > 1) {
            return res.status(400).json({ ok: false, msg: 'Taxa deve estar entre 0 e 1 (0 a 100%)' });
        }

        await pool.query(
            'UPDATE CONFIGURACOES SET valor = $1, atualizado_em = CURRENT_TIMESTAMP WHERE chave = $2',
            [taxaNum.toString(), 'TAXA_JUROS']
        );

        console.log('✅ Taxa de juros alterada para:', (taxaNum * 100) + '%');
        res.json({ ok: true, msg: 'Taxa de juros alterada com sucesso', taxa: taxaNum });
    } catch (err) {
        console.error('❌ Erro ao alterar taxa de juros:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao alterar taxa' });
    }
});

// --- BLOQUEAR/DESBLOQUEAR CLIENTE (ADMIN) ---
app.post('/api/admin/bloquear-cliente', adminAuth, async (req, res) => {
    try {
        const { cpf, tipo, bloqueado } = req.body;

        if (!cpf || !tipo) return res.status(400).json({ ok: false, msg: 'CPF e tipo de bloqueio não fornecidos' });

        let coluna = '';
        let mensagem = '';

        if (tipo === 'login') {
            coluna = 'bloqueado_login';
            mensagem = bloqueado ? 'acesso à conta bloqueado' : 'acesso à conta desbloqueado';
        } else if (tipo === 'emprestimo') {
            coluna = 'bloqueado_emprestimo';
            mensagem = bloqueado ? 'solicitações de empréstimo bloqueadas' : 'solicitações de empréstimo desbloqueadas';
        } else {
            return res.status(400).json({ ok: false, msg: 'Tipo de bloqueio inválido (login ou emprestimo)' });
        }

        await pool.query(
            `UPDATE USUARIOS SET ${coluna} = $1 WHERE cpf = $2`,
            [bloqueado === true, cpf]
        );

        console.log(`✅ Cliente ${cpf}: ${mensagem}`);
        res.json({ ok: true, msg: `✅ ${mensagem.charAt(0).toUpperCase() + mensagem.slice(1)}!` });
    } catch (err) {
        console.error('❌ Erro ao bloquear cliente:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao bloquear cliente' });
    }
});

// --- SOLICITAR RENEGOCIAÇÃO DE DÍVIDA (CLIENTE) ---
app.post('/solicitar-renegociacao', async (req, res) => {
    try {
        if (!req.session.usuarioLogado) return res.status(401).json({ ok: false, msg: 'Não autenticado' });

        const { simulacao_id, novo_prazo, motivo } = req.body;
        const cpf = req.session.userCpf;

        if (!simulacao_id || !novo_prazo) {
            return res.status(400).json({ ok: false, msg: 'Simulação e novo prazo são obrigatórios' });
        }

        // Verificar se simulação pertence ao cliente
        const simResult = await pool.query('SELECT id, cpf, parcelas, status FROM SIMULACOES WHERE id = $1 AND cpf = $2', [simulacao_id, cpf]);
        if (simResult.rows.length === 0) {
            return res.status(404).json({ ok: false, msg: 'Simulação não encontrada' });
        }

        const sim = simResult.rows[0];

        // Verificar se status é PAGO (ativo)
        if (sim.status !== 'PAGO') {
            return res.status(400).json({ ok: false, msg: 'Apenas empréstimos aprovados podem ser renegociados' });
        }

        // Verificar se novo prazo é válido
        const novoPrazoNum = parseInt(novo_prazo);
        if (novoPrazoNum <= sim.parcelas) {
            return res.status(400).json({ ok: false, msg: 'Novo prazo deve ser maior que o prazo atual' });
        }

        // Verificar se existe multa ativa
        const multaResult = await pool.query('SELECT COUNT(*) as qtd FROM MULTAS WHERE simulacao_id = $1 AND status = $2', [simulacao_id, 'ATIVA']);
        if (parseInt(multaResult.rows[0].qtd) === 0) {
            return res.status(400).json({ ok: false, msg: 'Renegociação disponível apenas para empréstimos com atraso' });
        }

        // Verificar se já existe renegociação pendente
        const pendResult = await pool.query('SELECT COUNT(*) as qtd FROM RENEGOCIACOES WHERE simulacao_id = $1 AND status = $2', [simulacao_id, 'PENDENTE']);
        if (parseInt(pendResult.rows[0].qtd) > 0) {
            return res.status(400).json({ ok: false, msg: 'Já existe uma renegociação pendente para este empréstimo' });
        }

        // Criar renegociação
        await pool.query(
            'INSERT INTO RENEGOCIACOES (simulacao_id, cpf, novo_prazo, motivo) VALUES ($1, $2, $3, $4)',
            [simulacao_id, cpf, novoPrazoNum, motivo || null]
        );

        console.log(`📝 Renegociação solicitada: Simulação ${simulacao_id}, CPF ${cpf}, novo prazo: ${novoPrazoNum}x`);
        res.json({ ok: true, msg: '✅ Solicitação de renegociação enviada! Aguarde aprovação do administrador.' });
    } catch (err) {
        console.error('❌ Erro ao solicitar renegociação:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao solicitar renegociação' });
    }
});

// --- RESPONDER RENEGOCIAÇÃO (ADMIN) ---
app.post('/api/admin/responder-renegociacao', adminAuth, async (req, res) => {
    try {
        const { renegociacao_id, aprovar } = req.body;

        if (!renegociacao_id) return res.status(400).json({ ok: false, msg: 'ID da renegociação não fornecido' });

        // Buscar renegociação
        const renResult = await pool.query('SELECT * FROM RENEGOCIACOES WHERE id = $1', [renegociacao_id]);
        if (renResult.rows.length === 0) {
            return res.status(404).json({ ok: false, msg: 'Renegociação não encontrada' });
        }

        const ren = renResult.rows[0];

        // Buscar simulação
        const simResult = await pool.query('SELECT id, total, valor_parcela, parcelas FROM SIMULACOES WHERE id = $1', [ren.simulacao_id]);
        if (simResult.rows.length === 0) {
            return res.status(404).json({ ok: false, msg: 'Simulação não encontrada' });
        }

        const sim = simResult.rows[0];

        if (aprovar === true) {
            // Buscar quanto já foi pago
            const pagtoResult = await pool.query('SELECT COALESCE(SUM(valor), 0) as total_pago FROM PAGAMENTOS WHERE simulacao_id = $1', [ren.simulacao_id]);
            const totalPago = parseFloat(pagtoResult.rows[0].total_pago || 0);
            const saldoRestante = sim.total - totalPago;
            const novaParcela = (saldoRestante / ren.novo_prazo).toFixed(2);

            // Atualizar SIMULACOES com novo prazo e parcela
            await pool.query(
                'UPDATE SIMULACOES SET parcelas = $1, valor_parcela = $2 WHERE id = $3',
                [ren.novo_prazo, novaParcela, ren.simulacao_id]
            );

            // Atualizar renegociação como aprovada
            await pool.query(
                'UPDATE RENEGOCIACOES SET status = $1, respondido_em = NOW() WHERE id = $2',
                ['APROVADA', renegociacao_id]
            );

            console.log(`✅ Renegociação aprovada: Simulação ${ren.simulacao_id}, novo prazo ${ren.novo_prazo}x, nova parcela R$ ${novaParcela}`);
            res.json({ ok: true, msg: '✅ Renegociação aprovada! Parcelas atualizadas.' });
        } else {
            // Rejeitar renegociação
            await pool.query(
                'UPDATE RENEGOCIACOES SET status = $1, respondido_em = NOW() WHERE id = $2',
                ['REJEITADA', renegociacao_id]
            );

            console.log(`❌ Renegociação rejeitada: Simulação ${ren.simulacao_id}`);
            res.json({ ok: true, msg: '❌ Renegociação rejeitada.' });
        }
    } catch (err) {
        console.error('❌ Erro ao responder renegociação:', err);
        res.status(500).json({ ok: false, msg: 'Erro ao responder renegociação' });
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

    const { nome, email, whatsapp, cep, rua, bairro, cidade, estado, numero_casa } = req.body;
    if (!nome || !email) return res.status(400).json({ ok: false, msg: 'Nome e Email são obrigatórios' });

    try {
        const cpf = req.session.userCpf;
        console.log('📥 Recebendo atualização de perfil:', { cpf, nome, email, cep, rua, bairro, cidade, estado, numero_casa });

        // Verificar se email já existe (para outro usuário)
        const emailExists = await pool.query('SELECT cpf FROM USUARIOS WHERE email = $1 AND cpf != $2', [email, cpf]);
        if (emailExists.rows.length > 0) {
            return res.status(400).json({ ok: false, msg: 'Este email já está cadastrado' });
        }

        const result = await pool.query(
            'UPDATE USUARIOS SET nome = $1, email = $2, whatsapp = $3, cep = $4, rua = $5, bairro = $6, cidade = $7, estado = $8, numero_casa = $9 WHERE cpf = $10',
            [nome, email, whatsapp || null, cep || null, rua || null, bairro || null, cidade || null, estado || null, numero_casa || null, cpf]
        );

        console.log('✅ Query executada - linhas afetadas:', result.rowCount);

        // Atualizar nome na sessão
        req.session.userName = nome;

        console.log('✅ Perfil atualizado com sucesso:', { cpf, nome, email, endereco: { cep, rua, bairro, cidade, estado, numero_casa } });
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

// --- FUNÇÃO DE VERIFICAÇÃO DE MULTAS ---
async function verificarMultas() {
    try {
        console.log('🔍 [MULTAS] Verificando parcelas atrasadas...');

        const sims = await pool.query(`
            SELECT s.*, COALESCE(SUM(p.valor), 0) as total_pago
            FROM SIMULACOES s
            LEFT JOIN PAGAMENTOS p ON p.simulacao_id = s.id AND p.status = 'CONFIRMADO'
            WHERE s.status = 'PAGO' AND s.aprovado_em IS NOT NULL
            GROUP BY s.id
        `);

        let novasMultas = 0;

        for (const sim of sims.rows) {
            const totalPago = parseFloat(sim.total_pago || 0);
            const parcelas = calcularParcelasSimulacao(sim, totalPago);

            for (const parcela of parcelas) {
                if (parcela.status !== 'ATRASADA') continue;

                const { multa, juros, total, diasAtraso } = calcularJurosMulta(
                    parcela.valorOriginal, parcela.dataVencimento
                );

                // Upsert: atualiza juros diariamente se a multa já existia
                await pool.query(`
                    INSERT INTO MULTAS
                        (simulacao_id, parcela_num, data_vencimento, valor_original, multa, juros, total_devido, dias_atraso, status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ATIVA')
                    ON CONFLICT (simulacao_id, parcela_num) DO UPDATE SET
                        juros = EXCLUDED.juros,
                        total_devido = EXCLUDED.total_devido,
                        dias_atraso = EXCLUDED.dias_atraso
                `, [sim.id, parcela.numero, parcela.dataVencimento,
                    parcela.valorOriginal, multa, juros, total, diasAtraso]);

                // Notificar apenas uma vez (quando notificado_em for NULL)
                const jaNotificado = await pool.query(
                    'SELECT notificado_em FROM MULTAS WHERE simulacao_id=$1 AND parcela_num=$2',
                    [sim.id, parcela.numero]
                );

                if (jaNotificado.rows[0] && !jaNotificado.rows[0].notificado_em) {
                    // Enviar email de atraso
                    if (sim.email) {
                        await enviarEmailAtraso(sim.email, sim.nome, parcela.numero,
                            parcela.valorOriginal, parcela.dataVencimento, multa, juros, total);
                    }
                    // Enviar WhatsApp de atraso
                    if (sim.whatsapp) {
                        await enviarWhatsAppAtraso(sim.whatsapp, sim.nome, parcela.numero,
                            parcela.valorOriginal, total);
                    }
                    // Marcar como notificado
                    await pool.query(
                        'UPDATE MULTAS SET notificado_em = NOW() WHERE simulacao_id=$1 AND parcela_num=$2',
                        [sim.id, parcela.numero]
                    );
                    novasMultas++;
                }
            }

            // Marcar multas como QUITADA se parcela foi paga
            for (const parcela of parcelas) {
                if (parcela.status === 'PAGA') {
                    await pool.query(
                        `UPDATE MULTAS SET status = 'QUITADA'
                         WHERE simulacao_id = $1 AND parcela_num = $2 AND status = 'ATIVA'`,
                        [sim.id, parcela.numero]
                    );
                }
            }
        }

        console.log(`✅ [MULTAS] Verificação concluída. ${novasMultas} novas notificações enviadas.`);
    } catch (err) {
        console.error('❌ [MULTAS] Erro:', err.message);
    }
}

// --- SISTEMA DE LEMBRETES AUTOMÁTICOS ---
// Executar verificação de vencimentos todos os dias às 08:00
cron.schedule('0 8 * * *', () => {
    console.log('⏰ [CRON] Iniciando verificação de vencimentos...');
    verificarVencimentos().catch(err => console.error('❌ [CRON] Erro:', err));
});

// Executar verificação de multas todos os dias às 09:00
cron.schedule('0 9 * * *', () => {
    console.log('⏰ [CRON-MULTAS] Iniciando verificação de multas...');
    verificarMultas().catch(err => console.error('❌ [CRON-MULTAS] Erro:', err));
});

// Executar verificação uma vez na inicialização (para testes)
setTimeout(() => {
    console.log('⏰ [STARTUP] Executando verificação inicial de vencimentos...');
    verificarVencimentos().catch(err => console.error('❌ [STARTUP] Erro:', err));
}, 2000);

// Executar verificação de multas na inicialização
setTimeout(() => {
    console.log('⏰ [STARTUP-MULTAS] Executando verificação inicial de multas...');
    verificarMultas().catch(err => console.error('❌ [STARTUP-MULTAS] Erro:', err));
}, 2500);

app.listen(PORT, () => { console.log('🚀 Servidor AzulCrédito ON: http://localhost:' + PORT); });