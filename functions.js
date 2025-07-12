// ==================== PAGINATION INTEGRATION ====================
function initializeMessagePagination() {
  messageHistory = [];
  displayedMessages = 0;
  hideLoadMoreButton();
}

function addToMessageHistory(type, text, timestamp = new Date()) {
  const message = {
    id: generateMessageId(),
    type: type,
    text: text,
    timestamp: timestamp,
    displayed: false
  };
  messageHistory.push(message);
}

function generateMessageId() {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function shouldShowLoadMoreButton() {
  const totalMessages = messageHistory.length;
  const hiddenMessages = totalMessages - displayedMessages;
  return hiddenMessages > 0 && displayedMessages >= LOAD_MORE_THRESHOLD;
}

function createLoadMoreButton() {
  if (loadMoreButton) return loadMoreButton;
  
  loadMoreButton = document.createElement('div');
  loadMoreButton.className = 'load-more-container';
  loadMoreButton.id = 'load-more-container';
  
  const hiddenCount = messageHistory.length - displayedMessages;
  
  loadMoreButton.innerHTML = `
    <button class="load-more-btn" onclick="loadMoreMessages()" aria-label="Carica messaggi precedenti">
      <i class="fas fa-chevron-up"></i>
      <span class="load-more-text">Carica ${hiddenCount} messaggi precedenti</span>
      <div class="load-more-indicator">
        <div class="load-more-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    </button>
  `;
  
  return loadMoreButton;
}

function showLoadMoreButton() {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;
  
  hideLoadMoreButton();
  const button = createLoadMoreButton();
  chatBody.insertBefore(button, chatBody.firstChild);
  
  setTimeout(() => {
    button.classList.add('show');
  }, 100);
}

function hideLoadMoreButton() {
  const existingButton = document.getElementById('load-more-container');
  if (existingButton) {
    existingButton.remove();
    loadMoreButton = null;
  }
}

window.loadMoreMessages = async function() {
  const button = document.getElementById('load-more-container');
  if (!button) return;
  
  button.classList.add('loading');
  const textElement = button.querySelector('.load-more-text');
  const originalText = textElement.textContent;
  textElement.textContent = 'Caricamento...';
  
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const messagesToLoad = Math.min(MESSAGES_PER_PAGE, messageHistory.length - displayedMessages);
    const startIndex = messageHistory.length - displayedMessages - messagesToLoad;
    const endIndex = messageHistory.length - displayedMessages;
    
    const messagesSlice = messageHistory.slice(startIndex, endIndex);
    
    const chatBody = document.getElementById('chat-body');
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'loaded-messages';
    
    for (const message of messagesSlice) {
      const messageElement = createMessageElement(message.type, message.text);
      messageElement.classList.add('loaded-message');
      messagesContainer.appendChild(messageElement);
      message.displayed = true;
    }
    
    chatBody.insertBefore(messagesContainer, button.nextSibling);
    displayedMessages += messagesToLoad;
    
    setTimeout(() => {
      messagesContainer.querySelectorAll('.loaded-message').forEach((msg, index) => {
        setTimeout(() => {
          msg.classList.add('show');
        }, index * 100);
      });
    }, 100);
    
    if (displayedMessages >= messageHistory.length) {
      hideLoadMoreButton();
    } else {
      const hiddenCount = messageHistory.length - displayedMessages;
      textElement.textContent = `Carica ${hiddenCount} messaggi precedenti`;
      button.classList.remove('loading');
    }
    
  } catch (error) {
    console.error('❌ Errore nel caricamento messaggi:', error);
    button.classList.remove('loading');
    textElement.textContent = originalText;
  }
};

function createMessageElement(type, text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.innerHTML = text;
  return messageDiv;
}

// ==================== UI FUNCTIONS WITH PAGINATION ====================
async function showTypingIndicator(text = "") {
  const typing = document.createElement('div');
  typing.className = 'message bot typing-indicator';
  typing.innerHTML = `<div class="typing-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
  
  const chatBody = document.getElementById('chat-body');
  chatBody.appendChild(typing);
  chatBody.scrollTop = chatBody.scrollHeight;
  
  const duration = Math.min(Math.max(600, text.length * 40), 2500);
  await new Promise(resolve => setTimeout(resolve, duration));
  typing.remove();
}

async function appendMessage(type, text) {
  // Aggiungi alla cronologia per paginazione
  addToMessageHistory(type, text);
  
  if (type === 'bot') await showTypingIndicator(text);

  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  msg.innerHTML = text;
  
  const chatBody = document.getElementById('chat-body');
  chatBody.appendChild(msg);
  
  // Incrementa contatore
  displayedMessages++;
  
  // Controlla se mostrare load more
  if (shouldShowLoadMoreButton()) {
    showLoadMoreButton();
  }
  
  // Gestione pulsante GDPR
  if (text.includes('gdpr-accept-btn')) {
    setupGDPRButton();
  }
  
  chatBody.scrollTop = chatBody.scrollHeight;
}

function setupGDPRButton() {
  setTimeout(() => {
    const gdprButton = document.getElementById('gdpr-accept-btn');
    if (gdprButton && !gdprButton.hasAttribute('data-setup')) {
      // Marca il pulsante come già configurato
      gdprButton.setAttribute('data-setup', 'true');
      
      gdprButton.addEventListener('click', async () => {
        gdprButton.disabled = true;
        gdprButton.style.background = '#6c757d';
        gdprButton.innerHTML = '<i class="fas fa-check"></i> CONSENSO ACCORDATO';
        
        conversationState.collectedData.gdpr = 'consenso_accordato';
        
        // NON aggiungere messaggio utente duplicato
        // await appendMessage('user', '✅ Ho accettato il consenso GDPR');
        
        // Passa al prossimo campo o completa
        const nextField = getNextRequiredField();
        if (!nextField) {
          await completeDataCollection();
        } else {
          conversationState.pendingField = nextField;
          const question = getQuestionForField(nextField);
          await appendMessage('bot', question);
        }
      });
    }
  }, 100);
}

function showInitialOptions() {
  // Controlla se i pulsanti esistono già
  if (document.getElementById('command-buttons')) {
    return; // Non creare duplicati
  }
  
  setTimeout(() => {
    const chatBody = document.getElementById('chat-body');
    const container = document.createElement('div');
    container.id = 'command-buttons';
    container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;';

    const options = [
      "Richiedere Preventivo", 
      "Orari di Apertura", 
      "Richiedi / Modifica Appuntamento", 
      "Richiedi Informazioni", 
      "Offerta Speciale"
    ];

    options.forEach(text => {
      const button = document.createElement('button');
      button.textContent = text;
      button.className = 'chat-option-btn';
      button.addEventListener('click', () => {
        disableCommandButtons();
        document.getElementById('user-input').value = text;
        sendMessage();
      });
      container.appendChild(button);
    });

    chatBody.appendChild(container);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 1000);
}

function disableCommandButtons() {
  const buttons = document.querySelectorAll('#command-buttons button');
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.cssText += 'opacity: 0.5; cursor: not-allowed;';
  });
}

// ==================== VALIDATION FUNCTIONS (ITALIAN FORMAT) ====================
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  // Regex più rigorosa per email italiane
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  return emailRegex.test(email) && 
         !email.includes('..') && 
         email.length >= 5 && 
         email.length <= 254 &&
         email.indexOf('@') > 0 &&
         email.lastIndexOf('@') === email.indexOf('@');
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  
  // Rimuovi spazi, trattini, parentesi
  const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // Gestisci prefisso +39
  const phoneWithoutPrefix = cleanPhone.replace(/^\+39/, '').replace(/^0039/, '');
  
  // Formato italiano: deve essere di 8-11 cifre dopo aver rimosso +39
  if (phoneWithoutPrefix.length < 8 || phoneWithoutPrefix.length > 11) {
    return false;
  }
  
  // Solo cifre
  if (!/^\d+$/.test(phoneWithoutPrefix)) {
    return false;
  }
  
  // Evita numeri ripetitivi (es: 1111111111)
  if (/(\d)\1{6,}/.test(phoneWithoutPrefix)) {
    return false;
  }
  
  // Controlla formati validi italiani
  const validPatterns = [
    /^3\d{8,9}$/,        // Cellulari (3xx xxx xxxx)
    /^0\d{8,10}$/,       // Fissi (0xx xxxx xxxx)
    /^[1-9]\d{7,9}$/     // Altri formati
  ];
  
  return validPatterns.some(pattern => pattern.test(phoneWithoutPrefix));
}

function formatPhoneForDisplay(phone) {
  const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  const phoneWithoutPrefix = cleanPhone.replace(/^\+39/, '').replace(/^0039/, '');
  
  // Formatta per display
  if (phoneWithoutPrefix.length === 10 && phoneWithoutPrefix.startsWith('3')) {
    // Cellulare: 3xx xxx xxxx
    return `+39 ${phoneWithoutPrefix.substring(0, 3)} ${phoneWithoutPrefix.substring(3, 6)} ${phoneWithoutPrefix.substring(6)}`;
  } else if (phoneWithoutPrefix.startsWith('0')) {
    // Fisso: 0xx xxxx xxxx
    return `+39 ${phoneWithoutPrefix}`;
  }
  
  return `+39 ${phoneWithoutPrefix}`;
}

// ==================== DATA PROCESSING FUNCTIONS ====================
function processFieldData(field, userMessage) {
  switch (field) {
    case 'nome':
      return processNameField(userMessage);
    
    case 'telefono':
      return processPhoneField(userMessage);
    
    case 'email':
      return processEmailField(userMessage);
    
    case 'preferenza_data':
    case 'motivo':
    case 'servizio_richiesto':
    case 'dettagli':
      return processTextField(userMessage);
    
    default:
      return { valid: true, value: userMessage.trim() };
  }
}

function processNameField(message) {
  const name = message.trim();
  
  // Validazione nome
  if (name.length < 2) {
    return { 
      valid: false, 
      errorMessage: '❌ Il nome deve essere di almeno 2 caratteri. Puoi ripetere?' 
    };
  }
  
  if (!/^[a-zA-ZàáâãäåèéêëìíîïòóôõöùúûüÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜ\s\'-]+$/.test(name)) {
    return { 
      valid: false, 
      errorMessage: '❌ Il nome contiene caratteri non validi. Usa solo lettere, per favore.' 
    };
  }
  
  if (name.length > 50) {
    return { 
      valid: false, 
      errorMessage: '❌ Il nome è troppo lungo. Puoi abbreviarlo?' 
    };
  }
  
  return { valid: true, value: name };
}

function processPhoneField(message) {
  // Cerca numero di telefono nel messaggio
  const phoneMatch = message.match(/[\d\s\-\+\(\)\.]{8,}/);
  
  if (!phoneMatch) {
    return { 
      valid: false, 
      errorMessage: '❌ Non riesco a trovare un numero di telefono. Puoi scriverlo di nuovo?' 
    };
  }
  
  const phone = phoneMatch[0].trim();
  
  if (!isValidPhone(phone)) {
    return { 
      valid: false, 
      errorMessage: `❌ Il numero "${phone}" non sembra valido per l'Italia. Controlla e riprova (es: 348 123 4567 oppure 02 1234 5678).` 
    };
  }
  
  const formatted = formatPhoneForDisplay(phone);
  return { 
    valid: true, 
    value: formatted,
    successMessage: `✅ Perfetto! Ho salvato il numero: ${formatted}`
  };
}

function processEmailField(message) {
  // Cerca email nel messaggio
  const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  
  if (!emailMatch) {
    return { 
      valid: false, 
      errorMessage: '❌ Non riesco a trovare un indirizzo email. Puoi scriverlo di nuovo?' 
    };
  }
  
  const email = emailMatch[0].toLowerCase();
  
  if (!isValidEmail(email)) {
    return { 
      valid: false, 
      errorMessage: `❌ L'email "${email}" non sembra valida. Controlla e riprova (es: nome@esempio.it).` 
    };
  }
  
  return { 
    valid: true, 
    value: email,
    successMessage: `✅ Ottimo! Ho salvato l'email: ${email}`
  };
}

function processTextField(message) {
  const text = message.trim();
  
  if (text.length < 3) {
    return { 
      valid: false, 
      errorMessage: '❌ La risposta è troppo breve. Puoi essere più specifico?' 
    };
  }
  
  return { valid: true, value: text };
}

// ==================== DATA COLLECTION UTILITIES ====================
function getNextRequiredField() {
  return conversationState.requiredFields.find(field => 
    !conversationState.collectedData[field]
  );
}

async function completeDataCollection() {
  const type = conversationState.requestType;
  const data = conversationState.collectedData;
  
  // Reset stato
  conversationState.collecting = false;
  conversationState.pendingField = null;
  
  // Invia email di notifica
  await sendEmailNotification(type, data);
  
  // Mostra recap finale
  await showCompletionRecap(type, data);
  
  // Opzioni per continuare
  setTimeout(showContinueOptions, 2000);
}

async function showCompletionRecap(type, data) {
  const typeLabels = {
    'appointment': 'APPUNTAMENTO',
    'quote': 'PREVENTIVO',
    'offer': 'OFFERTA SPECIALE'
  };
  
  const typeEmojis = {
    'appointment': '📅',
    'quote': '📋',
    'offer': '🎁'
  };
  
  const label = typeLabels[type] || type.toUpperCase();
  const emoji = typeEmojis[type] || '✅';
  
  const recap = `
    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 20px; border-radius: 12px; color: white; text-align: center; margin: 10px 0;">
      <h3>${emoji} ${label} COMPLETATO!</h3>
      <p><strong>Grazie ${data.nome}!</strong></p>
      <p>Ti contatteremo entro 24 ore al numero ${data.telefono || 'fornito'}.</p>
      <p style="font-size: 14px; opacity: 0.9;">📧 Riceverai anche una conferma via email.</p>
    </div>
  `;
  
  await appendMessage('bot', recap);
}

function showContinueOptions() {
  // Rimuovi eventuali pulsanti esistenti
  const existingButtons = document.querySelector('.continue-options');
  if (existingButtons) {
    existingButtons.remove();
  }
  
  const chatBody = document.getElementById('chat-body');
  const container = document.createElement('div');
  container.className = 'continue-options';
  container.style.cssText = 'text-align: center; margin-top: 15px;';
  
  const continueBtn = document.createElement('button');
  continueBtn.textContent = '💬 Hai altre domande?';
  continueBtn.className = 'chat-option-btn';
  continueBtn.style.cssText = 'background: #007bff; color: white; padding: 10px 20px; margin: 5px; border: none; border-radius: 6px; cursor: pointer;';
  continueBtn.addEventListener('click', () => {
    container.remove();
    appendMessage('bot', '😊 Perfetto! Di cosa altro hai bisogno?');
  });
  
  const newChatBtn = document.createElement('button');
  newChatBtn.textContent = '🔄 Nuova Chat';
  newChatBtn.className = 'chat-option-btn';
  newChatBtn.style.cssText = 'background: #28a745; color: white; padding: 10px 20px; margin: 5px; border: none; border-radius: 6px; cursor: pointer;';
  newChatBtn.addEventListener('click', startNewChat);
  
  container.appendChild(continueBtn);
  container.appendChild(newChatBtn);
  chatBody.appendChild(container);
  chatBody.scrollTop = chatBody.scrollHeight;
}

async function startNewChat() {
  try {
    // Reset variables
    sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    conversationState = {
      collecting: false,
      requestType: null,
      collectedData: {},
      requiredFields: [],
      pendingField: null
    };
    flowCount = 0;
    
    // Reset paginazione
    initializeMessagePagination();
    
    // Pulisci chat
    document.getElementById('chat-body').innerHTML = '';
    
    // Riavvia
    await showWelcomeMessage();
    showInitialOptions();
    
    console.log('🔄 Nuova chat iniziata');
  } catch (error) {
    console.error('❌ Errore reset:', error);
    location.reload();
  }
}

// ==================== API FUNCTIONS ====================
async function sendEmailNotification(type, data) {
  try {
    const emailData = {
      type: type,
      data: data,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      to: 'digitalandmoreit@gmail.com'
    };
    
    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId 
      },
      body: JSON.stringify(emailData)
    });
    
    console.log('📧 Email di notifica inviata');
  } catch (error) {
    console.error('❌ Errore invio email:', error);
  }
}

// ==================== KEYBOARD HANDLING ====================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'user-input' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

console.log('✅ Functions.js con validazioni italiane caricato');