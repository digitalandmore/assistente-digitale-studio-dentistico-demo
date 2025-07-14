const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

console.log('🚀 SERVER STARTUP - DEBUG INFO');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);

// ==================== MIDDLEWARE CON CORS MULTI-DOMAIN ====================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://assistente-digitale.it',
    'https://www.assistente-digitale.it',
    'https://assistente-digitale-studio-dentistico.onrender.com',
    'https://assistente-digitale.it/studio-dentistico-demo'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware per logging e redirect intelligente
app.use((req, res, next) => {
  const host = req.get('host');
  const fullPath = req.path;
  
  console.log(`${new Date().toISOString()} - ${req.method} ${host}${fullPath}`);
  
  // Se è assistente-digitale.it ma NON ha /studio-dentistico-demo E NON è API, redirect
  if (host === 'assistente-digitale.it' && !fullPath.startsWith('/studio-dentistico-demo') && fullPath !== '/' && !fullPath.startsWith('/api/')) {
    return res.redirect(301, `/studio-dentistico-demo${fullPath}`);
  }
  
  next();
});

// ==================== OPENAI CONFIGURATION ====================
let openai = null;

function initializeOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️ OPENAI_API_KEY non configurata');
    return null;
  }
  
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('✅ OpenAI inizializzato correttamente');
    return openai;
  } catch (error) {
    console.error('❌ Errore inizializzazione OpenAI:', error);
    return null;
  }
}

openai = initializeOpenAI();

// ==================== COMPANY INFO LOADER ====================
let companyInfo = {};

function loadCompanyInfo() {
  try {
    const companyInfoPath = path.join(__dirname, 'company-info.json');
    console.log('Tentativo caricamento company-info da:', companyInfoPath);
    
    if (fs.existsSync(companyInfoPath)) {
      const data = fs.readFileSync(companyInfoPath, 'utf8');
      companyInfo = JSON.parse(data);
      console.log('✅ Company info caricato:', Object.keys(companyInfo));
    } else {
      console.log('⚠️ File company-info.json non trovato, uso defaults minimi');
      companyInfo = getMinimalFallback();
    }
    return companyInfo;
  } catch (error) {
    console.error('❌ Errore caricamento company-info.json:', error);
    companyInfo = getMinimalFallback();
    return companyInfo;
  }
}

function getMinimalFallback() {
  console.log('⚠️ ATTENZIONE: Usando fallback minimali. Verificare company-info.json!');
  return {
    studio: {
      nome: "Studio Dentistico Demo",
      indirizzo: "Via dei Dentisti 10, Milano (MI)",
      telefono: "+39 123 456 7890",
      email: "info@studiodemo.it"
    },
    orari: {
      lunedi_venerdi: "09:00 - 18:00",
      sabato: "09:00 - 14:00",
      domenica: "Chiuso",
      note: "⚠️ VERIFICARE company-info.json per orari aggiornati"
    },
    servizi: {
      fallback: {
        nome: "Servizi Generali",
        descrizione: "⚠️ VERIFICARE company-info.json per lista completa servizi"
      }
    },
    festivita_italiane: {},
    ferie_programmate: {},
    offerte: {}
  };
}

loadCompanyInfo();

// ==================== SESSION MANAGEMENT ====================
const sessions = new Map();

function getOrCreateSession(req) {
  const sessionId = req.headers['x-session-id'] || 'default';
  
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      createdAt: new Date(),
      tokenCount: 0,
      flowCount: 0,
      chatCount: 0,
      conversationHistory: [],
      currentFlow: null,
      flowData: {},
      flowStep: 0,
      isExpired: false,
      lastActivity: new Date(),
      totalCost: 0,
      currentChatCost: 0
    });
    console.log(`📝 Nuova sessione creata: ${sessionId}`);
  }
  
  const session = sessions.get(sessionId);
  session.lastActivity = new Date();
  
  const timeoutMs = (parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 45) * 60 * 1000;
  if (Date.now() - session.createdAt.getTime() > timeoutMs) {
    session.isExpired = true;
  }
  
  return session;
}

function checkSessionLimits(session) {
  const maxTokens = parseInt(process.env.MAX_TOKENS_PER_SESSION) || 8000;
  const maxFlows = parseInt(process.env.MAX_FLOWS_PER_SESSION) || 5;
  const maxChats = parseInt(process.env.MAX_CHATS_PER_SESSION) || 3;
  const maxCostPerChat = parseFloat(process.env.MAX_COST_PER_CHAT) || 0.05;
  
  const currentChatCost = session.currentChatCost || 0;
  
  return {
    tokenLimitReached: session.tokenCount >= maxTokens,
    flowLimitReached: session.flowCount >= maxFlows,
    chatLimitReached: session.chatCount >= maxChats,
    costLimitReached: currentChatCost >= maxCostPerChat,
    sessionExpired: session.isExpired,
    currentChatCost: currentChatCost,
    remainingChats: maxChats - session.chatCount,
    remainingBudget: maxCostPerChat - currentChatCost
  };
}

function calculateCost(inputTokens, outputTokens) {
  const inputCost = parseFloat(process.env.INPUT_TOKEN_COST) || 0.00015;
  const outputCost = parseFloat(process.env.OUTPUT_TOKEN_COST) || 0.0006;
  
  return (inputTokens * inputCost / 1000) + (outputTokens * outputCost / 1000);
}

function resetCurrentChat(session) {
  session.chatCount += 1;
  session.currentChatCost = 0;
  session.conversationHistory = [];
  session.currentFlow = null;
  session.flowData = {};
  session.flowStep = 0;
  
  console.log(`🔄 Chat ${session.chatCount}/3 iniziata per sessione ${session.id}`);
  
  return session;
}

// ==================== HELPER FUNCTIONS PER CALCOLI TEMPORALI ====================
function calcolaGiornoSuccessivo(dataCorrente, giorniDaAggiungere = 1) {
  const data = new Date(dataCorrente);
  data.setDate(data.getDate() + giorniDaAggiungere);
  
  const giorni = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  
  return `${giorni[data.getDay()]} ${data.getDate()} ${mesi[data.getMonth()]} ${data.getFullYear()}`;
}

function èFestività(giorno, mese, festivita) {
  return Object.values(festivita).some(festa => 
    festa.mese === mese && festa.giorno === giorno
  );
}

function èInFerie(data, ferie) {
  const anno = data.getFullYear();
  const mese = data.getMonth() + 1;
  const giorno = data.getDate();
  
  return Object.values(ferie).some(periodo => {
    try {
      if (!periodo || !periodo.inizio || !periodo.fine) return false;
      if (typeof periodo.inizio !== 'string' || typeof periodo.fine !== 'string') return false;
      
      const [inizioGiorno, inizioMese] = periodo.inizio.split('-').map(Number);
      const [fineGiorno, fineMese] = periodo.fine.split('-').map(Number);
      
      if (isNaN(inizioGiorno) || isNaN(inizioMese) || isNaN(fineGiorno) || isNaN(fineMese)) return false;
      
      const inizioData = new Date(anno, inizioMese - 1, inizioGiorno);
      const fineData = new Date(anno, fineMese - 1, fineGiorno);
      
      if (fineMese < inizioMese) {
        fineData.setFullYear(anno + 1);
      }
      
      return data >= inizioData && data <= fineData;
    } catch (error) {
      console.error('❌ Errore controllo ferie:', error);
      return false;
    }
  });
}

// NUOVA FUNZIONE: Genera informazioni complete sui periodi di chiusura
function generaInfoPeriodi(ferie, festivita, annoCorrente) {
  let infoPeriodi = '';
  
  // Lista ferie programmate CON CONTROLLO INTELLIGENTE
  const ferieList = Object.values(ferie)
    .filter(periodo => periodo && periodo.inizio && periodo.fine && typeof periodo.inizio === 'string')
    .map(periodo => {
      try {
        const [inizioGiorno, inizioMese] = periodo.inizio.split('-').map(Number);
        const [fineGiorno, fineMese] = periodo.fine.split('-').map(Number);
        
        return `• ${periodo.descrizione || 'Periodo di chiusura'}: dal ${inizioGiorno}/${inizioMese} al ${fineGiorno}/${fineMese} (${periodo.inizio} al ${periodo.fine})`;
      } catch (error) {
        return `• ${periodo.descrizione || 'Periodo di chiusura'}: date da verificare`;
      }
    })
    .join('\n');
  
  if (ferieList) {
    infoPeriodi += `\n\nPERIODI DI CHIUSURA ${annoCorrente}:\n${ferieList}`;
  }
  
  // Lista festività principali
  const festivitaList = Object.values(festivita)
    .filter(festa => festa && festa.nome && festa.giorno && festa.mese)
    .map(festa => `• ${festa.nome}: ${festa.giorno}/${festa.mese} (${festa.giorno.toString().padStart(2, '0')}-${festa.mese.toString().padStart(2, '0')})`)
    .join('\n');
  
  if (festivitaList) {
    infoPeriodi += `\n\nFESTIVITÀ (sempre chiusi):\n${festivitaList}`;
  }
  
  return infoPeriodi;
}

// ==================== SISTEMA PROMPT CON DATA/ORA ITALIANA COMPLETA ====================
function generateDynamicSystemPrompt(session, companyInfo) {
  const studio = companyInfo.studio || {};
  const orari = companyInfo.orari || {};
  const servizi = companyInfo.servizi || {};
  const offerte = companyInfo.offerte || {};
  const festivita = companyInfo.festivita_italiane || {};
  const ferie = companyInfo.ferie_programmate || {};
  const orariSpeciali = companyInfo.orari_speciali || {};
  
  // ==================== DATA/ORA ITALIANA COMPLETA ====================
  const ora = new Date();
  const orarioItalia = new Date(ora.toLocaleString("en-US", {timeZone: "Europe/Rome"}));
  
  const giorni = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  
  const annoCorrente = orarioItalia.getFullYear();
  const meseCorrente = orarioItalia.getMonth() + 1;
  const giornoCorrente = orarioItalia.getDate();
  const giornoSettimana = orarioItalia.getDay();
  const oreCorrente = orarioItalia.getHours();
  const minutiCorrente = orarioItalia.getMinutes();
  
  const dataCompleta = `${giorni[giornoSettimana]} ${giornoCorrente} ${mesi[orarioItalia.getMonth()]} ${annoCorrente}`;
  const oraCompleta = `${oreCorrente.toString().padStart(2, '0')}:${minutiCorrente.toString().padStart(2, '0')}`;
  const oggiStr = `${giornoCorrente.toString().padStart(2, '0')}-${meseCorrente.toString().padStart(2, '0')}`;
  
  // ==================== CONTROLLI TEMPORALI AVANZATI ====================
  let infoSpeciali = '';
  
  // Controllo se siamo aperti ORA
  let statoApertura = '';
  if (giornoSettimana === 0) { // Domenica
    statoApertura = '🔴 CHIUSO (Domenica)';
  } else if (giornoSettimana >= 1 && giornoSettimana <= 5) { // Lun-Ven
    if (oreCorrente >= 9 && (oreCorrente < 18 || (oreCorrente === 18 && minutiCorrente === 0))) {
      statoApertura = '🟢 APERTO ORA';
    } else if (oreCorrente < 9) {
      const minRimanenti = (9 - oreCorrente) * 60 - minutiCorrente;
      statoApertura = `🟡 CHIUSO - Apriamo alle 09:00 (tra ${Math.floor(minRimanenti/60)}h ${minRimanenti%60}min)`;
    } else {
      statoApertura = '🔴 CHIUSO - Riapriamo domani alle 09:00';
    }
  } else if (giornoSettimana === 6) { // Sabato
    if (oreCorrente >= 9 && (oreCorrente < 13 || (oreCorrente === 13 && minutiCorrente === 0))) {
      statoApertura = '🟢 APERTO ORA';
    } else if (oreCorrente < 9) {
      const minRimanenti = (9 - oreCorrente) * 60 - minutiCorrente;
      statoApertura = `🟡 CHIUSO - Apriamo alle 09:00 (tra ${Math.floor(minRimanenti/60)}h ${minRimanenti%60}min)`;
    } else {
      statoApertura = '🔴 CHIUSO - Riapriamo lunedì alle 09:00';
    }
  }
  
  // Controllo festività OGGI
  Object.values(festivita).forEach(festa => {
    if (festa && festa.mese === meseCorrente && festa.giorno === giornoCorrente) {
      statoApertura = `🔴 CHIUSO per ${festa.nome}`;
      infoSpeciali += `\n⚠️ OGGI è ${festa.nome}: siamo CHIUSI.`;
    }
  });
  
  // Controllo ferie OGGI con gestione errori robusta
  if (èInFerie(orarioItalia, ferie)) {
    const periodoAttivo = Object.values(ferie).find(periodo => {
      try {
        if (!periodo || !periodo.inizio || !periodo.fine || typeof periodo.inizio !== 'string') return false;
        const [inizioGiorno, inizioMese] = periodo.inizio.split('-').map(Number);
        const [fineGiorno, fineMese] = periodo.fine.split('-').map(Number);
        const inizioData = new Date(annoCorrente, inizioMese - 1, inizioGiorno);
        const fineData = new Date(annoCorrente, fineMese - 1, fineGiorno);
        if (fineMese < inizioMese) fineData.setFullYear(annoCorrente + 1);
        return orarioItalia >= inizioData && orarioItalia <= fineData;
      } catch {
        return false;
      }
    });
    
    if (periodoAttivo) {
      statoApertura = `🔴 CHIUSO per ${periodoAttivo.descrizione || 'ferie'}`;
      infoSpeciali += `\n⚠️ Siamo in ${periodoAttivo.descrizione || 'ferie'} fino al ${periodoAttivo.fine}.`;
    }
  }
  
  // Controllo orari speciali OGGI
  if (orariSpeciali && typeof orariSpeciali === 'object') {
    Object.values(orariSpeciali).forEach(speciale => {
      if (speciale && speciale.data === oggiStr) {
        statoApertura = `🟡 ORARIO SPECIALE: ${speciale.orario}`;
        infoSpeciali += `\n⚠️ OGGI orario speciale: ${speciale.orario} (${speciale.motivo})`;
      }
    });
  }
  
  // Genera lista servizi dinamicamente dal JSON
  const serviziList = Object.values(servizi).map(s => `- ${s.nome}: ${s.descrizione || 'Servizio disponibile'}`).join('\n');
  
  // Genera offerte attive dinamicamente
  const offerteActive = Object.values(offerte)
    .filter(o => o.attiva === true)
    .map(o => `- ${o.nome}: ${o.descrizione} ${o.scadenza ? `(valida fino al ${o.scadenza})` : ''}`)
    .join('\n');

  // Genera informazioni complete sui periodi di chiusura CON ANNO CORRENTE
  const infoPeriodi = generaInfoPeriodi(ferie, festivita, annoCorrente);

  return `Sei l'assistente virtuale di ${studio.nome}.

🕒 DATA E ORA ATTUALE (ITALIA):
• DATA: ${dataCompleta}
• ORA: ${oraCompleta}
• STATO STUDIO: ${statoApertura}

INFORMAZIONI STUDIO (SEMPRE AGGIORNATE da company-info.json):
- Nome: ${studio.nome}
- Indirizzo: ${studio.indirizzo}
- Telefono: ${studio.telefono}
- Email: ${studio.email}
${studio.whatsapp ? `- WhatsApp: ${studio.whatsapp}` : ''}
${studio.sito ? `- Sito Web: ${studio.sito}` : ''}

ORARI DI APERTURA NORMALI:
- Lunedì-Venerdì: ${orari.lunedi_venerdi}
- Sabato: ${orari.sabato}
- Domenica: ${orari.domenica}
${orari.note ? `\nNote orari: ${orari.note}` : ''}
${infoSpeciali}

${infoPeriodi}

SERVIZI DISPONIBILI:
${serviziList || '⚠️ Nessun servizio configurato in company-info.json'}

${offerteActive ? `OFFERTE SPECIALI ATTIVE:\n${offerteActive}` : 'Nessuna offerta attiva al momento.'}

REGOLE COMPORTAMENTO CON CONSAPEVOLEZZA TEMPORALE:
1. USA SEMPRE la data/ora italiana sopra per domande temporali
2. Per "siete aperti ora?" usa lo STATO STUDIO sopra
3. Per "che giorno è?" usa la DATA completa sopra
4. Per "che ore sono?" usa l'ORA sopra
5. Per domande su date future (es: "il 12 agosto", "ad agosto"), controlla SEMPRE i PERIODI DI CHIUSURA sopra
6. Per "il 12 agosto" -> controlla se cade nel periodo 01-08 al 14-08 = CHIUSI per ferie estive
7. Per festività future, usa l'elenco FESTIVITÀ sopra
8. USA SEMPRE E SOLO le informazioni da company-info.json
9. Mai inventare informazioni non presenti in company-info.json
10. Risposte BREVI e DIRETTE (max 2-3 righe)
11. Usa emoji appropriate 😊
12. HTML: <br> per nuove righe, <strong> per grassetto
13. SEMPRE professionale ma amichevole

GESTIONE FLOW (SE ATTIVO):
${session.currentFlow ? `
🔄 FLOW ATTIVO: ${session.currentFlow.toUpperCase()}
⚠️ IMPORTANTE: Ignora questo messaggio e usa il sistema di flow rigido che gestirà la risposta automaticamente.
` : 'Nessun flow attivo - rispondi normalmente usando le informazioni sopra.'}

ESEMPI DI RISPOSTE TEMPORALI PRECISE:
- "Che ore sono?" → "Sono le ${oraCompleta} di ${dataCompleta}"
- "Siete aperti?" → Usa esattamente lo STATO STUDIO sopra
- "Che giorno è oggi?" → "Oggi è ${dataCompleta}"
- "Siete aperti il 12 agosto?" → "🔴 Il 12 agosto saremo chiusi per ferie estive (dal 1/8 al 14/8)"
- "Il 15 agosto?" → "🔴 Il 15 agosto (Ferragosto) siamo sempre chiusi"

Rispondi SEMPRE in italiano, usando data/ora italiana e informazioni ESCLUSIVAMENTE da company-info.json.`;
}

// ==================== SISTEMA FLOW RIGIDO STEP-BY-STEP ====================
function detectFlowIntent(message, session) {
  const msg = message.toLowerCase();
  
  // Se c'è già un flow attivo, continua quello
  if (session.currentFlow) {
    return { continue: true, flow: session.currentFlow };
  }
  
  // Rileva nuovo flow
  if (msg.includes('prenotare') || msg.includes('appuntamento') || msg.includes('prenotazione')) {
    return { start: true, flow: 'appointment' };
  }
  
  if (msg.includes('preventivo') || msg.includes('quanto costa') || msg.includes('prezzo')) {
    return { start: true, flow: 'quote' };
  }
  
  return { continue: false, flow: null };
}

function getFlowSteps(flowType) {
  const steps = {
    appointment: [
      {
        field: 'nome',
        question: 'Perfetto! Per procedere con la prenotazione ho bisogno di alcuni dati.<br><strong>Come ti chiami?</strong> 😊',
        validation: /^[a-zA-ZÀ-ÿ\s]{2,50}$/,
        error: 'Per favore inserisci un nome valido (solo lettere, 2-50 caratteri).'
      },
      {
        field: 'telefono',
        question: 'Grazie {nome}! <strong>Qual è il tuo numero di telefono?</strong><br>📞 Es: +39 123 456 7890 o 3331234567',
        validation: /^(\+39\s?)?((3[0-9]{2}[\s\-]?[0-9]{6,7})|([0-9]{2,4}[\s\-]?[0-9]{6,8}))$/,
        error: 'Per favore inserisci un numero di telefono valido (es: +39 123 456 7890, 3331234567, 0123456789).'
      },
      {
        field: 'email',
        question: 'Ottimo! <strong>Qual è la tua email?</strong><br>📧 Es: nome@email.it',
        validation: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        error: 'Per favore inserisci un indirizzo email valido.'
      },
      {
        field: 'tipo_visita',
        question: 'Perfetto! <strong>Che tipo di visita ti serve?</strong><br>🦷 Es: controllo, pulizia, visita urgente, ortodonzia...',
        validation: /.{3,100}/,
        error: 'Per favore specifica il tipo di visita (almeno 3 caratteri).'
      }
    ],
    quote: [
      {
        field: 'nome',
        question: 'Perfetto! Per inviarti un preventivo personalizzato ho bisogno di alcuni dati.<br><strong>Come ti chiami?</strong> 😊',
        validation: /^[a-zA-ZÀ-ÿ\s]{2,50}$/,
        error: 'Per favore inserisci un nome valido (solo lettere, 2-50 caratteri).'
      },
      {
        field: 'telefono',
        question: 'Grazie {nome}! <strong>Qual è il tuo numero di telefono?</strong><br>📞 Es: +39 123 456 7890 o 3331234567',
        validation: /^(\+39\s?)?((3[0-9]{2}[\s\-]?[0-9]{6,7})|([0-9]{2,4}[\s\-]?[0-9]{6,8}))$/,
        error: 'Per favore inserisci un numero di telefono valido (es: +39 123 456 7890, 3331234567, 0123456789).'
      },
      {
        field: 'email',
        question: 'Ottimo! <strong>Qual è la tua email?</strong><br>📧 Es: nome@email.it',
        validation: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        error: 'Per favore inserisci un indirizzo email valido.'
      },
      {
        field: 'servizio_interesse',
        question: 'Perfetto! <strong>Per quale servizio vuoi il preventivo?</strong><br>💰 Es: implanto, ortodonzia, sbiancamento, protesi...',
        validation: /.{3,100}/,
        error: 'Per favore specifica il servizio di interesse (almeno 3 caratteri).'
      }
    ]
  };
  
  return steps[flowType] || [];
}

function processFlowStep(session, message) {
  if (!session.currentFlow) return null;
  
  const steps = getFlowSteps(session.currentFlow);
  if (!steps.length) return null;
  
  const currentStep = steps[session.flowStep];
  if (!currentStep) return null;
  
  // ==================== RILEVA DOMANDE DURANTE IL FLOW ====================
  const trimmedMessage = message.trim().toLowerCase();
  
  // Parole chiave che indicano una domanda invece di una risposta
  const questionKeywords = [
    'come funziona', 'come si fa', 'quanto costa', 'quanto tempo', 'fa male',
    'che cos\'è', 'cosa è', 'spiegami', 'dimmi', 'vorrei sapere',
    'mi puoi dire', 'info su', 'informazioni', 'dettagli', 'durata',
    'prezzo', 'costo', 'procedura', 'processo', '?'
  ];
  
  const isQuestion = questionKeywords.some(keyword => trimmedMessage.includes(keyword)) || 
                   trimmedMessage.includes('?');
  
  // Se è una domanda durante il flow, rispondi alla domanda E continua il flow
  if (isQuestion && currentStep.field === 'servizio_interesse') {
    return {
      response: `📋 Ti rispondo subito!<br><br>
                 <strong>Lo sbiancamento dentale</strong> è un trattamento estetico che rimuove macchie e discromie dai denti.<br><br>
                 ✨ <strong>Come funziona:</strong><br>
                 • Sbiancamento professionale in studio (1-2 sedute)<br>
                 • Sbiancamento domiciliare con mascherine personalizzate<br>
                 • Gel sbiancante sicuro e testato clinicamente<br><br>
                 💰 <strong>Per un preventivo personalizzato</strong>, ti serve specificare:<br>
                 Vuoi lo sbiancamento professionale o domiciliare?`,
      questionAnswered: true,
      continueFlow: true,
      currentStep: currentStep.field
    };
  }
  
  // Se è una domanda durante il flow per tipo_visita
  if (isQuestion && currentStep.field === 'tipo_visita') {
    return {
      response: `📋 Ti spiego subito!<br><br>
                 I nostri <strong>controlli</strong> includono:<br>
                 • Visita completa con rx se necessario<br>
                 • Pulizia professionale<br>
                 • Controllo generale della salute orale<br><br>
                 🦷 <strong>Per prenotare</strong>, specifica:<br>
                 Vuoi un controllo generale, pulizia o hai un problema specifico?`,
      questionAnswered: true,
      continueFlow: true,
      currentStep: currentStep.field
    };
  }
  
  // Validazione normale del flow
  if (!currentStep.validation.test(message.trim())) {
    return {
      response: `❌ ${currentStep.error}<br><br>${currentStep.question}`,
      invalid: true
    };
  }
  
  // Salva dato validato
  session.flowData[currentStep.field] = message.trim();
  session.flowStep++;
  
  console.log(`✅ [${session.id}] Campo '${currentStep.field}' salvato: ${message.trim()}`);
  
  // Controlla se ci sono altri step
  if (session.flowStep < steps.length) {
    const nextStep = steps[session.flowStep];
    let nextQuestion = nextStep.question;
    
    // Sostituisci placeholder con dati raccolti
    Object.keys(session.flowData).forEach(key => {
      nextQuestion = nextQuestion.replace(`{${key}}`, session.flowData[key]);
    });
    
    return {
      response: nextQuestion,
      continue: true,
      progress: `${session.flowStep + 1}/${steps.length}`
    };
  } else {
    // Flow completato
    const flowType = session.currentFlow;
    const flowData = { ...session.flowData };
    
    // Reset flow
    session.currentFlow = null;
    session.flowData = {};
    session.flowStep = 0;
    session.flowCount++;
    
    // Invia email
    sendFlowCompletionEmail(flowType, flowData);
    
    return {
      response: generateFlowCompletionResponse(flowType, flowData),
      completed: true,
      flowData: flowData
    };
  }
}

function generateFlowCompletionResponse(flowType, flowData) {
  const studio = companyInfo.studio || {};
  
  if (flowType === 'appointment') {
    return `✅ <strong>Richiesta appuntamento inviata!</strong><br><br>
📋 <strong>Riepilogo:</strong><br>
• Nome: ${flowData.nome}<br>
• Telefono: ${flowData.telefono}<br>
• Email: ${flowData.email}<br>
• Tipo visita: ${flowData.tipo_visita}<br><br>
📞 Ti contatteremo presto al numero ${flowData.telefono} per confermare data e ora.<br><br>
<button id="gdpr-accept-btn" class="gdpr-consent-btn" style="
  background: linear-gradient(135deg, #4CAF50, #45a049);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
  margin-top: 10px;
">
✅ Acconsento al trattamento dati
</button>`;
  } else if (flowType === 'quote') {
    return `✅ <strong>Richiesta preventivo inviata!</strong><br><br>
📋 <strong>Riepilogo:</strong><br>
• Nome: ${flowData.nome}<br>
• Telefono: ${flowData.telefono}<br>
• Email: ${flowData.email}<br>
• Servizio: ${flowData.servizio_interesse}<br><br>
💰 Riceverai il preventivo personalizzato entro 24 ore via email.<br><br>
<button id="gdpr-accept-btn" class="gdpr-consent-btn" style="
  background: linear-gradient(135deg, #4CAF50, #45a049);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
  margin-top: 10px;
">
✅ Acconsento al trattamento dati
</button>`;
  }
  
  return '✅ Richiesta completata!';
}

// ==================== EMAIL TRANSPORTER (FIX) ====================
let transporter = null;

function initializeEmailTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('⚠️ Email non configurata - modalità sviluppo');
    return null;
  }

  try {
    transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    
    console.log('✅ Email transporter inizializzato');
    return transporter;
  } catch (error) {
    console.error('❌ Errore inizializzazione email:', error);
    return null;
  }
}

transporter = initializeEmailTransporter();

async function sendFlowCompletionEmail(flowType, flowData) {
  try {
    const studio = companyInfo.studio || {};
    const ora = new Date();
    const orarioItalia = new Date(ora.toLocaleString("en-US", {timeZone: "Europe/Rome"}));
    
    let subject = '';
    let body = '';
    
    if (flowType === 'appointment') {
      subject = `🦷 Nuova Prenotazione - ${flowData.nome}`;
      body = `
🎯 NUOVA PRENOTAZIONE APPUNTAMENTO

📋 DATI PAZIENTE:
Nome: ${flowData.nome}
Telefono: ${flowData.telefono}
Email: ${flowData.email}
Tipo Visita: ${flowData.tipo_visita}

📅 Data Richiesta: ${orarioItalia.toLocaleString('it-IT')}
🔗 Fonte: Assistente Digitale
📧 Session ID: flow_completed

AZIONE RICHIESTA:
- Contattare il paziente per confermare appuntamento
- Verificare disponibilità agenda
- Confermare data e ora

--
${studio.nome}
${studio.telefono}
${studio.email}
      `;
    } else if (flowType === 'quote') {
      subject = `💰 Richiesta Preventivo - ${flowData.nome}`;
      body = `
💰 NUOVA RICHIESTA PREVENTIVO

📋 DATI CLIENTE:
Nome: ${flowData.nome}
Telefono: ${flowData.telefono}
Email: ${flowData.email}
Servizio: ${flowData.servizio_interesse}

📅 Data Richiesta: ${orarioItalia.toLocaleString('it-IT')}
🔗 Fonte: Assistente Digitale
📧 Session ID: flow_completed

AZIONE RICHIESTA:
- Preparare preventivo personalizzato
- Inviare via email entro 24 ore
- Follow-up telefonico se necessario

--
${studio.nome}
${studio.telefono}
${studio.email}
      `;
    }
    
    if (process.env.NODE_ENV === 'development' || !transporter) {
      console.log('📧 EMAIL (MODALITÀ SVILUPPO):');
      console.log('Subject:', subject);
      console.log('Body:', body);
      console.log('--- FINE EMAIL ---');
    } else {
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: studio.email || process.env.SMTP_USER,
        subject: subject,
        text: body,
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email ${flowType} inviata per ${flowData.nome}`);
    }
    
  } catch (error) {
    console.error('❌ Errore invio email:', error);
  }
}

// ==================== API ENDPOINTS (PRIMA DEI STATIC FILES) ====================

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('🔍 Health check richiesto');
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: port,
    host: req.get('host'),
    path: req.path,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokensPerSession: process.env.MAX_TOKENS_PER_SESSION || 8000,
    maxChatsPerSession: process.env.MAX_CHATS_PER_SESSION || 3,
    maxFlowsPerSession: process.env.MAX_FLOWS_PER_SESSION || 5,
    activeSessions: sessions.size,
    companyInfoLoaded: Object.keys(companyInfo).length > 0,
    emailConfigured: !!transporter,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    flowSystemActive: true,
    timeZoneAware: true
  });
});

// Company info endpoint
app.get('/api/company-info', (req, res) => {
  try {
    res.json(companyInfo);
    console.log('✅ Company info inviato via API');
  } catch (error) {
    console.error('❌ Errore company-info endpoint:', error);
    res.status(500).json({ error: 'Unable to load company info' });
  }
});

// Session info endpoint
app.get('/api/session-info', (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || 'default';
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.json({
        sessionId: sessionId,
        tokenCount: 0,
        maxTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) || 8000,
        currentFlow: null,
        flowData: {},
        flowStep: 0,
        chatCount: 0,
        maxChats: parseInt(process.env.MAX_CHATS_PER_SESSION) || 3,
        totalCost: 0,
        isNew: true
      });
    }
    
    res.json({
      sessionId: session.id,
      tokenCount: session.tokenCount || 0,
      maxTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) || 8000,
      currentFlow: session.currentFlow,
      flowData: session.flowData || {},
      flowStep: session.flowStep || 0,
      chatCount: session.chatCount || 0,
      maxChats: parseInt(process.env.MAX_CHATS_PER_SESSION) || 3,
      totalCost: session.totalCost || 0,
      currentChatCost: session.currentChatCost || 0,
      lastActivity: session.lastActivity,
      isExpired: session.isExpired || false
    });
    
    console.log(`✅ Session info inviato per: ${sessionId}`);
    
  } catch (error) {
    console.error('❌ Errore session-info endpoint:', error);
    res.status(500).json({ 
      error: 'Unable to load session info',
      sessionId: req.headers['x-session-id'] || 'default',
      tokenCount: 0,
      maxTokens: 8000
    });
  }
});

// GDPR consent endpoint
app.post('/api/gdpr-consent', async (req, res) => {
  try {
    const { consent, sessionId } = req.body;
    const actualSessionId = req.headers['x-session-id'] || sessionId || 'default';
    
    if (consent) {
      console.log(`✅ Consenso GDPR ricevuto per sessione: ${actualSessionId}`);
      
      const timestamp = new Date().toISOString();
      console.log(`📝 GDPR Consent: ${actualSessionId} at ${timestamp}`);
      
      res.json({ 
        success: true, 
        message: 'Consenso GDPR registrato',
        sessionId: actualSessionId,
        timestamp: timestamp
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Consenso GDPR non fornito' 
      });
    }
    
  } catch (error) {
    console.error('❌ Errore GDPR consent:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore durante registrazione consenso' 
    });
  }
});

// Reset session endpoint
app.post('/api/reset-session', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    resetCurrentChat(session);
    
    console.log(`🔄 Chat resettata: ${sessionId} (Chat ${session.chatCount}/3)`);
    
    res.json({ 
      success: true, 
      message: `Chat ${session.chatCount}/3 iniziata`,
      chatInfo: {
        currentChat: session.chatCount,
        maxChats: 3,
        remainingChats: 3 - session.chatCount
      }
    });
  } else {
    res.json({ success: true, message: 'Nuova sessione creata' });
  }
});

// ==================== MAIN CHAT ENDPOINT CON FLOW RIGIDO E TIME-AWARE ====================
app.post('/api/chat', async (req, res) => {
  try {
    const { message, forceNewSession = false } = req.body;
    
    if (forceNewSession) {
      const sessionId = req.headers['x-session-id'] || 'default';
      const oldSession = sessions.get(sessionId);
      if (oldSession) {
        resetCurrentChat(oldSession);
      }
    }
    
    const session = getOrCreateSession(req);
    
    if (session.currentChatCost === undefined) {
      session.currentChatCost = 0;
    }
    
    const limits = checkSessionLimits(session);
    
    console.log(`💬 [${session.id}] Chat ${session.chatCount + 1}/3 - Messaggio: "${message.substring(0, 50)}..."`);
    console.log(`💰 [${session.id}] Costo chat: $${limits.currentChatCost.toFixed(4)}, Chat rimanenti: ${limits.remainingChats}`);
    
    if (!openai) {
      return res.json({
        response: "🤖 Servizio AI non configurato. Contatta l'amministratore.",
        error: true
      });
    }
    
    // Controlli limiti
    if (limits.chatLimitReached) {
      return res.json({
        response: `🚫 <strong>Limite raggiunto!</strong><br>
                   Hai utilizzato tutte le 3 chat disponibili per questa sessione.<br><br>
                   💰 Budget utilizzato: €${(session.totalCost * 0.92).toFixed(3)}<br>
                   📞 Per continuare, contattaci: ${companyInfo.studio?.telefono || '+39 123 456 7890'}`,
        limitReached: true,
        chatLimitReached: true
      });
    }
    
    if (limits.costLimitReached) {
      resetCurrentChat(session);
      
      if (session.chatCount >= 3) {
        return res.json({
          response: `💰 <strong>Budget esaurito!</strong><br>
                     Limite sessione raggiunto (3 chat utilizzate).<br>
                     📞 Contattaci: ${companyInfo.studio?.telefono || '+39 123 456 7890'}`,
          limitReached: true,
          chatLimitReached: true
        });
      }
      
      return res.json({
        response: `💰 <strong>Budget chat esaurito!</strong><br>
                   ✅ <strong>Nuova chat avviata!</strong> (${session.chatCount}/3)<br><br>
                   Riprova il tuo messaggio.`,
        newChatStarted: true,
        chatInfo: {
          currentChat: session.chatCount,
          maxChats: 3,
          remainingChats: 3 - session.chatCount
        }
      });
    }
    
    // ==================== GESTIONE FLOW RIGIDO ====================
    // Se c'è un flow attivo, gestiscilo direttamente
    if (session.currentFlow) {
      const flowResult = processFlowStep(session, message);
      if (flowResult) {
        console.log(`🔄 [${session.id}] Flow step processato: ${flowResult.invalid ? 'INVALID' : 'VALID'}`);
        
        return res.json({
          response: flowResult.response,
          currentFlow: session.currentFlow,
          flowData: session.flowData,
          flowStep: session.flowStep,
          flowCompleted: flowResult.completed || false,
          sessionId: session.id,
          chatInfo: {
            currentChat: session.chatCount || 1,
            maxChats: parseInt(process.env.MAX_CHATS_PER_SESSION) || 3,
            remainingChats: (parseInt(process.env.MAX_CHATS_PER_SESSION) || 3) - (session.chatCount || 0)
          }
        });
      }
    }
    
    // Rileva nuovo flow
    const flowIntent = detectFlowIntent(message, session);
    
    if (flowIntent.start) {
      session.currentFlow = flowIntent.flow;
      session.flowData = {};
      session.flowStep = 0;
      
      console.log(`🔄 [${session.id}] Nuovo flow avviato: ${flowIntent.flow}`);
      
      const steps = getFlowSteps(flowIntent.flow);
      if (steps.length > 0) {
        return res.json({
          response: steps[0].question,
          currentFlow: session.currentFlow,
          flowData: session.flowData,
          flowStep: session.flowStep,
          sessionId: session.id,
          chatInfo: {
            currentChat: session.chatCount || 1,
            maxChats: parseInt(process.env.MAX_CHATS_PER_SESSION) || 3,
            remainingChats: (parseInt(process.env.MAX_CHATS_PER_SESSION) || 3) - (session.chatCount || 0)
          }
        });
      }
    }
    
    // ==================== RISPOSTA AI CON CONSAPEVOLEZZA TEMPORALE ====================
    const systemPrompt = generateDynamicSystemPrompt(session, companyInfo);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.conversationHistory.slice(-6),
      { role: 'user', content: message }
    ];
    
    console.log(`🤖 [${session.id}] Chiamata GPT-4o-mini con data/ora italiana...`);
    
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: messages,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 800,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
    });
    
    const response = completion.choices[0].message.content;
    const inputTokens = completion.usage.prompt_tokens;
    const outputTokens = completion.usage.completion_tokens;
    const totalTokens = completion.usage.total_tokens;
    
    const costThisCall = calculateCost(inputTokens, outputTokens);
    session.currentChatCost += costThisCall;
    session.totalCost += costThisCall;
    
    console.log(`✅ [${session.id}] Risposta GPT-4o-mini (${totalTokens} token, $${costThisCall.toFixed(4)})`);
    
    // Aggiorna cronologia
    session.conversationHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    );
    session.tokenCount += totalTokens;
    
    // Mantieni solo ultimi 12 messaggi
    if (session.conversationHistory.length > 12) {
      session.conversationHistory = session.conversationHistory.slice(-12);
    }
    
    res.json({
      response: response,
      tokensUsed: totalTokens,
      totalTokens: session.tokenCount,
      remainingTokens: (parseInt(process.env.MAX_TOKENS_PER_SESSION) || 8000) - session.tokenCount,
      currentFlow: session.currentFlow,
      flowData: session.flowData,
      sessionId: session.id,
      costInfo: {
        thisCall: costThisCall,
        currentChatCost: session.currentChatCost,
        totalSessionCost: session.totalCost,
        remainingBudget: parseFloat(process.env.MAX_COST_PER_CHAT) - session.currentChatCost
      },
      chatInfo: {
        currentChat: session.chatCount || 1,
        maxChats: parseInt(process.env.MAX_CHATS_PER_SESSION) || 3,
        remainingChats: (parseInt(process.env.MAX_CHATS_PER_SESSION) || 3) - (session.chatCount || 0)
      }
    });
    
  } catch (error) {
    console.error('❌ Errore ChatGPT:', error);
    
    res.status(500).json({
      response: `🤖 Mi dispiace, sto avendo problemi tecnici.<br>📞 Per assistenza: ${companyInfo.studio?.telefono || '+39 123 456 7890'}`,
      error: true
    });
  }
});

// ==================== SERVE STATIC FILES (DOPO LE API) ====================
// Per assistente-digitale.it/studio-dentistico-demo/
app.use('/studio-dentistico-demo', express.static(__dirname, {
  dotfiles: 'ignore',
  etag: false,
  extensions: ['html', 'js', 'css', 'json'],
  index: ['index.html'],
  maxAge: '1d',
  setHeaders: function (res, path, stat) {
    res.set('x-timestamp', Date.now());
    res.set('x-served-from', 'subdirectory');
  }
}));

// Per il dominio Render diretto
app.use(express.static(__dirname, {
  dotfiles: 'ignore',
  etag: false,
  extensions: ['html', 'js', 'css', 'json'],
  index: ['index.html'],
  maxAge: '1d',
  setHeaders: function (res, path, stat) {
    res.set('x-timestamp', Date.now());
    res.set('x-served-from', 'root');
  }
}));

// ==================== ROOT ROUTES ====================
app.get('/studio-dentistico-demo', (req, res) => {
  console.log('🏠 Root studio-dentistico-demo richiesto');
  const indexPath = path.join(__dirname, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found');
  }
});

app.get('/', (req, res) => {
  console.log('🏠 Root richiesto');
  const host = req.get('host');
  
  // Se è assistente-digitale.it redirect a /studio-dentistico-demo/
  if (host === 'assistente-digitale.it') {
    return res.redirect(301, '/studio-dentistico-demo/');
  }
  
  // Altrimenti servi index.html normalmente
  const indexPath = path.join(__dirname, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found');
  }
});

// ==================== ERROR HANDLERS ====================
app.use((req, res) => {
  console.log(`❌ 404 - Path non trovato: ${req.path}`);
  res.status(404).json({ error: 'Path not found', path: req.path });
});

app.use((error, req, res, next) => {
  console.error('❌ Errore server:', error);
  res.status(500).json({ error: 'Internal server error', message: error.message });
});

// ==================== SESSION CLEANUP ====================
setInterval(() => {
  const now = Date.now();
  const timeoutMs = (parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 45) * 60 * 1000;
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity.getTime() > timeoutMs) {
      sessions.delete(sessionId);
      console.log(`🗑️ Sessione rimossa per inattività: ${sessionId}`);
    }
  }
}, 10 * 60 * 1000);

// ==================== SERVER START ====================
app.listen(port, '0.0.0.0', () => {
  console.log('🚀 ===================================');
  console.log(`🚀 ASSISTENTE DIGITALE COMPLETO`);
  console.log('🚀 ===================================');
  console.log(`🌐 Render URL: https://assistente-digitale-studio-dentistico.onrender.com`);
  console.log(`🌐 Custom URL: https://assistente-digitale.it/studio-dentistico-demo/`);
  console.log(`🤖 Modello: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
  console.log(`📊 Token/sessione: ${process.env.MAX_TOKENS_PER_SESSION || 8000}`);
  console.log(`💬 Chat/sessione: ${process.env.MAX_CHATS_PER_SESSION || 3}`);
  console.log(`💰 Budget/chat: €${((parseFloat(process.env.MAX_COST_PER_CHAT) || 0.05) * 0.92).toFixed(3)}`);
  console.log(`📋 Company info: ${Object.keys(companyInfo).length} sezioni`);
  console.log(`📧 Email: ${transporter ? 'CONFIGURATO' : 'SVILUPPO'}`);
  console.log(`🔑 OpenAI: ${openai ? 'CONFIGURATO' : 'NON CONFIGURATO'}`);
  console.log(`🔄 Flow System: ATTIVATO (step-by-step rigido)`);
  console.log(`🕒 Time Zone: ITALY (Europe/Rome) - Real-time aware`);
  console.log('🚀 ===================================');
});

process.on('SIGTERM', () => {
  console.log('🛑 Server in chiusura...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Server interrotto...');
  process.exit(0);
});