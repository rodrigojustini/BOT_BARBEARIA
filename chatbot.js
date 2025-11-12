// ========================================
// SERVIDOR PRINCIPAL - Minimal + Agenda + Feriados + Capacidade
// Extras: pausa ao pedir atendente, Instagram, anti-duplicata, MENU INTERATIVO (List) + fallback texto
// Hetzner-ready: Chromium do sistema, sessão persistente, PM2, SIGTERM/SIGINT
// ========================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const qrcodeTerminal = require('qrcode-terminal');
require('dotenv').config();

// WhatsApp
const { Client, LocalAuth, List } = require('whatsapp-web.js');

// ====== CONFIG BÁSICA ======
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const STRICT_MENU = String(process.env.STRICT_MENU || '').toLowerCase() === 'true';
const MAX_CONCURRENT_BOOKINGS = parseInt(process.env.MAX_CONCURRENT_BOOKINGS || '1', 10);

// Sessão (reuse SEM QR) — padrão seguro p/ Hetzner + PM2
const DEFAULT_DATA_DIR = process.env.AUTH_DATA_PATH || '/var/lib/srjustini-bot';
const AUTH_DATA_PATH = path.resolve(DEFAULT_DATA_DIR);
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || 'sr-justini-minimal';
const SESSION_DIR = path.join(AUTH_DATA_PATH, 'wwebjs_auth', AUTH_CLIENT_ID);
console.log('📁 Local da sessão:', SESSION_DIR);

// ====== ESTADO GLOBAL ======
let botState = {
  connected: false,
  authenticated: false,
  messages: 0,
  lastActivity: null,
  uptime: new Date(),
};

let client = null;

// ====== AGENDA EM MEMÓRIA ======
/**
 * bookings: { 'YYYY-MM-DD': [ { start, end, serviceKey, serviceLabel, client, phone } ] }
 */
const bookings = {};
const conversation = new Map(); // estado do fluxo de agendamento por usuário
const pausedUsers = new Set();  // usuários pausados (após pedir atendente)
const lastResponseByUser = new Map(); // anti-duplicata de respostas

// ====== DEFINIÇÕES DA BARBEARIA ======
const BUSINESS = {
  name: 'Barbearia Sr. Justini',
  address: 'Avenida Oceano Atlântico, 1998\nIntermares, Cabedelo - PB',
  phone: '(83) 99999-9999',
  instagram: '@sr.justini'
};

// Durações e preços
const SERVICES = {
  CABELO:       { label: 'Cabelo',                    price: 50, durationMin: 30 },
  BARBA:        { label: 'Barba',                     price: 50, durationMin: 30 },
  COMBO:        { label: 'Combo (Cabelo + Barba)',    price: 90, durationMin: 60 },
  COMPLETO:     { label: 'Completo (Cabelo+Barba+Sobrancelha)', price: 100, durationMin: 75 },
  SOBRANCELHA:  { label: 'Sobrancelha',               price: 30, durationMin: 20 },
  ACABAMENTO:   { label: 'Acabamento',                price: 30, durationMin: 15 },
  CAB_SOBR:     { label: 'Cabelo + Sobrancelha',      price: 75, durationMin: 45 },
  BAR_SOBR:     { label: 'Barba + Sobrancelha',       price: 70, durationMin: 45 },
};
const SERVICE_LIST = Object.entries(SERVICES).map(([key, v]) => ({ key, ...v }));

// ====== FERIADOS / FECHAMENTOS ======
const HOLIDAYS_ONCE = new Set([
  // '2025-12-24', '2025-12-31',
]);
const HOLIDAYS_ANNUAL = new Set([
  '01-01','04-21','05-01','09-07','10-12','11-02','11-15','12-25'
]);
const EXTRA_CLOSED_DATES = new Set([
  // '2025-11-10',
]);
// (Opcional) meio-expediente por data específica
const SPECIAL_HOURS = {
  // '2025-12-24': { openMin: 9*60, closeMin: 13*60 },
};

// ====== UTILS ======
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function hasLocationIntent(s = '') {
  const t = String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return t.includes('localizacao') || t.includes('endereco') || t.includes('onde fica') || t.includes('localiza');
}
function hojeInfo() {
  const now = new Date();
  const dias = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  const dd = String(now.getDate()).padStart(2,'0');
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  const dia = dias[now.getDay()];
  return { data: `${dd}/${mm}/${yyyy}`, dia, now };
}
function toDateKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function formatDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function ddmmyyyyToDate(ddmmyyyy) {
  const [dd, mm, yyyy] = String(ddmmyyyy).split('/').map(Number);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}
function minutesToHM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function ceilToNextStep(totalMin, step = 30) {
  return Math.ceil(totalMin / step) * step;
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function isHoliday(dateObj) {
  const ymd = toDateKey(dateObj);
  if (HOLIDAYS_ONCE.has(ymd)) return true;
  if (EXTRA_CLOSED_DATES.has(ymd)) return true;
  const mm = String(dateObj.getMonth() + 1).padStart(2,'0');
  const dd = String(dateObj.getDate()).padStart(2,'0');
  const md = `${mm}-${dd}`;
  return HOLIDAYS_ANNUAL.has(md);
}
function getOpeningHours(dateObj) {
  if (isHoliday(dateObj)) return null;
  const ymd = toDateKey(dateObj);
  if (SPECIAL_HOURS[ymd]) return SPECIAL_HOURS[ymd];
  const dow = dateObj.getDay(); // 0 dom ... 6 sáb
  if (dow >= 2 && dow <= 5) return { openMin: 9*60, closeMin: 19*60 };
  if (dow === 6)            return { openMin: 8*60, closeMin: 16*60 };
  return null; // dom/seg fechado
}
function computeAvailableSlots({ dateObj, serviceDurationMin, step = 30, bufferTodayMin = 30 }) {
  const oh = getOpeningHours(dateObj);
  if (!oh) return [];

  let startMin = oh.openMin;
  const endMin = oh.closeMin;
  const now = new Date();
  const sameDay = dateObj.toDateString() === now.toDateString();

  if (sameDay) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    startMin = Math.max(startMin, ceilToNextStep(nowMin + bufferTodayMin, step));
  }

  const dayKey = toDateKey(dateObj);
  const dayBookings = bookings[dayKey] || [];
  const slots = [];

  for (let s = ceilToNextStep(startMin, step); s + serviceDurationMin <= endMin; s += step) {
    const e = s + serviceDurationMin;
    if (dayBookings.every(b => !overlaps(s, e, b.start, b.end))) {
      slots.push({ start: s, end: e });
    }
  }

  return slots;
}

// === Anti-duplicação de respostas ===
async function replyUnique(msg, text) {
  const last = lastResponseByUser.get(msg.from);
  if (last && last === text) {
    return false; // não envia repetida
  }
  await msg.reply(text);
  lastResponseByUser.set(msg.from, text);
  return true;
}
async function sendStateTyping(chat, ms=500){ try{ await chat.sendStateTyping(); await delay(ms);}catch{} }

// ===== Menu interativo (List) + fallback texto “bonito” =====
function buildPrettyMenuText(name) {
  const { data, dia } = hojeInfo();
  const first = (name || 'cliente').split(' ')[0];

  return (
`*${BUSINESS.name}* 💈

👋 Olá, *${first}!*
📆 Hoje: *${data}* (${dia})
⏰ Funcionamento:
   • Ter–Sex: 09:00–19:00
   • Sáb: 08:00–16:00
   • Dom/Seg: Fechado

━━━━━━━━━━━━━━━━━━━━
*Escolha uma opção:*
1) Como funciona o atendimento
2) Ver valores dos serviços
3) Quais os diferenciais
4) Quero agendar
5) Falar com um atendente humano
📍 Digite "localização" para ver o endereço
━━━━━━━━━━━━━━━━━━━━

Dica: você também pode responder só com o número 😉`
  );
}

function buildMenuOptions() {
  return [
    { id: 'opt_1', title: '1 • Como funciona o atendimento' },
    { id: 'opt_2', title: '2 • Ver valores dos serviços' },
    { id: 'opt_3', title: '3 • Quais os diferenciais' },
    { id: 'opt_4', title: '4 • Quero agendar' },
    { id: 'opt_5', title: '5 • Falar com um atendente humano' },
    { id: 'opt_loc', title: '📍 Ver localização' },
  ];
}

async function sendMainMenu(msg, name) {
  try {
    const sections = [{ title: 'Como posso ajudar?', rows: buildMenuOptions() }];
    const list = new List(
      'Toque para escolher uma opção:',
      'Abrir menu',
      sections,
      'Barbearia Sr. Justini 💈',
      'Você também pode digitar o número da opção.'
    );
    await msg.reply(list);
    lastResponseByUser.set(msg.from, '__MENU_LIST__');
    return true;
  } catch (e) {
    const text = buildPrettyMenuText(name);
    return replyUnique(msg, text);
  }
}

// ====== API ======
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: {
      connected: botState.connected,
      authenticated: botState.authenticated,
      messages: botState.messages,
      lastActivity: botState.lastActivity,
    },
  });
});
app.get('/api/status', (req, res) => {
  res.json({ ...botState, uptimeSeconds: Math.floor((new Date() - botState.uptime) / 1000) });
});
app.get('/api/slots', (req, res) => {
  try {
    const { date, service } = req.query;
    if (!date || !service) return res.status(400).json({ error: 'date e service são obrigatórios' });
    const serviceDef = SERVICES[String(service).toUpperCase()];
    if (!serviceDef) return res.status(400).json({ error: 'service inválido' });
    const dateObj = ddmmyyyyToDate(date);
    if (!dateObj) return res.status(400).json({ error: 'date inválido (dd/mm/aaaa)' });

    const oh = getOpeningHours(dateObj);
    if (!oh) {
      return res.json({ date, service: serviceDef.label, durationMin: serviceDef.durationMin, slots: [], closed: true });
    }
    const slots = computeAvailableSlots({ dateObj, serviceDurationMin: serviceDef.durationMin });
    res.json({
      date,
      service: serviceDef.label,
      durationMin: serviceDef.durationMin,
      slots: slots.map(s => ({ start: minutesToHM(s.start), end: minutesToHM(s.end) })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/bookings', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date é obrigatório' });
  const dateObj = ddmmyyyyToDate(date);
  if (!dateObj) return res.status(400).json({ error: 'date inválido (dd/mm/aaaa)' });
  const key = toDateKey(dateObj);
  const day = bookings[key] || [];
  day.sort((a,b) => a.start - b.start);
  res.json({
    date,
    bookings: day.map(b => ({
      time: `${minutesToHM(b.start)}–${minutesToHM(b.end)}`,
      service: b.serviceLabel,
      client: b.client,
      phone: b.phone,
    })),
  });
});
app.get('/api/session-path', (req, res) => {
  res.json({ AUTH_DATA_PATH, AUTH_CLIENT_ID, SESSION_DIR, exists: fs.existsSync(SESSION_DIR) });
});
app.post('/api/connect', (req, res) => {
  if (!client) { initializeBot(); return res.json({ success: true, message: 'Conectando bot...' }); }
  return res.json({ success: false, message: 'Bot já iniciado.' });
});
app.post('/api/disconnect', async (req, res) => {
  try {
    if (client) {
      await client.destroy(); client = null;
      botState.connected = false; botState.authenticated = false;
      return res.json({ success: true, message: 'Bot desconectado.' });
    }
    return res.json({ success: false, message: 'Bot não está conectado.' });
  } catch (e) { return res.json({ success: false, message: 'Erro ao desconectar: ' + e.message }); }
});

// ===== (Opcional) Motor de resposta inteligente (DESLIGADO por padrão) =====
function responderCliente(mensagem, cliente) {
  const texto = mensagem.toLowerCase().trim();
  const agora = new Date();
  const linkAgendamento = `https://barbearia.com/agendar/${cliente.id}`;

  const temAgendamento = Boolean(cliente.temAgendamentoConfirmado);
  const ultimoContato = cliente.ultimaMensagem ? new Date(cliente.ultimaMensagem) : null;

  // Cliente já tem agendamento
  if (temAgendamento) {
    if (texto.includes("cancelar")) {
      return "✅ Seu agendamento foi cancelado com sucesso.";
    }
    if (texto.includes("falar com atendente")) {
      return "📞 Conectando com um atendente. Aguarde um momento...";
    }
    if (texto.includes("atraso") || texto.includes("vou me atrasar") || texto.includes("atrasado")) {
      return "⏰ Sem problemas! Lembre-se que toleramos até *15 minutos* de atraso.";
    }
    return `📅 Você já tem um agendamento confirmado.  
Se precisar, digite *\"cancelar\"*.  
Se for atrasar, lembramos que só toleramos até *15 minutos*.  
Ou se quiser falar com um atendente, digite *\"falar com atendente\"*.`;
  }

  // Mensagem de retorno para inativos (exemplo: rodar em CRON externo)
  if (ultimoContato) {
    const diasSemContato = Math.floor((agora - ultimoContato) / (1000 * 60 * 60 * 24));
    const diaDoMes = agora.getDate();
    if (diasSemContato > 30 && diaDoMes === 15) {
      return `Olá ${cliente.nome}, já está na hora de voltar na barbearia pra alinhar seu visual 💈  
✂️ Agende seu horário digitando *\"menu\"* ou clicando aqui: ${linkAgendamento}`;
    }
  }

  // Cliente quer agendar
  if (["menu","agendar","horário","horario","quero cortar","quero marcar"].some(p => texto.includes(p))) {
    return `📌 Claro! Para agendar seu horário, clique aqui: ${linkAgendamento}`;
  }

  // Padrão
  return "Olá! Como posso te ajudar hoje? Digite *\"menu\"* para ver as opções.";
}

// ====== WHATSAPP BOT ======
function initializeBot() {
  if (client) return;

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "sr-justini-bot", // Identificador único para a sessão
      dataPath: '.wwebjs_auth'   // Caminho para os dados de autenticação
    }),
    puppeteer: {
      headless: true, // Executar em modo headless
      args: [
        '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
        '--disable-features=VizDisplayCompositor','--disable-extensions','--disable-plugins',
        '--no-first-run','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', // Caminho para o Chrome
      ignoreHTTPSErrors: true,
      slowMo: 10,
    },
    restartOnAuthFail: true, qrMaxRetries: 5, takeoverOnConflict: true, takeoverTimeoutMs: 0,
  });

  // Logs úteis p/ diagnóstico de sessão
  client.on('loading_screen', (percent, msg) => {
    console.log('⏳ Carregando:', percent, msg);
  });
  client.on('authenticated', () => {
    reconnectAttempts = 0; // Reseta as tentativas ao autenticar
    console.log('🔐 Sessão autenticada.');
  });
  client.on('qr', (qr) => {
    console.log('QR Code recebido:', qr);
  });

  client.on('ready', () => { botState.connected = true; botState.authenticated = true; console.log('✅ Bot WhatsApp conectado e pronto!'); });
  client.on('auth_failure', (msg) => {
    console.error('Falha de autenticação:', msg);
  });
  client.on('disconnected', (reason) => {
    console.log('Bot desconectado. Motivo:', reason);
    client.initialize(); // Reconecta automaticamente
  });

  client.on('message', async (msg) => {
    try {
      const chat = await msg.getChat();
      if (chat.isGroup || msg.fromMe) return;
      if (msg.type !== 'chat') return;

      const contact = await msg.getContact();
      if ((contact.isBusiness ?? false) || contact.isWAContact === false) return;

      const name = contact.pushname || 'cliente';
      const phone = contact.number || msg.from.replace('@c.us','');
      const body = (msg.body || '').trim();
      const lower = body.toLowerCase();
      const normalized = lower.replace(/\s*•.*/, ''); // "1 • ..." -> "1"

      botState.messages++;
      botState.lastActivity = new Date();

      // ===== PAUSADO? Só responde a "menu" =====
      if (pausedUsers.has(msg.from)) {
        if (lower === 'menu') {
          pausedUsers.delete(msg.from);
          conversation.delete(msg.from);
          lastResponseByUser.delete(msg.from);
          await sendStateTyping(chat, 600);
          await sendMainMenu(msg, name);
        }
        return;
      }

      // STRICT MENU
      if (STRICT_MENU) {
        const allowedOptions = ['menu','1','2','3','4','5'];
        const allowLocation = hasLocationIntent(body);
        const inFlow = conversation.has(msg.from);
        if (!(allowedOptions.includes(normalized) || allowLocation || inFlow)) {
          await replyUnique(msg, 'Não entendi. Digite "menu" para ver as opções.');
          return;
        }
      }

      // Localização
      if (hasLocationIntent(body)) {
        await sendStateTyping(chat, 600);
        await replyUnique(
          msg,
          '📍 *Nossa localização:*\n\n' +
          `🏪 ${BUSINESS.name}\n` +
          `📍 ${BUSINESS.address}\n\n` +
          '🚗 Fácil acesso e estacionamento!'
        );
        return;
      }

      // MENU
      if (lower === 'menu') {
        conversation.delete(msg.from);
        lastResponseByUser.delete(msg.from);
        await sendStateTyping(chat, 600);
        await sendMainMenu(msg, name);
        return;
      }

      // Opções simples (1,2,3)
      if (['1','2','3'].includes(normalized) && !conversation.has(msg.from)) {
        await sendStateTyping(chat, 600);
        let resp = '';
        if (normalized === '1') {
          resp =
            `🏪 *Como funciona o atendimento:*\n\n` +
            `✅ Agendamento via WhatsApp\n` +
            `✅ Confirmação automática\n` +
            `✅ Lembrete antes do horário\n` +
            `✅ Atendimento personalizado\n` +
            `✅ Ambiente climatizado\n\n` +
            `📱 É só escolher o serviço e horário que cuidamos do resto!\n\n` +
            `Digite *"menu"* para voltar às opções.`;
        } else if (normalized === '2') {
          const lines = SERVICE_LIST.map(s => `• ${s.label}: R$ ${s.price},00 (${s.durationMin} min)`).join('\n');
          resp =
            `💰 *Valores e durações:*\n\n${lines}\n\n` +
            `💳 Aceitamos dinheiro, cartão e PIX!\n\n` +
            `Digite *"menu"* para voltar às opções.`;
        } else if (normalized === '3') {
          resp =
            `⭐ *Nossos diferenciais:*\n\n` +
            `🏆 Mais de 10 anos de experiência\n` +
            `🔥 Produtos premium (Barba Brava, QOD)\n` +
            `❄️ Ambiente climatizado\n` +
            `📱 Agendamento online facilitado\n` +
            `⏰ Pontualidade e agilidade\n\n` +
            `Digite *"menu"* para voltar às opções.`;
        }
        await replyUnique(msg, resp);
        return;
      }

      // ===== Opção 5: Falar com atendente =====
      if (normalized === '5' && !conversation.has(msg.from)) {
        conversation.set(msg.from, { step: 'handoff_confirm' });
        await sendStateTyping(chat, 400);
        await replyUnique(
          msg,
          `Você quer falar com um *atendente humano* agora?\n` +
          `Responda *"sim"* para transferir e o bot irá *pausar*.\n` +
          `Para cancelar, digite *"menu"*.`
        );
        return;
      }

      // ====== FLUXO ======
      if (conversation.has(msg.from)) {
        const st = conversation.get(msg.from);

        // Handoff de atendente — confirmação
        if (st.step === 'handoff_confirm') {
          if (['sim','s','yes','y'].includes(lower)) {
            conversation.delete(msg.from);
            pausedUsers.add(msg.from);
            await sendStateTyping(chat, 400);
            await replyUnique(
              msg,
              `Perfeito! Vou te direcionar para um *atendente humano*.\n` +
              `Entre em contato pelo Instagram: *${BUSINESS.instagram}*\n\n` +
              `_Obs.: o bot ficará *pausado* até você enviar "menu"._`
            );
            return;
          }
          if (lower === 'menu') {
            conversation.delete(msg.from);
            await sendStateTyping(chat, 400);
            await sendMainMenu(msg, name);
            return;
          }
          await replyUnique(msg, 'Responda *"sim"* para transferir ao atendente, ou *"menu"* para voltar.');
          return;
        }

        // ====== Fluxo de agendamento ======
        if (st.step === 'service') {
          const idx = parseInt(normalized, 10);
          if (!Number.isFinite(idx) || idx < 1 || idx > SERVICE_LIST.length) {
            await replyUnique(msg, 'Por favor, envie o *número* do serviço listado, ou "menu" para sair.');
            return;
          }
          const chosen = SERVICE_LIST[idx - 1];
          st.serviceKey = chosen.key;
          st.serviceLabel = chosen.label;
          st.durationMin = chosen.durationMin;
          st.step = 'date';
          conversation.set(msg.from, st);
          await sendStateTyping(chat, 400);
          await replyUnique(
            msg,
            `Ótima escolha: *${chosen.label}* ✂️\n` +
            `Para que dia você quer agendar?\n` +
            `Envie: "hoje", "amanhã" ou uma data no formato *dd/mm/aaaa*.\n` +
            `Ex.: ${formatDDMMYYYY(new Date())}`
          );
          return;
        }

        if (st.step === 'date') {
          const now = new Date();
          let dateObj = null;
          if (lower === 'hoje') {
            dateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          } else if (lower === 'amanha' || lower === 'amanhã') {
            const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            t.setDate(t.getDate() + 1);
            dateObj = t;
          } else {
            dateObj = ddmmyyyyToDate(body);
          }

          if (!dateObj) {
            await replyUnique(msg, 'Data inválida. Envie "hoje", "amanhã" ou no formato *dd/mm/aaaa*.');
            return;
          }

          const oh = getOpeningHours(dateObj);
          if (!oh) {
            const reason = isHoliday(dateObj)
              ? '❌ Não abriremos neste dia (feriado/fechamento).'
              : '❌ Não funcionamos aos domingos e segundas-feiras.';
            await replyUnique(msg, `${reason}\n⏰ Ter–Sex: 09:00–19:00 | Sáb: 08:00–16:00`);
            return;
          }

          const onlyDate = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          const diffDays = Math.floor((onlyDate(dateObj) - onlyDate(now)) / 86400000);
          if (diffDays > 7) {
            await replyUnique(msg, '❌ Não fazemos agendamentos com mais de *7 dias* de antecedência.\nEscolha uma data mais próxima.');
            return;
          }

          st.dateObj = dateObj;
          st.step = 'slot';
          conversation.set(msg.from, st);

          const slots = computeAvailableSlots({ dateObj, serviceDurationMin: st.durationMin });
          if (slots.length === 0) {
            await replyUnique(msg, '😕 Não encontrei horários disponíveis para esse dia.\nTente outro dia, por favor.');
            return;
          }

          st.slots = slots.slice(0, 12);
          const lines = st.slots.map((s, i) => `${i + 1}. ${minutesToHM(s.start)} – ${minutesToHM(s.end)}`).join('\n');
          await sendStateTyping(chat, 400);
          await replyUnique(
            msg,
            `✅ Horários disponíveis em *${formatDDMMYYYY(dateObj)}*:\n\n${lines}\n\n` +
            `Envie o *número* do horário desejado ou "menu" para sair.`
          );
          return;
        }

        if (st.step === 'slot') {
          const idx = parseInt(normalized, 10);
          if (!Number.isFinite(idx) || !st.slots || idx < 1 || idx > st.slots.length) {
            await replyUnique(msg, 'Envie o *número* de um dos horários listados, ou "menu" para sair.');
            return;
          }
          const chosen = st.slots[idx - 1];
          st.chosenSlot = chosen;
          st.step = 'confirm';
          conversation.set(msg.from, st);

          await sendStateTyping(chat, 400);
          await replyUnique(
            msg,
            `Confirma o agendamento de *${st.serviceLabel}* para *${minutesToHM(chosen.start)}* ` +
            `no dia *${formatDDMMYYYY(st.dateObj)}*?\n\nResponda "sim" para confirmar ou "menu" para sair.`
          );
          return;
        }

        if (st.step === 'confirm') {
          if (['sim','s','yes','y'].includes(lower)) {
            const key = toDateKey(st.dateObj);
            const day = bookings[key] || [];
            const s = st.chosenSlot.start;
            const e = st.chosenSlot.end;
            const overlappingCount = day.filter(b => overlaps(s, e, b.start, b.end)).length;
            if (overlappingCount >= MAX_CONCURRENT_BOOKINGS) {
              conversation.delete(msg.from);
              await replyUnique(
                msg,
                'Ops! Esse horário acabou de ficar indisponível (capacidade máxima atingida). 😕\n' +
                'Digite *"4"* para recomeçar o agendamento.'
              );
              return;
            }
            day.push({ start: s, end: e, serviceKey: st.serviceKey, serviceLabel: st.serviceLabel, client: name, phone });
            day.sort((a,b) => a.start - b.start);
            bookings[key] = day;
            conversation.delete(msg.from);

            await sendStateTyping(chat, 400);
            await replyUnique(
              msg,
              `🎉 *Agendamento confirmado!*\n\n` +
              `👤 Cliente: ${name}\n` +
              `📱 Telefone: ${phone}\n` +
              `✂️ Serviço: ${st.serviceLabel}\n` +
              `🗓️ Data: ${formatDDMMYYYY(st.dateObj)}\n` +
              `⏰ Horário: ${minutesToHM(s)}–${minutesToHM(e)}\n\n` +
              `📍 ${BUSINESS.address}\n` +
              `Qualquer dúvida, chame aqui. Até breve!`
            );
            return;
          }
          if (lower === 'menu') {
            conversation.delete(msg.from);
            await sendStateTyping(chat, 400);
            await sendMainMenu(msg, name);
            return;
          }
          await replyUnique(msg, 'Responda "sim" para confirmar ou "menu" para sair.');
          return;
        }
      }

      // Entrada no fluxo de agendamento (4)
      if (normalized === '4' && !conversation.has(msg.from)) {
        conversation.set(msg.from, { step: 'service' });
        await sendStateTyping(chat, 500);
        const servicesText = SERVICE_LIST.map((s, i) => `${i + 1}. ${s.label} — R$ ${s.price},00 (${s.durationMin} min)`).join('\n');
        await replyUnique(
          msg,
          `📅 *Vamos agendar!*\n` +
          `Qual serviço deseja?\n\n${servicesText}\n\n` +
          `Envie o *número* do serviço. (ou digite "menu" para sair)`
        );
        return;
      }

      // ===== (Opcional) Motor de resposta inteligente (somente se habilitado) =====
      if (String(process.env.ENABLE_INTEL_RESPONSE || '').toLowerCase() === 'true') {
        const cliente = {
          id: msg.from,
          nome: name,
          // Integra com sua agenda real quando houver (aqui, default false)
          temAgendamentoConfirmado: false,
          ultimaMensagem: new Date(),
        };
        const tentativa = responderCliente(body, cliente);
        if (tentativa) {
          await sendStateTyping(chat, 400);
          await replyUnique(msg, tentativa);
          return;
        }
      }

      // Padrão: chama o menu
      await sendStateTyping(chat, 400);
      await sendMainMenu(msg, name);

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error.message);
      try { await replyUnique(msg, 'Ops! Tive um problema ao processar sua mensagem. Tente novamente ou digite *"menu"*.'); } catch {}
    }
  });

  client.initialize();
}

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando em http://localhost:${PORT}`);
  console.log('Para conectar o bot manualmente: POST /api/connect');
});

// Encerramento limpo (PM2/systemd)
process.on('SIGTERM', async () => {
  try { if (client) await client.destroy(); } catch {}
  process.exit(0);
});
process.on('SIGINT', async () => {
  try { if (client) await client.destroy(); } catch {}
  process.exit(0);
});

// Inicia automático após 2s (reutilizando sessão se existir)
setTimeout(() => { initializeBot(); }, 2000);

console.log('🚀 Bot Server iniciado (menu interativo + agenda + feriados + capacidade + pausa de atendente)!'); // corrige: comentário válido
