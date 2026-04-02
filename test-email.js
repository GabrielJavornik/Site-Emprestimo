const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "57d6387605008f",
    pass: "8a19399ddd8e06"
  }
});

console.log('🔄 Testando conexão SMTP...\n');

transporter.verify((error, success) => {
  if (error) {
    console.error('❌ ERRO NA CONEXÃO:', error);
    process.exit(1);
  } else {
    console.log('✅ SMTP CONECTADO COM SUCESSO!\n');
    enviarTestEmail();
  }
});

async function enviarTestEmail() {
  try {
    console.log('📧 Enviando e-mail de teste...\n');

    const info = await transporter.sendMail({
      from: '"AzulCrédito" <093278@aluno.uricer.edu.br>',
      to: 'teste@example.com',
      subject: 'EMAIL DE TESTE - AzulCrédito',
      html: '<h2>Teste de Email</h2><p>Se você recebeu este email, o SMTP está funcionando!</p>'
    });

    console.log('✅ EMAIL ENVIADO COM SUCESSO!');
    console.log('📬 Message ID:', info.messageId);
    console.log('\n💡 Verifique em: https://mailtrap.io (inbox)\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ ERRO AO ENVIAR EMAIL:');
    console.error('Tipo:', error.code);
    console.error('Mensagem:', error.message);
    console.error('\nDetalhes completos:', error);
    process.exit(1);
  }
}
