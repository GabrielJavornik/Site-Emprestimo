const form = document.getElementById('form-simulacao');
const retorno = document.getElementById('retorno');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const dados = {
      nome: form.nome.value,
      cpf: form.cpf.value,
      valor: form.valor.value
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
          <div class="resultado">
            <h3>Simulação para ${json.nome}</h3>
            <p>Valor solicitado: <strong>R$ ${json.valor}</strong></p>
            <p>Parcelas: <strong>${json.parcelas}x de R$ ${json.parcela}</strong></p>
            <p>Total a pagar: <strong>R$ ${json.total}</strong></p>
          </div>
        `;
      } else {
        retorno.textContent = 'Não foi possível simular.';
      }
    } catch (err) {
      retorno.textContent = 'Erro ao enviar a simulação.';
      console.error(err);
    }
  });
}

