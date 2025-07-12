// ==================== UI MANAGER ====================
// Gestisce l'aggiornamento dinamico dell'interfaccia con i dati dal JSON

// ==================== VARIABILI GLOBALI ====================
let uiStudioInfo = {};
let currentDate = new Date();
let calendarData = {};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  loadAndUpdateUI();
});

// ==================== MAIN LOAD FUNCTION ====================
async function loadAndUpdateUI() {
  try {
    const response = await fetch('company-info.json');
    uiStudioInfo = await response.json();
    
    updateAllUIElements();
    
    console.log('✅ UI aggiornata con dati dinamici');
  } catch (error) {
    console.error('❌ Errore caricamento UI:', error);
    setFallbackValues();
  }
}

function updateAllUIElements() {
  updateStaticElements();
  updatePromoSection();
  updatePopupContents();
  updateFooterInfo();
}

function setFallbackValues() {
  // Valori di fallback se il JSON non si carica
  uiStudioInfo = {
    studio: {
      nome: 'Studio Dentistico Demo',
      descrizione: 'Il tuo sorriso è la nostra priorità',
      indirizzo: 'Via Demo 123, Milano (MI)'
    },
    contatti: {
      telefono: { numero: '+39 123 456 7890' },
      email: { indirizzo: 'info@studiodemo.it' }
    }
  };
  updateAllUIElements();
}

// ==================== STATIC ELEMENTS UPDATE ====================
function updateStaticElements() {
  updateStudioName();
  updateSiteUrl();
}

function updateStudioName() {
  const nomeStudio = uiStudioInfo.studio?.nome || 'Studio Dentistico Demo';
  
  const elements = [
    { id: 'studio-name', content: nomeStudio },
    { id: 'chat-title', content: `Assistente Digitale - ${nomeStudio.replace('Studio Dentistico ', '')}` },
    { id: 'popup-studio-title', content: createStudioTitleWithLogo(nomeStudio) },
    { id: 'gallery-title', content: nomeStudio }
  ];
  
  elements.forEach(({ id, content }) => {
    const element = document.getElementById(id);
    if (element) {
      if (id === 'popup-studio-title') {
        element.innerHTML = content;
      } else {
        element.textContent = content;
      }
    }
  });
}

function createStudioTitleWithLogo(nomeStudio) {
  return `<img src="images/logo.png" alt="Logo Studio" style="width: 28px; height: 28px; border-radius: 50%; vertical-align: middle; margin-right: 10px;">${nomeStudio}`;
}

function updateSiteUrl() {
  const siteElement = document.getElementById('studio-site');
  if (siteElement && uiStudioInfo.contatti?.sito_web?.url) {
    siteElement.textContent = uiStudioInfo.contatti.sito_web.url;
  }
}

// ==================== PROMO SECTION ====================
function updatePromoSection() {
  const promoSection = document.getElementById('promo-section');
  if (!promoSection || !uiStudioInfo.offerte) return;

  const offertaAttiva = findActiveOffer();
  
  if (offertaAttiva) {
    promoSection.innerHTML = createPromoHTML(offertaAttiva);
  }
}

function findActiveOffer() {
  return Object.values(uiStudioInfo.offerte).find(offerta => offerta.attiva);
}

function createPromoHTML(offerta) {
  return `
    <h4>🎁 ${offerta.nome}</h4>
    <p class="scadenza">Valida fino al <strong>${offerta.scadenza}</strong></p>
    <p class="descrizione">${offerta.descrizione}</p>
    ${offerta.prezzo_speciale ? `<p class="prezzo">💰 ${offerta.prezzo_speciale}</p>` : ''}
  `;
}

// ==================== POPUP CONTENTS UPDATE ====================
function updatePopupContents() {
  updateInfoStudioPopup();
  updateSpecialtiesPopup();
  updateSchedulePopup();
  updateSupportPopup();
  updateLocationPopup();
}

// ==================== INFO STUDIO POPUP ====================
function updateInfoStudioPopup() {
  const container = document.getElementById('info-studio-content');
  if (!container) return;

  const studio = uiStudioInfo.studio || {};
  const team = uiStudioInfo.team?.descrizione || getDefaultTeamDescription();
  
  const infoBlocks = [
    {
      icon: 'fas fa-user-md',
      title: 'Chi Siamo',
      content: studio.descrizione || getDefaultStudioDescription()
    },
    {
      icon: 'fas fa-hourglass-start',
      title: 'La Nostra Storia',
      content: studio.storia || getDefaultStudioHistory()
    },
    {
      icon: 'fas fa-users',
      title: 'Il Nostro Team',
      content: team
    }
  ];

  container.innerHTML = infoBlocks.map(createInfoBlock).join('');
}

function getDefaultTeamDescription() {
  return 'Un\'equipe multidisciplinare composta da dentisti, igienisti e assistenti pronti ad accoglierti con professionalità e cortesia.';
}

function getDefaultStudioDescription() {
  return 'Lo Studio Dentistico Demo offre soluzioni odontoiatriche di qualità con tecnologie moderne, attenzione al paziente e cura personalizzata.';
}

function getDefaultStudioHistory() {
  return 'Dal 2005 ci prendiamo cura del sorriso dei nostri pazienti, con uno staff specializzato e costantemente aggiornato.';
}

function createInfoBlock({ icon, title, content }) {
  return `
    <div class="info-block">
      <div class="icon"><i class="${icon}"></i></div>
      <div class="text">
        <strong>${title}</strong>
        <p>${content}</p>
      </div>
    </div>
  `;
}

// ==================== SPECIALTIES POPUP ====================
function updateSpecialtiesPopup() {
  const container = document.getElementById('specialties-content');
  if (!container || !uiStudioInfo.servizi) return;

  const servizi = Object.values(uiStudioInfo.servizi);
  container.innerHTML = servizi.map(createSpecialtyHTML).join('');
}

function createSpecialtyHTML(servizio) {
  return `
    <div class="specialty">
      <div class="icon"><i class="${servizio.icona || 'fas fa-tooth'}"></i></div>
      <div class="text">
        <strong>${servizio.nome}</strong>
        <p>${servizio.descrizione}</p>
        ${servizio.prezzo_base ? `<small><strong>Da ${servizio.prezzo_base}</strong></small>` : ''}
      </div>
    </div>
  `;
}

// ==================== SCHEDULE POPUP ====================
function updateSchedulePopup() {
  const container = document.getElementById('schedule-content');
  if (!container) return;

  const scheduleData = getScheduleData();
  container.innerHTML = createScheduleTabsHTML();
  
  // Prepara i dati del calendario dopo aver creato l'HTML
  setTimeout(() => {
    prepareCalendarData(scheduleData);
    initializeCalendar();
  }, 100);
}

function getScheduleData() {
  return {
    orari: uiStudioInfo.orari || {},
    orariSpeciali: uiStudioInfo.orari_speciali || {},
    festivita: uiStudioInfo.festivita_italiane || {},
    ferieProgrammate: uiStudioInfo.ferie_programmate || {}
  };
}

function createScheduleTabsHTML() {
  return `
    <div class="tab-container">
      <div class="tab-buttons">
        <button class="tab-button active" onclick="switchScheduleTab('normal')">
          <i class="fas fa-clock"></i> Orari Normali
        </button>
        <button class="tab-button" onclick="switchScheduleTab('calendar')">
          <i class="fas fa-calendar"></i> Calendario Chiusure
        </button>
      </div>

      <div id="schedule-tab-normal" class="tab-content active">
        <div class="schedule-normal-grid">
          ${generateNormalSchedule()}
        </div>
      </div>

      <div id="schedule-tab-calendar" class="tab-content">
        <div class="calendar-container">
          ${generateCalendarHTML()}
        </div>
      </div>
    </div>
  `;
}

// ==================== NORMAL SCHEDULE GENERATION ====================
function generateNormalSchedule() {
  const orari = uiStudioInfo.orari || {};
  let scheduleHTML = '';

  const scheduleItems = [
    { key: 'lunedi_venerdi', label: 'Lunedì - Venerdì', icon: 'fas fa-calendar-week' },
    { key: 'sabato', label: 'Sabato', icon: 'fas fa-calendar-day' },
    { key: 'domenica', label: 'Domenica', icon: 'fas fa-calendar-day' }
  ];

  scheduleItems.forEach(item => {
    if (orari[item.key]) {
      const isChiuso = item.key === 'domenica' && orari[item.key].toLowerCase().includes('chius');
      scheduleHTML += createScheduleItem(item, orari[item.key], isChiuso);
    }
  });

  if (orari.note) {
    scheduleHTML += createNoteItem(orari.note);
  }

  return scheduleHTML || createEmptyScheduleMessage();
}

function createScheduleItem({ label, icon }, orario, isChiuso = false) {
  return `
    <div class="schedule-item ${isChiuso ? 'closed' : ''}">
      <div class="icon"><i class="${icon}"></i></div>
      <div class="text">
        <strong>${label}</strong>
        <p><i class="fas fa-${isChiuso ? 'times' : 'clock'}"></i> ${orario}</p>
      </div>
    </div>
  `;
}

function createNoteItem(note) {
  return `
    <div class="schedule-item special" style="grid-column: 1 / -1;">
      <div class="icon"><i class="fas fa-info-circle"></i></div>
      <div class="text">
        <strong>Note Importanti</strong>
        <p>${note}</p>
      </div>
    </div>
  `;
}

function createEmptyScheduleMessage() {
  return '<p style="text-align: center; color: #666; padding: 40px;">Nessun orario normale configurato</p>';
}

// ==================== CALENDAR GENERATION ====================
function generateCalendarHTML() {
  return `
    <div class="calendar-header">
      <button class="calendar-nav" onclick="changeMonth(-1)">
        <i class="fas fa-chevron-left"></i>
      </button>
      <div class="calendar-month-year" id="calendar-month-year"></div>
      <button class="calendar-nav" onclick="changeMonth(1)">
        <i class="fas fa-chevron-right"></i>
      </button>
    </div>
    
    <div class="calendar-weekdays">
      ${createWeekdaysHTML()}
    </div>
    
    <div class="calendar-grid" id="calendar-grid"></div>
    
    <div class="calendar-legend">
      ${createCalendarLegendHTML()}
    </div>
  `;
}

function createWeekdaysHTML() {
  const weekdays = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  return weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('');
}

function createCalendarLegendHTML() {
  const legendItems = [
    { class: 'closed', label: 'Chiuso' },
    { class: 'vacation', label: 'Ferie' },
    { class: 'holiday', label: 'Festività' }
  ];

  return legendItems.map(item => `
    <div class="legend-item">
      <div class="legend-color ${item.class}"></div>
      <span>${item.label}</span>
    </div>
  `).join('');
}

// ==================== CALENDAR DATA PREPARATION ====================
function prepareCalendarData({ orariSpeciali, festivita, ferieProgrammate }) {
  calendarData = {};
  
  addFestivitaToCalendar(festivita);
  addOrariSpecialiToCalendar(orariSpeciali);
  addFerieProgrammateToCalendar(ferieProgrammate);
}

function addFestivitaToCalendar(festivita) {
  Object.values(festivita).forEach(festa => {
    const key = `${festa.giorno}/${festa.mese}`;
    calendarData[key] = {
      type: 'holiday',
      title: festa.nome,
      status: festa.status
    };
  });
}

function addOrariSpecialiToCalendar(orariSpeciali) {
  Object.values(orariSpeciali).forEach(speciale => {
    const key = `${speciale.giorno}/${speciale.mese}`;
    const isChiuso = speciale.orario.toLowerCase().includes('chius');
    calendarData[key] = {
      type: isChiuso ? 'closed' : 'special',
      title: speciale.nome,
      status: speciale.orario
    };
  });
}

function addFerieProgrammateToCalendar(ferieProgrammate) {
  Object.values(ferieProgrammate).forEach(ferie => {
    if (ferie.tipo === 'periodo_fisso' && ferie.inizio && ferie.fine) {
      addVacationPeriod(ferie);
    }
  });
}

function addVacationPeriod(ferie) {
  const startDate = new Date(2024, ferie.inizio.mese - 1, ferie.inizio.giorno);
  const endDate = new Date(2024, ferie.fine.mese - 1, ferie.fine.giorno);
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = `${d.getDate()}/${d.getMonth() + 1}`;
    calendarData[key] = {
      type: 'vacation',
      title: ferie.descrizione,
      status: ferie.nota || 'Ferie programmate'
    };
  }
}

// ==================== CALENDAR DISPLAY ====================
function initializeCalendar() {
  updateCalendarDisplay();
}

function updateCalendarDisplay() {
  const monthYearElement = document.getElementById('calendar-month-year');
  const gridElement = document.getElementById('calendar-grid');
  
  if (!monthYearElement || !gridElement) return;
  
  updateCalendarHeader(monthYearElement);
  updateCalendarGrid(gridElement);
}

function updateCalendarHeader(element) {
  const monthNames = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  
  element.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
}

function updateCalendarGrid(gridElement) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  
  const today = new Date();
  let calendarHTML = '';
  
  // Genera 6 settimane (42 giorni)
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    
    calendarHTML += createCalendarDayHTML(cellDate, month, today);
  }
  
  gridElement.innerHTML = calendarHTML;
}

function createCalendarDayHTML(cellDate, currentMonth, today) {
  const isCurrentMonth = cellDate.getMonth() === currentMonth;
  const isToday = cellDate.toDateString() === today.toDateString();
  const dayKey = `${cellDate.getDate()}/${cellDate.getMonth() + 1}`;
  const dayData = calendarData[dayKey];
  
  const classes = getCalendarDayClasses(isCurrentMonth, isToday, dayData);
  const tooltip = dayData ? `${dayData.title}: ${dayData.status}` : '';
  
  return `
    <div class="${classes.join(' ')}" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>
      ${cellDate.getDate()}
    </div>
  `;
}

function getCalendarDayClasses(isCurrentMonth, isToday, dayData) {
  const classes = ['calendar-day'];
  
  classes.push(isCurrentMonth ? 'current-month' : 'other-month');
  
  if (isToday) classes.push('today');
  if (dayData) classes.push(dayData.type);
  
  return classes;
}

// ==================== SUPPORT POPUP ====================
function updateSupportPopup() {
  const container = document.getElementById('support-content');
  if (!container) return;

  const contatti = uiStudioInfo.contatti || {};
  const supportItems = createSupportItems(contatti);
  
  container.innerHTML = supportItems.map(createSupportItemHTML).join('');
}

function createSupportItems(contatti) {
  const items = [
    {
      icon: 'fas fa-phone-alt',
      title: 'Telefono',
      content: createPhoneLink(contatti.telefono)
    },
    {
      icon: 'fas fa-envelope',
      title: 'Email',
      content: createEmailLink(contatti.email)
    }
  ];

  if (contatti.whatsapp) {
    items.push({
      icon: 'fab fa-whatsapp',
      title: 'WhatsApp',
      content: createWhatsAppLink(contatti.whatsapp)
    });
  }

  if (contatti.sito_web) {
    items.push({
      icon: 'fas fa-globe',
      title: 'Sito Web',
      content: createWebsiteLink(contatti.sito_web)
    });
  }

  return items;
}

function createPhoneLink(telefono) {
  const numero = telefono?.numero || '+39 123 456 7890';
  const link = telefono?.link || `tel:${numero.replace(/\s/g, '')}`;
  return `<a href="${link}">${numero}</a>`;
}

function createEmailLink(email) {
  const indirizzo = email?.indirizzo || 'info@studiodemo.it';
  const link = email?.link || `mailto:${indirizzo}`;
  return `<a href="${link}">${indirizzo}</a>`;
}

function createWhatsAppLink(whatsapp) {
  return `<a href="${whatsapp.link}" target="_blank">Scrivici su WhatsApp</a>`;
}

function createWebsiteLink(sito) {
  return `<a href="${sito.link}" target="_blank">${sito.url}</a>`;
}

function createSupportItemHTML({ icon, title, content }) {
  return `
    <div class="support-item">
      <div class="icon"><i class="${icon}"></i></div>
      <div class="text">
        <strong>${title}</strong>
        <p>${content}</p>
      </div>
    </div>
  `;
}

// ==================== LOCATION POPUP ====================
function updateLocationPopup() {
  const container = document.getElementById('location-content');
  if (!container) return;

  const studio = uiStudioInfo.studio || {};
  const nomeStudio = studio.nome || 'Studio Dentistico Demo';
  const indirizzo = studio.indirizzo || 'Via dei Dentisti 10, Milano (MI)';
  
  container.innerHTML = createLocationHTML(nomeStudio, indirizzo);
}

function createLocationHTML(nomeStudio, indirizzo) {
  return `
    <p><strong>${nomeStudio}</strong></p>
    <p>${indirizzo}</p>
    <iframe
      src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2889.939052703738!2d9.191383315685328!3d45.46420357910095!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4786c6a2d8e9cb3d%3A0xc4f61a4c4baf9e1c!2sMilano%2C%20MI!5e0!3m2!1sit!2sit!4v1612787342425!5m2!1sit!2sit"
      width="100%" 
      height="200" 
      style="border:0; border-radius: 8px;" 
      allowfullscreen="" 
      loading="lazy">
    </iframe>
    <a href="https://www.google.com/maps/search/${encodeURIComponent(indirizzo)}" target="_blank" class="gmb-button">
      Ottieni indicazioni
    </a>
  `;
}

// ==================== FOOTER ====================
function updateFooterInfo() {
  const footerElement = document.getElementById('footer-info');
  if (!footerElement) return;

  const infoLegali = uiStudioInfo.info_legali || {};
  const footerData = {
    ragioneSociale: infoLegali.ragione_sociale || 'Studio Dentistico Demo SRL',
    partitaIva: infoLegali.piva || '01234567890',
    albo: infoLegali.albo || 'Iscrizione Albo Medici Odontoiatri: MI-123456'
  };
  
  footerElement.innerHTML = createFooterHTML(footerData);
}

function createFooterHTML({ ragioneSociale, partitaIva, albo }) {
  return `
    ${ragioneSociale}<br>
    P.IVA ${partitaIva}<br>
    ${albo}
  `;
}

// ==================== GLOBAL FUNCTIONS ====================
// Funzioni globali che devono essere accessibili dall'HTML

window.changeMonth = function(direction) {
  currentDate.setMonth(currentDate.getMonth() + direction);
  updateCalendarDisplay();
};

window.switchScheduleTab = function(tabName) {
  // Rimuovi active da tutti i button e content
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  // Aggiungi active agli elementi selezionati
  const activeButton = document.querySelector(`[onclick="switchScheduleTab('${tabName}')"]`);
  const activeContent = document.getElementById(`schedule-tab-${tabName}`);
  
  if (activeButton) activeButton.classList.add('active');
  if (activeContent) activeContent.classList.add('active');
  
  // Inizializza il calendario se necessario
  if (tabName === 'calendar') {
    setTimeout(() => {
      const gridElement = document.getElementById('calendar-grid');
      if (gridElement && gridElement.innerHTML === '') {
        updateCalendarDisplay();
      }
    }, 100);
  }
};

// ==================== CONSOLE LOG ====================
console.log('✅ UI Manager caricato e ottimizzato');