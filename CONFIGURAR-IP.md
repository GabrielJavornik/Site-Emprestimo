# 🌐 CONFIGURAR IP PARA ACESSAR DO CELULAR

## Problema
Quando clica no link de email do celular/outro PC, recebe erro "localhost é inacessível"

## Solução

### PASSO 1: Descobrir seu IP Local

**Windows - Abra Prompt de Comando:**
```bash
ipconfig
```

Procure por:
```
Adaptador Ethernet ou Wi-Fi:
   IPv4 Address . . . . . . . . . . . : 192.168.X.X
```

**Exemplo:**
- IP encontrado: `192.168.1.50`

---

### PASSO 2: Configurar no Server

**Edite o `server.js` linha 12:**

Procure por:
```javascript
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
```

**Substitua por seu IP:**
```javascript
const BASE_URL = process.env.BASE_URL || 'http://192.168.1.50:8080';
```

⚠️ **Mude `192.168.1.50` para SEU IP!**

---

### PASSO 3: Reiniciar o Servidor

```bash
node server.js
```

Deve aparecer:
```
✅ SendGrid CONFIGURADO - Remetente: 093278@aluno.uricer.edu.br
🚀 Servidor AzulCrédito ON: http://localhost:8080
```

---

### PASSO 4: Acessar do Celular

**Abra o navegador do celular e acesse:**
```
http://192.168.1.50:8080
```

Substitua `192.168.1.50` pelo SEU IP!

---

## ✅ Agora Teste

**1. Cadastre no celular**
```
http://SEU_IP:8080
```

**2. Verifique o email**
- Procure pelo email de confirmação
- O link agora funcionará (não mais "localhost")
- Clique e confirme

**3. Faça login**
- Volte para o site
- Login com a conta criada

---

## 🔧 Alternativa: Variável de Ambiente

Se preferir não editar o arquivo, execute:

```bash
SET BASE_URL=http://192.168.1.50:8080 && node server.js
```

Ou no Linux/Mac:
```bash
BASE_URL=http://192.168.1.50:8080 node server.js
```

---

## 📞 Dúvidas

**O IP muda?**
- Sim, se você usar Wi-Fi diferentes
- Sempre procure pelo IPv4 Address mais recente

**Como deixar permanente?**
- Use um domínio (ngrok, localtunel, etc)
- Ou configure IP estático no router

---

## ✨ Pronto!

Agora emails e links funcionam em qualquer dispositivo! 🚀
