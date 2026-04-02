const sgMail = require('@sendgrid/mail');

// Sua chave API
const API_KEY = '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';
const SEU_EMAIL = '093278@aluno.uricer.edu.br';
const EMAIL_TESTE = 'jaja282901@outlook.com'; // Seu email pessoal para receber o teste

console.log('\n' + '='.repeat(80));
console.log('🧪 TESTE COMPLETO DO SENDGRID');
console.log('='.repeat(80) + '\n');

// ✅ LINHA 1-2: Configurar a API Key
console.log('📋 PASSO 1: Verificando API Key...');
console.log('API Key recebida:', API_KEY ? '✅ SIM' : '❌ NÃO');
console.log('Tamanho da chave:', API_KEY.length, 'caracteres\n');

if (!API_KEY || API_KEY.length < 20) {
    console.error('❌ API Key inválida ou vazia!');
    process.exit(1);
}

sgMail.setApiKey(API_KEY);
console.log('✅ API Key configurada corretamente\n');

// ✅ LINHA 3: Configurar dados
console.log('📋 PASSO 2: Verificando dados de configuração...');
console.log('Email do remetente:', SEU_EMAIL);
console.log('Email de teste:', EMAIL_TESTE);
console.log('✅ Dados configurados\n');

// ✅ LINHA 4: Criar mensagem de teste
console.log('📋 PASSO 3: Preparando email de teste...');

const msg = {
    to: EMAIL_TESTE,
    from: `AzulCrédito <${SEU_EMAIL}>`,
    subject: 'Teste SendGrid - AzulCrédito',
    html: `
        <div style="font-family:sans-serif;color:#333;max-width:500px;border:1px solid #eee;padding:25px;border-radius:15px;background-color:#fcfdfe;">
            <h2 style="color:#1e3c72;border-bottom:2px solid #1e3c72;padding-bottom:10px;">✅ Email de Teste</h2>
            <p>Se você recebeu este email, o SendGrid está <strong>FUNCIONANDO PERFEITAMENTE!</strong></p>
            <p>Data: ${new Date().toLocaleString('pt-BR')}</p>
            <p>Remetente: ${SEU_EMAIL}</p>
            <hr>
            <p style="font-size:0.9rem;color:#666;">AzulCrédito © 2026</p>
        </div>
    `
};

console.log('Email preparado:');
console.log('  To:', msg.to);
console.log('  From:', msg.from);
console.log('  Subject:', msg.subject);
console.log('✅ Estrutura válida\n');

// ✅ LINHA 5: Enviar email
console.log('📋 PASSO 4: Enviando email via SendGrid...');
console.log('Aguarde...\n');

sgMail.send(msg)
    .then(response => {
        console.log('\n' + '='.repeat(80));
        console.log('✅ EMAIL ENVIADO COM SUCESSO!');
        console.log('='.repeat(80) + '\n');

        console.log('📊 Detalhes:');
        console.log('  Status Code:', response[0].statusCode);
        console.log('  Message ID:', response[0].headers['x-message-id']);
        console.log('  Enviado para:', EMAIL_TESTE);
        console.log('  De:', SEU_EMAIL);
        console.log('\n💡 PRÓXIMOS PASSOS:');
        console.log('  1. Verifique sua caixa de entrada em:', EMAIL_TESTE);
        console.log('  2. Se não receber, verifique a pasta SPAM');
        console.log('  3. No SendGrid, acesse: https://app.sendgrid.com/email_activity');
        console.log('  4. Procure pelo email de teste para ver o status\n');

        console.log('✅ CONFIGURAÇÃO CONCLUÍDA - COPY ESTAS FUNÇÕES PARA SEU server.js:\n');
        console.log(`
sgMail.setApiKey('${API_KEY}');

async function enviarEmailConfirmacao(dest, nome, valor) {
    try {
        await sgMail.send({
            to: dest,
            from: 'AzulCrédito <${SEU_EMAIL}>',
            subject: 'Recebemos sua proposta! 🚀',
            html: \`...\`
        });
        console.log("✅ Email de CONFIRMAÇÃO enviado");
    } catch (e) {
        console.error('❌ Erro:', e.message);
    }
}
        `);
        process.exit(0);
    })
    .catch(error => {
        console.log('\n' + '='.repeat(80));
        console.log('❌ ERRO AO ENVIAR EMAIL');
        console.log('='.repeat(80) + '\n');

        console.log('🔍 DIAGNÓSTICO:\n');
        console.log('Tipo de erro:', error.code || error.status);
        console.log('Mensagem:', error.message);

        if (error.response) {
            console.log('\n📋 Resposta completa do servidor:');
            console.log(JSON.stringify(error.response, null, 2));
        }

        console.log('\n💡 SOLUÇÕES POSSÍVEIS:\n');
        console.log('1. Se erro 401: Chave API inválida ou expirada');
        console.log('2. Se erro 403: Email não validado no SendGrid');
        console.log('3. Se erro 400: Dados do email inválidos');
        console.log('\n📌 Acesse: https://app.sendgrid.com/settings/sender_auth');
        console.log('E valide o email: ' + SEU_EMAIL + '\n');

        process.exit(1);
    });
