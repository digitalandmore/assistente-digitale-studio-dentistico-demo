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
    // Carica company info via API
    const response = await fetch('/api/company-info');
    studioInfo = await response.json();
    console.log('✅ Dati studio caricati via API');
  } catch (error) {
    console.error('❌ Errore caricamento dati:', error);
  }
  
  await showWelcomeMessage();
  await loadSessionInfo();
});

async function loadSessionInfo() {
  try {
    const response = await fetch('/api/session-info', {
      headers: {
        'x-session-id': conversationState.sessionId
      }
    });
    const sessionInfo = await response.json();
    
    conversationState.tokenCount = sessionInfo.tokenCount;
    conversationState.maxTokens = sessionInfo.maxTokens;
    conversationState.currentFlow = sessionInfo.currentFlow;
    conversationState.flowData = sessionInfo.flowData;
    
    updateTokenDisplay();
    console.log('📊 Info sessione caricate:', sessionInfo);
  } catch (error) {
    console.error('❌ Errore caricamento sessione:', error);
  }
}

async function showWelcomeMessage() {
  const studioNome = studioInfo.studio?.nome || 'Studio Dentistico Demo';
  const welcomeMsg = `👋 Ciao! Sono l'assistente digitale di ${studioNome}. Come posso aiutarti oggi?`;
  await appendMessage('bot', welcomeMsg);
  
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
  
  // Send to AI
  const response = await sendToAI(message);
  await appendMessage('bot', response.response);
  
  updateSessionState(response);
}

// ==================== AI COMMUNICATION ====================
async function sendToAI(message) {
  try {
    await showTypingIndicator();
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': conversationState.sessionId
      },
      body: JSON.stringify({
        message: message
      })
    });
    
    const data = await response.json();
    
    if (data.limitReached) {
      return {
        response: data.response + `
          <div class="limit-reached-container">
            <button onclick="resetSession()" class="elegant-reset-btn">
              🔄 Nuova Chat
            </button>
          </div>
        `,
        limitReached: true
      };
    }
    
    console.log('✅ Risposta AI ricevuta');
    console.log('📊 Token usati:', data.tokensUsed);
    console.log('💰 Costo:', data.costInfo?.thisCall?.toFixed(4) || 'N/A');
    
    return data;
    
  } catch (error) {
    console.error('❌ Errore chiamata AI:', error);
    return {
      response: `🤖 Mi dispiace, sto avendo problemi tecnici.<br>📞 Per assistenza immediata chiama: ${studioInfo.studio?.telefono || '+39 123 456 7890'}`,
      error: true
    };
  }
}

function updateSessionState(response) {
  if (response.totalTokens) {
    conversationState.tokenCount = response.totalTokens;
  }
  if (response.currentFlow) {
    conversationState.currentFlow = response.currentFlow;
  }
  if (response.flowData) {
    conversationState.flowData = response.flowData;
  }
  
  updateTokenDisplay();
  updateCostDisplay(response.costInfo);
  
  if (response.response && response.response.includes('gdpr-accept-btn')) {
    setTimeout(setupGDPRButton, 500);
  }
}

function updateTokenDisplay() {
  const remainingTokens = conversationState.maxTokens - conversationState.tokenCount;
  const percentage = (conversationState.tokenCount / conversationState.maxTokens) * 100;
  
  console.log(`📊 Token: ${conversationState.tokenCount}/${conversationState.maxTokens} (${percentage.toFixed(1)}%)`);
}

function updateCostDisplay(costInfo) {
  if (!costInfo) return;
  
  const remainingBudget = costInfo.remainingBudget;
  const totalCost = costInfo.currentChatCost;
  const model = 'gpt-4o-mini';
  
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;
  
  // Rimuovi indicatori precedenti
  document.querySelectorAll('.budget-indicator, .cost-warning, .cost-critical').forEach(el => el.remove());
  
  if (remainingBudget < 0.01) {
    const indicator = document.createElement('div');
    indicator.className = 'cost-critical';
    indicator.innerHTML = `
      🚨 <strong>Budget quasi esaurito!</strong><br>
      💰 Costo: €${(totalCost * 0.92).toFixed(3)} / €0.046<br>
      🤖 Modello: ${model}
    `;
    chatBody.appendChild(indicator);
  } else if (remainingBudget < 0.02) {
    const indicator = document.createElement('div');
    indicator.className = 'cost-warning';
    indicator.innerHTML = `
      ⚠️ <strong>Budget in esaurimento</strong><br>
      💰 Rimangono: €${(remainingBudget * 0.92).toFixed(3)}<br>
      🤖 Modello: ${model}
    `;
    chatBody.appendChild(indicator);
  }
  
  chatBody.scrollTop = chatBody.scrollHeight;
}

// ==================== SESSION MANAGEMENT ====================
async function resetSession() {
  try {
    await fetch('/api/reset-session', {
      method: 'POST',
      headers: {
        'x-session-id': conversationState.sessionId
      }
    });
    
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.innerHTML = '';
    }
    
    conversationState.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    conversationState.tokenCount = 0;
    conversationState.currentFlow = null;
    conversationState.flowData = {};
    
    await showWelcomeMessage();
    
    console.log('🔄 Sessione resettata');
    
  } catch (error) {
    console.error('❌ Errore reset sessione:', error);
  }
}

// ==================== MESSAGE MANAGEMENT ====================
async function appendMessage(type, message) {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;
  
  const typingIndicator = chatBody.querySelector('.typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.innerHTML = message;
  
  chatBody.appendChild(messageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
  
  if (window.mobileChat?.isOpen) {
    syncToMobile(type, message);
  }
  
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
  const gdprButtons = container.querySelectorAll('#gdpr-accept-btn');
  gdprButtons.forEach(btn => {
    if (!btn.hasAttribute('data-listener-added')) {
      btn.setAttribute('data-listener-added', 'true');
      btn.addEventListener('click', handleGDPRConsent);
    }
  });
  
  const resetButtons = container.querySelectorAll('.elegant-reset-btn');
  resetButtons.forEach(btn => {
    if (!btn.hasAttribute('data-listener-added')) {
      btn.setAttribute('data-listener-added', 'true');
      btn.addEventListener('click', resetSession);
    }
  });
  
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

async function handleGDPRConsent(event) {
  const button = event.target;
  
  try {
    const response = await fetch('/api/gdpr-consent', {
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
      button.innerHTML = '✅ Consenso acquisito';
      button.disabled = true;
      
      await appendMessage('bot', '✅ <strong>Consenso acquisito!</strong><br>Ti ricontatteremo presto. Grazie per aver scelto il nostro studio!');
    }
    
  } catch (error) {
    console.error('❌ Errore invio consenso GDPR:', error);
    button.innerHTML = '❌ Errore - Riprova';
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

// ==================== GLOBAL EXPORTS ====================
window.sendMessage = sendMessage;
window.handleQuickAction = handleQuickAction;
window.resetSession = resetSession;
window.handleEnterKey = handleEnterKey;
window.handleMobileEnterKey = handleMobileEnterKey;
window.sendMobileMessage = sendMobileMessage;
window.appendMessage = appendMessage;