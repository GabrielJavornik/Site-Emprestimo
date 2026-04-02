// ⚠️ SEÇÃO DE EMAIL AJUSTADA (SendGrid)
const sgMail = require('@sendgrid/mail');

// Sua chave de API (Mantenha esta que você já gerou)
sgMail.setApiKey('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');

// --- FUNÇÕES DE E-MAIL COM REMETENTE VALIDADO ---

async function enviarEmailConfirmacao(dest, nome, valor) {
    console.log('📧 Tentando enviar CONFIRMAÇÃO para:', dest);
    try {
        await sgMail.send({
            to: dest,
            from: 'AzulCrédito <093278@aluno.uricer.edu.br>',
            subject: 'Recebemos sua proposta! 🚀',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #eee;padding:25px;border-radius:15px;background-color:#fcfdfe;">
                    <h2 style="color:#1e3c72;border-bottom:2px solid #1e3c72;padding-bottom:10px;">Olá, ${nome}!</h2>
                    <p>Sua proposta de empréstimo de <strong>R$ ${valor.toFixed(2)}</strong> foi recebida.</p>
                    <div style="background:#eef2f7;padding:10px;border-radius:8px;margin:15px 0;">Status: <strong>Em Análise Técnica</strong></div>
                    <p>Equipe AzulCrédito</p></div>`
        });
        console.log("✅ E-mail de CONFIRMAÇÃO enviado para " + dest);
    } catch (e) {
        console.error('❌ Erro e-mail CONFIRMAÇÃO:', e.response ? e.response.body : e.message);
    }
}

async function enviarEmailAprovado(dest, nome) {
    console.log('📧 Tentando enviar APROVAÇÃO para:', dest);
    try {
        await sgMail.send({
            to: dest,
            from: 'AzulCrédito <093278@aluno.uricer.edu.br>',
            subject: 'BOAS NOTÍCIAS: Seu crédito foi APROVADO! 🎉',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #dcfce7;padding:25px;border-radius:15px;background-color:#f0fdf4;">
                    <h2 style="color:#166534;">Parabéns, ${nome}! 🎉</h2>
                    <p>Seu crédito foi <strong>APROVADO</strong>. O valor será transferido via PIX em instantes.</p></div>`
        });
        console.log("✅ E-mail de APROVAÇÃO enviado para " + dest);
    } catch (e) {
        console.error('❌ Erro e-mail APROVAÇÃO:', e.response ? e.response.body : e.message);
    }
}

async function enviarEmailReprovado(dest, nome) {
    console.log('📧 Tentando enviar REPROVAÇÃO para:', dest);
    try {
        await sgMail.send({
            to: dest,
            from: 'AzulCrédito <093278@aluno.uricer.edu.br>',
            subject: 'Atualização sobre sua proposta',
            html: `<div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #fee2e2;padding:25px;border-radius:15px;background-color:#fef2f2;">
                    <h2 style="color:#991b1b;">Olá, ${nome}</h2>
                    <p>No momento não conseguimos aprovar seu crédito. Tente novamente em 60 dias.</p></div>`
        });
        console.log("✅ E-mail de REPROVAÇÃO enviado para " + dest);
    } catch (e) {
        console.error('❌ Erro e-mail REPROVAÇÃO:', e.response ? e.response.body : e.message);
    }
}