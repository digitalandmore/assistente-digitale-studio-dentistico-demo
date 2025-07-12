const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://assistente-digitale.it',
    'https://www.assistente-digitale.it',
    'https://assistente-digitale-studio-dentistico.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id']
}));
app.use(express.json());
app.use(express.static('.'));

// ==================== OPENAI CONFIGURATION ====================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==================== COMPANY INFO LOADER ====================
let companyInfo = {};
function loadCompanyInfo() {
  try {
    const data = fs.readFileSync('company-info.json', 'utf8');
    companyInfo = JSON.parse(data);
    console.log('✅ Company info caricato:', Object.keys(companyInfo));
    return companyInfo;
  } catch (error) {
    console.error('❌ Errore caricamento company-info.json:', error);
    companyInfo = getDefaultCompanyInfo();
    return companyInfo;
  }
}

function getDefaultCompanyInfo() {
  return {
    studio: {
      nome: "Studio Dentistico Demo",
      indirizzo: "Via dei Dentisti 10, Milano (MI)",
      telefono: "+39 123 456 7890",
      email: "info@studiodemo.it"
    },
    orari: {
      lunedi_venerdi: "09:00 - 18:00",
      sabato: "09:00 - 13:00",
      domenica: "Chiuso"
    },
    servizi: {
      igiene_orale: {
        nome: "Igiene Orale",
        descrizione: "Pulizia dentale professionale e prevenzione"
      },
      conservativa: {
        nome: "Conservativa",
        descrizione: "Cura delle carie e ricostruzioni"
      }
    },
    offerte: {}
  };
}

// Carica i dati all'avvio
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
      conversationHistory: [],
      currentFlow: null,
      flowData: {},
      isExpired: false,
      lastActivity: new Date()
    });
    console.log(`📝 Nuova sessione creata: ${sessionId}`);
  }
  
  const session = sessions.get(sessionId);
  session.lastActivity = new Date();
  
  // Check session timeout
  const timeoutMs = (parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 30) * 60 * 1000;
  if (Date.now() - session.createdAt.getTime() > timeoutMs) {
    session.isExpired = true;
  }
  
  return session;
}

function checkSessionLimits(session) {
  const maxTokens = parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000;
  const maxFlows = parseInt(process.env.MAX_FLOWS_PER_SESSION) || 5;
  
  return {
    tokenLimitReached: session.tokenCount >= maxTokens,
    flowLimitReached: session.flowCount >= maxFlows,
    sessionExpired: session.isExpired
  };
}

// ==================== AI SYSTEM PROMPT GENERATOR ====================
function generateSystemPrompt(session, companyInfo) {
  const studio = companyInfo.studio || {};
  const orari = companyInfo.orari || {};
  const servizi = companyInfo.servizi || {};
  const offerte = companyInfo.offerte || {};
  
  // Informazioni sui flow attivi
  const flowInfo = session.currentFlow ? `
FLOW ATTIVO: ${session.currentFlow}
DATI RACCOLTI: ${JSON.stringify(session.flowData, null, 2)}

Se il flow è attivo, continua a raccogliere i dati mancanti seguendo l'ordine logico.
` : '';

  return `Sei l'assistente digitale di ${studio.nome || 'Studio Dentistico Demo'}.

=== INFORMAZIONI DELLO STUDIO ===
Nome: ${studio.nome || 'Studio Dentistico Demo'}
Indirizzo: ${studio.indirizzo || 'Via dei Dentisti 10, Milano (MI)'}
Telefono: ${studio.telefono || '+39 123 456 7890'}
Email: ${studio.email || 'info@studiodemo.it'}

=== ORARI ===
Lunedì-Venerdì: ${orari.lunedi_venerdi || '09:00-18:00'}
Sabato: ${orari.sabato || '09:00-13:00'}
Domenica: ${orari.domenica || 'Chiuso'}

=== SERVIZI DISPONIBILI ===
${Object.values(servizi).map(s => `- ${s.nome}: ${s.descrizione}`).join('\n')}

=== OFFERTE ATTIVE ===
${Object.keys(offerte).length > 0 ? 
  Object.values(offerte).map(o => `- ${o.nome}: ${o.descrizione}${o.scadenza ? ` (valida fino al ${o.scadenza})` : ''}`).join('\n') :
  'Nessuna offerta attiva al momento'
}

${flowInfo}

=== ISTRUZIONI COMPORTAMENTALI ===
1. Rispondi SEMPRE in italiano con tono professionale ma amichevole
2. Usa emoji appropriate per rendere le risposte più accattivanti
3. Formatta le risposte con HTML: <br> per andare a capo, <strong> per grassetto
4. Rispondi SOLO con informazioni presenti nei dati forniti
5. Se non sai qualcosa, suggerisci di chiamare il numero di telefono
6. Per domande su altre sedi/città, spiega che c'è solo la sede indicata

=== GESTIONE FLOW INTELLIGENTE ===
Quando l'utente richiede:

**PRENOTAZIONE APPUNTAMENTO:**
- Attiva flow "appointment" 
- Raccogli nell'ordine: nome, telefono, email, tipo_visita, urgenza, note
- Validazione: nome min 2 caratteri, telefono formato italiano, email valida
- Al completamento: mostra riepilogo e richiedi consenso GDPR

**RICHIESTA PREVENTIVO:**
- Attiva flow "quote" 
- Raccogli: nome, telefono, email, servizio_interesse, budget_orientativo, note
- Al completamento: informa che saranno ricontattati entro 24h

**RICHIESTA INFORMAZIONI:**
- Non serve flow, rispondi direttamente con le informazioni disponibili

=== VALIDAZIONI ===
- Nome: minimo 2 caratteri, solo lettere e spazi
- Telefono: formato italiano (+39, 0xx, 3xx) con almeno 9 cifre
- Email: formato standard con @ e dominio valido
- Non accettare dati palesemente falsi (es: nome "asdf", telefono "123")

=== ESEMPI DI FLOW ===

**Inizio prenotazione:**
"📅 Perfetto! Ti aiuto a prenotare un appuntamento.
Come ti chiami?"

**Raccolta telefono:**
"📞 Ciao Mario! Qual è il tuo numero di telefono?
Mi serve per confermare l'appuntamento."

**Completamento:**
"✅ Riepilogo prenotazione:
👤 Nome: Mario Rossi
📞 Telefono: +39 123 456 7890
📧 Email: mario@email.com
🦷 Visita: Controllo generale
⏰ Urgenza: Normale

Ti ricontatteremo entro 24 ore per confermare data e orario.

[Pulsante GDPR da generare]"

=== FORMATO RISPOSTE ===
- Sempre cordiale e professionale
- HTML semplice per formattazione
- Emoji per rendere più amichevole
- Informazioni chiare e strutturate
- Call-to-action quando appropriato

Rispondi sempre come se fossi un assistente umano esperto e disponibile.`;
}

// ==================== FLOW DETECTION ENGINE ====================
function detectFlowIntent(message, session) {
  const msg = message.toLowerCase();
  
  // Se già in un flow, continua quello
  if (session.currentFlow) {
    return { continue: true, flow: session.currentFlow };
  }
  
  // Detect new flow intents
  if (msg.includes('prenotare') || msg.includes('appuntamento') || msg.includes('prenotazione')) {
    return { start: true, flow: 'appointment' };
  }
  
  if (msg.includes('preventivo') || msg.includes('quanto costa') || msg.includes('prezzo')) {
    return { start: true, flow: 'quote' };
  }
  
  return { continue: false, flow: null };
}

// ==================== FLOW COMPLETION CHECKER ====================
function checkFlowCompletion(session) {
  if (!session.currentFlow) return { complete: false };
  
  const requiredFields = {
    appointment: ['nome', 'telefono', 'email', 'tipo_visita', 'urgenza'],
    quote: ['nome', 'telefono', 'email', 'servizio_interesse']
  };
  
  const required = requiredFields[session.currentFlow] || [];
  const collected = Object.keys(session.flowData);
  const missing = required.filter(field => !session.flowData[field]);
  
  return {
    complete: missing.length === 0,
    missing: missing,
    progress: `${collected.length}/${required.length}`
  };
}

// ==================== EMAIL TRANSPORTER ====================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ==================== MAIN CHAT ENDPOINT ====================
app.post('/api/chat', async (req, res) => {
  try {
    const { message, forceNewSession = false } = req.body;
    
    // Reset session if requested
    if (forceNewSession) {
      const sessionId = req.headers['x-session-id'] || 'default';
      sessions.delete(sessionId);
    }
    
    const session = getOrCreateSession(req);
    const limits = checkSessionLimits(session);
    
    console.log(`💬 [${session.id}] Messaggio: "${message.substring(0, 50)}..."`);
    console.log(`📊 [${session.id}] Token: ${session.tokenCount}, Flow: ${session.currentFlow}`);
    
    // Check limits
    if (limits.tokenLimitReached || limits.sessionExpired) {
      return res.json({
        response: "Hai raggiunto il limite di utilizzo. Clicca 'Nuova Chat' per continuare.",
        limitReached: true,
        sessionExpired: limits.sessionExpired,
        resetButton: true
      });
    }
    
    // Detect flow intent
    const flowIntent = detectFlowIntent(message, session);
    
    // Start new flow if detected
    if (flowIntent.start) {
      session.currentFlow = flowIntent.flow;
      session.flowData = {};
      console.log(`🔄 [${session.id}] Avviato flow: ${flowIntent.flow}`);
    }
    
    // Generate system prompt with current context
    const systemPrompt = generateSystemPrompt(session, companyInfo);
    
    // Prepare conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.conversationHistory.slice(-8), // Keep last 8 messages
      { role: 'user', content: message }
    ];
    
    console.log(`🤖 [${session.id}] Chiamata ChatGPT...`);
    
    // Call ChatGPT
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: messages,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 800,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
    });
    
    const response = completion.choices[0].message.content;
    const tokensUsed = completion.usage.total_tokens;
    
    console.log(`✅ [${session.id}] Risposta ChatGPT (${tokensUsed} token)`);
    
    // Update conversation history
    session.conversationHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    );
    session.tokenCount += tokensUsed;
    
    // Keep history manageable
    if (session.conversationHistory.length > 16) {
      session.conversationHistory = session.conversationHistory.slice(-16);
    }
    
    // Try to extract flow data from user message
    if (session.currentFlow) {
      const extractedData = extractFlowData(message, session.currentFlow);
      if (extractedData) {
        Object.assign(session.flowData, extractedData);
        console.log(`📝 [${session.id}] Dati estratti:`, extractedData);
      }
    }
    
    // Check if flow is complete
    let flowStatus = null;
    if (session.currentFlow) {
      flowStatus = checkFlowCompletion(session);
      
      if (flowStatus.complete) {
        console.log(`✅ [${session.id}] Flow ${session.currentFlow} completato!`);
        
        // Send email notification
        await sendFlowCompletionEmail(session.currentFlow, session.flowData);
        
        // Reset flow
        session.currentFlow = null;
        session.flowCount++;
        
        // Add GDPR button to response if it's an appointment
        if (session.currentFlow === 'appointment') {
          response += `\n\n<button id="gdpr-accept-btn" class="gdpr-button">✅ Accetto il trattamento dei dati</button>`;
        }
      }
    }
    
    res.json({
      response: response,
      tokensUsed: tokensUsed,
      totalTokens: session.tokenCount,
      remainingTokens: (parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000) - session.tokenCount,
      currentFlow: session.currentFlow,
      flowData: session.flowData,
      flowStatus: flowStatus,
      sessionId: session.id
    });
    
  } catch (error) {
    console.error('❌ Errore ChatGPT:', error);
    res.status(500).json({
      response: "Mi dispiace, sto avendo problemi tecnici. Riprova tra poco o chiamaci direttamente.",
      error: true,
      fallback: true
    });
  }
});

// ==================== FLOW DATA EXTRACTION ====================
function extractFlowData(message, flowType) {
  const extractedData = {};
  
  // Simple extraction patterns
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const phoneRegex = /(\+39|0)?[\s]?([0-9]{2,3})[\s]?([0-9]{6,7}|[0-9]{3}[\s]?[0-9]{3,4})/;
  const nameRegex = /^[a-zA-ZÀ-ÿ\s]{2,30}$/;
  
  // Extract email
  const emailMatch = message.match(emailRegex);
  if (emailMatch) {
    extractedData.email = emailMatch[0];
  }
  
  // Extract phone
  const phoneMatch = message.match(phoneRegex);
  if (phoneMatch) {
    extractedData.telefono = phoneMatch[0].replace(/\s/g, '');
  }
  
  // Extract name (if message is likely a name)
  if (nameRegex.test(message.trim()) && message.trim().length >= 2) {
    // Check if it's likely a name and not a service request
    const lowerMsg = message.toLowerCase();
    if (!lowerMsg.includes('vorrei') && !lowerMsg.includes('voglio') && !lowerMsg.includes('mi serve')) {
      extractedData.nome = message.trim();
    }
  }
  
  // Flow-specific extraction
  if (flowType === 'appointment') {
    if (message.toLowerCase().includes('urgente') || message.toLowerCase().includes('subito')) {
      extractedData.urgenza = 'urgente';
    } else if (message.toLowerCase().includes('normale') || message.toLowerCase().includes('routine')) {
      extractedData.urgenza = 'normale';
    }
  }
  
  return Object.keys(extractedData).length > 0 ? extractedData : null;
}

// ==================== EMAIL SENDING ====================
async function sendFlowCompletionEmail(flowType, flowData) {
  try {
    const studio = companyInfo.studio || {};
    
    let subject = '';
    let body = '';
    
    if (flowType === 'appointment') {
      subject = `Nuova Prenotazione - ${flowData.nome || 'N/A'}`;
      body = `
🎯 NUOVA PRENOTAZIONE APPUNTAMENTO

📋 DATI PAZIENTE:
Nome: ${flowData.nome || 'N/A'}
Telefono: ${flowData.telefono || 'N/A'}
Email: ${flowData.email || 'N/A'}
Tipo Visita: ${flowData.tipo_visita || 'N/A'}
Urgenza: ${flowData.urgenza || 'N/A'}
Note: ${flowData.note || 'Nessuna nota'}

📅 Data Richiesta: ${new Date().toLocaleString('it-IT')}
🔗 Fonte: Assistente Digitale Demo

--
${studio.nome || 'Studio Dentistico Demo'}
      `;
    } else if (flowType === 'quote') {
      subject = `Richiesta Preventivo - ${flowData.nome || 'N/A'}`;
      body = `
💰 NUOVA RICHIESTA PREVENTIVO

📋 DATI CLIENTE:
Nome: ${flowData.nome || 'N/A'}
Telefono: ${flowData.telefono || 'N/A'}
Email: ${flowData.email || 'N/A'}
Servizio di Interesse: ${flowData.servizio_interesse || 'N/A'}
Budget Orientativo: ${flowData.budget_orientativo || 'Non specificato'}
Note: ${flowData.note || 'Nessuna nota'}

📅 Data Richiesta: ${new Date().toLocaleString('it-IT')}
🔗 Fonte: Assistente Digitale Demo

--
${studio.nome || 'Studio Dentistico Demo'}
      `;
    }
    
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: studio.email || process.env.SMTP_USER,
      subject: subject,
      text: body,
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 EMAIL (MODALITÀ SVILUPPO):');
      console.log('Subject:', subject);
      console.log('Body:', body);
      console.log('--- FINE EMAIL ---');
    } else {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email ${flowType} inviata`);
    }
    
  } catch (error) {
    console.error('❌ Errore invio email:', error);
  }
}

// ==================== GDPR ENDPOINT ====================
app.post('/api/gdpr-consent', (req, res) => {
  const { consent, sessionId } = req.body;
  
  console.log(`📋 Consenso GDPR ricevuto per sessione ${sessionId}: ${consent ? 'ACCETTATO' : 'RIFIUTATO'}`);
  
  res.json({
    success: true,
    message: consent ? 'Consenso acquisito correttamente' : 'Consenso non fornito'
  });
});

// ==================== UTILITY ENDPOINTS ====================

// Reset session
app.post('/api/reset-session', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
    console.log(`🔄 Sessione resettata: ${sessionId}`);
  }
  
  res.json({ success: true, message: 'Sessione resettata con successo' });
});

// Session info
app.get('/api/session-info', (req, res) => {
  const session = getOrCreateSession(req);
  const limits = checkSessionLimits(session);
  
  res.json({
    sessionId: session.id,
    tokenCount: session.tokenCount,
    flowCount: session.flowCount,
    currentFlow: session.currentFlow,
    flowData: session.flowData,
    maxTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) || 10000,
    maxFlows: parseInt(process.env.MAX_FLOWS_PER_SESSION) || 5,
    limits: limits,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity
  });
});

// Company info endpoint
app.get('/api/company-info', (req, res) => {
  // Reload company info to get latest changes
  loadCompanyInfo();
  res.json(companyInfo);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    model: process.env.OPENAI_MODEL || 'gpt-4',
    maxTokensPerSession: process.env.MAX_TOKENS_PER_SESSION || 10000,
    maxFlowsPerSession: process.env.MAX_FLOWS_PER_SESSION || 5,
    activeSessions: sessions.size,
    companyInfoLoaded: Object.keys(companyInfo).length > 0
  });
});

// ==================== STATIC FILES ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== ERROR HANDLERS ====================
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato' });
});

app.use((error, req, res, next) => {
  console.error('❌ Errore server:', error);
  res.status(500).json({ error: 'Errore interno del server' });
});

// ==================== SESSION CLEANUP ====================
setInterval(() => {
  const now = Date.now();
  const timeoutMs = (parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 30) * 60 * 1000;
  
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
  console.log(`🚀 SERVER CHATGPT + FLOW AVVIATO`);
  console.log('🚀 ===================================');
  console.log(`🌐 URL: ${process.env.NODE_ENV === 'production' ? 'https://assistente-digitale-studio-dentistico.onrender.com' : `http://localhost:${port}`}`);
  console.log(`🤖 Modello ChatGPT: ${process.env.OPENAI_MODEL || 'gpt-4'}`);
  console.log(`📊 Max token/sessione: ${process.env.MAX_TOKENS_PER_SESSION || 10000}`);
  console.log(`🔄 Max flow/sessione: ${process.env.MAX_FLOWS_PER_SESSION || 5}`);
  console.log(`📋 Company info: ${Object.keys(companyInfo).length} sezioni caricate`);
  console.log(`📧 Email mode: ${process.env.NODE_ENV === 'development' ? 'SVILUPPO' : 'PRODUZIONE'}`);
  console.log('🚀 ===================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server in chiusura...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Server interrotto...');
  process.exit(0);
});