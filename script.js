const form = document.getElementById('form-simulacao');
const retorno = document.getElementById('retorno');
const cpfInput = document.getElementById('cpf');

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

function formatCPF(value) {
  const d = onlyDigits(value).slice(0,11);
  let out = d;
  if (d.length > 9) out = d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  else if (d.length > 6) out = d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (d.length > 3) out = d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return out;
}

cpfInput && cpfInput.addEventListener('input', (e) => {
  const pos = e.target.selectionStart;
  const before = e.target.value;
  e.target.value = formatCPF(before);
  const after = e.target.value;
  const diff = after.length - before.length;
  e.target.setSelectionRange(pos + diff, pos + diff);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nome = form.nome.value.trim();
  const cpfRaw = form.cpf.value.trim();
  const cpf = onlyDigits(cpfRaw);
  const valorRaw = form.valor.value;
  const valorNumber = Number(valorRaw);

  if (!nome) {
    retorno.innerHTML = `<p style="color:red;">Por favor informe o nome.</p>`;
    return;
  }

  if (!/^\d{11}$/.test(cpf)) {
    retorno.innerHTML = `<p style="color:red;">CPF inválido. Deve conter exatamente 11 dígitos numéricos.</p>`;
    return;
  }

  if (!isFinite(valorNumber) || valorNumber < 0) {
    retorno.innerHTML = `<p style="color:red;">Valor inválido. Informe um número válido (maior ou igual a 0).</p>`;
    return;
  }

  const dados = { nome, cpf, valor: valorNumber };

  try {
    const resposta = await fetch('/simular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });

    const json = await resposta.json();

    if (json.ok) {
      retorno.innerHTML = `
        <div class="resultado">
          <p>Simulação para <strong>${json.nome}</strong></p>
          <p>CPF: <strong>${formatCPF(json.cpf)}</strong></p>
          <p>Valor solicitado: <strong>R$ ${json.valor}</strong></p>
          <p>Parcelas: <strong>${json.parcelas}x de R$ ${json.parcela}</strong></p>
          <p>Total a pagar: <strong>R$ ${json.total}</strong></p>
          <p style="color:green; margin-top:.5rem;">${json.message}</p>
        </div>
      `;
      form.reset();
    } else {
      retorno.innerHTML = `<p style="color:red;">${json.message || 'Erro ao simular.'}</p>`;
    }
  } catch (err) {
    console.error(err);
    retorno.innerHTML = `<p style="color:red;">Erro ao conectar com o servidor.</p>`;
  }
});
