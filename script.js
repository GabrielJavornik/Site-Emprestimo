const form = document.getElementById('form-simulacao');
const retorno = document.getElementById('retorno');
const cpfInput = document.getElementById('cpf');
const erroCpf = document.getElementById('erro-cpf');

/* util: mantém só números */
function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

/* máscara de CPF */
function formatCPF(value) {
  const d = onlyDigits(value).slice(0, 11);
  let out = d;
  if (d.length > 9) {
    out = d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (d.length > 6) {
    out = d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  } else if (d.length > 3) {
    out = d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  }
  return out;
}

/* valida CPF brasileiro */
function validaCPF(cpf) {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(d.charAt(i), 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(d.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(d.charAt(i), 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(d.charAt(10), 10)) return false;

  return true;
}

/* máscara ao digitar CPF */
cpfInput.addEventListener('input', (e) => {
  const antes = e.target.value;
  const pos = e.target.selectionStart;
  e.target.value = formatCPF(antes);
  const diff = e.target.value.length - antes.length;
  e.target.setSelectionRange(pos + diff, pos + diff);

  if (erroCpf) erroCpf.style.display = 'none';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nome = form.nome.value.trim();
  const cpf = cpfInput.value.trim();
  const valorStr = form.valor.value;
  const valorNumber = Number(valorStr);
  const parcelas = form.parcelas.value; // 👈 novo

  if (!nome) {
    retorno.innerHTML = `<p style="color:red;">Informe o nome.</p>`;
    return;
  }

  if (!validaCPF(cpf)) {
    erroCpf.style.display = 'block';
    retorno.innerHTML = `<p style="color:red;">CPF inválido.</p>`;
    return;
  }

  if (!isFinite(valorNumber) || valorNumber < 0) {
    retorno.innerHTML = `<p style="color:red;">Valor inválido.</p>`;
    return;
  }

  const dados = {
    nome,
    cpf,
    valor: valorNumber,
    parcelas: Number(parcelas)
  };

  try {
    const resp = await fetch('/simular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });

    const json = await resp.json();

    if (json.ok) {
      retorno.innerHTML = `
        <div style="background:#e8fff0; border:1px solid #bff0cd; padding:1rem; border-radius:.5rem;">
          <p>Simulação para <strong>${json.nome}</strong></p>
          <p>CPF: <strong>${cpf}</strong></p>
          <p>Valor solicitado: <strong>R$ ${json.valor}</strong></p>
          <p>Parcelas: <strong>${json.parcelas}x de R$ ${json.parcela}</strong></p>
          <p>Total a pagar: <strong>R$ ${json.total}</strong></p>
          <p style="color:green; margin-top:.5rem;">${json.message}</p>
        </div>
      `;
      form.reset();
      erroCpf.style.display = 'none';
    } else {
      retorno.innerHTML = `<p style="color:red;">${json.message || 'Erro ao simular.'}</p>`;
    }
  } catch (err) {
    console.error(err);
    retorno.innerHTML = `<p style="color:red;">Erro ao conectar com o servidor.</p>`;
  }
});
