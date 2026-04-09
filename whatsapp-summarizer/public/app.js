// Login and Navigation Logic
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const loginFeedback = document.getElementById('login-feedback');
const passwordInput = document.getElementById('login-password');

if (sessionStorage.getItem('logged_in') === 'true') {
  loginOverlay.style.display = 'none';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginFeedback.style.display = 'none';

  const password = passwordInput.value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    
    if (res.ok) {
      sessionStorage.setItem('logged_in', 'true');
      loginOverlay.style.display = 'none';
    } else {
      loginFeedback.style.display = 'block';
    }
  } catch (err) {
    loginFeedback.innerText = 'Erro ao conectar. Tente novamente.';
    loginFeedback.style.display = 'block';
  }
});

const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(`view-${btn.dataset.target}`).classList.add('active');
  });
});

// Elements
const statusIndicator = document.getElementById('status-indicator');
const statusDot = statusIndicator.querySelector('.status-dot');
const statusText = document.getElementById('status-text');

const qrImage = document.getElementById('qr-image');
const qrLoader = document.getElementById('qr-loader');
const qrHelper = document.getElementById('qr-helper');
const waConnectedMsg = document.getElementById('wa-connected-msg');

const formConfig = document.getElementById('form-config');
const configFeedback = document.getElementById('config-feedback');
const summaryFeedback = document.getElementById('summary-feedback');

// State
let lastState = '';

// Check API status periodically
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    
    updateUI(data.status, data.qr);
  } catch (err) {
    console.error("Error fetching status:", err);
    updateUI('disconnected');
  }
}

function updateUI(status, qrDataUrl) {
  if (lastState !== status) {
    lastState = status;
    statusDot.className = 'status-dot'; // reset
    
    if (status === 'connected') {
      statusDot.classList.add('connected');
      statusText.innerText = 'Conectado';
      
      qrImage.style.display = 'none';
      qrLoader.style.display = 'none';
      qrHelper.style.display = 'none';
      waConnectedMsg.style.display = 'block';
    } 
    else if (status === 'qr') {
      statusDot.classList.add('waiting');
      statusText.innerText = 'Aguardando QR Code';
      
      waConnectedMsg.style.display = 'none';
      qrLoader.style.display = 'none';
      
      if (qrDataUrl) {
        qrImage.src = qrDataUrl;
        qrImage.style.display = 'block';
        qrHelper.style.display = 'block';
      } else {
        qrLoader.style.display = 'block';
        qrLoader.innerText = 'Buscando QR Code...';
      }
    } 
    else {
      statusDot.classList.add('disconnected');
      statusText.innerText = 'Desconectado / Iniciando...';
      
      qrImage.style.display = 'none';
      qrHelper.style.display = 'none';
      waConnectedMsg.style.display = 'none';
      qrLoader.style.display = 'block';
      qrLoader.innerText = 'Iniciando WhatsApp...';
    }
  } else if (status === 'qr' && qrDataUrl && qrImage.src !== qrDataUrl) {
    // Se o QR atualizar (rotatividade do wwebjs)
    qrImage.src = qrDataUrl;
    qrImage.style.display = 'block';
    qrLoader.style.display = 'none';
  }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    
    document.getElementById('groupName').value = data.groupName || '';
    document.getElementById('phoneNumber').value = data.phoneNumber || '';
    document.getElementById('openAiKey').value = data.openAiKey || '';
    document.getElementById('openAiUrl').value = data.openAiUrl || '';
    document.getElementById('openAiModel').value = data.openAiModel || '';
  } catch (err) {
    console.error('Failed to load config', err);
  }
}

formConfig.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    groupName: document.getElementById('groupName').value,
    phoneNumber: document.getElementById('phoneNumber').value,
    openAiKey: document.getElementById('openAiKey').value,
    openAiUrl: document.getElementById('openAiUrl').value,
    openAiModel: document.getElementById('openAiModel').value
  };

  configFeedback.innerText = 'Salvando...';
  configFeedback.style.color = 'var(--text-muted)';
  
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      configFeedback.innerText = 'Configurações salvas e aplicadas no bot!';
      configFeedback.style.color = 'var(--primary-dark)';
    } else {
      configFeedback.innerText = 'Erro ao salvar.';
      configFeedback.style.color = 'var(--danger)';
    }
  } catch (err) {
    configFeedback.innerText = 'Erro de rede.';
  }
});

async function triggerSummary(period) {
  summaryFeedback.innerText = 'Enviando comando para o bot...';
  summaryFeedback.style.color = 'var(--text-muted)';
  
  try {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period })
    });
    
    if (res.ok) {
      summaryFeedback.innerText = 'Rotina de resumo iniciada! Verifique o WhatsApp ou console.';
      summaryFeedback.style.color = 'var(--primary-dark)';
    } else {
      summaryFeedback.innerText = 'Erro ao iniciar.';
      summaryFeedback.style.color = 'var(--danger)';
    }
  } catch (err) {
    summaryFeedback.innerText = 'Erro de rede.';
  }
}

async function logoutWhatsApp() {
  if (confirm('Tem certeza que deseja desconectar o WhatsApp? Será necessário ler o QR Code novamente.')) {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  }
}

// Init
loadConfig();
setInterval(checkStatus, 3000);
checkStatus();

// Aba de Histórico de Resumos
async function loadSummariesHistory() {
  const container = document.getElementById('summaries-list');
  container.innerHTML = '<span class="loader">Carregando histórico...</span>';
  
  try {
    const res = await fetch('/api/summaries');
    const data = await res.json();
    
    if (data.length === 0) {
      container.innerHTML = '<p class="text-muted">Nenhum resumo gerado ainda.</p>';
      return;
    }
    
    container.innerHTML = '';
    data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '15px';
      
      const dateStr = new Date(item.date).toLocaleString('pt-BR');
      
      card.innerHTML = `
        <h3 style="font-size: 1.1rem; margin-bottom: 8px; color: var(--primary-dark);">Resumo (${item.period}) - ${dateStr}</h3>
        <pre style="white-space: pre-wrap; font-family: inherit; font-size: 0.95rem; line-height: 1.5; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #eee;">${item.text}</pre>
        <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText); this.innerText='Copiado!'; setTimeout(()=>this.innerText='Copiar Resumo', 2000)" style="margin-top: 10px; font-size: 0.8rem; padding: 6px 12px;">Copiar Resumo</button>
      `;
      container.appendChild(card);
    });
    
  } catch (err) {
    container.innerHTML = '<p class="text-muted" style="color: var(--danger);">Erro ao carregar o histórico. Verifique se o backend está rodando e tente novamente.</p>';
  }
}

// Ao clicar na aba de resumos, carregar a primeira vez
document.querySelector('[data-target="resumos"]').addEventListener('click', loadSummariesHistory);
