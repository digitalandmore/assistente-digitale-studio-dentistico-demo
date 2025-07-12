// ==================== GLOBAL VARIABLES ====================
let studioInfo = {};
let conversationState = {
  collecting: false,
  requestType: null,
  collectedData: {},
  requiredFields: [],
  pendingField: null,
  lastUserMessage: null,
  lastBotResponse: null,
  lastIntent: null
};

let flowCount = 0;
let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

// ==================== PAGINATION VARIABLES ====================
let messageHistory = [];
let displayedMessages = 0;
const MESSAGES_PER_PAGE = 10;
const LOAD_MORE_THRESHOLD = 8;
let loadMoreButton = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('company-info.json');
    studioInfo = await response.json();
    
    initializeMessagePagination();
    await showWelcomeMessage();
    
    console.log('✅ Sistema Chat Ibrido (Flow + AI) inizializzato');
  } catch (error) {
    console.error('❌ Errore caricamento company-info.json:', error);
    studioInfo = getDefaultStudioInfo();
    initializeMessagePagination();
    await showWelcomeMessage();
  }
});

async function showWelcomeMessage() {
  const studioNome = studioInfo.studio?.nome || 'Studio Dentistico Demo';
  const welcomeMsg = `👋 Ciao! Sono l'assistente digitale di ${studioNome}. Come posso aiutarti oggi?`;
  await appendMessage('bot', welcomeMsg);
  
  setTimeout(showInitialOptions, 2000);
}

async function showInitialOptions() {
  // Previeni duplicati
  if (document.querySelector('.chat-options-container')) {
    return;
  }

  const initialOptions = `
    <div class="chat-options-container" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
      <button class="chat-option-btn" data-action="info">📋 Informazioni Studio</button>
      <button class="chat-option-btn" data-action="orari">⏰ Orari e Disponibilità</button>
      <button class="chat-option-btn" data-action="prenotazione">📅 Prenota Visita</button>
      <button class="chat-option-btn" data-action="offerte">🎁 Offerte Speciali</button>
      <button class="chat-option-btn" data-action="contatti">📞 Contatti</button>
    </div>
  `;
  
  await appendMessage('bot', initialOptions);
  
  // Setup listeners una sola volta
  setTimeout(() => {
    document.querySelectorAll('.chat-option-btn').forEach(btn => {
      if (!btn.hasAttribute('data-listener-added')) {
        btn.setAttribute('data-listener-added', 'true');
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          const action = this.getAttribute('data-action');
          if (action) {
            handleQuickOption(action);
          }
        });
      }
    });
  }, 100);
}

async function handleQuickOption(option) {
  const messages = {
    'info': 'Dimmi informazioni sullo studio',
    'orari': 'Quali sono gli orari di apertura?', 
    'prenotazione': 'Vorrei prenotare una visita',
    'offerte': 'Dimmi le offerte speciali',
    'contatti': 'Come posso contattare lo studio?'
  };
  
  if (messages[option]) {
    await appendMessage('user', messages[option]);
    
    // Disabilita tutti i pulsanti
    document.querySelectorAll('.chat-option-btn').forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    });
    
    const response = await generateHybridResponse(option, messages[option]);
    await appendMessage('bot', response);
    
    if (response.includes('gdpr-accept-btn')) {
      setupGDPRButton();
    }
  }
}

// ==================== HYBRID RESPONSE ENGINE ====================
async function generateHybridResponse(option, userMessage) {
  const flowResponse = await tryFlowResponse(option);
  
  if (flowResponse) {
    console.log('✅ Usato Flow Pre-impostato');
    return flowResponse;
  }
  
  console.log('🤖 Fallback su AI Response');
  return await generateAIResponse(userMessage);
}

async function tryFlowResponse(option) {
  switch (option) {
    case 'info':
      return generateInfoResponse();
    case 'orari':
      return generateHoursResponse();
    case 'prenotazione':
      return await startAppointmentFlow();
    case 'offerte':
      return await startOfferFlow();
    case 'contatti':
      return generateContactResponse();
    default:
      return null;
  }
}

// ==================== MAIN CHAT FUNCTION ====================
async function sendMessage() {
  const input = document.getElementById('user-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  input.value = '';
  flowCount++;
  
  await appendMessage('user', message);
  disableCommandButtons();
  
  const response = await generateSmartResponse(message);
  await appendMessage('bot', response);
  
  if (response.includes('gdpr-accept-btn')) {
    setupGDPRButton();
  }
}

// ==================== SMART RESPONSE ENGINE ====================
async function generateSmartResponse(userMessage) {
  const msg = userMessage.toLowerCase().trim();
  
  conversationState.lastUserMessage = userMessage;
  
  if (conversationState.collecting) {
    const response = await handleDataCollectionFlow(userMessage);
    conversationState.lastBotResponse = response;
    return response;
  }
  
  let response = '';
  
  // FLOW PRE-IMPOSTATI CON PATTERN MATCHING
  if (msg.includes('orari') || msg.includes('orario') || msg.includes('quando siete aperti') || msg.includes('apertura')) {
    response = generateHoursResponse();
    console.log('✅ Usato Flow: Orari');
  }
  else if (msg.includes('prenotare') || msg.includes('prenotazione') || msg.includes('appuntamento') || msg.includes('prenoto')) {
    response = await startAppointmentFlow();
    console.log('✅ Usato Flow: Prenotazione');
  }
  else if (msg.includes('offerta') || msg.includes('offerte') || msg.includes('sconto') || msg.includes('promozione')) {
    response = await startOfferFlow();
    console.log('✅ Usato Flow: Offerte');
  }
  else if (msg.includes('contatto') || msg.includes('telefono') || msg.includes('email') || msg.includes('chiamare')) {
    response = generateContactResponse();
    console.log('✅ Usato Flow: Contatti');
  }
  else if (msg.includes('dove') || msg.includes('indirizzo') || msg.includes('posizione') || msg.includes('sede')) {
    response = generateLocationResponse();
    console.log('✅ Usato Flow: Posizione');
  }
  else if (msg.includes('servizi') || msg.includes('cosa fate') || msg.includes('specializzazioni')) {
    response = generateServicesResponse();
    console.log('✅ Usato Flow: Servizi');
  }
  else if (msg.match(/^(ciao|salve|buongiorno|buonasera)$/i)) {
    response = '👋 Ciao! Come posso aiutarti?';
    console.log('✅ Usato Flow: Saluti');
  }
  else {
    console.log('🤖 Usando AI per risposta personalizzata');
    response = await generateAIResponse(userMessage);
  }
  
  conversationState.lastBotResponse = response;
  return response;
}

// ==================== AI RESPONSE ENGINE ====================
async function generateAIResponse(userMessage) {
  const msg = userMessage.toLowerCase();
  
  // SERVIZI SPECIFICI
  if (msg.includes('impianto') || msg.includes('impianti')) {
    return generateServiceResponse('implantologia');
  }
  if (msg.includes('apparecchio') || msg.includes('ortodonzia') || msg.includes('denti storti')) {
    return generateServiceResponse('ortodonzia');
  }
  if (msg.includes('sbiancamento') || msg.includes('estetica') || msg.includes('faccette') || msg.includes('sorriso')) {
    return generateServiceResponse('estetica_dentale');
  }
  if (msg.includes('pulizia') || msg.includes('igiene') || msg.includes('detartrasi')) {
    return generateServiceResponse('igiene_orale');
  }
  if (msg.includes('carie') || msg.includes('otturazione') || msg.includes('conservativa')) {
    return generateServiceResponse('conservativa');
  }
  if (msg.includes('devitalizzazione') || msg.includes('endodonzia') || msg.includes('canale')) {
    return generateServiceResponse('endodonzia');
  }
  if (msg.includes('gengive') || msg.includes('parodontologia') || msg.includes('sanguinano')) {
    return generateServiceResponse('parodontologia');
  }
  if (msg.includes('protesi') || msg.includes('dentiera') || msg.includes('corona')) {
    return generateServiceResponse('protesi');
  }
  if (msg.includes('emergenza') || msg.includes('urgenza') || msg.includes('male') || msg.includes('dolore')) {
    return generateEmergencyResponse();
  }
  
  // INFORMAZIONI BUSINESS
  if (msg.includes('esperienza') || msg.includes('storia') || msg.includes('da quanto') || msg.includes('anni')) {
    return generateHistoryResponse();
  }
  if (msg.includes('tecnologia') || msg.includes('moderne') || msg.includes('attrezzature')) {
    return generateTechnologyResponse();
  }
  if (msg.includes('team') || msg.includes('medici') || msg.includes('dottori') || msg.includes('staff')) {
    return generateTeamResponse();
  }
  if (msg.includes('bambini') || msg.includes('bambino') || msg.includes('pediatrica')) {
    return generatePediatricResponse();
  }
  
  // DOMANDE BUSINESS
  if (msg.includes('quanto costa') || msg.includes('prezzo') || msg.includes('costo') || msg.includes('tariffe')) {
    return generatePriceResponse();
  }
  if (msg.includes('assicurazione') || msg.includes('convenzionato') || msg.includes('mutua')) {
    return generateInsuranceResponse();
  }
  if (msg.includes('garanzia') || msg.includes('garanzie')) {
    return generateWarrantyResponse();
  }
  
  // CORTESIA E FEEDBACK
  if (msg.includes('grazie') || msg.includes('ringrazio')) {
    return generateThanksResponse();
  }
  if (msg.match(/^(si|sì|ok|va bene|confermo)$/i)) {
    return generateConfirmationResponse();
  }
  
  // RISPOSTA GENERICA BASATA SUL CONTESTO
  return generateContextualResponse(userMessage);
}

// ==================== FLOW RESPONSES (BASATE SU COMPANY-INFO.JSON) ====================
function generateInfoResponse() {
  const studio = studioInfo.studio || {};
  const studioNome = studio.nome || 'Studio Dentistico Demo';
  const descrizione = studio.descrizione || 'Studio dentistico moderno con tecnologie all\'avanguardia';
  
  return `
    🏥 <strong>${studioNome}</strong><br><br>
    📋 ${descrizione}<br><br>
    
    <strong>🎯 I nostri punti di forza:</strong><br>
    • Personale specializzato e certificato<br>
    • Attrezzature moderne e sterilizzate<br>
    • Ambiente accogliente e confortevole<br>
    • Approccio personalizzato per ogni paziente<br><br>
    
    💡 Vuoi sapere di più sui nostri <strong>servizi</strong> o <strong>prenotare una visita</strong>?
  `;
}

function generateHoursResponse() {
  const studio = studioInfo.studio || {};
  const orari = studioInfo.orari || {};
  const studioNome = studio.nome || 'Studio Dentistico Demo';
  
  let response = `📅 <strong>Orari di ${studioNome}</strong><br><br>`;
  
  if (orari.lunedi_venerdi) {
    response += `🕘 <strong>Lunedì - Venerdì:</strong> ${orari.lunedi_venerdi}<br>`;
  } else {
    response += `🕘 <strong>Lunedì - Venerdì:</strong> 09:00 - 18:00<br>`;
  }
  
  if (orari.sabato) {
    response += `🕘 <strong>Sabato:</strong> ${orari.sabato}<br>`;
  } else {
    response += `🕘 <strong>Sabato:</strong> 09:00 - 13:00<br>`;
  }
  
  if (orari.domenica) {
    response += `🕘 <strong>Domenica:</strong> ${orari.domenica}<br>`;
  } else {
    response += `🕘 <strong>Domenica:</strong> Chiuso<br>`;
  }
  
  if (orari.note) {
    response += `<br>📝 <em>${orari.note}</em><br>`;
  }
  
  response += '<br>💡 Vuoi prenotare un appuntamento?';
  
  return response;
}

function generateContactResponse() {
  const studio = studioInfo.studio || {};
  
  const telefono = studio.telefono || '+39 123 456 7890';
  const email = studio.email || 'info@studiodemo.it';
  const whatsapp = studio.whatsapp || telefono;
  const sito = studio.sito || 'www.studiodemo.it';
  
  return `
    📞 <strong>Come contattarci</strong><br><br>
    ☎️ <strong>Telefono:</strong> ${telefono}<br>
    ✉️ <strong>Email:</strong> ${email}<br>
    💬 <strong>WhatsApp:</strong> ${whatsapp}<br>
    🌐 <strong>Sito web:</strong> ${sito}<br><br>
    💬 Oppure continua pure a scrivermi qui per qualsiasi informazione!<br><br>
    🎯 Posso aiutarti a prenotare un appuntamento o fornirti un preventivo.
  `;
}

function generateLocationResponse() {
  const studio = studioInfo.studio || {};
  const studioNome = studio.nome || 'Studio Dentistico Demo';
  const indirizzo = studio.indirizzo || 'Via dei Dentisti 10, Milano (MI)';
  
  return `
    📍 <strong>Dove trovarci</strong><br><br>
    <strong>${studioNome}</strong><br>
    📌 ${indirizzo}<br><br>
    🚗 Parcheggio disponibile<br>
    🚇 Facilmente raggiungibile con mezzi pubblici<br><br>
    💡 Clicca su "Dove trovarci" nella sidebar per vedere la mappa!
  `;
}

function generateServicesResponse() {
  const servizi = studioInfo.servizi || {};
  const serviziDisponibili = Object.values(servizi).filter(s => s.disponibile !== false);
  
  if (serviziDisponibili.length > 0) {
    const serviziList = serviziDisponibili
      .map(s => `• <strong>${s.nome}</strong>: ${s.descrizione}`)
      .join('<br>');
    
    return `
      🦷 <strong>I nostri servizi</strong><br><br>
      ${serviziList}<br><br>
      💡 Vuoi maggiori dettagli su un servizio specifico o un preventivo personalizzato?
    `;
  }
  
  return `
    🦷 <strong>I nostri servizi</strong><br><br>
    Offriamo una gamma completa di trattamenti odontoiatrici con tecnologie moderne e approccio personalizzato.<br><br>
    📞 Per informazioni dettagliate sui servizi, contattaci al ${studioInfo.studio?.telefono || '+39 123 456 7890'}
  `;
}

// ==================== AI RESPONSE GENERATORS ====================
function generateServiceResponse(serviceKey) {
  const servizio = studioInfo.servizi?.[serviceKey];
  
  if (servizio && servizio.disponibile !== false) {
    let response = `🦷 <strong>${servizio.nome}</strong><br><br>`;
    response += `📋 ${servizio.descrizione}<br><br>`;
    
    if (servizio.dettagli) {
      response += '<strong>🎯 Trattiamo:</strong><br>';
      Object.entries(servizio.dettagli).forEach(([key, detail]) => {
        response += `• ${detail}<br>`;
      });
      response += '<br>';
    }
    
    response += '💡 Vuoi un preventivo personalizzato per questo trattamento?';
    return response;
  }
  
  return `
    🦷 <strong>Servizio richiesto</strong><br><br>
    Per informazioni su questo trattamento specifico, ti invito a contattarci direttamente.<br><br>
    📞 <strong>Telefono:</strong> ${studioInfo.studio?.telefono || '+39 123 456 7890'}<br>
    💡 Posso aiutarti con altri servizi o prenotare una visita di consulenza?
  `;
}

function generateHistoryResponse() {
  const studio = studioInfo.studio || {};
  const team = studioInfo.team || {};
  
  return `
    🏥 <strong>La nostra esperienza</strong><br><br>
    ${studio.storia || 'Dal 2005 ci prendiamo cura del sorriso dei nostri pazienti, con uno staff specializzato e costantemente aggiornato.'}<br><br>
    
    👨‍⚕️ <strong>Il nostro team:</strong><br>
    ${team.descrizione || 'Un\'equipe multidisciplinare composta da dentisti, igienisti e assistenti pronti ad accoglierti con professionalità e cortesia.'}<br><br>
    
    💡 Vuoi conoscerci meglio? Prenota una visita conoscitiva!
  `;
}

function generateTechnologyResponse() {
  const studio = studioInfo.studio || {};
  
  return `
    🔬 <strong>Tecnologie all'avanguardia</strong><br><br>
    ${studio.descrizione || 'Nel nostro studio utilizziamo tecnologie moderne per garantire trattamenti efficaci e confortevoli.'}<br><br>
    
    ✅ <strong>I nostri standard:</strong><br>
    • Attrezzature moderne e certificate<br>
    • Protocolli di sterilizzazione rigorosi<br>
    • Ambiente confortevole e accogliente<br>
    • Approccio personalizzato per ogni paziente<br><br>
    
    🎯 Vuoi vedere il nostro studio? Prenota una visita!
  `;
}

function generateTeamResponse() {
  const team = studioInfo.team || {};
  
  return `
    👨‍⚕️ <strong>Il nostro team</strong><br><br>
    ${team.descrizione || 'Un\'equipe multidisciplinare composta da dentisti, igienisti e assistenti specializzati.'}<br><br>
    
    🎯 <strong>I nostri valori:</strong><br>
    • Professionalità e competenza<br>
    • Aggiornamento continuo<br>
    • Approccio umano e personalizzato<br>
    • Cura del paziente a 360°<br><br>
    
    💡 Vuoi conoscere meglio il nostro team? Prenota una visita!
  `;
}

function generatePediatricResponse() {
  return `
    👶 <strong>Cure per i più piccoli</strong><br><br>
    Ci prendiamo cura anche dei bambini con un approccio delicato e rassicurante!<br><br>
    
    🎈 <strong>Per i piccoli pazienti:</strong><br>
    • Ambiente accogliente e colorato<br>
    • Personale specializzato nell'approccio pediatrico<br>
    • Trattamenti specifici per l'età<br>
    • Educazione all'igiene orale<br><br>
    
    😊 Vuoi prenotare una visita per il tuo bambino?
  `;
}

function generatePriceResponse() {
  const studio = studioInfo.studio || {};
  
  return `
    💰 <strong>Prezzi e Preventivi</strong><br><br>
    I costi dipendono dal tipo di trattamento e dalle tue specifiche esigenze.<br><br>
    
    🎯 <strong>Per un preventivo accurato:</strong><br>
    • Visita specialistica personalizzata<br>
    • Valutazione completa della situazione<br>
    • Piano di trattamento dettagliato<br><br>
    
    💡 Posso aiutarti a richiedere un <strong>preventivo gratuito</strong>!<br>
    📞 Oppure chiama direttamente: ${studio.telefono || '+39 123 456 7890'}
  `;
}

function generateEmergencyResponse() {
  const studio = studioInfo.studio || {};
  const orari = studioInfo.orari || {};
  
  return `
    🚨 <strong>Emergenze Dentali</strong><br><br>
    Per urgenze durante gli orari di apertura:<br>
    📞 <strong>Chiama subito:</strong> ${studio.telefono || '+39 123 456 7890'}<br><br>
    
    ⏰ <strong>Orari:</strong><br>
    • Lun-Ven: ${orari.lunedi_venerdi || '09:00-18:00'}<br>
    • Sabato: ${orari.sabato || '09:00-13:00'}<br><br>
    
    🩺 <strong>Fuori orario:</strong> Chiama il numero per istruzioni per emergenze.<br><br>
    💊 Per il dolore temporaneo: antinfiammatori da banco seguendo le istruzioni.
  `;
}

function generateInsuranceResponse() {
  return `
    💳 <strong>Convenzioni e Assicurazioni</strong><br><br>
    Per informazioni su convenzioni con assicurazioni sanitarie e fondi integrativi:<br><br>
    📞 <strong>Contattaci al:</strong> ${studioInfo.studio?.telefono || '+39 123 456 7890'}<br>
    📧 <strong>Oppure scrivi a:</strong> ${studioInfo.studio?.email || 'info@studiodemo.it'}<br><br>
    💡 Il nostro staff ti fornirà tutti i dettagli sulle convenzioni attive.
  `;
}

function generateWarrantyResponse() {
  return `
    🛡️ <strong>Garanzie sui Trattamenti</strong><br><br>
    Tutti i nostri trattamenti sono coperti da garanzia secondo gli standard professionali.<br><br>
    📋 <strong>Per dettagli specifici:</strong><br>
    • Tipologia di garanzia per ogni trattamento<br>
    • Durata e condizioni<br>
    • Protocolli di follow-up<br><br>
    💡 Discuteremo tutto nel dettaglio durante la visita!
  `;
}

function generateThanksResponse() {
  return `
    😊 <strong>Prego, è un piacere aiutarti!</strong><br><br>
    Sono sempre qui per fornirti informazioni sul nostro studio.<br><br>
    💡 <strong>Posso ancora aiutarti con:</strong><br>
    • Prenotazioni e appuntamenti<br>
    • Informazioni sui servizi<br>
    • Preventivi personalizzati<br>
    • Qualsiasi altra domanda<br><br>
    🦷 La tua salute orale è la nostra priorità!
  `;
}

function generateConfirmationResponse() {
  return `
    ✅ <strong>Perfetto!</strong><br><br>
    Cosa posso fare per te ora?<br><br>
    🎯 <strong>Posso aiutarti con:</strong><br>
    📅 Prenotare un appuntamento<br>
    📋 Richiedere un preventivo<br>
    🎁 Vedere le offerte speciali<br>
    ℹ️ Informazioni sui servizi<br><br>
    💡 Dimmi pure cosa ti interessa!
  `;
}

function generateContextualResponse(userMessage) {
  const studio = studioInfo.studio || {};
  
  return `
    🤔 Grazie per la tua domanda: "${userMessage}"<br><br>
    
    🏥 <strong>${studio.nome || 'Studio Dentistico Demo'}</strong> è qui per aiutarti!<br><br>
    
    💡 <strong>Posso aiutarti con:</strong><br>
    📅 Prenotazioni e appuntamenti<br>
    📋 Informazioni sui nostri servizi<br>
    🎁 Offerte e promozioni<br>
    📞 Contatti e orari<br><br>
    
    😊 Riformula pure la domanda o dimmi cosa ti interessa specificamente!
  `;
}

// ==================== APPOINTMENT FLOW ====================
async function startAppointmentFlow() {
  conversationState.collecting = true;
  conversationState.requestType = 'appointment';
  conversationState.requiredFields = ['nome', 'telefono', 'servizio', 'urgenza'];
  conversationState.collectedData = {};
  conversationState.pendingField = 'nome';
  
  return `
    📅 <strong>Prenotazione Appuntamento</strong><br><br>
    Perfetto! Ti aiuto a prenotare un appuntamento.<br><br>
    📝 <strong>Come ti chiami?</strong><br>
    <small>Ho bisogno del tuo nome per la prenotazione.</small>
  `;
}

// ==================== OFFER FLOW ====================
async function startOfferFlow() {
  const offerte = studioInfo.offerte || {};
  const offerteAttive = Object.values(offerte).filter(o => o.attiva !== false);
  
  if (offerteAttive.length > 0) {
    let response = `🎁 <strong>Offerte Speciali Attive</strong><br><br>`;
    
    offerteAttive.forEach(offerta => {
      response += `✨ <strong>${offerta.nome}</strong><br>`;
      response += `📋 ${offerta.descrizione}<br>`;
      if (offerta.scadenza) {
        response += `⏰ Valida fino al: ${offerta.scadenza}<br>`;
      }
      response += '<br>';
    });
    
    response += '💡 Ti interessa una di queste offerte? Posso aiutarti a prenotare!';
    return response;
  }
  
  return `
    🎁 <strong>Offerte Speciali</strong><br><br>
    Al momento non ci sono offerte attive, ma puoi sempre contattarci per promozioni personalizzate!<br><br>
    📞 <strong>Chiama:</strong> ${studioInfo.studio?.telefono || '+39 123 456 7890'}<br>
    💡 Oppure prenota una visita per un preventivo personalizzato!
  `;
}

// ==================== DATA COLLECTION FLOW ====================
async function handleDataCollectionFlow(userMessage) {
  const field = conversationState.pendingField;
  const value = userMessage.trim();
  
  // Validazione semplificata
  const validation = validateField(field, value);
  if (!validation.valid) {
    return validation.errorMessage;
  }
  
  // Salva il dato
  conversationState.collectedData[field] = validation.value || value;
  
  // Determina il prossimo campo
  const currentIndex = conversationState.requiredFields.indexOf(field);
  const nextIndex = currentIndex + 1;
  
  if (nextIndex < conversationState.requiredFields.length) {
    // Chiedi il prossimo campo
    conversationState.pendingField = conversationState.requiredFields[nextIndex];
    return getNextFieldQuestion(conversationState.pendingField, conversationState.collectedData);
  } else {
    // Tutti i dati raccolti
    conversationState.collecting = false;
    return await completeDataCollection();
  }
}

function validateField(field, value) {
  switch (field) {
    case 'nome':
      if (value.length < 2) {
        return { valid: false, errorMessage: '❌ Il nome deve essere di almeno 2 caratteri. Puoi ripetere?' };
      }
      return { valid: true, value: value };
    
    case 'telefono':
      const phoneRegex = /[\d\s\-\+\(\)\.]{8,}/;
      if (!phoneRegex.test(value)) {
        return { valid: false, errorMessage: '❌ Non riesco a trovare un numero di telefono. Puoi scriverlo di nuovo?' };
      }
      return { valid: true, value: value };
    
    default:
      return { valid: true, value: value };
  }
}

function getNextFieldQuestion(field, collectedData) {
  switch (field) {
    case 'telefono':
      return `📞 <strong>Perfetto ${collectedData.nome}!</strong><br><br>Qual è il tuo numero di telefono?<br><small>Ci serve per confermare l'appuntamento.</small>`;
    case 'servizio':
      return `🦷 <strong>Che tipo di visita ti serve?</strong><br><br>Esempi: Controllo generale, Pulizia denti, Problema specifico, ecc.<br><small>Ci aiuta a programmare il tempo necessario.</small>`;
    case 'urgenza':
      return `⏰ <strong>È urgente?</strong><br><br>Scrivi "urgente" se hai dolore o problemi immediati, oppure "normale" per un controllo di routine.`;
    default:
      return 'Dimmi il prossimo dato necessario.';
  }
}

async function completeDataCollection() {
  const data = conversationState.collectedData;
  const studio = studioInfo.studio || {};
  
  const summaryHtml = `
    ✅ <strong>Richiesta Prenotazione Ricevuta</strong><br><br>
    📝 <strong>Riepilogo:</strong><br>
    👤 <strong>Nome:</strong> ${data.nome}<br>
    📞 <strong>Telefono:</strong> ${data.telefono}<br>
    🦷 <strong>Servizio:</strong> ${data.servizio}<br>
    ⏰ <strong>Urgenza:</strong> ${data.urgenza}<br><br>
    
    💡 <strong>Prossimi passi:</strong><br>
    • Ti ricontatteremo entro 24 ore<br>
    • Confermeremo data e orario<br>
    • Riceverai tutti i dettagli<br><br>
    
    📞 <strong>Per info immediate:</strong> ${studio.telefono || '+39 123 456 7890'}<br><br>
    
    <div style="margin-top: 15px;">
      <button id="gdpr-accept-btn" style="background: #0077cc; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
        ✅ Accetto il trattamento dei dati per la prenotazione
      </button>
    </div>
  `;
  
  return summaryHtml;
}

// ==================== MESSAGE MANAGEMENT ====================
async function appendMessage(type, message) {
  // Typing indicator per bot
  if (type === 'bot') {
    await showTypingIndicator();
  }

  const chatBody = document.getElementById('chat-body');
  if (chatBody) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = message;
    
    chatBody.appendChild(messageDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
    
    messageHistory.push({ type, message, timestamp: Date.now() });
    displayedMessages++;
  }
  
  // Sincronizza con mobile se aperto
  if (window.mobileChat && window.mobileChat.isOpen && window.appendMobileMessage) {
    await window.appendMobileMessage(type, message);
  }
  
  console.log(`💬 Messaggio ${type} aggiunto (Sistema Ibrido)`);
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
  
  // Durata basata sulla lunghezza del messaggio (min 600ms, max 2500ms)
  await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(600, 50), 2500)));
  
  typing.remove();
}

function initializeMessagePagination() {
  messageHistory = [];
  displayedMessages = 0;
  console.log('✅ Pagination inizializzata');
}

function disableCommandButtons() {
  document.querySelectorAll('.chat-option-btn').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });
}

function setupGDPRButton() {
  setTimeout(() => {
    const gdprBtn = document.getElementById('gdpr-accept-btn');
    if (gdprBtn && !gdprBtn.hasAttribute('data-listener-added')) {
      gdprBtn.setAttribute('data-listener-added', 'true');
      gdprBtn.addEventListener('click', acceptGDPR);
    }
  }, 100);
}

function acceptGDPR() {
  const gdprBtn = document.getElementById('gdpr-accept-btn');
  if (gdprBtn) {
    gdprBtn.style.background = '#28a745';
    gdprBtn.innerHTML = '✅ Consenso acquisito';
    gdprBtn.disabled = true;
    
    setTimeout(() => {
      appendMessage('bot', '✅ <strong>Consenso acquisito!</strong><br>Ti ricontatteremo presto per confermare l\'appuntamento. Grazie!');
    }, 1000);
  }
}

// ==================== UTILITY FUNCTIONS ====================
function getDefaultStudioInfo() {
  return {
    studio: {
      nome: 'Studio Dentistico Demo',
      indirizzo: 'Via dei Dentisti 10, Milano (MI)',
      telefono: '+39 123 456 7890',
      email: 'info@studiodemo.it'
    },
    orari: {
      lunedi_venerdi: '09:00 - 18:00',
      sabato: '09:00 - 13:00',
      domenica: 'Chiuso'
    },
    servizi: {},
    offerte: {}
  };
}

// ==================== GLOBAL EXPORTS ====================
window.showInitialOptions = showInitialOptions;
window.handleQuickOption = handleQuickOption;
window.generateSmartResponse = generateSmartResponse;
window.generateAIResponse = generateAIResponse;
window.acceptGDPR = acceptGDPR;
window.setupGDPRButton = setupGDPRButton;
window.sendMessage = sendMessage;