require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const cron = require('node-cron');
const { WhatsAppBot } = require('./bot');
const pino = require('pino');

// Servidor Express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PORT = 3000;
const SESSION_DIR = './auth_info';
const CONFIG_FILE = path.join(__dirname, '../config.json');
const SUMMARIES_FILE = path.join(__dirname, '../summaries.json');

// Global State
let connectionStatus = 'disconnected'; // 'disconnected', 'qr', 'connected'
let currentQR = null;
let sock = null;
let activeBot = null;
let reconnectAttempts = 0;

// Carregar Configurações
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (err) {
      console.error('Erro ao ler config.json:', err);
    }
  }
  return {
    groupName: process.env.GROUP_NAME || '',
    phoneNumber: process.env.YOUR_PHONE_NUMBER || '',
    openAiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
    openAiUrl: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
    openAiModel: process.env.OPENAI_MODEL || 'qwen/qwen3.6-plus:free',
  };
}

function saveConfig(newConfig) {
  const current = loadConfig();
  const updated = { ...current, ...newConfig };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  
  if (activeBot) {
    activeBot.updateConfig(updated);
  }
}

// Histórico de Resumos
function loadSummaries() {
  if (fs.existsSync(SUMMARIES_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SUMMARIES_FILE, 'utf8'));
    } catch(err) {}
  }
  return [];
}

function saveSummary(summaryData) {
  const summaries = loadSummaries();
  summaries.unshift(summaryData); // Mais recentes primeiro
  if (summaries.length > 50) summaries.pop(); // Mantém os 50 últimos
  fs.writeFileSync(SUMMARIES_FILE, JSON.stringify(summaries, null, 2));
}

const logger = pino({ level: 'fatal' });

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n📡 Iniciando WhatsApp Web v${version.join('.')}`);
  connectionStatus = 'disconnected';
  currentQR = null;

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: true // mantido por debug
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'qr';
      currentQR = await qrcode.toDataURL(qr);
      console.log('🔗 QR Code gerado! Abra o painel web (localhost:3000) para ler.');
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      currentQR = null;
      activeBot = null;
      
      const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : null;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Sessão encerrada ou deslogada pelo celular. Removendo credenciais...');
        // Apaga a pasta auth_info e reinicia
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        // Recomeça limpo
        setTimeout(connectToWhatsApp, 2000);
      } else {
        console.log(`🔄 Reconectando... Motivo: ${statusCode}`);
        reconnectAttempts++;
        setTimeout(connectToWhatsApp, 2000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      currentQR = null;
      reconnectAttempts = 0;
      console.log('✅ WhatsApp conectado com sucesso!');
      
      const config = loadConfig();
      if (!config.groupName || !config.phoneNumber) {
        console.log('⚠️ Aviso: Grupo Alvo ou Seu Número não estão configurados! Abra o Painel para configurar.');
      }
      
      activeBot = new WhatsAppBot(sock, config);
      activeBot.onSummaryGenerated = (summaryText, period) => {
        saveSummary({ 
          period, 
          text: summaryText, 
          date: new Date().toISOString() 
        });
      };
      await activeBot.start();
    }
  });
}

// ---------------- CRON JOBS ----------------
cron.schedule('0 13 * * *', () => {
  if (activeBot && connectionStatus === 'connected') {
    activeBot.sendSummary('almoço');
  }
}, { timezone: 'America/Sao_Paulo' });

cron.schedule('0 20 * * *', () => {
  if (activeBot && connectionStatus === 'connected') {
    activeBot.sendSummary('noite');
  }
}, { timezone: 'America/Sao_Paulo' });

console.log('⏰ Rotinas automáticas de resumo (13:00 e 20:00) estão ativas e blindadas no servidor!');

// ---------------- API ROUTES ----------------

// 1. Status Connection & QR
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qr: currentQR
  });
});

// 2. Load Configs
app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

// 3. Save Configs
app.post('/api/config', (req, res) => {
  try {
    saveConfig(req.body);
    res.json({ success: true, message: 'Configurações atualizadas' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Trigger Summary Manually
app.post('/api/summarize', async (req, res) => {
  if (!activeBot || connectionStatus !== 'connected') {
    return res.status(400).json({ error: 'Bot offline ou não configurado' });
  }
  
  const { period } = req.body;
  try {
    // Roda assíncrono para liberar o request logo
    activeBot.sendSummary(period || 'manual');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Histórico de Resumos
app.get('/api/summaries', (req, res) => {
  res.json(loadSummaries());
});

// 6. Logout / Disconnect route
app.post('/api/logout', async (req, res) => {
  if (sock) {
    console.log('Desconectando via Web...');
    sock.logout('user requested');
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Nao ha sessao ativa.' });
  }
});

// 7. Login
app.post('/api/login', (req, res) => {
  const adminPassword = process.env.PANEL_PASSWORD || 'admin';
  if (req.body.password === adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Senha incorreta' });
  }
});

app.listen(PORT, () => {
  console.log(`\n================================`);
  console.log(`🌐 Painel Web do Bot de Resumo`);
  console.log(` Acesse: http://localhost:${PORT}`);
  console.log(`================================`);
  
  // Inicia conexao Whatsapp
  connectToWhatsApp();
});
