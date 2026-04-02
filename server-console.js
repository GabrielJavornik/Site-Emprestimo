// ⚠️ SUBSTITUA A SEÇÃO DE EMAIL DO SERVER.JS ORIGINAL COM ISTO:
// Versão que simula email no console (útil para testes em ambiente bloqueado)

// --- FUNÇÕES DE E-MAIL SIMULADAS NO CONSOLE ---
async function enviarEmailConfirmacao(dest, nome, valor) {
    console.log('\n' + '='.repeat(80));
    console.log('📧 EMAIL DE CONFIRMAÇÃO SIMULADO');
    console.log('='.repeat(80));
    console.log('Para:', dest);
    console.log('Nome:', nome);
    console.log('Valor:', 'R$ ' + valor.toFixed(2));
    console.log('Assunto: Recebemos sua proposta! 🚀');
    console.log('Status: EM ANÁLISE TÉCNICA');
    console.log('='.repeat(80) + '\n');
}

async function enviarEmailAprovado(dest, nome) {
    console.log('\n' + '='.repeat(80));
    console.log('✅ EMAIL DE APROVAÇÃO SIMULADO');
    console.log('='.repeat(80));
    console.log('Para:', dest);
    console.log('Nome:', nome);
    console.log('Assunto: BOAS NOTÍCIAS: Seu crédito foi APROVADO! 🎉');
    console.log('Mensagem: Seu crédito foi APROVADO! O valor será transferido via PIX.');
    console.log('='.repeat(80) + '\n');
}

async function enviarEmailReprovado(dest, nome) {
    console.log('\n' + '='.repeat(80));
    console.log('❌ EMAIL DE REPROVAÇÃO SIMULADO');
    console.log('='.repeat(80));
    console.log('Para:', dest);
    console.log('Nome:', nome);
    console.log('Assunto: Atualização sobre sua proposta');
    console.log('Mensagem: No momento não conseguimos aprovar seu crédito. Tente novamente em 60 dias.');
    console.log('='.repeat(80) + '\n');
}
