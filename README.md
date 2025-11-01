# 💸 Site de Simulação de Empréstimo com Firebird

Este projeto foi desenvolvido para simular empréstimos de forma simples e interativa, utilizando **Node.js**, **Express** e **banco de dados Firebird**.  
O sistema permite ao usuário inserir seus dados, simular valores e salvar automaticamente as informações no banco.

---

## 🚀 Tecnologias Utilizadas
- **HTML5 / CSS3 / JavaScript**
- **Node.js** com **Express**
- **Banco de Dados Firebird**
- **DBeaver** (para administração do banco)
- **Git e GitHub** (controle de versão)

---

## 🧩 Estrutura do Projeto

Site-Emprestimo/
│
├── index.html # Página principal com formulário de simulação
├── style.css # Estilos da interface
├── script.js # Envio dos dados via requisição POST
│
├── server.js # Servidor Node.js + conexão com Firebird
├── banco.sql # Script de criação da tabela no Firebird
│
├── package.json # Dependências do projeto
└── node_modules/ # Pastas geradas pelo npm


---

## 🗄️ Estrutura do Banco (Firebird)

Tabela criada: **SIMULACOES**

| Campo          | Tipo         | Descrição                          |
|----------------|--------------|------------------------------------|
| ID             | INTEGER      | Identificador único (PK)           |
| NOME           | VARCHAR(120) | Nome do solicitante                |
| CPF            | VARCHAR(20)  | CPF do solicitante                 |
| VALOR          | DECIMAL(10,2)| Valor solicitado                   |
| PARCELAS       | INTEGER      | Quantidade de parcelas             |
| VALOR_PARCELA  | DECIMAL(10,2)| Valor de cada parcela              |
| TOTAL          | DECIMAL(10,2)| Valor total a pagar                |
| CRIADO_EM      | TIMESTAMP    | Data/hora da simulação             |

📄 Arquivo SQL: [`banco.sql`](./banco.sql)

---

## ⚙️ Como Executar o Projeto

### 1️⃣ Instalar dependências
```bash
npm install
node server.js
