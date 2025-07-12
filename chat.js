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
    
    console.log('✅ AI Chat System inizializzato con dati da company-info.json');
  } catch (error) {
    console.error('❌ Errore caricamento company-info.json:', error);
    studioInfo = getDefaultStudioInfo();
    initializeMessagePagination();
    await showWelcomeMessage();
  }
});

function getDefaultStudioInfo() {
  return {
    studio: {
      nome: 'Studio Dentistico Demo',
      descrizione: 'Studio dentistico moderno con tecnologie all\'avanguardia',
      indirizzo: 'Via Demo 123, Milano (MI)',
      telefono: '+39 123 456 7890',
      email: 'info@studiodemo.it'
    },
    orari: {
      lunedi_venerdi: '09:00 - 18:00',
      sabato: '09:00 - 13:00',
      domenica: 'Chiuso',
      note: 'Per verificare aperture e chiusure durante festività, consulta la sezione "Orari dello Studio".'
    },
    contatti: {
      telefono: { numero: '+39 123 456 7890' },
      email: { indirizzo: 'info@studiodemo.it' }
    },
    servizi: {
      igiene: { nome: 'Igiene Orale', descrizione: 'Prevenzione e detartrasi per mantenere denti e gengive sani' },
      implantologia: { nome: 'Implantologia', descrizione: 'Sostituzione di denti mancanti con impianti sicuri e duraturi' },
      ortodonzia: { nome: 'Ortodonzia', descrizione: 'Apparecchi per l\'allineamento dentale in adulti e bambini' },
      estetica: { nome: 'Estetica Dentale', descrizione: 'Trattamenti per migliorare il sorriso: sbiancamento, faccette e altro' },
      endodonzia: { nome: 'Endodonzia', descrizione: 'Terapia canalare avanzata per salvare denti compromessi' },
      parodontologia: { nome: 'Parodontologia', descrizione: 'Diagnosi e cura di gengiviti, parodontiti e patologie gengivali' }
    },
    offerte: {
      prima_visita: {
        nome: 'Prima Visita + Igiene',
        descrizione: 'Visita completa con pulizia professionale',
        prezzo_speciale: '89',
        prezzo_originale: '150',
        scadenza: '31/12/2024',
        attiva: true,
        colore: '#ff6b6b'
      },
      sbiancamento: {
        nome: 'Sbiancamento Professionale',
        descrizione: 'Trattamento sbiancante avanzato',
        prezzo_speciale: '199',
        prezzo_originale: '350',
        scadenza: '31/12/2024',
        attiva: true,
        colore: '#74b9ff'
      },
      controllo: {
        nome: 'Controllo + Panoramica',
        descrizione: 'Visita di controllo con radiografia',
        prezzo_speciale: '49',
        prezzo_originale: '120',
        scadenza: '31/12/2024',
        attiva: true,
        colore: '#00b894'
      }
    },
    offerte_inclusi: [
      'Visita specialistica completa',
      'Consulenza personalizzata',
      'Piano di trattamento dettagliato'
    ],
    festivita_italiane: {},
    ferie_programmate: {},
    orari_speciali: {}
  };
}

// ==================== ORARI E DISPONIBILITÀ ====================
function getAvailableSlots() {
  const orari = studioInfo.orari || {};
  const slots = [];
  
  if (orari.lunedi_venerdi && orari.lunedi_venerdi !== 'Chiuso') {
    slots.push({
      giorni: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì'],
      orario: orari.lunedi_venerdi,
      periodo: 'settimanale'
    });
  }
  
  if (orari.sabato && orari.sabato !== 'Chiuso') {
    slots.push({
      giorni: ['sabato'],
      orario: orari.sabato,
      periodo: 'weekend'
    });
  }
  
  return slots;
}

function isDateAvailable(dateString) {
  const msg = dateString.toLowerCase().trim();
  const festivita = studioInfo.festivita_italiane || {};
  const ferie = studioInfo.ferie_programmate || {};
  const orariSpeciali = studioInfo.orari_speciali || {};
  
  // Controlla giorni della settimana
  if (msg.includes('domenica')) {
    return {
      available: false,
      reason: 'domenica',
      message: '🚫 <strong>Domenica</strong><br>Lo studio è chiuso la domenica.'
    };
  }
  
  // Controlla festività specifiche
  if ((msg.includes('15') && msg.includes('agosto')) || msg.includes('ferragosto')) {
    return {
      available: false,
      reason: 'festivita',
      message: '🚫 <strong>Ferragosto</strong> (15/8)<br>Lo studio è chiuso per festività nazionale.'
    };
  }
  
  // Controlla festività italiane dal JSON
  for (const [key, festa] of Object.entries(festivita)) {
    if (festa.status === 'chiuso') {
      const nomi = [festa.nome?.toLowerCase(), key.toLowerCase()];
      if (nomi.some(nome => nome && msg.includes(nome))) {
        return {
          available: false,
          reason: 'festivita',
          message: `🚫 <strong>${festa.nome || key}</strong><br>Lo studio è chiuso per festività nazionale.`
        };
      }
      
      // Controlla date specifiche (giorno/mese)
      if (festa.giorno && festa.mese) {
        const monthNames = getMonthNames(festa.mese);
        if (msg.includes(festa.giorno.toString()) && 
            monthNames.some(month => msg.includes(month))) {
          return {
            available: false,
            reason: 'festivita',
            message: `🚫 <strong>${festa.nome || key}</strong> (${festa.giorno}/${festa.mese})<br>Lo studio è chiuso per festività nazionale.`
          };
        }
      }
    }
  }
  
  // Controlla ferie programmate
  for (const [key, feria] of Object.entries(ferie)) {
    const descrizioni = [feria.nome?.toLowerCase(), feria.descrizione?.toLowerCase(), key.toLowerCase()];
    if (descrizioni.some(desc => desc && msg.includes(desc.split(' ')[0]))) {
      return {
        available: false,
        reason: 'ferie',
        message: `🚫 <strong>${feria.nome || 'Periodo di ferie'}</strong><br>${feria.nota || feria.descrizione || 'Lo studio è chiuso per ferie programmate.'}`
      };
    }
  }
  
  // Controlla orari speciali
  for (const [key, orario] of Object.entries(orariSpeciali)) {
    const nomi = [orario.nome?.toLowerCase(), key.toLowerCase()];
    if (nomi.some(nome => nome && msg.includes(nome))) {
      if (orario.orario === 'Chiuso') {
        return {
          available: false,
          reason: 'orario_speciale',
          message: `🚫 <strong>${orario.nome}</strong><br>Lo studio è chiuso.`
        };
      } else {
        return {
          available: true,
          special: true,
          reason: 'orario_speciale',
          message: `⏰ <strong>${orario.nome}</strong><br>Orario speciale: ${orario.orario}`
        };
      }
    }
  }
  
  return { available: true };
}

function getMonthNames(monthNumber) {
  const months = {
    1: ['gennaio', 'gen'], 2: ['febbraio', 'feb'], 3: ['marzo', 'mar'],
    4: ['aprile', 'apr'], 5: ['maggio', 'mag'], 6: ['giugno', 'giu'],
    7: ['luglio', 'lug'], 8: ['agosto', 'ago'], 9: ['settembre', 'set'],
    10: ['ottobre', 'ott'], 11: ['novembre', 'nov'], 12: ['dicembre', 'dic']
  };
  return months[monthNumber] || [];
}

function generateAvailableSlotsMessage() {
  const slots = getAvailableSlots();
  
  let message = '📅 <strong>Orari disponibili per appuntamenti:</strong><br><br>';
  
  slots.forEach(slot => {
    if (slot.giorni.length === 1) {
      message += `🕘 <strong>${slot.giorni[0].charAt(0).toUpperCase() + slot.giorni[0].slice(1)}:</strong> ${slot.orario}<br>`;
    } else {
      const firstDay = slot.giorni[0].charAt(0).toUpperCase() + slot.giorni[0].slice(1);
      const lastDay = slot.giorni[slot.giorni.length-1].charAt(0).toUpperCase() + slot.giorni[slot.giorni.length-1].slice(1);
      message += `🕘 <strong>${firstDay} - ${lastDay}:</strong> ${slot.orario}<br>`;
    }
  });
  
  message += '<br>💡 <strong>Puoi scegliere:</strong><br>';
  message += '• Un giorno specifico (es: "lunedì mattina")<br>';
  message += '• Un periodo (es: "settimana prossima")<br>';
  message += '• Un orario preferito (es: "nel pomeriggio")<br><br>';
  message += '📝 <em>Per verificare aperture e chiusure durante festività, consulta la sezione "Orari dello Studio".</em><br><br>';
  
  return message;
}

function checkSpecificDate(userMessage) {
  const msg = userMessage.toLowerCase();
  
  const datePatterns = [
    /(\d{1,2})\s*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/i,
    /(\d{1,2})[\s\/\-](\d{1,2})/,
    /(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i,
    /(natale|capodanno|ferragosto|pasqua|epifania|festa|ferie)/i,
    /(agosto|dicembre)\s*(siete|aperto|aperti|chiuso)/i,
    /(il|del|di)\s*\d{1,2}/i
  ];
  
  return datePatterns.some(pattern => pattern.test(msg));
}

function generateSpecificDateResponse(userMessage) {
  const availability = isDateAvailable(userMessage);
  
  if (!availability.available) {
    return `${availability.message}<br><br>${generateAvailableSlotsMessage()}`;
  }
  
  if (availability.special) {
    return `${availability.message}<br><br>💡 Vuoi prenotare un appuntamento per questo giorno?`;
  }
  
  return generateHoursResponse();
}

// ==================== INTELLIGENT INTENT ANALYZER ====================
function analyzeUserIntent(message) {
  const msg = message.toLowerCase().trim();
  
  // ORARI
  if (msg.includes('orari') || msg.includes('orario') || 
      msg.includes('quando siete aperti') || msg.includes('quando aprite') ||
      msg.includes('apertura') || msg.includes('aperti') ||
      (msg.includes('quali') && msg.includes('orari')) ||
      (msg.includes('che') && msg.includes('orari')) ||
      msg.match(/quando.*(aperto|aperti|chiuso)/i)) {
    return { type: 'hours', confidence: 'high', context: message };
  }
  
  // POSIZIONE
  if (msg.includes('dove siete') || msg.includes('dove vi trovate') ||
      msg.includes('dove si trova') || msg.includes('indirizzo') ||
      msg.includes('posizione') || msg.includes('sede') ||
      msg.includes('come arrivare') || msg.includes('raggiungere') ||
      (msg.includes('dove') && !msg.includes('cosa'))) {
    return { type: 'location', confidence: 'high', context: message };
  }
  
  // OFFERTE - AGGIUNTO CON PRIORITÀ ALTA
  if (msg.includes('offerta') || msg.includes('offerte') ||
      msg.includes('sconto') || msg.includes('sconti') ||
      msg.includes('promozione') || msg.includes('promozioni') ||
      (msg.includes('dimmi') && (msg.includes('offerta') || msg.includes('offerte'))) ||
      (msg.includes('sapere') && (msg.includes('offerta') || msg.includes('offerte'))) ||
      (msg.includes('vorrei') && (msg.includes('offerta') || msg.includes('offerte'))) ||
      msg.includes('offerta speciale')) {
    return { type: 'offer', confidence: 'high', context: message };
  }
  
  // APPUNTAMENTI
  if (msg.includes('appuntamento') || msg.includes('prenotare') ||
      msg.includes('prenotazione') || msg.includes('prenoto') ||
      msg.includes('booking') || 
      (msg.includes('visita') && !msg.includes('dove'))) {
    return { type: 'appointment', confidence: 'high', context: message };
  }
  
  // PREVENTIVI E PREZZI
  if (msg.includes('preventivo') || msg.includes('quanto costa') ||
      msg.includes('tariffe') || msg.includes('prezzi') ||
      (msg.includes('prezzo') && !msg.includes('poco')) ||
      (msg.includes('costo') && !msg.includes('basso'))) {
    return { type: 'quote', confidence: 'high', context: message };
  }
  
  // SERVIZI
  if ((msg.includes('servizi') || msg.includes('trattamenti') ||
       msg.includes('specializzazioni') || msg.includes('cosa fate') ||
       msg.includes('cosa offrite')) &&
      !msg.includes('orari') && !msg.includes('dove') && !msg.includes('costo') &&
      !msg.includes('offerta')) {
    return { type: 'services', confidence: 'high', context: message };
  }
  
  // CONTATTI
  if (msg.includes('contatto') || msg.includes('telefono') ||
      msg.includes('email') || msg.includes('chiamare') || 
      msg.includes('scrivere') || msg.includes('numero')) {
    return { type: 'contact', confidence: 'high', context: message };
  }
  
  // CONFERME CONTESTUALI
  if (msg.match(/^(si|sì|ok|va bene|confermo|esatto|perfetto)$/i)) {
    if (conversationState.lastBotResponse) {
      if (conversationState.lastBotResponse.includes('appuntamento')) {
        return { type: 'appointment', confidence: 'context', context: 'confirmation' };
      }
      if (conversationState.lastBotResponse.includes('preventivo')) {
        return { type: 'quote', confidence: 'context', context: 'confirmation' };
      }
      if (conversationState.lastBotResponse.includes('offerta')) {
        return { type: 'offer', confidence: 'context', context: 'confirmation' };
      }
    }
    return { type: 'confirmation', confidence: 'medium', context: message };
  }
  
  // RICHIESTE CON "DIMMI"
  if (msg.includes('dimmi')) {
    if (msg.includes('orari') || msg.includes('quando')) {
      return { type: 'hours', confidence: 'high', context: 'request_more' };
    }
    if (msg.includes('dove') || msg.includes('indirizzo')) {
      return { type: 'location', confidence: 'high', context: 'request_more' };
    }
    if (msg.includes('offerta') || msg.includes('offerte')) {
      return { type: 'offer', confidence: 'high', context: 'request_more' };
    }
    if (msg.includes('servizi') || msg.includes('cosa')) {
      return { type: 'services', confidence: 'high', context: 'request_more' };
    }
    if (msg.includes('più') && conversationState.lastIntent) {
      return { type: conversationState.lastIntent, confidence: 'context', context: 'more_info' };
    }
  }
  
  // SALUTI
  if (msg.match(/^(ciao|salve|buongiorno|buonasera|hey|hello)$/i) ||
      (msg.includes('ciao') && msg.split(' ').length <= 2)) {
    return { type: 'greeting', confidence: 'high', context: message };
  }
  
  // RINGRAZIAMENTI
  if (msg.includes('grazie') || msg.includes('ringrazio')) {
    return { type: 'thanks', confidence: 'high', context: message };
  }
  
  // APPREZZAMENTI
  if (msg.match(/^(ottimo|bene|perfetto|ok)$/i)) {
    return { type: 'positive_feedback', confidence: 'medium', context: message };
  }
  
  // EMERGENZE
  if (msg.includes('urgente') || msg.includes('dolore') ||
      msg.includes('male') || msg.includes('emergenza') || 
      msg.includes('subito') || msg.includes('presto')) {
    return { type: 'emergency', confidence: 'high', context: message };
  }
  
  // SERVIZI SPECIFICI
  const specificServices = {
    'pulizia': 'igiene_orale', 'igiene': 'igiene_orale', 'detartrasi': 'igiene_orale',
    'carie': 'endodonzia', 'otturazione': 'endodonzia', 'devitalizzazione': 'endodonzia',
    'impianto': 'implantologia', 'impianti': 'implantologia',
    'protesi': 'protesi_dentali', 'dentiera': 'protesi_dentali',
    'apparecchio': 'ortodonzia', 'ortodonzia': 'ortodonzia', 'allineatori': 'ortodonzia',
    'estetica': 'estetica_dentale', 'sbiancamento': 'estetica_dentale', 'faccette': 'estetica_dentale',
    'endodonzia': 'endodonzia', 'parodontologia': 'parodontologia', 'gengive': 'parodontologia'
  };
  
  for (const [service, category] of Object.entries(specificServices)) {
    if (msg.includes(service)) {
      return { 
        type: 'services', 
        specificService: category,
        confidence: 'high',
        context: message 
      };
    }
  }
  
  return { type: 'general', confidence: 'low', context: message };
}

// ==================== AI RESPONSE ENGINE ====================
async function generateAIResponse(userMessage) {
  const msg = userMessage.toLowerCase();
  
  conversationState.lastUserMessage = userMessage;
  
  // Se stiamo raccogliendo dati, gestisci il flusso
  if (conversationState.collecting) {
    const response = await handleDataCollectionFlow(userMessage);
    conversationState.lastBotResponse = response;
    return response;
  }
  
  // Controlla se l'utente sta chiedendo di una data specifica
  if (checkSpecificDate(userMessage)) {
    const response = generateSpecificDateResponse(userMessage);
    conversationState.lastBotResponse = response;
    conversationState.lastIntent = 'hours';
    return response;
  }
  
  // Analisi intelligente dell'intent
  const intent = analyzeUserIntent(msg);
  conversationState.lastIntent = intent.type;
  
  let response = '';
  
  switch (intent.type) {
    case 'greeting':
      response = handleGreeting();
      break;
    case 'thanks':
      response = handleThanks();
      break;
    case 'positive_feedback':
      response = handlePositiveFeedback();
      break;
    case 'confirmation':
      response = handleConfirmation();
      break;
    case 'appointment':
      response = await startAppointmentFlow();
      break;
    case 'quote':
      response = await startQuoteFlow();
      break;
    case 'offer':
      response = await startOfferFlow();
      break;
    case 'hours':
      response = generateHoursResponse();
      break;
    case 'location':
      response = generateLocationResponse();
      break;
    case 'contact':
      response = generateContactResponse();
      break;
    case 'services':
      response = generateServicesResponse(intent.specificService);
      break;
    case 'emergency':
      response = generateEmergencyResponse();
      break;
    default:
      response = generateContextualResponse(userMessage, intent);
  }
  
  conversationState.lastBotResponse = response;
  return response;
}

async function showWelcomeMessage() {
  const studioNome = studioInfo.studio?.nome || 'Studio Dentistico Demo';
  const welcomeMsg = `👋 Ciao! Sono l'assistente digitale di ${studioNome}. Come posso aiutarti oggi?`;
  await appendMessage('bot', welcomeMsg);
  
  setTimeout(showInitialOptions, 2000);
}

// ==================== RESPONSE GENERATORS ====================
function handleGreeting() {
  const responses = [
    '👋 Ciao! Come posso aiutarti oggi?',
    '😊 Salve! Sono qui per aiutarti con qualsiasi domanda.',
    '🌟 Buongiorno! Di cosa hai bisogno?'
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function handleThanks() {
  return '😊 Prego! È un piacere aiutarti. Hai altre domande?';
}

function handlePositiveFeedback() {
  return '😊 Sono contento che sia tutto chiaro! Posso aiutarti con altro?';
}

function handleConfirmation() {
  return `
    😊 Perfetto! Cosa posso fare per te?<br><br>
    📅 <strong>Prenotare un appuntamento</strong><br>
    📋 <strong>Richiedere un preventivo</strong><br>
    🎁 <strong>Offerte speciali</strong><br>
    ℹ️ <strong>Informazioni sui servizi</strong><br><br>
    💡 Scrivi quello che ti interessa!
  `;
}

function generateHoursResponse() {
  const studioNome = studioInfo.studio?.nome || 'Studio Demo';
  const orari = studioInfo.orari || {};
  
  let response = `📅 <strong>Orari di ${studioNome}</strong><br><br>`;
  
  Object.entries(orari).forEach(([key, value]) => {
    if (key !== 'note' && value) {
      const dayLabel = {
        'lunedi_venerdi': 'Lunedì - Venerdì',
        'sabato': 'Sabato', 
        'domenica': 'Domenica',
        'lunedi': 'Lunedì',
        'martedi': 'Martedì',
        'mercoledi': 'Mercoledì',
        'giovedi': 'Giovedì',
        'venerdi': 'Venerdì'
      };
      
      const label = dayLabel[key] || key.charAt(0).toUpperCase() + key.slice(1);
      response += `🕘 <strong>${label}:</strong> ${value}<br>`;
    }
  });
  
  response += '<br>📝 <em>Per verificare aperture e chiusure durante festività, consulta la sezione "Orari dello Studio".</em><br>';
  response += '<br>💡 Vuoi prenotare un appuntamento?';
  
  return response;
}

function generateLocationResponse() {
  const studio = studioInfo.studio || {};
  const studioNome = studio.nome || 'Studio Demo';
  const indirizzo = studio.indirizzo || 'Via Demo 123, Milano (MI)';
  
  return `
    📍 <strong>Dove trovarci</strong><br><br>
    <strong>${studioNome}</strong><br>
    📌 ${indirizzo}<br><br>
    🚗 Parcheggio disponibile<br>
    🚇 Facilmente raggiungibile con mezzi pubblici<br><br>
    💡 Clicca su "Dove trovarci" nella sidebar per vedere la mappa!
  `;
}

function generateContactResponse() {
  const contatti = studioInfo.contatti || {};
  const studio = studioInfo.studio || {};
  const telefono = contatti.telefono?.numero || studio.telefono || '+39 123 456 7890';
  const email = contatti.email?.indirizzo || studio.email || 'info@studiodemo.it';
  
  return `
    📞 <strong>Come contattarci</strong><br><br>
    ☎️ <strong>Telefono:</strong> ${telefono}<br>
    ✉️ <strong>Email:</strong> ${email}<br><br>
    💬 Oppure continua pure a scrivermi qui per qualsiasi informazione!<br><br>
    🎯 Posso aiutarti a prenotare un appuntamento o fornirti un preventivo.
  `;
}

function generateServicesResponse(specificService = null) {
  const servizi = studioInfo.servizi || {};
  
  if (specificService && servizi[specificService]) {
    const servizio = servizi[specificService];
    return `
      🦷 <strong>${servizio.nome}</strong><br><br>
      📋 ${servizio.descrizione}<br><br>
      ${servizio.prezzo_base ? `💰 <strong>A partire da:</strong> ${servizio.prezzo_base}<br><br>` : ''}
      💡 Vuoi un preventivo personalizzato per questo trattamento?
    `;
  }
  
  const serviziList = Object.values(servizi)
    .filter(s => s.disponibile !== false)
    .map(s => `• <strong>${s.nome}</strong>: ${s.descrizione}`)
    .join('<br>');
  
  if (serviziList) {
    return `
      🦷 <strong>I nostri servizi</strong><br><br>
      ${serviziList}<br><br>
      💡 Vuoi maggiori dettagli su un servizio specifico o un preventivo personalizzato?
    `;
  }
  
  return `
    🦷 <strong>I nostri servizi</strong><br><br>
    • <strong>Igiene Orale</strong>: Prevenzione e detartrasi<br>
    • <strong>Implantologia</strong>: Sostituzione denti mancanti<br>
    • <strong>Ortodonzia</strong>: Apparecchi per allineamento<br>
    • <strong>Estetica Dentale</strong>: Sbiancamento e faccette<br>
    • <strong>Endodonzia</strong>: Terapia canalare<br>
    • <strong>Parodontologia</strong>: Cura delle gengive<br><br>
    💡 Vuoi maggiori dettagli su un servizio specifico o un preventivo personalizzato?
  `;
}

function generateEmergencyResponse() {
  const contatti = studioInfo.contatti || {};
  const studio = studioInfo.studio || {};
  const telefono = contatti.telefono?.numero || studio.telefono || '+39 123 456 7890';
  
  return `
    🚨 <strong>Emergenza dentale</strong><br><br>
    Per urgenze immediate ti consiglio di:<br>
    📞 <strong>Chiamare subito:</strong> ${telefono}<br><br>
    ⏰ Se siamo chiusi, lascia un messaggio in segreteria per le emergenze.<br><br>
    💡 Vuoi che ti aiuti a prenotare una visita urgente?
  `;
}

function generateContextualResponse(message, intent) {
  const msg = message.toLowerCase();
  
  // Risposte per prenotazione offerte
  if (msg.includes('prenota offerta') || msg.includes('prenotare offerta') ||
      msg.includes('voglio prenotare') || 
      (msg.includes('prenota') && conversationState.lastIntent === 'offer')) {
    return startOfferBookingFlow();
  }
  
  const contextResponses = {
    'bambini': '👶 Ci prendiamo cura anche dei più piccoli! Abbiamo un approccio delicato e giocoso. Vuoi prenotare una visita pediatrica?',
    'paura': '😌 Capisco la tua preoccupazione. Il nostro team è specializzato nel mettere a proprio agio i pazienti ansiosi. Parliamo di cosa ti preoccupa?',
    'dolore': '😰 Mi dispiace che tu abbia dolore. È importante non aspettare. Vuoi che ti aiuti a prenotare una visita urgente?',
    'apparecchio': '😁 L\'ortodonzia moderna offre molte soluzioni discrete! Dai classici agli allineatori trasparenti. Vuoi saperne di più?',
    'impianto': '🦷 Gli impianti sono la soluzione definitiva per sostituire i denti mancanti. Vuoi informazioni specifiche o un preventivo?',
    'pulizia': '✨ La pulizia professionale è fondamentale! Consigliamo ogni 6 mesi. Vuoi prenotare o avere un preventivo?'
  };
  
  for (const [keyword, response] of Object.entries(contextResponses)) {
    if (msg.includes(keyword)) {
      return response;
    }
  }
  
  return `
    🤔 Capisco che tu stia cercando informazioni.<br><br>
    Posso aiutarti con:<br>
    📅 <strong>Appuntamenti</strong> e prenotazioni<br>
    📋 <strong>Preventivi</strong> personalizzati<br>
    🎁 <strong>Offerte speciali</strong><br>
    🕐 <strong>Orari</strong> e informazioni<br>
    🦷 <strong>Servizi</strong> e trattamenti<br><br>
    💡 Di cosa hai bisogno nello specifico?
  `;
}

// ==================== DATA COLLECTION FLOWS ====================
async function startAppointmentFlow() {
  conversationState.collecting = true;
  conversationState.requestType = 'appointment';
  conversationState.requiredFields = ['nome', 'telefono', 'email', 'preferenza_data', 'motivo', 'gdpr'];
  conversationState.collectedData = {};
  conversationState.pendingField = 'nome';
  
  return `
    📅 <strong>Prenotazione appuntamento</strong><br><br>
    Perfetto! Ti aiuto a prenotare un appuntamento.<br><br>
    💭 Per iniziare, come ti chiami?
  `;
}

async function startQuoteFlow() {
  conversationState.collecting = true;
  conversationState.requestType = 'quote';
  conversationState.requiredFields = ['nome', 'telefono', 'email', 'servizio_richiesto', 'dettagli', 'gdpr'];
  conversationState.collectedData = {};
  conversationState.pendingField = 'nome';
  
  return `
    📋 <strong>Richiesta preventivo</strong><br><br>
    Ottimo! Ti preparo un preventivo personalizzato e gratuito.<br><br>
    💭 Iniziamo: qual è il tuo nome?
  `;
}

async function startOfferFlow() {
  const offerte = studioInfo.offerte || {};
  
  // Se ci sono offerte nel JSON, mostrole tutte
  if (Object.keys(offerte).length > 0) {
    let offerteHTML = '🎁 <strong>Offerte Speciali</strong><br><br>';
    
    Object.entries(offerte).forEach(([key, offerta]) => {
      if (offerta.attiva !== false) {
        const colore = offerta.colore || '#007bff';
        
        // Gestione flessibile del prezzo - cerca diversi campi possibili
        let prezzoSpeciale = '';
        if (offerta.prezzo_speciale) {
          prezzoSpeciale = offerta.prezzo_speciale;
        } else if (offerta.prezzo) {
          prezzoSpeciale = offerta.prezzo;
        } else if (offerta.costo) {
          prezzoSpeciale = offerta.costo;
        } else if (offerta.tariffa) {
          prezzoSpeciale = offerta.tariffa;
        }
        
        // Gestione prezzo originale
        let prezzoOriginale = '';
        if (offerta.prezzo_originale) {
          prezzoOriginale = `<span style="text-decoration: line-through; opacity: 0.7;">€${offerta.prezzo_originale}</span>`;
        } else if (offerta.prezzo_normale) {
          prezzoOriginale = `<span style="text-decoration: line-through; opacity: 0.7;">€${offerta.prezzo_normale}</span>`;
        }
        
        // Se non c'è prezzo, non mostrare la parte prezzo
        const prezzoDisplay = prezzoSpeciale ? 
          `<span style="font-size: 24px; font-weight: bold;">€${prezzoSpeciale}</span> ${prezzoOriginale}<br>` : 
          '';
        
        offerteHTML += `
          <div style="background: linear-gradient(135deg, ${colore} 0%, ${colore}dd 100%); padding: 15px; border-radius: 8px; color: white; margin: 10px 0;">
            <strong>${offerta.nome || offerta.titolo || 'Offerta Speciale'}</strong><br>
            ${offerta.descrizione ? `${offerta.descrizione}<br>` : ''}
            ${prezzoDisplay}
            ${offerta.scadenza ? `<small>⏰ Valida fino al: ${offerta.scadenza}</small>` : ''}
            ${offerta.validita ? `<small>⏰ Valida fino al: ${offerta.validita}</small>` : ''}
          </div>
        `;
      }
    });
    
    // Aggiungi dettagli inclusi se presenti
    const inclusi = studioInfo.offerte_inclusi || [
      'Visita specialistica completa',
      'Consulenza personalizzata', 
      'Piano di trattamento dettagliato'
    ];
    
    offerteHTML += '<br>📝 <strong>Tutte le offerte includono:</strong><br>';
    inclusi.forEach(item => {
      offerteHTML += `• ${item}<br>`;
    });
    
    offerteHTML += '<br>💡 <strong>Vuoi prenotare una di queste offerte?</strong><br>';
    offerteHTML += 'Scrivi "prenota offerta" o "voglio prenotare"!';
    
    return offerteHTML;
  }
  
  // Se non ci sono offerte nel JSON, messaggio di fallback
  return `
    🎁 <strong>Offerte speciali</strong><br><br>
    Al momento non abbiamo offerte attive, ma posso fornirti un <strong>preventivo personalizzato</strong> che potrebbe sorprenderti!<br><br>
    💡 Vuoi procedere con una richiesta di preventivo?
  `;
}
  
async function startOfferBookingFlow() {
  const offerte = studioInfo.offerte || {};
  
  if (Object.keys(offerte).length > 0) {
    conversationState.collecting = true;
    conversationState.requestType = 'offer';
    conversationState.requiredFields = ['nome', 'telefono', 'email', 'offerta_scelta', 'gdpr'];
    conversationState.collectedData = {};
    conversationState.pendingField = 'nome';
    
    return `
      🎁 <strong>Prenotazione Offerta Speciale</strong><br><br>
      Perfetto! Ti aiuto a prenotare una delle nostre offerte.<br><br>
      💭 Per iniziare, come ti chiami?
    `;
  }
  
  return `
    🎁 <strong>Offerte speciali</strong><br><br>
    Al momento non abbiamo offerte attive, ma posso fornirti un <strong>preventivo personalizzato</strong>!<br><br>
    💡 Vuoi procedere con una richiesta di preventivo?
  `;
}

// ==================== DATA COLLECTION HANDLER ====================
async function handleDataCollectionFlow(userMessage) {
  if (!conversationState.collecting) {
    return await generateAIResponse(userMessage);
  }
  
  const currentField = conversationState.pendingField;
  
  if (isOffContext(userMessage)) {
    const tempCollecting = conversationState.collecting;
    const tempField = conversationState.pendingField;
    
    conversationState.collecting = false;
    const contextResponse = await generateAIResponse(userMessage);
    
    if (tempCollecting) {
      conversationState.collecting = tempCollecting;
      conversationState.pendingField = tempField;
      const returnPrompt = getReturnPrompt(currentField);
      return `${contextResponse}<br><br>${returnPrompt}`;
    }
    
    return contextResponse;
  }
  
  const result = processFieldData(currentField, userMessage);
  
  if (!result.valid) {
    return result.errorMessage;
  }
  
  if (result.fieldName) {
    conversationState.collectedData[result.fieldName] = result.value;
  } else {
    conversationState.collectedData[currentField] = result.value;
  }
  
  const nextField = getNextRequiredField();
  
  if (!nextField) {
    if (!conversationState.collectedData.gdpr) {
      conversationState.pendingField = 'gdpr';
      return getQuestionForField('gdpr');
    }
    return await completeDataCollection();
  }
  
  conversationState.pendingField = nextField;
  return getQuestionForField(nextField);
}

function isOffContext(message) {
  const contextKeywords = ['orari', 'dove', 'contatto', 'servizi', 'grazie', 'ciao'];
  const msg = message.toLowerCase();
  return contextKeywords.some(keyword => msg.includes(keyword)) && 
         !msg.includes('nome') && !msg.includes('telefono') && !msg.includes('email');
}

function getReturnPrompt(currentField) {
  const prompts = {
    'nome': '👤 Tornando alla tua richiesta, come ti chiami?',
    'telefono': '📱 Perfetto! Ora dimmi il tuo numero di telefono:',
    'email': '✉️ Ottimo! E la tua email?',
    'preferenza_data': '📅 Quando preferiresti l\'appuntamento?',
    'motivo': '🦷 Per quale motivo hai bisogno dell\'appuntamento?',
    'servizio_richiesto': '🔧 Per quale servizio vuoi il preventivo?',
    'dettagli': '📝 Puoi darmi qualche dettaglio in più?',
    'offerta_scelta': '🎁 Quale offerta ti interessa?',
    'gdpr': '📋 Ho bisogno del tuo consenso per procedere:'
  };
  
  return prompts[currentField] || 'Continuiamo con la tua richiesta:';
}

function getQuestionForField(field) {
  const questions = {
    'nome': '👤 Perfetto! E il tuo cognome?',
    'telefono': '📱 Ottimo! Ora dimmi il tuo numero di telefono:',
    'email': '✉️ Perfetto! Qual è la tua email?',
    'preferenza_data': generateAvailableSlotsMessage(),
    'motivo': '🦷 Per quale motivo hai bisogno dell\'appuntamento? (visita, controllo, urgenza...)',
    'servizio_richiesto': '🔧 Per quale servizio ti serve il preventivo? (igiene, impianto, apparecchio...)',
    'dettagli': '📝 Puoi darmi qualche dettaglio in più sulla tua situazione?',
    'offerta_scelta': generateOffertaSceltaQuestion(),
    'gdpr': generateGDPRRequest()
  };
  
  return questions[field] || 'Dimmi di più:';
}

function generateOffertaSceltaQuestion() {
  const offerte = studioInfo.offerte || {};
  
  if (Object.keys(offerte).length === 0) {
    return 'Quale offerta ti interessa?';
  }
  
  let question = '🎁 <strong>Quale offerta ti interessa?</strong><br><br>';
  let counter = 1;
  
  Object.entries(offerte).forEach(([key, offerta]) => {
    if (offerta.attiva !== false) {
      question += `${counter}️⃣ <strong>${offerta.nome}</strong> - €${offerta.prezzo_speciale}<br>`;
      counter++;
    }
  });
  
  question += '<br>💬 Scrivi il numero o il nome dell\'offerta che preferisci:';
  
  return question;
}

function generateGDPRRequest() {
  return `
    📋 <strong>Consenso al trattamento dati</strong><br><br>
    Per completare la richiesta ho bisogno del tuo consenso al trattamento dei dati personali secondo il GDPR.<br><br>
    
    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #007bff;">
      <strong>📝 Cosa facciamo con i tuoi dati:</strong><br>
      • Li utilizziamo solo per rispondere alla tua richiesta<br>
      • Non li condividiamo con terzi<br>
      • Li conserviamo per il tempo necessario<br>
      • Puoi richiederne la cancellazione in qualsiasi momento<br><br>
      
      <a href="https://example.com/privacy" target="_blank" style="color: #007bff; text-decoration: underline;">
        📄 Leggi la Privacy Policy completa
      </a>
    </div>
    
    <button id="gdpr-accept-btn" class="chat-option-btn" style="background: #28a745; color: white; padding: 12px 24px; margin: 10px 0; border: none; border-radius: 6px; cursor: pointer;">
      ✅ ACCETTO IL TRATTAMENTO DATI
    </button><br><br>
    
    <small style="color: #666;">Cliccando accetti il trattamento dei tuoi dati personali.</small>
  `;
}

// ==================== GESTIONE GDPR E COMPLETAMENTO ====================
function setupGDPRButton() {
  setTimeout(() => {
    const gdprBtn = document.getElementById('gdpr-accept-btn');
    if (gdprBtn && !gdprBtn.hasAttribute('data-listener-added')) {
      gdprBtn.setAttribute('data-listener-added', 'true');
      
      gdprBtn.addEventListener('click', async function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (this.disabled) return;
        
        this.disabled = true;
        this.innerHTML = '✅ CONSENSO ACCORDATO';
        this.style.background = '#6c757d';
        this.style.cursor = 'not-allowed';
        
        if (!conversationState.collecting || !conversationState.collectedData.nome) {
          await appendMessage('bot', '❌ Si è verificato un errore. Ti prego di ripetere la richiesta.');
          return;
        }
        
        conversationState.collectedData.gdpr = 'accettato';
        await appendMessage('user', '✅ Accetto il trattamento dei dati');
        
        try {
          const completionResponse = await completeDataCollection();
          await appendMessage('bot', completionResponse);
        } catch (error) {
          console.error('Errore completamento:', error);
          await appendMessage('bot', '❌ Si è verificato un errore durante il completamento. Ti prego di ripetere la richiesta.');
        }
      });
    }
  }, 200);
}

// ==================== FIELD PROCESSING ====================
function processFieldData(field, userMessage) {
  // Gestione nome/cognome
  if (field === 'nome' && conversationState.collectedData.nome) {
    const surname = userMessage.trim();
    if (surname.length < 2) {
      return { 
        valid: false, 
        errorMessage: '❌ Il cognome deve essere di almeno 2 caratteri. Puoi ripetere?' 
      };
    }
    
    if (!/^[a-zA-ZàáâãäåèéêëìíîïòóôõöùúûüÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜ\s\'-]+$/.test(surname)) {
      return { 
        valid: false, 
        errorMessage: '❌ Il cognome contiene caratteri non validi. Usa solo lettere, per favore.' 
      };
    }
    
    const nomeCompleto = `${conversationState.collectedData.nome} ${surname}`;
    return { 
      valid: true, 
      value: nomeCompleto,
      fieldName: 'nome',
      successMessage: `✅ Perfetto! ${nomeCompleto}`
    };
  }
  
  switch (field) {
    case 'nome':
      return processNameField(userMessage);
    case 'telefono':
      return processPhoneField(userMessage);
    case 'email':
      return processEmailField(userMessage);
    case 'preferenza_data':
      const availability = isDateAvailable(userMessage);
      if (!availability.available) {
        return {
          valid: false,
          errorMessage: `${availability.message}<br><br>${generateAvailableSlotsMessage()}`
        };
      }
      return processTextField(userMessage);
    case 'motivo':
    case 'servizio_richiesto':
    case 'dettagli':
    case 'offerta_scelta':
      return processTextField(userMessage);
    case 'gdpr':
      return { valid: true, value: 'accettato' };
    default:
      return { valid: true, value: userMessage.trim() };
  }
}

function processNameField(message) {
  const name = message.trim();
  
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
  
  return { valid: true, value: name };
}

function processPhoneField(message) {
  const phoneMatch = message.match(/[\d\s\-\+\(\)\.]{8,}/);
  
  if (!phoneMatch) {
    return { 
      valid: false, 
      errorMessage: '❌ Non riesco a trovare un numero di telefono. Puoi scriverlo di nuovo?' 
    };
  }
  
  return { valid: true, value: phoneMatch[0].trim() };
}

function processEmailField(message) {
  const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  
  if (!emailMatch) {
    return { 
      valid: false, 
      errorMessage: '❌ Non riesco a trovare un indirizzo email. Puoi scriverlo di nuovo?' 
    };
  }
  
  return { valid: true, value: emailMatch[0].toLowerCase() };
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

function getNextRequiredField() {
  return conversationState.requiredFields.find(field => 
    !conversationState.collectedData[field]
  );
}

async function completeDataCollection() {
  if (!conversationState.collecting) {
    throw new Error('Stato raccolta non valido');
  }
  
  const type = conversationState.requestType;
  const data = { ...conversationState.collectedData };
  
  if (!data.nome || !data.telefono || !data.email || !data.gdpr) {
    throw new Error('Dati essenziali mancanti');
  }
  
  // Reset stato IMMEDIATAMENTE
  conversationState.collecting = false;
  conversationState.pendingField = null;
  conversationState.collectedData = {};
  conversationState.requestType = null;
  
  let recap = '';
  let tipoRichiesta = '';
  
  switch (type) {
    case 'appointment':
      tipoRichiesta = 'Appuntamento';
      recap = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #007bff;">
          <strong>📋 Riepilogo Appuntamento:</strong><br><br>
          👤 <strong>Nome:</strong> ${data.nome}<br>
          📱 <strong>Telefono:</strong> ${data.telefono}<br>
          ✉️ <strong>Email:</strong> ${data.email}<br>
          📅 <strong>Preferenza:</strong> ${data.preferenza_data}<br>
          🦷 <strong>Motivo:</strong> ${data.motivo}<br>
        </div>
      `;
      break;
      
    case 'quote':
      tipoRichiesta = 'Preventivo';
      recap = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #007bff;">
          <strong>📋 Riepilogo Preventivo:</strong><br><br>
          👤 <strong>Nome:</strong> ${data.nome}<br>
          📱 <strong>Telefono:</strong> ${data.telefono}<br>
          ✉️ <strong>Email:</strong> ${data.email}<br>
          🔧 <strong>Servizio:</strong> ${data.servizio_richiesto}<br>
          📝 <strong>Dettagli:</strong> ${data.dettagli}<br>
        </div>
      `;
      break;
      
    case 'offer':
      tipoRichiesta = 'Offerta Speciale';
      recap = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #007bff;">
          <strong>📋 Riepilogo Offerta:</strong><br><br>
          👤 <strong>Nome:</strong> ${data.nome}<br>
          📱 <strong>Telefono:</strong> ${data.telefono}<br>
          ✉️ <strong>Email:</strong> ${data.email}<br>
          🎁 <strong>Offerta:</strong> ${data.offerta_scelta || data.offerta || 'Offerta speciale'}<br>
        </div>
      `;
      break;
  }
  
  const nomeUtente = data.nome?.split(' ')[0] || '';
  const telefono = studioInfo.studio?.telefono || '+39 123 456 7890';
  
  return `
    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 20px; border-radius: 12px; color: white; text-align: center; margin: 10px 0;">
      <h3>✅ RICHIESTA ${tipoRichiesta.toUpperCase()} COMPLETATA!</h3>
      <p><strong>Grazie ${nomeUtente}!</strong></p>
      <p>Ti contatteremo entro 24 ore al numero ${data.telefono}.</p>
      <p style="font-size: 14px; opacity: 0.9;">📧 Riceverai anche una conferma via email a ${data.email}</p>
    </div>
    
    ${recap}
    
    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 10px 0;">
      <strong>🎯 Prossimi passi:</strong><br>
      1. Riceverai una chiamata di conferma<br>
      2. Ti invieremo tutti i dettagli via email<br>
      3. Saremo lieti di accoglierti nel nostro studio!<br><br>
      
      <strong>📞 Hai urgenze?</strong> Chiamaci al ${telefono}
    </div>
    
    😊 <strong>Posso aiutarti con altro?</strong><br><br>
    💡 Puoi chiedermi informazioni su servizi, orari o prenotare un altro appuntamento!
  `;
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
  
  const response = await generateAIResponse(message);
  await appendMessage('bot', response);
  
  if (response.includes('gdpr-accept-btn')) {
    setupGDPRButton();
  }
}

// ==================== GLOBAL FUNCTIONS ====================
window.sendMessage = sendMessage;

console.log('✅ AI Chat System ottimizzato e pronto con supporto offerte');