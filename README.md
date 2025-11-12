# 💈 Barbearia Sr. Justini - Bot WhatsApp

Bot automatizado para agendamento de serviços da Barbearia Sr. Justini via WhatsApp.

## 🚀 Funcionalidades

- ✅ Agendamento automático de serviços
- 📅 Gerenciamento de horários disponíveis
- 🎯 Menu interativo com opções
- 📍 Informações de localização
- 💰 Consulta de valores e serviços
- ⏰ Respeita horários de funcionamento e feriados
- 🔄 Reconexão automática
- 💾 Persistência de sessão (sem necessidade de re-escanear QR code)

## 📋 Pré-requisitos

- Node.js >= 16.x
- npm ou yarn
- Chrome/Chromium instalado
- PM2 (para produção)

## 🔧 Instalação

### 1. Clone o repositório
```bash
git clone <seu-repositorio>
cd js
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:
- **Windows**: Configure `CHROME_PATH` para `C:\Program Files\Google\Chrome\Application\chrome.exe`
- **Linux**: Configure `CHROME_PATH` para `/usr/bin/chromium` ou `/usr/bin/google-chrome`

### 4. Execute o bot

**Desenvolvimento:**
```bash
npm start
```

**Produção (com PM2):**
```bash
pm2 start ecosystem.config.js
pm2 save
```

## 🌐 Deploy na Hetzner Cloud

### 1. Conecte ao servidor
```bash
ssh root@5.78.130.43
```

### 2. Instale as dependências do sistema
```bash
# Atualize o sistema
apt update && apt upgrade -y

# Instale Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Instale Chromium
apt install -y chromium chromium-sandbox

# Instale PM2 globalmente
npm install -g pm2
```

### 3. Clone e configure o projeto
```bash
# Clone o repositório
git clone <seu-repositorio> /opt/srjustini-bot
cd /opt/srjustini-bot

# Instale dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
nano .env  # Edite conforme necessário
```

### 4. Inicie o bot com PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Configure o firewall
```bash
# Permita a porta 3001
ufw allow 3001/tcp
ufw enable
```

## 📱 Primeiro uso

1. Execute o bot pela primeira vez
2. Escaneie o QR code que aparecerá no terminal com o WhatsApp
3. Após autenticar, a sessão será salva em `.wwebjs_auth`
4. Nas próximas execuções, não será necessário escanear o QR code novamente

## 🔍 Monitoramento

```bash
# Ver logs do PM2
pm2 logs sr-justini-bot

# Ver status
pm2 status

# Reiniciar bot
pm2 restart sr-justini-bot
```

## 🛠️ API Endpoints

- `GET /health` - Status do servidor
- `GET /api/status` - Status do bot
- `GET /api/slots?date=DD/MM/YYYY&service=CABELO` - Horários disponíveis
- `GET /api/bookings?date=DD/MM/YYYY` - Agendamentos do dia
- `POST /api/connect` - Conectar bot manualmente
- `POST /api/disconnect` - Desconectar bot

## 📦 Estrutura do Projeto

```
.
├── chatbot.js              # Código principal do bot
├── package.json            # Dependências e scripts
├── ecosystem.config.js     # Configuração do PM2
├── .env                    # Variáveis de ambiente (não versionado)
├── .env.example            # Template de variáveis
├── .gitignore             # Arquivos ignorados pelo Git
└── README.md              # Esta documentação
```

## 🔒 Segurança

- **Nunca** compartilhe o arquivo `.env` ou a pasta `.wwebjs_auth`
- Use variáveis de ambiente para dados sensíveis
- Configure corretamente o firewall no servidor
- Mantenha as dependências atualizadas

## 🐛 Troubleshooting

### Erro: "Failed to launch the browser process!"
- Verifique se o Chrome/Chromium está instalado
- Confirme o caminho correto no `CHROME_PATH` do arquivo `.env`
- No Linux, instale: `apt install chromium chromium-sandbox`

### Bot desconecta frequentemente
- Verifique a estabilidade da conexão de internet
- Certifique-se de que apenas um dispositivo está conectado ao WhatsApp
- Use PM2 para garantir reconexão automática

### QR code aparece toda vez
- Verifique se a pasta `.wwebjs_auth` existe e não foi excluída
- Confirme as permissões de leitura/escrita na pasta

## 📞 Suporte

Para dúvidas ou problemas, entre em contato:
- Instagram: @sr.justini
- Telefone: (83) 99999-9999

## 📄 Licença

Este projeto é proprietário da Barbearia Sr. Justini.
