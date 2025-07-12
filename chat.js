// ==================== BASE URL DETECTION INTELLIGENTE ====================
function getBaseURL() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  
  console.log('🔍 Detecting base URL...', { hostname, pathname });
  
  // Localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  
  // Custom domain con subdirectory
  if (hostname === 'assistente-digitale.it') {
    return 'https://assistente-digitale.it';
  }
  
  // Render domain diretto
  if (hostname.includes('onrender.com')) {
    return `https://${hostname}`;
  }
  
  // Fallback
  return window.location.origin;
}

const BASE_URL = getBaseURL();
console.log('🌐 BASE_URL configurato:', BASE_URL);

// ==================== GLOBAL VARIABLES ====================
let studioInfo = {};
let conversationState = {
  sessionId: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
  currentFlow: null,
  flowData: {},
  tokenCount: 0,
  maxTokens: 8000
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('🚀 Chat.js inizializzazione...');
    await loadCompanyInfo();
    await showWelcomeMessage();
    await loadSessionInfo();
    console.log('✅ Chat.js inizializzato correttamente');
  } catch (error) {
    console.error('❌ Errore inizializzazione chat:', error);
  }
});

async function loadCompanyInfo() {
  try {
    console.log('📡 Caricamento dati via API...');
    const response = await fetch(`${BASE_URL}/api/company-info`, {
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API failed: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }
    
    studioInfo = await response.json();
    console.log('✅ Dati studio caricati via API');
  } catch (error) {
    console.error('❌ Errore caricamento dati:', error);
    // Fallback minimo per evitare crash
    studioInfo = {
      studio: {
        nome: 'Studio Dentistico Demo',
        telefono: '+39 123 456 7890',
        email: 'info@studiodemo.it'
      }
    };
  }
}

async function loadSessionInfo() {
  try {
    console.log('📊 Caricamento info sessione...');
    const response = await fetch(`${BASE_URL}/api/session-info`, {
      headers: {
        'x-session-id': conversationState.sessionId,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Session API failed: ${response.status}`);
    }
    
    const sessionInfo = await response.json();
    
    conversationState.tokenCount = sessionInfo.tokenCount || 0;
    conversationState.maxTokens = sessionInfo.maxTokens || 8000;
    conversationState.currentFlow = sessionInfo.currentFlow || null;
    conversationState.flowData = sessionInfo.flowData || {};
    
    console.log('📊 Info sessione caricate (nascosto da UI)');
  } catch (error) {
    console.error('❌ Errore caricamento sessione:', error);
    // Continua con valori default
    conversationState.tokenCount = 0;
    conversationState.maxTokens = 8000;
  }
}

async function showWelcomeMessage() {
  const studioNome = studioInfo.studio?.nome || 'Studio Dentistico Demo';
  const welcomeMsg = `👋 Ciao! Sono l'assistente digitale di <strong>${studioNome}</strong>.<br>Come posso aiutarti oggi?`;
  await appendMessage('bot', welcomeMsg);
  
  // Delay prima di mostrare le opzioni
  setTimeout(showQuickOptions, 2000);
}

async function showQuickOptions() {
  const quickOptions = `
    <div class="quick-options" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
      <button class="chat-option-btn" data-action="preventivo">💰 Richiedere Preventivo</button>
      <button class="chat-option-btn" data-action="orari">⏰ Orari di Apertura</button>
      <button class="chat-option-btn" data-action="prenotazione">📅 Richiedi / Modifica Appuntamento</button>
      <button class="chat-option-btn" data-action="info">ℹ️ Richiedi Informazioni</button>
      <button class="chat-option-btn" data-action="offerte">🎁 Offerta Speciale</button>
    </div>
  `;
  
  await appendMessage('bot', quickOptions);
  setupOptionButtonListeners();
}

function setupOptionButtonListeners() {
  setTimeout(() => {
    document.querySelectorAll('.chat-option-btn[data-action]').forEach(btn => {
      if (!btn.hasAttribute('data-listener-added')) {
        btn.setAttribute('data-listener-added', 'true');
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          const action = this.getAttribute('data-action');
          handleQuickAction(action);
        });
      }
    });
  }, 100);
}

async function handleQuickAction(action) {
  const actionMessages = {
    'preventivo': 'Vorrei richiedere un preventivo personalizzato',
    'orari': 'Quali sono gli orari di apertura dello studio?',
    'prenotazione': 'Vorrei prenotare un appuntamento',
    'info': 'Vorrei informazioni generali sullo studio',
    'offerte': 'Ci sono offerte speciali attive?'
  };
  
  if (actionMessages[action]) {
    await appendMessage('user', actionMessages[action]);
    disableQuickOptions();
    
    const response = await sendToAI(actionMessages[action]);
    await appendMessage('bot', response.response);
    
    updateSessionState(response);
  }
}

function disableQuickOptions() {
  document.querySelectorAll('.chat-option-btn').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });
}

// ==================== MAIN CHAT FUNCTION ====================
async function sendMessage() {
  const input = document.getElementById('user-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  input.value = '';
  await appendMessage('user', message);
  
  const response = await sendToAI(message);
  await appendMessage('bot', response.response);
  
  updateSessionState(response);
}

// ==================== AI COMMUNICATION ====================
async function sendToAI(message) {
  try {
    await showTypingIndicator();
    
    console.log('🤖 Invio messaggio al server...');
    
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': conversationState.sessionId,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        message: message
      })
    });
    
    if (!response.ok) {
      throw new Error(`Chat API failed: ${response.status} ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Invalid response content type: ${contentType}`);
    }
    
    const data = await response.json();
    
    // Gestione limiti raggiunti
    if (data.limitReached || data.chatLimitReached || data.newChatStarted) {
      return {
        response: data.response + `
          <div class="limit-reached-container" style="margin-top: 15px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; text-align: center; animation: slideInUp 0.3s ease-out;">
            <button onclick="resetSession()" class="elegant-reset-btn" style="
              background: linear-gradient(135deg, #4CAF50, #45a049);
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 25px;
              cursor: pointer;
              font-size: 16px;
              font-weight: 600;
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
              text-decoration: none;
              display: inline-block;
              min-width: 140px;
              text-align: center;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(76, 175, 80, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(76, 175, 80, 0.3)'">
              🔄 Nuova Chat
            </button>
          </div>
        `,
        limitReached: true
      };
    }
    
    // Log solo in console per debug, non mostrare all'utente
    console.log('✅ Risposta AI ricevuta');
    console.log('📊 Token usati:', data.tokensUsed || 'N/A');
    console.log('💰 Costo chiamata:', data.costInfo?.thisCall?.toFixed(4) || 'N/A');
    console.log('📈 Token totali:', data.totalTokens || 'N/A');
    console.log('💳 Costo chat corrente:', data.costInfo?.currentChatCost?.toFixed(4) || 'N/A');
    console.log('💰 Budget rimanente:', data.costInfo?.remainingBudget?.toFixed(4) || 'N/A');
    
    return data;
    
  } catch (error) {
    console.error('❌ Errore chiamata AI:', error);
    return {
      response: `🤖 Mi dispiace, sto avendo problemi tecnici.<br>📞 Per assistenza immediata chiama: <strong>${studioInfo.studio?.telefono || '+39 123 456 7890'}</strong>`,
      error: true
    };
  }
}

function updateSessionState(response) {
  // Aggiorna stato sessione
  if (response.totalTokens) {
    conversationState.tokenCount = response.totalTokens;
  }
  if (response.currentFlow) {
    conversationState.currentFlow = response.currentFlow;
  }
  if (response.flowData) {
    conversationState.flowData = response.flowData;
  }
  
  // Log dettagliato solo in console per debug
  if (response.costInfo) {
    console.log('💰 Costo info dettagliato:', response.costInfo);
  }
  
  if (response.chatInfo) {
    console.log('💬 Chat info dettagliato:', response.chatInfo);
  }
  
  // Setup GDPR button se presente nella risposta
  if (response.response && response.response.includes('gdpr-accept-btn')) {
    setTimeout(() => setupGDPRButtons(), 500);
  }
}

// ==================== SESSION MANAGEMENT ====================
async function resetSession() {
  try {
    console.log('🔄 Resetting session...');
    
    await fetch(`${BASE_URL}/api/reset-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': conversationState.sessionId
      }
    });
    
    // Pulisci chat desktop
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.innerHTML = '';
    }
    
    // Pulisci chat mobile se esiste
    const mobileChatBody = document.getElementById('chat-mobile-body');
    if (mobileChatBody) {
      mobileChatBody.innerHTML = '';
    }
    
    // Reset stato conversazione
    conversationState.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    conversationState.tokenCount = 0;
    conversationState.currentFlow = null;
    conversationState.flowData = {};
    
    // Mostra nuovo messaggio di benvenuto
    await showWelcomeMessage();
    
    console.log('✅ Sessione resettata - nuova chat iniziata');
    
  } catch (error) {
    console.error('❌ Errore reset sessione:', error);
    
    // Fallback: reset locale anche se API fallisce
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.innerHTML = '';
    }
    
    conversationState.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    conversationState.tokenCount = 0;
    conversationState.currentFlow = null;
    conversationState.flowData = {};
    
    await showWelcomeMessage();
  }
}

// ==================== MESSAGE MANAGEMENT ====================
async function appendMessage(type, message) {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;
  
  // Rimuovi typing indicator se presente
  const typingIndicator = chatBody.querySelector('.typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.innerHTML = message;
  
  chatBody.appendChild(messageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
  
  // Sync con mobile se aperto
  if (window.mobileChat?.isOpen) {
    syncToMobile(type, message);
  }
  
  // Setup dynamic listeners
  setTimeout(() => {
    setupDynamicButtonListeners(messageDiv);
  }, 100);
}

async function showTypingIndicator() {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;
  
  const typing = document.createElement('div');
  typing.className = 'message bot typing-indicator';
  typing.innerHTML = `
    <div class="typing-animation">
      <span></span><span></span><span></span>
    </div>
  `;
  
  chatBody.appendChild(typing);
  chatBody.scrollTop = chatBody.scrollHeight;
  
  // Delay realistico
  await new Promise(resolve => setTimeout(resolve, 1000));
}

function syncToMobile(type, message) {
  const mobileChatBody = document.getElementById('chat-mobile-body');
  if (mobileChatBody) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = message;
    
    mobileChatBody.appendChild(messageDiv);
    mobileChatBody.scrollTop = mobileChatBody.scrollHeight;
    
    setTimeout(() => {
      setupDynamicButtonListeners(messageDiv);
    }, 100);
  }
}

// ==================== DYNAMIC BUTTON HANDLERS ====================
function setupDynamicButtonListeners(container) {
  // GDPR buttons
  const gdprButtons = container.querySelectorAll('#gdpr-accept-btn, .gdpr-consent-btn');
  gdprButtons.forEach(btn => {
    if (!btn.hasAttribute('data-listener-added')) {
      btn.setAttribute('data-listener-added', 'true');
      btn.addEventListener('click', handleGDPRConsent);
    }
  });
  
  // Reset buttons
  const resetButtons = container.querySelectorAll('.elegant-reset-btn');
  resetButtons.forEach(btn => {
    if (!btn.hasAttribute('data-listener-added')) {
      btn.setAttribute('data-listener-added', 'true');
      btn.addEventListener('click', resetSession);
    }
  });
  
  // Option buttons
  const optionButtons = container.querySelectorAll('.chat-option-btn[data-action]');
  optionButtons.forEach(btn => {
    if (!btn.hasAttribute('data-listener-added')) {
      btn.setAttribute('data-listener-added', 'true');
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const action = this.getAttribute('data-action');
        handleQuickAction(action);
      });
    }
  });
}

function setupGDPRButtons() {
  setTimeout(() => {
    const gdprButtons = document.querySelectorAll('#gdpr-accept-btn, .gdpr-consent-btn');
    gdprButtons.forEach(btn => {
      if (!btn.hasAttribute('data-listener-added')) {
        btn.setAttribute('data-listener-added', 'true');
        btn.addEventListener('click', handleGDPRConsent);
      }
    });
  }, 100);
}

async function handleGDPRConsent(event) {
  const button = event.target;
  
  try {
    console.log('📝 Invio consenso GDPR...');
    
    // Feedback visivo immediato
    button.style.opacity = '0.7';
    button.innerHTML = '⏳ Invio in corso...';
    button.disabled = true;
    
    const response = await fetch(`${BASE_URL}/api/gdpr-consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': conversationState.sessionId
      },
      body: JSON.stringify({
        consent: true,
        sessionId: conversationState.sessionId
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      button.style.background = '#28a745';
      button.style.opacity = '1';
      button.innerHTML = '✅ Consenso acquisito';
      
      await appendMessage('bot', '✅ <strong>Consenso acquisito!</strong><br>Ti ricontatteremo presto. Grazie per aver scelto il nostro studio!');
      
      console.log('✅ Consenso GDPR inviato con successo');
    } else {
      throw new Error('Consenso non accettato');
    }
    
  } catch (error) {
    console.error('❌ Errore invio consenso GDPR:', error);
    button.style.background = '#dc3545';
    button.style.opacity = '1';
    button.innerHTML = '❌ Errore - Riprova';
    button.disabled = false;
  }
}

// ==================== KEYBOARD HANDLERS ====================
function handleEnterKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function handleMobileEnterKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMobileMessage();
  }
}

async function sendMobileMessage() {
  const mobileInput = document.getElementById('mobile-user-input');
  const message = mobileInput.value.trim();
  
  if (!message) return;
  
  mobileInput.value = '';
  
  await appendMessage('user', message);
  
  const response = await sendToAI(message);
  await appendMessage('bot', response.response);
  
  updateSessionState(response);
}

// ==================== UTILITY FUNCTIONS ====================
function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== GLOBAL EXPORTS ====================
window.sendMessage = sendMessage;
window.handleQuickAction = handleQuickAction;
window.resetSession = resetSession;
window.handleEnterKey = handleEnterKey;
window.handleMobileEnterKey = handleMobileEnterKey;
window.sendMobileMessage = sendMobileMessage;
window.appendMessage = appendMessage;
window.handleGDPRConsent = handleGDPRConsent;

// ==================== ERROR HANDLING GLOBALE ====================
window.addEventListener('error', (event) => {
  console.error('🚨 Errore JavaScript globale:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Promise rejections non gestita:', event.reason);
  event.preventDefault();
});

// ==================== ANIMATION STYLES INJECTION ====================
if (!document.querySelector('#chat-animations')) {
  const style = document.createElement('style');
  style.id = 'chat-animations';
  style.textContent = `
    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .limit-reached-container {
      animation: slideInUp 0.3s ease-out;
    }
    
    .elegant-reset-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
    }
    
    .elegant-reset-btn:active {
      transform: translateY(0);
      box-shadow: 0 3px 10px rgba(76, 175, 80, 0.3);
    }
  `;
  document.head.appendChild(style);
}

console.log('✅ Chat.js caricato completamente con URL detection intelligente');
console.log('🌐 Configurazione:', { BASE_URL, hostname: window.location.hostname });