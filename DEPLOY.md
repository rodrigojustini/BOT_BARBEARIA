# 🚀 Guia de Deploy - Barbearia Sr. Justini Bot

Este guia descreve o processo completo de deploy do bot na nuvem Hetzner.

## 📋 Informações do Servidor

- **IP**: 5.78.130.43
- **Sistema**: Ubuntu/Debian
- **Porta do Bot**: 3001

---

## 🔧 Preparação Local (Windows)

### 1. Verificar arquivos antes do push

```powershell
# Certifique-se de que está no diretório correto
cd C:\Users\ise2j\Desktop\js

# Verifique o status do Git
git status

# Adicione o repositório remoto (se ainda não adicionou)
git remote add origin https://github.com/rodrigojustini/BOT_BARBEARIA.git

# Ou atualize a URL se já existe
git remote set-url origin https://github.com/rodrigojustini/BOT_BARBEARIA.git
```

### 2. Commit e Push

```powershell
# Adicione todos os arquivos (exceto os do .gitignore)
git add .

# Faça o commit
git commit -m "Preparação para deploy na Hetzner"

# Envie para o GitHub
git push -u origin main
```

---

## 🌐 Configuração do Servidor Hetzner (5.78.130.43)

### 1. Conectar ao Servidor

```bash
ssh root@5.78.130.43
```

### 2. Instalar Dependências do Sistema

```bash
# Atualizar sistema
apt update && apt upgrade -y

# Instalar Node.js 18.x (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verificar instalação
node --version
npm --version

# Instalar Chromium e dependências
apt install -y chromium chromium-sandbox \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libwayland-client0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils

# Instalar PM2 globalmente
npm install -g pm2

# Verificar instalação do PM2
pm2 --version
```

### 3. Criar Estrutura de Diretórios

```bash
# Criar diretório para o bot
mkdir -p /opt/srjustini-bot

# Criar diretório para dados de sessão
mkdir -p /var/lib/srjustini-bot

# Definir permissões
chmod 755 /opt/srjustini-bot
chmod 755 /var/lib/srjustini-bot
```

### 4. Clonar o Repositório

```bash
# Navegar para o diretório
cd /opt/srjustini-bot

# Clonar o repositório
git clone https://github.com/rodrigojustini/BOT_BARBEARIA.git .

# Verificar arquivos
ls -la
```

### 5. Instalar Dependências do Projeto

```bash
# Instalar pacotes npm
npm install

# Verificar se instalou corretamente
npm list --depth=0
```

### 6. Configurar Variáveis de Ambiente

```bash
# Copiar o template
cp .env.example .env

# Editar o arquivo .env
nano .env
```

**Configuração do .env para Linux:**

```bash
# Configurações do Servidor
PORT=3001

# Configurações de Autenticação do WhatsApp
AUTH_DATA_PATH=/var/lib/srjustini-bot
AUTH_CLIENT_ID=sr-justini-minimal

# Configurações do Chrome/Chromium (IMPORTANTE: usar caminho do Linux)
CHROME_PATH=/usr/bin/chromium

# Configurações do Bot
STRICT_MENU=false
MAX_CONCURRENT_BOOKINGS=1

# Configurações Opcionais
ENABLE_INTEL_RESPONSE=false
```

**Salvar**: `Ctrl + O`, `Enter`, `Ctrl + X`

### 7. Testar o Bot Manualmente (Primeira Vez)

```bash
# Executar o bot para gerar o QR code
node chatbot.js
```

**Importante:**
1. O QR code aparecerá no terminal
2. Escaneie com o WhatsApp
3. Aguarde a mensagem "✅ Bot WhatsApp conectado e pronto!"
4. Pressione `Ctrl + C` para parar
5. A sessão ficará salva em `/var/lib/srjustini-bot/wwebjs_auth/`

### 8. Iniciar com PM2

```bash
# Iniciar o bot com PM2
pm2 start ecosystem.config.js

# Verificar status
pm2 status

# Ver logs em tempo real
pm2 logs sr-justini-bot

# Salvar configuração do PM2
pm2 save

# Configurar PM2 para iniciar com o sistema
pm2 startup
# Copie e execute o comando que aparecer
```

### 9. Configurar Firewall

```bash
# Instalar UFW (se não estiver instalado)
apt install -y ufw

# Permitir SSH (IMPORTANTE: fazer antes de habilitar o firewall!)
ufw allow 22/tcp

# Permitir porta do bot
ufw allow 3001/tcp

# Habilitar firewall
ufw enable

# Verificar status
ufw status
```

---

## 🔍 Monitoramento e Manutenção

### Comandos Úteis do PM2

```bash
# Ver status de todos os processos
pm2 status

# Ver logs em tempo real
pm2 logs sr-justini-bot

# Ver logs com filtro
pm2 logs sr-justini-bot --lines 100

# Reiniciar bot
pm2 restart sr-justini-bot

# Parar bot
pm2 stop sr-justini-bot

# Remover bot do PM2
pm2 delete sr-justini-bot

# Monitoramento em tempo real
pm2 monit
```

### Verificar Saúde do Bot

```bash
# Testar endpoint de saúde
curl http://localhost:3001/health

# Testar status do bot
curl http://localhost:3001/api/status
```

### Ver Logs do Sistema

```bash
# Logs do PM2
pm2 logs sr-justini-bot --lines 50

# Logs de erro
pm2 logs sr-justini-bot --err

# Logs apenas de saída
pm2 logs sr-justini-bot --out
```

---

## 🔄 Atualizar o Bot

### Quando houver mudanças no código:

```bash
# Conectar ao servidor
ssh root@5.78.130.43

# Navegar para o diretório
cd /opt/srjustini-bot

# Parar o bot
pm2 stop sr-justini-bot

# Puxar atualizações do GitHub
git pull origin main

# Instalar novas dependências (se houver)
npm install

# Reiniciar o bot
pm2 restart sr-justini-bot

# Verificar logs
pm2 logs sr-justini-bot
```

---

## 🐛 Troubleshooting

### Bot não inicia

```bash
# Verificar logs
pm2 logs sr-justini-bot --lines 100

# Testar manualmente
cd /opt/srjustini-bot
node chatbot.js
```

### Erro: "Failed to launch the browser process!"

```bash
# Verificar se Chromium está instalado
which chromium
chromium --version

# Reinstalar se necessário
apt install --reinstall chromium chromium-sandbox

# Verificar caminho no .env
cat .env | grep CHROME_PATH
```

### Bot desconecta do WhatsApp

```bash
# Verificar logs
pm2 logs sr-justini-bot

# Verificar sessão
ls -la /var/lib/srjustini-bot/wwebjs_auth/

# Se necessário, reconectar manualmente
pm2 stop sr-justini-bot
node chatbot.js  # Escanear QR code novamente
# Ctrl+C após conectar
pm2 restart sr-justini-bot
```

### Porta 3001 não acessível externamente

```bash
# Verificar se o bot está rodando
pm2 status

# Verificar se está escutando na porta
netstat -tuln | grep 3001

# Verificar firewall
ufw status

# Abrir porta se necessário
ufw allow 3001/tcp
```

### Memória ou CPU alta

```bash
# Monitorar recursos
pm2 monit

# Ver uso detalhado
htop

# Reiniciar o bot
pm2 restart sr-justini-bot
```

---

## 📊 Monitoramento Avançado (Opcional)

### Instalar PM2 Plus (Monitoramento Cloud)

```bash
# Registrar no PM2 Plus
pm2 plus

# Seguir instruções para criar conta gratuita
```

### Configurar Logs Externos

```bash
# Instalar módulo de logs
pm2 install pm2-logrotate

# Configurar rotação de logs
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 🔒 Segurança

### Recomendações:

1. **Mudar senha root**:
```bash
passwd root
```

2. **Criar usuário não-root**:
```bash
adduser srjustini
usermod -aG sudo srjustini
```

3. **Configurar SSH com chave**:
```bash
# No seu computador local (Windows PowerShell):
ssh-keygen -t rsa -b 4096

# Copiar chave pública para o servidor
ssh-copy-id root@5.78.130.43
```

4. **Desabilitar login root via SSH** (após configurar usuário):
```bash
nano /etc/ssh/sshd_config
# Alterar: PermitRootLogin no
systemctl restart sshd
```

5. **Configurar fail2ban**:
```bash
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 📞 Suporte

Se encontrar problemas durante o deploy:

1. Verifique os logs: `pm2 logs sr-justini-bot`
2. Teste manualmente: `node chatbot.js`
3. Verifique as dependências: `npm list`
4. Consulte o README.md para troubleshooting geral

---

## ✅ Checklist de Deploy

- [ ] Servidor Hetzner acessível via SSH
- [ ] Node.js 18+ instalado
- [ ] Chromium instalado com todas as dependências
- [ ] PM2 instalado globalmente
- [ ] Repositório clonado em `/opt/srjustini-bot`
- [ ] Dependências npm instaladas
- [ ] Arquivo `.env` configurado corretamente
- [ ] QR code escaneado (primeira vez)
- [ ] Bot rodando com PM2
- [ ] PM2 configurado para startup automático
- [ ] Firewall configurado (porta 3001 aberta)
- [ ] Logs verificados e sem erros
- [ ] Endpoint `/health` respondendo
- [ ] Bot respondendo no WhatsApp

---

**Deploy concluído com sucesso! 🎉**
