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

// Inizializza OpenAI all'avvio
openai = initializeOpenAI();

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
      },
      ortodonzia: {
        nome: "Ortodonzia",
        descrizione: "Apparecchi e allineamento dentale"
      }
    },
    offerte: {}
  };
}

// Carica i dati all'avvio
loadCompanyInfo();

// ==================== SESSION MANAGEMENT CON CHAT COUNTER ====================
const sessions = new Map();

function getOrCreateSession(req) {
  const sessionId = req.headers['x-session-id'] || 'default';
  
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      createdAt: new Date(),
      tokenCount: 0,
      flowCount: 0,
      chatCount: 0, // Contatore chat
      conversationHistory: [],
      currentFlow: null,
      flowData: {},
      isExpired: false,
      lastActivity: new Date(),
      totalCost: 0, // Costo totale sessione
      currentChatCost: 0 // Costo chat corrente
    });
    console.log(`📝 Nuova sessione creata: ${sessionId}`);
  }
  
  const session = sessions.get(sessionId);
  session.lastActivity = new Date();
  
  // Check session timeout
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
  
  // Calcola costo attuale chat
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

// ==================== COST CALCULATION ====================
function calculateCost(inputTokens, outputTokens) {
  const inputCost = parseFloat(process.env.INPUT_TOKEN_COST) || 0.00015;
  const outputCost = parseFloat(process.env.OUTPUT_TOKEN_COST) || 0.0006;
  
  return (inputTokens * inputCost / 1000) + (outputTokens * outputCost / 1000);
}

// ==================== RESET CHAT FUNCTION ====================
function resetCurrentChat(session) {
  // Incrementa contatore chat
  session.chatCount += 1;
  
  // Reset parametri chat
  session.currentChatCost = 0;
  session.conversationHistory = [];
  session.currentFlow = null;
  session.flowData = {};
  
  console.log(`🔄 Chat ${session.chatCount}/3 iniziata per sessione ${session.id}`);
  
  return session;
}

// ==================== AI SYSTEM PROMPT GENERATOR ====================
function generateOptimizedSystemPrompt(session, companyInfo) {
  const studio = companyInfo.studio || {};
  
  // Prompt più conciso per risparmiare token
  return `Sei l'assistente di ${studio.nome || 'Studio Dentistico Demo'}.

DATI STUDIO:
- Indirizzo: ${studio.indirizzo || 'Via dei Dentisti 10, Milano (MI)'}
- Tel: ${studio.telefono || '+39 123 456 7890'}
- Email: ${studio.email || 'info@studiodemo.it'}

REGOLE:
1. Risposte brevi e dirette
2. Usa emoji appropriate
3. HTML: <br>, <strong>
4. Per prenotazioni raccogli: nome, telefono, email, tipo visita
5. Solo info veritiere dai dati forniti

${session.currentFlow ? `FLOW ATTIVO: ${session.currentFlow}` : ''}

Rispondi in italiano, professionale ma amichevole.`;
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
    appointment: ['nome', 'telefono', 'email', 'tipo_visita'],
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
    const lowerMsg = message.toLowerCase();
    if (!lowerMsg.includes('vorrei') && !lowerMsg.includes('voglio') && !lowerMsg.includes('mi serve')) {
      extractedData.nome = message.trim();
    }
  }
  
  return Object.keys(extractedData).length > 0 ? extractedData : null;
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
Note: ${flowData.note || 'Nessuna nota'}

📅 Data Richiesta: ${new Date().toLocaleString('it-IT')}
🔗 Fonte: Assistente Digitale

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
Servizio: ${flowData.servizio_interesse || 'N/A'}
Note: ${flowData.note || 'Nessuna nota'}

📅 Data Richiesta: ${new Date().toLocaleString('it-IT')}
🔗 Fonte: Assistente Digitale

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

// ==================== API ENDPOINTS ====================

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokensPerSession: process.env.MAX_TOKENS_PER_SESSION || 8000,
    maxChatsPerSession: process.env.MAX_CHATS_PER_SESSION || 3,
    maxFlowsPerSession: process.env.MAX_FLOWS_PER_SESSION || 5,
    activeSessions: sessions.size,
    companyInfoLoaded: Object.keys(companyInfo).length > 0,
    emailConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    openaiConfigured: !!process.env.OPENAI_API_KEY
  });
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

// ==================== MAIN CHAT ENDPOINT ====================
app.post('/api/chat', async (req, res) => {
  try {
    const { message, forceNewSession = false } = req.body;
    
    // Reset session if requested
    if (forceNewSession) {
      const sessionId = req.headers['x-session-id'] || 'default';
      const oldSession = sessions.get(sessionId);
      if (oldSession) {
        resetCurrentChat(oldSession);
      }
    }
    
    const session = getOrCreateSession(req);
    
    // Inizializza costo chat corrente se non esiste
    if (session.currentChatCost === undefined) {
      session.currentChatCost = 0;
    }
    
    const limits = checkSessionLimits(session);
    
    console.log(`💬 [${session.id}] Chat ${session.chatCount + 1}/3 - Messaggio: "${message.substring(0, 50)}..."`);
    console.log(`💰 [${session.id}] Costo chat: $${limits.currentChatCost.toFixed(4)}, Chat rimanenti: ${limits.remainingChats}`);
    
    // Se OpenAI non è configurato
    if (!openai) {
      return res.json({
        response: "🤖 Servizio AI non configurato. Contatta l'amministratore.",
        error: true
      });
    }
    
    // Check limits
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
      // Avvia nuova chat automaticamente
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
    
    // Detect flow intent
    const flowIntent = detectFlowIntent(message, session);
    
    // Start new flow if detected
    if (flowIntent.start) {
      session.currentFlow = flowIntent.flow;
      session.flowData = {};
      console.log(`🔄 [${session.id}] Avviato flow: ${flowIntent.flow}`);
    }
    
    // Generate system prompt
    const systemPrompt = generateOptimizedSystemPrompt(session, companyInfo);
    
    // Prepare conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.conversationHistory.slice(-6), // Meno storia per risparmiare
      { role: 'user', content: message }
    ];
    
    console.log(`🤖 [${session.id}] Chiamata GPT-4o-mini...`);
    
    // Call ChatGPT
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
    
    // Calcola costo preciso
    const costThisCall = calculateCost(inputTokens, outputTokens);
    session.currentChatCost += costThisCall;
    session.totalCost += costThisCall;
    
    console.log(`✅ [${session.id}] Risposta GPT-4o-mini (${totalTokens} token, $${costThisCall.toFixed(4)})`);
    
    // Update conversation history
    session.conversationHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    );
    session.tokenCount += totalTokens;
    
    // Keep history shorter for cost efficiency
    if (session.conversationHistory.length > 12) {
      session.conversationHistory = session.conversationHistory.slice(-12);
    }
    
    // Flow handling
    if (session.currentFlow) {
      const extractedData = extractFlowData(message, session.currentFlow);
      if (extractedData) {
        Object.assign(session.flowData, extractedData);
      }
      
      const flowStatus = checkFlowCompletion(session);
      if (flowStatus.complete) {
        await sendFlowCompletionEmail(session.currentFlow, session.flowData);
        session.currentFlow = null;
        session.flowCount++;
      }
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
  console.log(`🚀 ASSISTENTE DIGITALE AVVIATO`);
  console.log('🚀 ===================================');
  console.log(`🌐 URL: ${process.env.NODE_ENV === 'production' ? 'https://assistente-digitale.it/studio-dentistico-demo' : `http://localhost:${port}`}`);
  console.log(`🤖 Modello: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
  console.log(`📊 Token/sessione: ${process.env.MAX_TOKENS_PER_SESSION || 8000}`);
  console.log(`💬 Chat/sessione: ${process.env.MAX_CHATS_PER_SESSION || 3}`);
  console.log(`💰 Budget/chat: €${((parseFloat(process.env.MAX_COST_PER_CHAT) || 0.05) * 0.92).toFixed(3)}`);
  console.log(`📋 Company info: ${Object.keys(companyInfo).length} sezioni`);
  console.log(`📧 Email: ${process.env.NODE_ENV === 'development' ? 'SVILUPPO' : 'PRODUZIONE'}`);
  console.log(`🔑 OpenAI: ${openai ? 'CONFIGURATO' : 'NON CONFIGURATO'}`);
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