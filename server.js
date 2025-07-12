const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Session storage (in production, use Redis or database)
const sessions = new Map();

// Email transporter configuration - CORREZIONE QUI
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Session management functions
function getOrCreateSession(req) {
  const sessionId = req.headers['x-session-id'] || 'default';
  
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      createdAt: new Date(),
      tokenCount: 0,
      flowCount: 0,
      conversationHistory: [],
      isExpired: false,
      lastActivity: new Date()
    });
    console.log(`📝 Nuova sessione creata: ${sessionId}`);
  }
  
  const session = sessions.get(sessionId);
  session.lastActivity = new Date();
  
  // Check session timeout
  const timeoutMs = parseInt(process.env.SESSION_TIMEOUT_MINUTES) * 60 * 1000;
  if (Date.now() - session.createdAt.getTime() > timeoutMs) {
    session.isExpired = true;
    console.log(`⏰ Sessione scaduta: ${sessionId}`);
  }
  
  return session;
}

function checkSessionLimits(session) {
  const maxTokens = parseInt(process.env.MAX_TOKENS_PER_SESSION);
  const maxFlows = parseInt(process.env.MAX_FLOWS_PER_SESSION);
  
  return {
    tokenLimitReached: session.tokenCount >= maxTokens,
    flowLimitReached: session.flowCount >= maxFlows,
    sessionExpired: session.isExpired
  };
}

// Clean expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  const timeoutMs = parseInt(process.env.SESSION_TIMEOUT_MINUTES) * 60 * 1000;
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity.getTime() > timeoutMs) {
      sessions.delete(sessionId);
      console.log(`🗑️ Sessione rimossa per inattività: ${sessionId}`);
    }
  }
}, 10 * 60 * 1000);

// Routes

// Serve main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], systemPrompt } = req.body;
    const session = getOrCreateSession(req);
    const limits = checkSessionLimits(session);
    
    console.log(`💬 Messaggio ricevuto da sessione ${session.id}: "${message.substring(0, 50)}..."`);
    console.log(`📊 Token usati: ${session.tokenCount}/${process.env.MAX_TOKENS_PER_SESSION}, Flussi: ${session.flowCount}/${process.env.MAX_FLOWS_PER_SESSION}`);
    
    // Check limits
    if (limits.tokenLimitReached || limits.sessionExpired) {
      console.log(`🚫 Limite raggiunto per sessione ${session.id}`);
      return res.json({
        response: "Hai raggiunto il limite di utilizzo per questa sessione. Clicca su 'Inizia Nuova Chat' per continuare.",
        limitReached: true,
        sessionExpired: limits.sessionExpired
      });
    }
    
    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.conversationHistory.slice(-10), // Keep last 10 messages
      { role: 'user', content: message }
    ];
    
    console.log(`🤖 Chiamata a OpenAI con ${messages.length} messaggi...`);
    
    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      messages: messages,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
    });
    
    const response = completion.choices[0].message.content;
    const tokensUsed = completion.usage.total_tokens;
    
    console.log(`✅ Risposta ricevuta (${tokensUsed} token): "${response.substring(0, 50)}..."`);
    
    // Update session
    session.conversationHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    );
    session.tokenCount += tokensUsed;
    
    // Keep conversation history manageable
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }
    
    res.json({
      response: response,
      tokensUsed: tokensUsed,
      totalTokens: session.tokenCount,
      remainingTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION) - session.tokenCount
    });
    
  } catch (error) {
    console.error('❌ Errore chiamata OpenAI:', error);
    res.status(500).json({
      response: "Mi dispiace, sto avendo problemi tecnici. Per favore riprova tra poco.",
      error: true
    });
  }
});

// Flow completion endpoint
app.post('/api/flow-completed', (req, res) => {
  const session = getOrCreateSession(req);
  session.flowCount++;
  
  const limits = checkSessionLimits(session);
  
  console.log(`✅ Flusso completato per sessione ${session.id}. Totale flussi: ${session.flowCount}`);
  
  res.json({
    flowCount: session.flowCount,
    flowLimitReached: limits.flowLimitReached,
    remainingFlows: parseInt(process.env.MAX_FLOWS_PER_SESSION) - session.flowCount
  });
});

// Email sending endpoint
app.post('/api/send-email', async (req, res) => {
  try {
    const { type, data, to, from, subject } = req.body;
    
    console.log(`📧 Invio email tipo: ${type} a: ${to}`);
    
    let emailSubject = subject || `Nuova richiesta ${type} - Studio Dentistico Demo`;
    let emailBody = '';
    
    if (type === 'lead') {
      emailSubject = 'Nuova Richiesta - Assistente Digital Studio Dentistico';
      emailBody = `
🎯 NUOVA RICHIESTA - ASSISTENTE DIGITALE STUDIO DENTISTICO

📋 DATI CONTATTO:
Nome: ${data.nome}
Studio: ${data.studio}
Email: ${data.email}
Telefono: ${data.telefono}
Città: ${data.citta}
Proprietario Studio: ${data.proprietario}

🔗 Fonte: Demo Assistente Digitale
📅 Data: ${new Date().toLocaleString('it-IT')}
📧 Email di contatto: preventivo@assistente-digitale.it

--
Digital&More - Assistente Digitale per Studi Dentistici
      `;
    } else {
      emailBody = `
📋 NUOVA RICHIESTA ${type.toUpperCase()} - STUDIO DENTISTICO DEMO

${Object.entries(data).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join('\n')}

📅 Data: ${new Date().toLocaleString('it-IT')}
🔗 Fonte: Assistente Digitale Demo

--
Studio Dentistico Demo
      `;
    }
    
    const mailOptions = {
      from: from || process.env.SMTP_USER,
      to: to,
      subject: emailSubject,
      text: emailBody,
    };
    
    // In modalità sviluppo, logga invece di inviare email reali
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 EMAIL (MODALITÀ SVILUPPO):');
      console.log('From:', mailOptions.from);
      console.log('To:', mailOptions.to);
      console.log('Subject:', mailOptions.subject);
      console.log('Body:');
      console.log(mailOptions.text);
      console.log('--- FINE EMAIL ---');
    } else {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email inviata con successo a: ${to}`);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Errore invio email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset session endpoint
app.post('/api/reset-session', (req, res) => {
  const sessionId = req.headers['x-session-id'] || 'default';
  
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
    console.log(`🔄 Sessione resettata: ${sessionId}`);
  }
  
  res.json({ success: true, message: 'Sessione resettata con successo' });
});

// Session info endpoint
app.get('/api/session-info', (req, res) => {
  const session = getOrCreateSession(req);
  const limits = checkSessionLimits(session);
  
  res.json({
    sessionId: session.id,
    tokenCount: session.tokenCount,
    flowCount: session.flowCount,
    maxTokens: parseInt(process.env.MAX_TOKENS_PER_SESSION),
    maxFlows: parseInt(process.env.MAX_FLOWS_PER_SESSION),
    limits: limits,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    model: process.env.OPENAI_MODEL,
    maxTokensPerSession: process.env.MAX_TOKENS_PER_SESSION,
    maxFlowsPerSession: process.env.MAX_FLOWS_PER_SESSION,
    activeSessions: sessions.size
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('❌ Errore server:', error);
  res.status(500).json({ error: 'Errore interno del server' });
});

// Start server
app.listen(port, () => {
  console.log('🚀 ===================================');
  console.log(`🚀 SERVER ASSISTENTE DIGITALE AVVIATO`);
  console.log('🚀 ===================================');
  console.log(`🌐 URL: http://localhost:${port}`);
  console.log(`🤖 Modello OpenAI: ${process.env.OPENAI_MODEL}`);
  console.log(`🎯 Max token per sessione: ${process.env.MAX_TOKENS_PER_SESSION}`);
  console.log(`📊 Max flussi per sessione: ${process.env.MAX_FLOWS_PER_SESSION}`);
  console.log(`⏰ Timeout sessione: ${process.env.SESSION_TIMEOUT_MINUTES} minuti`);
  console.log(`📧 Email modalità: ${process.env.NODE_ENV === 'development' ? 'SVILUPPO (log only)' : 'PRODUZIONE'}`);
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