// ==================== GLOBAL VARIABLES ====================
let studioInfo = {};
let conversationState = {
  sessionId: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
  currentFlow: null,
  flowData: {},
  tokenCount: 0,
  maxTokens: 10000
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
    // Fallback: prova a caricare il file JSON direttamente
    try {
      const fallbackResponse = await fetch('company-info.json');
      studioInfo = await fallbackResponse.json();
      console.log('✅ Dati studio caricati via fallback');
    } catch (fallbackError) {
      console.error('❌ Errore fallback:', fallbackError);
    }
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
  
  // Check token limits
  if (conversationState.tokenCount >= conversationState.maxTokens) {
    await appendMessage('bot', '⚠️ Hai raggiunto il limite di utilizzo. <button onclick="resetSession()" class="reset-btn">🔄 Nuova Chat</button>');
    return;
  }
  
  input.value = '';
  await appendMessage('user', message);
  
  // Send to ChatGPT via server
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
        response: data.response + ' <button onclick="resetSession()" class="reset-btn">🔄 Nuova Chat</button>',
        limitReached: true
      };
    }
    
    console.log('✅ Risposta ChatGPT ricevuta');
    console.log('📊 Token usati:', data.tokensUsed);
    console.log('🔄 Flow attivo:', data.currentFlow);
    
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
  
  // Setup GDPR button if present
  if (response.response && response.response.includes('gdpr-accept-btn')) {
    setTimeout(setupGDPRButton, 500);
  }
}

function updateTokenDisplay() {
  const remainingTokens = conversationState.maxTokens - conversationState.tokenCount;
  const percentage = (conversationState.tokenCount / conversationState.maxTokens) * 100;
  
  console.log(`📊 Token: ${conversationState.tokenCount}/${conversationState.maxTokens} (${percentage.toFixed(1)}%)`);
  
  // Visual indicator if approaching limit
  if (percentage > 80) {
    const indicator = document.createElement('div');
    indicator.className = 'token-warning';
    indicator.innerHTML = `⚠️ Token quasi esauriti: ${remainingTokens} rimasti`;
    indicator.style.cssText = 'background: #fff3cd; padding: 8px; margin: 8px 0; border-radius: 4px; font-size: 12px;';
    
    const chatBody = document.getElementById('chat-body');
    if (chatBody && !chatBody.querySelector('.token-warning')) {
      chatBody.appendChild(indicator);
    }
  }
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
    
    // Clear chat
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.innerHTML = '';
    }
    
    // Generate new session ID
    conversationState.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    conversationState.tokenCount = 0;
    conversationState.currentFlow = null;
    conversationState.flowData = {};
    
    // Restart welcome
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
  
  // Remove typing indicator
  const typingIndicator = chatBody.querySelector('.typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.innerHTML = message;
  
  chatBody.appendChild(messageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
  
  // Sync with mobile if open
  if (window.mobileChat?.isOpen) {
    syncToMobile(type, message);
  }
  
  // Setup button listeners for new content
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
  // GDPR buttons
  const gdprButtons = container.querySelectorAll('#gdpr-accept-btn');
  gdprButtons.forEach(btn => {
    if (!btn.hasAttribute('data-listener-added')) {
      btn.setAttribute('data-listener-added', 'true');
      btn.addEventListener('click', handleGDPRConsent);
    }
  });
  
  // Reset buttons
  const resetButtons = container.querySelectorAll('.reset-btn');
  resetButtons.forEach(btn => {
    if (!btn.hasAttribute('data-listener-added')) {
      btn.setAttribute('data-listener-added', 'true');
      btn.addEventListener('click', resetSession);
    }
  });
  
  // Option buttons (if any new ones are dynamically created)
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

function setupGDPRButton() {
  setTimeout(() => {
    const gdprBtn = document.getElementById('gdpr-accept-btn');
    if (gdprBtn && !gdprBtn.hasAttribute('data-listener-added')) {
      gdprBtn.setAttribute('data-listener-added', 'true');
      gdprBtn.addEventListener('click', handleGDPRConsent);
    }
  }, 100);
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
  
  // Add to mobile chat
  await appendMessage('user', message);
  
  // Send to AI
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