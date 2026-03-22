const form = document.getElementById('form-simulacao');
const retorno = document.getElementById('retorno');
const cpfInput = document.getElementById('cpf');
const erroCpf = document.getElementById('erro-cpf');

/**
 * 1. FUNÇÕES DE MÁSCARAS E MODAL
 */

// MÁSCARA DE CPF (000.000.000-00)
function formatCPF(value) {
    const d = onlyDigits(value).slice(0, 11);
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
            .replace(/\.$/, '').replace(/-$/, '');
}

// MÁSCARA DE DINHEIRO (R$ 1.000,00)
function formatMoeda(value) {
    let v = onlyDigits(value);
    v = (Number(v) / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
    return v;
}

// Ouvinte para formatar CPF e Moeda em tempo real
document.addEventListener('input', (e) => {
    // Formata campos de CPF baseando-se no placeholder ou ID
    if (e.target.id.includes('cpf') || (e.target.placeholder && e.target.placeholder.includes('000.000.000-00'))) {
        e.target.value = formatCPF(e.target.value);
    }
    // Formata campos de Valor/Dinheiro
    if (e.target.id === 'v' || e.target.name === 'valor' || e.target.id === 'valor' || e.target.id === 'v_mask') {
        e.target.value = formatMoeda(e.target.value);
    }
});

function abrirModal() { 
    document.getElementById('modalLogin').style.display = "block"; 
    switchTab('login'); 
}

function fecharModal() { 
    document.getElementById('modalLogin').style.display = "none"; 
}

function switchTab(type) {
    const isLogin = type === 'login';
    document.getElementById('form-login').style.display = isLogin ? 'block' : 'none';
    document.getElementById('form-cadastro').style.display = isLogin ? 'none' : 'block';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-cadastro').classList.toggle('active', !isLogin);
    document.getElementById('msg-auth').innerText = ""; 
}

window.onclick = function(event) {
    let modal = document.getElementById('modalLogin');
    if (event.target == modal) fecharModal();
}

/**
 * 2. VALIDAÇÃO TÉCNICA
 */
function onlyDigits(str) { return String(str || '').replace(/\D/g, ''); }

function validaCPF(cpf) {
    const d = onlyDigits(cpf);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(d.charAt(i)) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(d.charAt(9))) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(d.charAt(i)) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(d.charAt(10));
}

/**
 * 3. EVENTOS DE FORMULÁRIO
 */

// --- SIMULAÇÃO (HOME) ---
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = form.nome.value.trim();
        const cpfLimpo = onlyDigits(cpfInput.value);
        const valorLimpo = Number(onlyDigits(form.valor.value)) / 100;

        if (!validaCPF(cpfLimpo)) {
            erroCpf.style.display = 'block';
            return;
        } else {
            erroCpf.style.display = 'none';
        }

        const dados = { nome, cpf: cpfLimpo, valor: valorLimpo, parcelas: Number(form.parcelas.value) };

        try {
            retorno.innerHTML = "<p style='color:orange'>Consultando AzulCrédito...</p>";
            const resp = await fetch('/simular', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const json = await resp.json();

            if (json.ok) {
                const zapLink = `https://wa.me/5554992026684?text=Olá! Fiz uma simulação: ${json.nome}, CPF: ${json.cpf}, Valor: R$${valorLimpo.toFixed(2)}, Parcelas: ${json.parcelas}x`;
                retorno.innerHTML = `
                    <div class="resultado" style="background:#f0fdf4; padding:20px; border-radius:12px; border:1px solid #bbf7d0; margin-top:15px;">
                        <h4 style="color: #166534">🎉 Aprovado!</h4>
                        <p>Valor solicitado: <strong>R$ ${valorLimpo.toFixed(2)}</strong></p>
                        <a href="${zapLink}" target="_blank" style="background:#25d366; color:white; padding:10px; display:block; text-align:center; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:10px;">CONTRATAR NO WHATSAPP</a>
                    </div>`;
                form.reset();
            }
        } catch (err) {
            retorno.innerHTML = "<p style='color:red'>Erro ao conectar com o servidor.</p>";
        }
    });
}

// --- LOGIN (ATUALIZADO COM REDIRECIONAMENTO SEGURO) ---
const formLogin = document.getElementById('form-login');
if (formLogin) {
    formLogin.addEventListener('submit', async function(e) {
        e.preventDefault();
        const msg = document.getElementById('msg-auth');
        const cpf = onlyDigits(document.getElementById('login-cpf').value);
        const senha = document.getElementById('login-senha').value;

        msg.style.color = "orange";
        msg.innerText = "Verificando dados...";

        try {
            const resp = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpf, senha })
            });
            const json = await resp.json();

            if (json.ok) {
                msg.style.color = "#2ecc71";
                msg.innerText = `✅ Bem-vindo! Redirecionando...`;
                
                // MUDANÇA AQUI: Agora redirecionamos apenas para /simulacoes
                // O servidor saberá quem você é através da sessão (cookie)
                setTimeout(() => { window.location.href = '/simulacoes'; }, 1500);
            } else {
                msg.style.color = "#e74c3c";
                msg.innerText = "❌ Usuário ou senha incorretos.";
            }
        } catch (err) { msg.innerText = "Erro de conexão."; }
    });
}

// --- CADASTRO REAL (ATUALIZADO COM EMAIL E WHATSAPP) ---
const formCad = document.getElementById('form-cadastro');
if (formCad) {
    formCad.addEventListener('submit', async function(e) {
        e.preventDefault();
        const msg = document.getElementById('msg-auth');
        
        const nome = document.getElementById('cad-nome').value;
        const email = document.getElementById('cad-email').value;
        const whatsapp = onlyDigits(document.getElementById('cad-whatsapp').value);
        const cpf = onlyDigits(document.getElementById('cad-cpf').value);
        const senha = document.getElementById('cad-senha').value;
        const aceitoTermos = document.getElementById('cad-termos').checked;

        if (!aceitoTermos) {
            alert("Você precisa aceitar os termos de uso.");
            return;
        }

        if (!validaCPF(cpf)) {
            alert("CPF Inválido.");
            return;
        }

        try {
            msg.style.color = "orange";
            msg.innerText = "Criando sua conta...";
            
            const resp = await fetch('/cadastro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, email, whatsapp, cpf, senha })
            });
            
            const json = await resp.json();
            if (json.ok) {
                msg.style.color = "#2ecc71";
                msg.innerText = "✅ Conta criada! Faça login.";
                setTimeout(() => switchTab('login'), 2000);
            } else {
                msg.style.color = "#e74c3c";
                msg.innerText = "❌ Erro: CPF ou E-mail já cadastrado.";
            }
        } catch (err) { 
            msg.style.color = "#e74c3c";
            msg.innerText = "Erro ao conectar com o servidor."; 
        }
    });
}