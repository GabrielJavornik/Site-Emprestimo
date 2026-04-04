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

// MÁSCARA DE CEP (00000-000)
function formatCEP(value) {
    const d = onlyDigits(value).slice(0, 8);
    return d.replace(/(\d{5})(\d{3})/, '$1-$2').replace(/-$/, '');
}

// BUSCAR ENDEREÇO VIA CEP (ViaCEP)
async function buscarCEP(cep) {
    const cepLimpo = onlyDigits(cep);
    if (cepLimpo.length !== 8) return;

    try {
        const resp = await fetch(`/api/cep/${cepLimpo}`);
        const data = await resp.json();

        if (data.ok) {
            document.getElementById('cad-rua').value = data.rua || '';
            document.getElementById('cad-bairro').value = data.bairro || '';
            document.getElementById('cad-cidade').value = data.cidade || '';
            document.getElementById('cad-estado').value = data.estado || '';
            document.getElementById('cad-numero').focus();
        } else {
            alert('⚠️ ' + data.msg);
        }
    } catch (e) {
        console.error('❌ Erro ao buscar CEP:', e);
        alert('❌ Erro ao buscar endereço');
    }
}

// Ouvinte para formatar CPF, CEP e Moeda em tempo real
document.addEventListener('input', (e) => {
    // Formata campos de CPF baseando-se no placeholder ou ID
    if (e.target.id.includes('cpf') || (e.target.placeholder && e.target.placeholder.includes('000.000.000-00'))) {
        e.target.value = formatCPF(e.target.value);
    }
    // Formata campos de Valor/Dinheiro
    if (e.target.id === 'v' || e.target.name === 'valor' || e.target.id === 'valor' || e.target.id === 'v_mask') {
        e.target.value = formatMoeda(e.target.value);
    }
    // Formata campo de CEP
    if (e.target.id.includes('cep') || (e.target.placeholder && e.target.placeholder.includes('00000-000'))) {
        e.target.value = formatCEP(e.target.value);
    }
});

// Ouvinte para buscar endereço ao sair do campo de CEP
document.addEventListener('blur', (e) => {
    if (e.target.id === 'cad-cep' && e.target.value.length === 9) {
        buscarCEP(e.target.value);
    }
}, true);

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
 * 3. FAQ INTERATIVO
 */
window.addEventListener('load', () => {
    const faqs = [
        { q: 'Qual é o valor máximo que posso solicitar?', a: 'O valor máximo é R$ 20.000.' },
        { q: 'Qual é o prazo máximo de parcelamento?', a: 'Você pode parcelar em até 24 meses.' },
        { q: 'Quanto tempo leva para aprovar?', a: 'A aprovação leva em média 24-48 horas.' },
        { q: 'Preciso de renda comprovada?', a: 'Sim, precisa de contracheque ou extrato.' },
        { q: 'Vocês cobram taxa de antecipação?', a: 'Não! Zero taxa antecipada.' },
        { q: 'Como recebo o dinheiro?', a: 'Via PIX direto em sua conta.' }
    ];

    const container = document.getElementById('faq-container');
    if (container) {
        let html = '';
        faqs.forEach((item, i) => {
            html += `
                <div style="margin-bottom:15px;background:white;padding:15px;border-radius:8px;border-left:4px solid #0078d7;">
                    <div style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="document.getElementById('resp-${i}').style.display = document.getElementById('resp-${i}').style.display === 'none' ? 'block' : 'none';">
                        <strong style="color:#1e3c72;">❓ ${item.q}</strong>
                        <span style="color:#0078d7;">▼</span>
                    </div>
                    <p id="resp-${i}" style="margin:10px 0 0 0;color:#555;display:none;padding-top:10px;border-top:1px solid #eee;">✅ ${item.a}</p>
                </div>
            `;
        });
        container.innerHTML = html;
    }
});

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

// --- LOGIN COM VALIDAÇÃO DE EMAIL ---
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
                setTimeout(() => { window.location.href = '/simulacoes'; }, 1500);
            } else {
                msg.style.color = "#e74c3c";
                // Mostrar a mensagem exata do servidor
                if (json.msg) {
                    msg.innerText = json.msg;
                } else {
                    msg.innerText = "❌ Usuário ou senha incorretos.";
                }
            }
        } catch (err) { msg.innerText = "Erro de conexão."; }
    });
}

// --- CADASTRO COM CONFIRMAÇÃO DE EMAIL ---
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

        // Campos de endereço (opcionais)
        const cep = document.getElementById('cad-cep').value;
        const rua = document.getElementById('cad-rua').value;
        const bairro = document.getElementById('cad-bairro').value;
        const cidade = document.getElementById('cad-cidade').value;
        const estado = document.getElementById('cad-estado').value;
        const numero_casa = document.getElementById('cad-numero').value;

        if (!aceitoTermos) {
            alert("Você precisa aceitar os termos de uso.");
            return;
        }

        if (!validaCPF(cpf)) {
            alert("CPF Inválido.");
            return;
        }

        if (whatsapp.length < 10 || whatsapp.length > 11) {
            alert("WhatsApp inválido. Use DDD + número (10 ou 11 dígitos).\nExemplo: 54999999999");
            return;
        }

        try {
            msg.style.color = "orange";
            msg.innerText = "Criando sua conta...";

            const resp = await fetch('/cadastro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, email, whatsapp, cpf, senha, cep, rua, bairro, cidade, estado, numero_casa })
            });

            const json = await resp.json();
            if (json.ok) {
                msg.style.color = "#2ecc71";
                msg.innerText = "✅ Conta criada! Verifique seu email para confirmar.";
                setTimeout(() => switchTab('login'), 3000);
            } else {
                msg.style.color = "#e74c3c";
                msg.innerText = "❌ Erro: " + (json.msg || "CPF ou E-mail já cadastrado.");
            }
        } catch (err) {
            msg.style.color = "#e74c3c";
            msg.innerText = "Erro ao conectar com o servidor.";
        }
    });
}

// --- MÁSCARA E VALIDAÇÃO DE WHATSAPP ---
const inputWhatsApp = document.getElementById('cad-whatsapp');
if (inputWhatsApp) {
    inputWhatsApp.addEventListener('input', function() {
        let valor = onlyDigits(this.value);

        // Limitar a 11 dígitos máximo
        if (valor.length > 11) {
            valor = valor.slice(0, 11);
        }

        // Aplicar máscara: (XX) 9XXXX-XXXX ou (XX) 9XXX-XXXX
        let mascara = '';
        if (valor.length === 0) {
            mascara = '';
        } else if (valor.length <= 2) {
            mascara = valor;
        } else if (valor.length <= 6) {
            mascara = `(${valor.slice(0, 2)}) ${valor.slice(2)}`;
        } else if (valor.length <= 10) {
            mascara = `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}-${valor.slice(7)}`;
        } else {
            mascara = `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}-${valor.slice(7, 11)}`;
        }

        this.value = mascara;
    });
}