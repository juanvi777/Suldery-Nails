let ownerUser = null;
const pendingPhotoFiles = { login: null, client: null };
const $d = id => document.getElementById(id);
function safeFormatTime12(timeValue) {
  const text = String(timeValue ?? '').slice(0, 5);
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return text || 'Hora pendiente';
  let hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DURATION_LABELS = {
  'Manicure semipermanente': '1 h 30 min',
  'Pedicure semipermanente': '1 hora',
  'Dipping': '2 horas',
  'Press on': '2 horas'
};

let ownerUsersCache = [];
let ownerAppointmentsCache = [];
let ownerPhotosCache = [];
let ownerRecoveryRequestsCache = [];
let ownerCatalogCache = [];
let ownerCatalogIndex = 0;
let ownerReviewsCache = [];
let ownerReviewAverage = 0;
let ownerReviewCount = 0;
let notificationTargetsCache = { users: [], appointments: [] };
let ownerCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let ownerCalendarData = new Map();
let ownerCalendarSelectedDate = '';

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function timeOptions(includeEndOfDay = false) {
  const values = [];
  for (let minutes = 0; minutes <= 1440; minutes += 30) {
    if (minutes === 1440 && !includeEndOfDay) continue;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    values.push(value);
  }
  return values;
}

function timeSelectHTML(value, allowEndOfDay = false) {
  return `<select class="interval-time" data-time>${timeOptions(allowEndOfDay).map(time => `<option value="${time}" ${time === value ? 'selected' : ''}>${safeFormatTime12(time)}</option>`).join('')}</select>`;
}

function intervalRow(interval = { start_time:'07:00', end_time:'12:00' }, removable = true) {
  const row = document.createElement('div');
  row.className = 'interval-row';
  row.innerHTML = `<div class="interval-selects"><label>Desde${timeSelectHTML(interval.start_time)}</label><span>—</span><label>Hasta${timeSelectHTML(interval.end_time, true)}</label></div>${removable ? '<button type="button" class="small-button ghost interval-remove">Quitar</button>' : ''}`;
  const remove = row.querySelector('.interval-remove');
  if (remove) remove.addEventListener('click', () => row.remove());
  return row;
}

function addInterval(container, interval) {
  container.appendChild(intervalRow(interval));
}

function buildWeeklyEditor(weekly) {
  const form = $d('weeklyScheduleForm');
  form.innerHTML = '';
  for (let weekday = 1; weekday <= 7; weekday++) {
    const intervals = Array.isArray(weekly?.[weekday]) ? weekly[weekday] : [];
    const card = document.createElement('article');
    card.className = 'weekday-schedule-card';
    card.dataset.weekday = String(weekday);
    card.innerHTML = `<div class="weekday-schedule-head"><div><strong>${DAY_NAMES[weekday % 7]}</strong><small> ${weekday === 7 ? 'Puedes abrirlo si lo necesitas' : 'Horario semanal recurrente'}</small></div><label class="schedule-switch"><input type="checkbox" data-day-open ${intervals.length ? 'checked' : ''}><span></span><b>Atender</b></label></div><div class="interval-list" data-intervals></div><button type="button" class="small-button add-interval">+ Agregar tramo</button>`;
    const list = card.querySelector('[data-intervals]');
    intervals.forEach((interval) => addInterval(list, interval));
    if (!intervals.length) list.appendChild(intervalRow({start_time:'07:00',end_time:'12:00'}, true)).classList.add('template-row');
    card.querySelector('.add-interval').addEventListener('click', () => addInterval(list, {start_time:'13:00',end_time:'18:00'}));
    form.appendChild(card);
  }
}

function collectScheduleForm() {
  const weekly = {};
  document.querySelectorAll('.weekday-schedule-card').forEach(card => {
    const weekday = Number(card.dataset.weekday);
    const isOpen = card.querySelector('[data-day-open]').checked;
    if (!isOpen) { weekly[weekday] = []; return; }
    weekly[weekday] = [...card.querySelectorAll('[data-intervals] .interval-row')].map(row => ({
      start_time: row.querySelectorAll('[data-time]')[0].value,
      end_time: row.querySelectorAll('[data-time]')[1].value
    }));
  });
  return weekly;
}

function buildOverrideIntervals() {
  const container = $d('scheduleOverrideIntervals');
  container.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'interval-editor-head';
  heading.innerHTML = '<span>Tramos del día</span><button type="button" class="small-button" id="addOverrideInterval">+ Tramo</button>';
  container.appendChild(heading);
  const list = document.createElement('div');
  list.className = 'override-interval-list';
  list.dataset.intervals = '';
  container.appendChild(list);
  addInterval(list, {start_time:'07:00',end_time:'12:00'});
  addInterval(list, {start_time:'13:00',end_time:'18:00'});
  heading.querySelector('#addOverrideInterval').addEventListener('click', () => addInterval(list, {start_time:'13:00',end_time:'15:00'}));
  toggleOverrideIntervals();
}

function toggleOverrideIntervals() {
  const open = $d('scheduleOverrideOpen')?.value === 'yes';
  const container = $d('scheduleOverrideIntervals');
  if (container) container.classList.toggle('disabled-section', !open);
}

function collectOverrideIntervals() {
  return [...document.querySelectorAll('#scheduleOverrideIntervals [data-intervals] .interval-row')].map(row => ({
    start_time: row.querySelectorAll('[data-time]')[0].value,
    end_time: row.querySelectorAll('[data-time]')[1].value
  }));
}

async function initDuena() {
  ownerUser = await requireRole('owner');
  if (!ownerUser) return;
  const now = new Date();
  $d('ownerDateLabel').textContent = new Intl.DateTimeFormat('es-CO', { timeZone:'America/Bogota', weekday:'long', day:'numeric', month:'long' }).format(now);
  const today = localISODate(now);
  $d('ownerAppointmentDate').min = today;
  $d('ownerAppointmentDate').value = today;
  $d('blockedDate').min = today;
  $d('scheduleOverrideDate').min = today;

  document.querySelectorAll('[data-owner-tool]').forEach(button => button.addEventListener('click', () => openOwnerTool(button.dataset.ownerTool)));
  document.querySelectorAll('[data-close-owner-tool]').forEach(button => button.addEventListener('click', closeOwnerTools));
  document.querySelectorAll('[data-owner-stat]').forEach(button => button.addEventListener('click', () => openOwnerStat(button.dataset.ownerStat)));
  document.querySelectorAll('[data-close-owner-stat]').forEach(button => button.addEventListener('click', closeOwnerStats));
  $d('notifyClientSelect')?.addEventListener('change', updateNotifyAppointmentOptions);
  $d('notifyAppointmentSelect')?.addEventListener('change', fillReminderMessage);
  $d('notifyReminderButton')?.addEventListener('click', fillReminderMessage);
  $d('notifyHelloButton')?.addEventListener('click', fillHelloMessage);
  $d('sendNotifyButton')?.addEventListener('click', sendOwnerNotification);
  $d('ownerAppointmentDate').addEventListener('change', loadOwnerSlots);
  $d('ownerService').addEventListener('change', () => { updateOwnerServiceDurationHint(); loadOwnerSlots(); });
  $d('ownerBookingForm').addEventListener('submit', submitManualBooking);
  $d('photoPickerLogin')?.addEventListener('change', event => seleccionarFoto(event, 'login'));
  $d('photoPickerClientOnly')?.addEventListener('change', event => seleccionarFoto(event, 'client'));
  $d('saveLoginPhotoButton')?.addEventListener('click', () => guardarFotoSeleccionada('login'));
  $d('saveClientPhotoButton')?.addEventListener('click', () => guardarFotoSeleccionada('client'));
  $d('photoReplacePicker')?.addEventListener('change', reemplazarFoto);
  $d('blockedDateForm').addEventListener('submit', bloquearFecha);
  $d('blockedDatesList').addEventListener('click', handleBlockedDateAction);
  $d('blockedMode')?.addEventListener('change', toggleBlockedMode);
  $d('blockedIntervalsEditor')?.addEventListener('click', handleBlockedIntervalEditorClick);
  $d('ownerLoginGallery')?.addEventListener('click', handleGalleryAction);
  $d('ownerClientGallery')?.addEventListener('click', handleGalleryAction);
  $d('ownerClientOnlyGallery')?.addEventListener('click', handleGalleryAction);
  $d('catalogPhotoPicker')?.addEventListener('change', subirCatalogoFoto);
  $d('catalogReplacePicker')?.addEventListener('change', reemplazarCatalogoFoto);
  $d('catalogRefreshButton')?.addEventListener('click', loadOwnerCatalog);
  $d('catalogOwnerPrevious')?.addEventListener('click', () => moveCatalogViewer(-1));
  $d('catalogOwnerNext')?.addEventListener('click', () => moveCatalogViewer(1));
  $d('catalogOwnerDelete')?.addEventListener('click', eliminarCatalogoFotoActual);
  $d('catalogOwnerReplace')?.addEventListener('click', prepararReemplazoCatalogoActual);
  $d('catalogOwnerUp')?.addEventListener('click', () => moverCatalogoActual('up'));
  $d('catalogOwnerDown')?.addEventListener('click', () => moverCatalogoActual('down'));
  $d('saveWeeklyScheduleButton').addEventListener('click', saveWeeklySchedule);
  $d('scheduleOverrideForm').addEventListener('submit', saveScheduleOverride);
  $d('scheduleOverrideOpen').addEventListener('change', toggleOverrideIntervals);
  $d('scheduleOverridesList').addEventListener('click', handleOverrideAction);
  $d('ownerCalendarPrevious')?.addEventListener('click', () => changeOwnerCalendarMonth(-1));
  $d('ownerCalendarNext')?.addEventListener('click', () => changeOwnerCalendarMonth(1));
  $d('ownerCalendarToday')?.addEventListener('click', goToOwnerCalendarToday);
  $d('ownerCalendarService')?.addEventListener('change', () => { if (ownerCalendarSelectedDate) loadOwnerCalendarDay(ownerCalendarSelectedDate); });
  $d('ownerCalendarAppointments')?.addEventListener('click', handleOwnerCalendarAppointmentAction);
  $d('enableNotificationsButton')?.addEventListener('click', async () => { try { await enableSulderyPush(); await loadNotificationStatus(); alert('Listo 💕. Este dispositivo ya puede recibir tus avisos.'); } catch (error) { alert(error.message); } });
  $d('testNotificationButton')?.addEventListener('click', testOwnerNotification);

  $d('careGuideService')?.addEventListener('change', renderCareGuide);
  $d('careGuideClientName')?.addEventListener('input', renderCareGuide);
  $d('careGuideCopyButton')?.addEventListener('click', copyCareMessage);
  document.querySelectorAll('[data-ai-tab]').forEach(button => button.addEventListener('click', () => switchAiTab(button.dataset.aiTab)));
  $d('aiGenerateDesign')?.addEventListener('click', generateAiDesign);
  $d('aiAssistantAsk')?.addEventListener('click', answerAiAssistant);
  $d('aiAssistantQuestion')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); answerAiAssistant(); } });
  document.querySelectorAll('[data-ai-prompt]').forEach(button => button.addEventListener('click', () => { const input=$d('aiAssistantQuestion'); if (input) input.value=button.dataset.aiPrompt; answerAiAssistant(); }));
  $d('aiKnowledgeSearch')?.addEventListener('input', renderAiKnowledge);
  renderAiKnowledge();
  renderAiCatalog();
  switchAiTab('assistant');
  generateAiDesign();

  updateOwnerServiceDurationHint();
  buildOverrideIntervals();
  buildBlockedIntervalsEditor();
  toggleBlockedMode();
  await refreshOwnerData();
  renderCareGuide();
}

function openOwnerTool(name) {
  document.querySelectorAll('.owner-tool-panel').forEach(panel => panel.classList.add('hidden-tool-panel'));
  const toolPanelIds = {
    nailLab: 'ownerToolNailLab',
    clientPhotos: 'ownerToolClientPhotos',
    photos: 'ownerToolPhotos',
    calendar: 'ownerToolCalendar',
    schedule: 'ownerToolSchedule',
    manual: 'ownerToolManual',
    blocked: 'ownerToolBlocked',
    catalog: 'ownerToolCatalog'
  };
  const panelId = toolPanelIds[name] || `ownerTool${name[0].toUpperCase()}${name.slice(1)}`;
  const panel = $d(panelId);
  if (!panel) return;
  panel.classList.remove('hidden-tool-panel');
  panel.scrollIntoView({ behavior:'smooth', block:'start' });
  if (name === 'schedule') loadScheduleEditor();
  if (name === 'manual') loadOwnerSlots();
  if (name === 'blocked') loadBlockedDates();
  if (name === 'photos') loadOwnerGallery();
  if (name === 'clientPhotos') loadOwnerGallery();
  if (name === 'catalog') loadOwnerCatalog();
  if (name === 'calendar') loadOwnerCalendar();
}

function closeOwnerTools() {
  document.querySelectorAll('.owner-tool-panel').forEach(panel => panel.classList.add('hidden-tool-panel'));
}

async function loadNotificationStatus() {
  const title = $d('notificationStatusTitle');
  const text = $d('notificationStatusText');
  const button = $d('enableNotificationsButton');
  if (!title || !text) return;
  try {
    const data = await getSulderyPushStatus();
    if (data.subscribed) {
      title.textContent = data.needsAttention ? 'Avisos gratuitos · revisar' : 'Avisos gratuitos · activos';
      text.textContent = data.needsAttention
        ? 'Hay una suscripción que necesita comprobarse. Pulsa “Probar aviso” y, si hace falta, vuelve a activar los avisos.'
        : `Este dispositivo está registrado para recibir tus avisos (${data.devices} dispositivo${data.devices === 1 ? '' : 's'}).`;
      if (button) button.textContent = data.needsAttention ? '🔔 Revisar avisos' : 'Avisos activos ✓';
    } else {
      title.textContent = 'Avisos gratuitos · pendientes';
      text.textContent = 'Actívalos una vez en este celular para recibir solicitudes y recordatorios.';
      if (button) button.textContent = 'Activar avisos';
    }
  } catch (error) {
    title.textContent = 'Avisos gratuitos';
    text.textContent = error.message;
  }
}

async function testOwnerNotification() {
  try {
    const data = await apiFetch('/owner/notifications/test', { method: 'POST' });
    alert(data.message);
  } catch (error) { alert(error.message); }
}




async function refreshOwnerData() {
  await Promise.all([loadPendingUsers(), loadOwnerAppointments(), loadPasswordRecoveryRequests(), loadNotificationStatus(), loadOwnerReviews(), loadNotificationTargets()]);
  await loadOwnerGallery();
  await loadBlockedDates();
  updateOwnerServiceDurationHint();
  await loadOwnerSlots();
  renderOwnerStatsDetails();
}

function openOwnerStat(name) {
  closeOwnerTools();
  closeOwnerStats();
  if (name === 'clients') {
    renderActiveClients();
    $d('ownerStatClients').classList.remove('hidden-tool-panel');
    $d('ownerStatClients').scrollIntoView({ behavior:'smooth', block:'start' });
  } else if (name === 'appointments') {
    renderScheduledAppointments();
    $d('ownerStatAppointments').classList.remove('hidden-tool-panel');
    $d('ownerStatAppointments').scrollIntoView({ behavior:'smooth', block:'start' });
  } else if (name === 'calendar') {
    openOwnerTool('calendar');
  } else if (name === 'recovery') {
    loadPasswordRecoveryRequests();
    $d('ownerStatRecovery').classList.remove('hidden-tool-panel');
    $d('ownerStatRecovery').scrollIntoView({ behavior:'smooth', block:'start' });
  } else if (name === 'reviews') {
    loadOwnerReviews();
    $d('ownerStatReviews')?.classList.remove('hidden-tool-panel');
    $d('ownerStatReviews')?.scrollIntoView({ behavior:'smooth', block:'start' });
  } else if (name === 'notify') {
    loadNotificationTargets();
    $d('ownerStatNotify')?.classList.remove('hidden-tool-panel');
    $d('ownerStatNotify')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }
}

function closeOwnerStats() {
  document.querySelectorAll('.owner-detail-panel').forEach(panel => panel.classList.add('hidden-tool-panel'));
}

function renderOwnerStatsDetails() {
  $d('activeClientCount').textContent = ownerUsersCache.filter(user => user.role === 'client' && user.status === 'accepted').length;
  $d('scheduledCount').textContent = ownerAppointmentsCache.filter(a => a.status === 'accepted' && String(a.appointment_date).slice(0,10) >= localISODate(new Date())).length;
  if ($d('recoveryCount')) $d('recoveryCount').textContent = ownerRecoveryRequestsCache.filter(request => request.status === 'pending').length;
  if ($d('reviewAverage')) $d('reviewAverage').textContent = ownerReviewCount ? ownerReviewAverage.toFixed(1) + '★' : '—';
  if ($d('reviewCount')) $d('reviewCount').textContent = ownerReviewCount;
  if ($d('ownerReviewAverageLarge')) $d('ownerReviewAverageLarge').textContent = ownerReviewCount ? ownerReviewAverage.toFixed(1) : '—';
  if ($d('ownerReviewCountLarge')) $d('ownerReviewCountLarge').textContent = ownerReviewCount;
  if ($d('ownerReviewStars')) $d('ownerReviewStars').textContent = reviewStars(ownerReviewAverage);
  renderActiveClients();
  renderScheduledAppointments();
}


function reviewStars(value) {
  const numeric = Math.max(0, Math.min(5, Number(value) || 0));
  if (!numeric) return '☆☆☆☆☆';
  const rounded = Math.round(numeric);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

async function loadOwnerReviews() {
  const list = $d('ownerReviewsList');
  try {
    const data = await apiFetch('/owner/reviews');
    ownerReviewsCache = Array.isArray(data.reviews) ? data.reviews : [];
    ownerReviewAverage = Number(data.average || 0);
    ownerReviewCount = Number(data.count || ownerReviewsCache.length || 0);
    renderOwnerReviews();
    renderOwnerStatsDetails();
  } catch (error) {
    ownerReviewsCache = [];
    if (list) list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function pushHealthLabel(user) {
  const devices = Number(user?.devices || 0);
  if (!devices) return 'avisos no activados';
  const errorAfterSuccess = user.last_error_at && (!user.last_success_at || new Date(user.last_error_at) > new Date(user.last_success_at));
  if (errorAfterSuccess) return 'revisar avisos';
  if (!user.last_success_at) return 'probar avisos';
  return 'avisos activos';
}

function renderOwnerReviews() {
  const list = $d('ownerReviewsList');
  if (!list) return;
  list.innerHTML = '';
  if (!ownerReviewsCache.length) {
    list.innerHTML = '<div class="empty-state">Todavía no hay reseñas publicadas. Cuando una clienta comparta su experiencia, aparecerá aquí. 💕</div>';
    return;
  }
  ownerReviewsCache.forEach(review => {
    const item = document.createElement('article');
    item.className = 'admin-item review-owner-item';
    const date = review.created_at ? String(review.created_at).slice(0,10) : '';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(review.client_name || 'Clienta')}</strong><p class="review-stars">${reviewStars(review.stars)} <span>${Number(review.stars)}/5</span></p><p>${escapeHtml(review.comment || '')}</p><small>${escapeHtml(review.email || '')}${review.phone ? ` · ${escapeHtml(review.phone)}` : ''}${date ? ` · ${escapeHtml(formatDate(date))}` : ''}</small></div><button type="button" class="small-button cancel" data-owner-review-delete="${review.id}">Eliminar</button>`;
    list.appendChild(item);
  });
  list.querySelectorAll('[data-owner-review-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta reseña?')) return;
    try { await apiFetch(`/owner/reviews/${button.dataset.ownerReviewDelete}`, {method:'DELETE'}); await loadOwnerReviews(); }
    catch (error) { alert(error.message); }
  }));
}

async function loadNotificationTargets() {
  try {
    const data = await apiFetch('/owner/notification-targets');
    notificationTargetsCache = { users: Array.isArray(data.users) ? data.users : [], appointments: Array.isArray(data.appointments) ? data.appointments : [] };
    const select = $d('notifyClientSelect');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Selecciona una clienta</option>';
    notificationTargetsCache.users.forEach(user => {
      const option = document.createElement('option');
      option.value = user.id;
      option.textContent = `${user.name} · ${pushHealthLabel(user)}`;
      select.appendChild(option);
    });
    if (current && notificationTargetsCache.users.some(user => String(user.id) === String(current))) select.value = current;
    updateNotifyAppointmentOptions();
  } catch (error) {
    if ($d('notifyMessageStatus')) setMessage($d('notifyMessageStatus'), error.message);
  }
}

function updateNotifyAppointmentOptions() {
  const clientSelect = $d('notifyClientSelect');
  const apptSelect = $d('notifyAppointmentSelect');
  const meta = $d('notifyClientMeta');
  if (!clientSelect || !apptSelect) return;
  const userId = Number(clientSelect.value || 0);
  apptSelect.innerHTML = '<option value="">Sin cita específica</option>';
  const user = notificationTargetsCache.users.find(item => Number(item.id) === userId);
  if (meta) {
    meta.innerHTML = user
      ? `<strong>${escapeHtml(user.name)}</strong> · ${escapeHtml(user.phone || 'Sin teléfono registrado')} · ${escapeHtml(pushHealthLabel(user))}${user.phone ? ` · <a href="https://wa.me/${whatsAppNumber(user.phone)}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : ''} ${Number(user.devices || 0) ? `<button type="button" class="small-button ghost" data-test-client-push="${user.id}">Probar aviso</button>` : ''}`
      : 'Selecciona una clienta para ver sus datos de contacto.';
  }
  if (!userId) return;
  notificationTargetsCache.appointments.filter(appt => Number(appt.user_id) === userId && ['pending','accepted'].includes(appt.status)).forEach(appt => {
    const option = document.createElement('option');
    option.value = appt.id;
    option.textContent = `${formatDate(appt.date)} · ${safeFormatTime12(appt.time)} · ${appt.service} · ${statusLabel(appt.status)}`;
    option.dataset.date = appt.date;
    option.dataset.time = appt.time;
    option.dataset.service = appt.service;
    apptSelect.appendChild(option);
  });
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-test-client-push]');
  if (!button) return;
  button.disabled = true;
  try {
    const data = await apiFetch(`/owner/notifications/test-client/${button.dataset.testClientPush}`, {method:'POST'});
    alert(data.message);
    await loadNotificationTargets();
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
});

function fillReminderMessage() {
  const userId = Number($d('notifyClientSelect')?.value || 0);
  const apptId = Number($d('notifyAppointmentSelect')?.value || 0);
  const user = notificationTargetsCache.users.find(item => Number(item.id) === userId);
  const appt = notificationTargetsCache.appointments.find(item => Number(item.id) === apptId);
  const box = $d('notifyMessage');
  if (!box) return;
  if (!user) { box.value = ''; return; }
  if (!appt) {
    const next = notificationTargetsCache.appointments.filter(item => Number(item.user_id) === userId && item.status === 'accepted')[0];
    if (next) {
      if ($d('notifyAppointmentSelect')) $d('notifyAppointmentSelect').value = String(next.id);
      box.value = `Hola ${firstNameForNotify(user.name)} 💕, te escribo para recordarte tu próxima cita en Suldery Nails. Nos vemos con mucho cariño. 💅✨`;
    } else {
      box.value = `Hola ${firstNameForNotify(user.name)} 💕, quería dejarte este recordatorio de parte de Suldery Nails. 💕`;
    }
    return;
  }
  box.value = `Hola ${firstNameForNotify(user.name)} 💕, te recuerdo con mucho cariño tu cita de ${appt.service} para el ${formatDate(appt.date)} a las ${safeFormatTime12(appt.time)}. ¡Te esperamos! 💅✨`;
}

function fillHelloMessage() {
  const userId = Number($d('notifyClientSelect')?.value || 0);
  const user = notificationTargetsCache.users.find(item => Number(item.id) === userId);
  if (!$d('notifyMessage')) return;
  $d('notifyMessage').value = user ? `Hola ${firstNameForNotify(user.name)} 💕, un saludito de parte de Suldery Nails. Esperamos verte pronto. ✨` : '';
}

function firstNameForNotify(name) { return String(name || 'clienta').trim().split(/\s+/)[0] || 'clienta'; }
function whatsAppNumber(phone) { const digits = String(phone || '').replace(/\D/g,''); return digits.startsWith('57') ? digits : `57${digits.replace(/^0+/, '')}`; }

async function sendOwnerNotification() {
  const userId = Number($d('notifyClientSelect')?.value || 0);
  const appointmentId = Number($d('notifyAppointmentSelect')?.value || 0);
  const messageEl = $d('notifyMessageStatus');
  const button = $d('sendNotifyButton');
  const message = String($d('notifyMessage')?.value || '').trim();
  if (!userId) return setMessage(messageEl, 'Selecciona primero una clienta.');
  if (!message) return setMessage(messageEl, 'Escribe el mensaje que quieres enviar.');
  button.disabled = true;
  setMessage(messageEl, 'Enviando aviso…');
  try {
    const data = await apiFetch('/owner/notifications/send', { method:'POST', body:JSON.stringify({user_id:userId, appointment_id:appointmentId || undefined, message}) });
    setMessage(messageEl, data.message, true);
  } catch (error) { setMessage(messageEl, error.message); }
  finally { button.disabled = false; }
}

function renderActiveClients() {
  const list = $d('activeClientsList');
  if (!list) return;
  const clients = ownerUsersCache.filter(user => user.role === 'client' && user.status === 'accepted');
  list.innerHTML = '';
  if (!clients.length) { list.innerHTML = '<div class="empty-state">Todavía no hay clientas activas.</div>'; return; }
  clients.forEach(user => {
    const item = document.createElement('article');
    item.className = 'admin-item';
    const pushLabel = Number(user.devices || 0) ? ((user.last_error_at && (!user.last_success_at || new Date(user.last_error_at) > new Date(user.last_success_at))) ? 'Avisos: revisar' : 'Avisos: activos') : 'Avisos: no activados';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(user.name)}</strong><p>${escapeHtml(user.email)}${user.phone ? ` · ${escapeHtml(user.phone)}` : ''}</p><small>Activa desde ${escapeHtml(formatDate(String(user.created_at).slice(0,10)))} · ${pushLabel}</small></div><span class="status accepted">Activa</span>`;
    list.appendChild(item);
  });
}

function renderScheduledAppointments() {
  const list = $d('scheduledAppointmentsList');
  if (!list) return;
  const today = localISODate(new Date());
  const appointments = ownerAppointmentsCache
    .filter(appt => appt.status === 'accepted' && String(appt.appointment_date).slice(0,10) >= today)
    .sort((a,b) => `${a.appointment_date}T${a.appointment_time}`.localeCompare(`${b.appointment_date}T${b.appointment_time}`));
  list.innerHTML = '';
  if (!appointments.length) { list.innerHTML = '<div class="empty-state">No hay citas confirmadas de hoy en adelante.</div>'; return; }
  appointments.forEach(appt => {
    const item = document.createElement('article');
    item.className = 'admin-item';
    const source = appt.user_id ? 'Clienta registrada' : 'Cita agendada manualmente';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${safeFormatTime12(appt.appointment_time)} · ${DURATION_LABELS[appt.service] || `${Number(appt.duration_minutes)||60} min`}</p><small>${escapeHtml(source)}${appt.client_email ? ` · ${escapeHtml(appt.client_email)}` : ''}${appt.client_phone ? ` · Tel: ${escapeHtml(appt.client_phone)}` : ''}</small></div><span class="status accepted">Confirmada</span>`;
    list.appendChild(item);
  });
}

async function loadPendingUsers() {
  const data = await apiFetch('/owner/users');
  ownerUsersCache = Array.isArray(data.users) ? data.users : [];
  const list = $d('pendingUsersList');
  const pending = ownerUsersCache.filter(user => user.status === 'pending');
  $d('activeClientCount').textContent = ownerUsersCache.filter(user => user.role === 'client' && user.status === 'accepted').length;
  if ($d('recoveryCount')) $d('recoveryCount').textContent = ownerRecoveryRequestsCache.filter(request => request.status === 'pending').length;
  list.innerHTML = '';
  if (!pending.length) { list.innerHTML = '<div class="empty-state">No hay cuentas esperando aprobación. Las clientas aceptadas aparecen en “Clientas activas”.</div>'; return; }
  pending.forEach(user => {
    const item = document.createElement('article'); item.className = 'admin-item';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(user.name)}</strong><p>${escapeHtml(user.email)}${user.phone ? ` · Tel: ${escapeHtml(user.phone)}` : ''}</p><small>Solicitud recibida ${formatDate(String(user.created_at).slice(0,10))}</small></div><span class="status pending">Pendiente</span>`;
    const actions = document.createElement('div'); actions.className = 'admin-actions';
    actions.append(actionButton('Aceptar', 'small-button', () => setUserStatus(user.id, 'accepted')));
    actions.append(actionButton('Rechazar', 'small-button cancel', () => setUserStatus(user.id, 'rejected')));
    item.appendChild(actions); list.appendChild(item);
  });
}

async function setUserStatus(id, status) {
  try { await apiFetch(`/owner/users/${id}/status`, {method:'PATCH',body:JSON.stringify({status})}); await loadPendingUsers(); }
  catch (error) { alert(error.message); }
  renderOwnerStatsDetails();
}

async function loadPasswordRecoveryRequests() {
  const list = $d('passwordRecoveryRequestsList');
  if (!list) return;
  try {
    const data = await apiFetch('/owner/password-recovery-requests');
    ownerRecoveryRequestsCache = Array.isArray(data.requests) ? data.requests : [];
    if ($d('recoveryCount')) $d('recoveryCount').textContent = ownerRecoveryRequestsCache.filter(request => request.status === 'pending').length;
    list.innerHTML = '';
    if (!ownerRecoveryRequestsCache.length) {
      list.innerHTML = '<div class="empty-state">No hay solicitudes de recuperación pendientes. ✨</div>';
      return;
    }
    ownerRecoveryRequestsCache.forEach(request => {
      const item = document.createElement('article');
      item.className = 'admin-item recovery-request-item';
      const phone = request.phone || request.account_phone || 'sin teléfono';
      const created = String(request.created_at || '').slice(0, 16).replace('T', ' ');
      item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(request.name || 'Clienta')}</strong><p>${escapeHtml(request.email || 'Sin correo')}</p><small>📱 ${escapeHtml(phone)}${created ? ` · Solicitud: ${escapeHtml(created)}` : ''}</small></div>`;
      const actions = document.createElement('div');
      actions.className = 'admin-actions';
      actions.append(actionButton('Restablecer contraseña', 'small-button', () => resetClientPassword(request)));
      actions.append(actionButton('Marcar atendida', 'small-button ghost', () => setRecoveryRequestStatus(request.id, 'resolved')));
      actions.append(actionButton('Rechazar', 'small-button cancel', () => setRecoveryRequestStatus(request.id, 'rejected')));
      item.appendChild(actions);
      list.appendChild(item);
    });
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function resetClientPassword(request) {
  const email = request?.email || 'esta clienta';
  const first = window.prompt(`Nueva contraseña para ${email}.

Por seguridad, la contraseña anterior no se puede mostrar. La nueva debe tener al menos 6 caracteres.`);
  if (first === null) return;
  if (first.length < 6) { alert('La nueva contraseña debe tener al menos 6 caracteres.'); return; }
  const second = window.prompt('Repite la nueva contraseña:');
  if (second === null) return;
  if (first !== second) { alert('Las contraseñas no coinciden.'); return; }
  try {
    await apiFetch(`/owner/password-recovery-requests/${request.id}/reset`, { method:'PATCH', body:JSON.stringify({ password:first }) });
    alert('Contraseña restablecida y solicitud atendida. 💕');
    await loadPasswordRecoveryRequests();
  } catch (error) { alert(error.message); }
}

async function setRecoveryRequestStatus(id, status) {
  try {
    await apiFetch(`/owner/password-recovery-requests/${id}/status`, {method:'PATCH', body:JSON.stringify({status})});
    await loadPasswordRecoveryRequests();
  } catch (error) {
    alert(error.message);
  }
}

async function loadOwnerAppointments() {
  const data = await apiFetch('/owner/appointments');
  ownerAppointmentsCache = Array.isArray(data.appointments) ? data.appointments : [];
  const list = $d('ownerAppointmentsList');
  const pending = ownerAppointmentsCache.filter(appt => appt.status === 'pending');
  list.innerHTML = '';
  if (!pending.length) { list.innerHTML = '<div class="empty-state">No hay solicitudes de citas pendientes. Las confirmadas permanecen en tu calendario.</div>'; return; }
  pending.forEach(appt => {
    const item = document.createElement('article'); item.className = 'admin-item';
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${safeFormatTime12(appt.appointment_time)}</p><small>${escapeHtml(appt.client_email || 'Cita manual')}${appt.client_phone ? ` · Tel: ${escapeHtml(appt.client_phone)}` : ''}</small></div><span class="status pending">Pendiente</span>`;
    const actions = document.createElement('div'); actions.className = 'admin-actions';
    actions.append(actionButton('Confirmar', 'small-button', () => setApptStatus(appt.id, 'accepted')));
    actions.append(actionButton('Rechazar', 'small-button cancel', () => setApptStatus(appt.id, 'rejected')));
    item.appendChild(actions); list.appendChild(item);
  });
  renderOwnerStatsDetails();
}

async function setApptStatus(id, status) {
  try {
    await apiFetch(`/owner/appointments/${id}/status`, {method:'PATCH',body:JSON.stringify({status})});
    await loadOwnerAppointments();
    renderOwnerStatsDetails();
    if (ownerCalendarSelectedDate) await loadOwnerCalendarDay(ownerCalendarSelectedDate);
  } catch (error) { alert(error.message); }
}


function ownerCalendarMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}`;
}

function ownerCalendarDateLabel(value) {
  return formatDate(value);
}

function ownerCalendarStatusText(meta) {
  if (!meta) return 'Sin información';
  if (meta.status === 'blocked') return 'Bloqueado';
  if (meta.status === 'rest') return 'Descanso';
  if (meta.status === 'pending') return meta.label || 'Pendiente';
  if (meta.status === 'appointments') return meta.label || 'Citas';
  return 'Libre';
}

async function loadOwnerCalendar() {
  const month = ownerCalendarMonthKey(ownerCalendarMonth);
  const label = $d('ownerCalendarMonthLabel');
  if (label) label.textContent = ownerCalendarMonth.toLocaleDateString('es-CO', {month:'long', year:'numeric'});
  try {
    const data = await apiFetch(`/owner/calendar?month=${encodeURIComponent(month)}`);
    ownerCalendarData = new Map((data.days || []).map(day => [day.date, day]));
    renderOwnerCalendar();
    if (ownerCalendarSelectedDate && ownerCalendarSelectedDate.startsWith(month)) {
      await loadOwnerCalendarDay(ownerCalendarSelectedDate);
    } else {
      const today = localISODate(new Date());
      const defaultDate = ownerCalendarData.has(today) ? today : (data.days?.find(day => ['available','appointments','pending'].includes(day.status))?.date || data.days?.[0]?.date);
      if (defaultDate) await loadOwnerCalendarDay(defaultDate);
    }
  } catch (error) {
    const feedback = $d('ownerCalendarFeedback');
    if (feedback) feedback.textContent = error.message;
  }
}

function renderOwnerCalendar() {
  const grid = $d('ownerCalendarDays');
  if (!grid) return;
  const year = ownerCalendarMonth.getFullYear();
  const month = ownerCalendarMonth.getMonth();
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  grid.innerHTML = '';
  for (let i = 0; i < first; i++) {
    const empty = document.createElement('span');
    empty.className = 'calendar-empty';
    grid.appendChild(empty);
  }
  const today = localISODate(new Date());
  for (let day = 1; day <= total; day++) {
    const date = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const meta = ownerCalendarData.get(date) || {status:'available', label:'Libre'};
    const localDate = new Date(year, month, day);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calendar-day owner-calendar-day ${meta.status}`;
    if (date === ownerCalendarSelectedDate) button.classList.add('selected');
    if (date === today) button.classList.add('today');
    button.innerHTML = `<strong>${day}</strong><span class="calendar-weekday">${localDate.toLocaleDateString('es-CO',{weekday:'short'}).replace('.','')}</span><small>${escapeHtml(ownerCalendarStatusText(meta))}</small>`;
    button.addEventListener('click', () => loadOwnerCalendarDay(date));
    grid.appendChild(button);
  }
}

function changeOwnerCalendarMonth(offset) {
  ownerCalendarMonth = new Date(ownerCalendarMonth.getFullYear(), ownerCalendarMonth.getMonth() + offset, 1);
  ownerCalendarSelectedDate = '';
  loadOwnerCalendar();
}

function goToOwnerCalendarToday() {
  const now = new Date();
  ownerCalendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  ownerCalendarSelectedDate = localISODate(now);
  loadOwnerCalendar();
}

async function loadOwnerCalendarDay(date) {
  ownerCalendarSelectedDate = date;
  renderOwnerCalendar();
  const service = $d('ownerCalendarService')?.value || 'Manicure semipermanente';
  try {
    const data = await apiFetch(`/owner/calendar/day?date=${encodeURIComponent(date)}&service=${encodeURIComponent(service)}`);
    const title = $d('ownerCalendarDayTitle');
    if (title) title.textContent = ownerCalendarDateLabel(data.date);
    const feedback = $d('ownerCalendarFeedback');
    if (feedback) feedback.textContent = data.blocked ? `Día bloqueado${data.blocked.reason ? `: ${data.blocked.reason}` : ''}.` : data.is_past ? 'Estás consultando una fecha pasada. Las citas quedan visibles para tu historial.' : 'Aquí puedes ver tus citas y los espacios que todavía están libres.';
    renderOwnerCalendarSchedule(data.schedule || [], Boolean(data.blocked), Boolean(data.is_past));
    renderOwnerCalendarAppointments(data.appointments || []);
    renderOwnerCalendarFreeSlots(data.free_slots || [], service, Boolean(data.blocked), Boolean(data.is_past));
  } catch (error) {
    const feedback = $d('ownerCalendarFeedback');
    if (feedback) feedback.textContent = error.message;
    $d('ownerCalendarAppointments').innerHTML = '';
    $d('ownerCalendarFreeSlots').innerHTML = '';
  }
}

function renderOwnerCalendarSchedule(intervals, blocked, isPast) {
  const box = $d('ownerCalendarSchedule');
  if (!box) return;
  if (blocked) { box.innerHTML = '<span class="empty-state">Día bloqueado completo.</span>'; return; }
  if (!intervals.length) { box.innerHTML = '<span class="empty-state">No hay atención programada ese día.</span>'; return; }
  const note = isPast ? '<span class="owner-calendar-note">Historial · </span>' : '';
  box.innerHTML = `${note}${intervals.map(i => `<span class="owner-calendar-chip">${escapeHtml(safeFormatTime12(i.start_time))} – ${escapeHtml(safeFormatTime12(i.end_time))}</span>`).join('')}`;
}

function renderOwnerCalendarAppointments(appointments) {
  const list = $d('ownerCalendarAppointments');
  if (!list) return;
  list.innerHTML = '';
  if (!appointments.length) {
    list.innerHTML = '<div class="empty-state">No hay citas agendadas para este día.</div>';
    return;
  }
  appointments.forEach(appt => {
    const item = document.createElement('article');
    item.className = 'admin-item owner-calendar-appointment';
    const status = statusLabel(appt.status);
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(safeFormatTime12(appt.appointment_time))} · ${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${DURATION_LABELS[appt.service] || `${Number(appt.duration_minutes)||60} min`}</p><small>${escapeHtml(appt.client_email || 'Cita agendada manualmente')}${appt.client_phone ? ` · Tel: ${escapeHtml(appt.client_phone)}` : ''}</small></div><span class="status ${appt.status}">${status}</span>`;
    if (['pending','accepted'].includes(appt.status)) {
      const actions = document.createElement('div'); actions.className = 'admin-actions';
      if (appt.status === 'pending') {
        actions.append(actionButton('Confirmar', 'small-button', () => setApptStatus(appt.id, 'accepted')));
        actions.append(actionButton('Rechazar', 'small-button cancel', () => setApptStatus(appt.id, 'rejected')));
      } else {
        actions.append(actionButton('Cancelar cita', 'small-button cancel', () => setApptStatus(appt.id, 'cancelled')));
      }
      item.appendChild(actions);
    }
    list.appendChild(item);
  });
}

function renderOwnerCalendarFreeSlots(slots, service, blocked, isPast) {
  const box = $d('ownerCalendarFreeSlots');
  if (!box) return;
  box.innerHTML = '';
  if (blocked) { box.innerHTML = '<div class="empty-state">No hay espacios porque el día está bloqueado.</div>'; return; }
  if (isPast) { box.innerHTML = '<div class="empty-state">Los espacios libres no se calculan para fechas pasadas.</div>'; return; }
  if (!slots.length) { box.innerHTML = '<div class="empty-state">No quedan espacios para este servicio.</div>'; return; }
  const intro = document.createElement('p'); intro.className = 'owner-calendar-note'; intro.textContent = `Espacios libres para ${service}:`;
  box.appendChild(intro);
  const wrap = document.createElement('div'); wrap.className = 'owner-calendar-free-grid';
  slots.forEach(time => { const chip = document.createElement('span'); chip.className = 'owner-calendar-free-chip'; chip.textContent = safeFormatTime12(time); wrap.appendChild(chip); });
  box.appendChild(wrap);
}

function handleOwnerCalendarAppointmentAction(event) {
  const button = event.target.closest('[data-owner-calendar-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  if (!id) return;
  const action = button.dataset.ownerCalendarAction;
  if (action === 'accept') setApptStatus(id, 'accepted');
  if (action === 'reject') setApptStatus(id, 'rejected');
}

async function loadOwnerSlots() {
  const date = $d('ownerAppointmentDate').value;
  const select = $d('ownerAppointmentTime');
  select.innerHTML = '<option value="">Cargando…</option>';
  if (!date) return;
  try {
    const service = encodeURIComponent($d('ownerService').value);
    const data = await apiFetch(`/owner/slots?date=${encodeURIComponent(date)}&service=${service}`);
    select.innerHTML = '';
    if (!data.slots.length) { select.innerHTML = '<option value="">No hay horarios disponibles</option>'; return; }
    data.slots.forEach(time => { const option = document.createElement('option'); option.value = time; option.textContent = safeFormatTime12(time); select.appendChild(option); });
  } catch (error) { select.innerHTML = `<option value="">${escapeHtml(error.message)}</option>`; }
}

function updateOwnerServiceDurationHint() { $d('ownerServiceDurationHint').textContent = `Duración: ${DURATION_LABELS[$d('ownerService').value] || '—'}`; }

async function submitManualBooking(event) {
  event.preventDefault();
  const message = $d('ownerBookingMessage'); const button = $d('ownerBookingButton');
  const body = { clientName:$d('ownerClientName').value.trim(), clientPhone:$d('ownerClientPhone')?.value.trim() || '', service:$d('ownerService').value, date:$d('ownerAppointmentDate').value, time:$d('ownerAppointmentTime').value };
  if (!body.clientName || !body.date || !body.time) { setMessage(message,'Completa nombre, fecha y hora.'); return; }
  button.disabled = true; setMessage(message,'Guardando cita…');
  try { const data = await apiFetch('/owner/appointments',{method:'POST',body:JSON.stringify(body)}); setMessage(message,data.message,true); $d('ownerClientName').value=''; await Promise.all([loadOwnerSlots(),loadOwnerAppointments()]); renderOwnerStatsDetails(); }
  catch(error){ setMessage(message,error.message); }
  finally{ button.disabled=false; }
}

async function loadScheduleEditor() {
  try {
    const data = await apiFetch('/owner/schedule-editor');
    buildWeeklyEditor(data.weekly);
    renderScheduleOverrides(data.overrides || []);
  } catch (error) { setMessage($d('weeklyScheduleMessage'), error.message); }
}

async function saveWeeklySchedule() {
  const button = $d('saveWeeklyScheduleButton'); const message = $d('weeklyScheduleMessage');
  const weekly = collectScheduleForm();
  button.disabled = true; setMessage(message,'Guardando…');
  try { const data = await apiFetch('/owner/schedule-editor',{method:'PUT',body:JSON.stringify({weekly})}); setMessage(message,data.message,true); await loadScheduleEditor(); await loadOwnerSlots(); }
  catch(error){ setMessage(message,error.message); }
  finally{ button.disabled=false; }
}

async function saveScheduleOverride(event) {
  event.preventDefault();
  const date = $d('scheduleOverrideDate').value; const isOpen = $d('scheduleOverrideOpen').value === 'yes';
  try {
    await apiFetch('/owner/schedule-overrides',{method:'POST',body:JSON.stringify({date,is_open:isOpen,intervals:isOpen?collectOverrideIntervals():[],note:$d('scheduleOverrideNote').value.trim()})});
    $d('scheduleOverrideForm').reset(); $d('scheduleOverrideDate').min = localISODate(new Date());
    buildOverrideIntervals(); await loadScheduleEditor(); await loadOwnerSlots();
  } catch(error){ alert(error.message); }
}

function renderScheduleOverrides(overrides) {
  const list = $d('scheduleOverridesList'); list.innerHTML = '';
  if (!overrides.length) { list.innerHTML = '<div class="empty-state">No hay cambios especiales guardados.</div>'; return; }
  overrides.forEach(item => {
    const article = document.createElement('article'); article.className='override-item';
    const intervals = item.is_open ? item.intervals.map(i => `${safeFormatTime12(i.start_time)}–${safeFormatTime12(i.end_time)}`).join(' · ') : 'Descanso todo el día';
    article.innerHTML = `<div><strong>${escapeHtml(formatDate(item.date))}</strong><span>${escapeHtml(intervals)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</span></div><button type="button" class="small-button cancel" data-override-date="${item.date}">Quitar</button>`;
    list.appendChild(article);
  });
}

async function handleOverrideAction(event) {
  const button = event.target.closest('[data-override-date]'); if (!button) return;
  if (!confirm('¿Quitar este horario especial? La fecha volverá al horario semanal.')) return;
  try { await apiFetch(`/owner/schedule-overrides/${button.dataset.overrideDate}`,{method:'DELETE'}); await loadScheduleEditor(); await loadOwnerSlots(); }
  catch(error){ alert(error.message); }
}

function buildBlockedIntervalsEditor() {
  const container = $d('blockedIntervalsEditor');
  if (!container) return;
  container.innerHTML = '';
  addBlockedIntervalRow(container, { start_time: '09:00', end_time: '10:30' });
}

function addBlockedIntervalRow(container, values = { start_time: '09:00', end_time: '10:30' }) {
  const row = document.createElement('div');
  row.className = 'interval-row blocked-interval-row';
  row.innerHTML = `
    <div class="interval-selects">
      <label>Desde${timeSelectHTML(values.start_time)}</label>
      <span>—</span>
      <label>Hasta${timeSelectHTML(values.end_time, true)}</label>
    </div>
    <button type="button" class="small-button ghost blocked-interval-remove">Quitar</button>`;
  row.querySelector('.blocked-interval-remove').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function handleBlockedIntervalEditorClick() {}

function toggleBlockedMode() {
  const mode = $d('blockedMode')?.value || 'full';
  const editor = $d('blockedIntervalsEditor');
  const submit = $d('blockedSubmitButton');
  if (!editor || !submit) return;
  editor.classList.toggle('hidden-tool-panel', mode !== 'hours');
  submit.textContent = mode === 'hours' ? 'Bloquear horas' : 'Bloquear día';
}

function collectBlockedIntervals() {
  return [...document.querySelectorAll('#blockedIntervalsEditor .blocked-interval-row')].map(row => ({
    start_time: row.querySelectorAll('[data-time]')[0].value,
    end_time: row.querySelectorAll('[data-time]')[1].value
  }));
}

async function loadBlockedDates() {
  const data = await apiFetch('/owner/blocked-dates');
  const list = $d('blockedDatesList');
  list.innerHTML = '';
  $d('blockedDate').min = localISODate(new Date());

  const fullDates = Array.isArray(data.dates) ? data.dates : [];
  const hours = Array.isArray(data.hours) ? data.hours : [];

  if (!fullDates.length && !hours.length) {
    list.innerHTML = '<div class="empty-state">No tienes días ni horas bloqueadas.</div>';
    return;
  }

  fullDates.forEach(item => {
    const article = document.createElement('article');
    article.className = 'blocked-date-item';
    article.innerHTML = `<div><strong>${escapeHtml(formatDate(item.date))}</strong><span>Día completo${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</span></div><button type="button" class="small-button cancel" data-blocked-id="${item.id}">Desbloquear</button>`;
    list.appendChild(article);
  });

  hours.forEach(item => {
    const article = document.createElement('article');
    article.className = 'blocked-date-item';
    article.innerHTML = `<div><strong>${escapeHtml(formatDate(item.date))}</strong><span>Bloqueado: ${safeFormatTime12(item.start_time)} – ${safeFormatTime12(item.end_time)}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</span></div><button type="button" class="small-button cancel" data-blocked-hour-id="${item.id}">Quitar</button>`;
    list.appendChild(article);
  });
}

async function bloquearFecha(event) {
  event.preventDefault();
  const date = $d('blockedDate').value;
  const reason = $d('blockedReason').value.trim();
  const mode = $d('blockedMode')?.value || 'full';
  if (!date) return;

  const body = {
    date,
    reason,
    mode,
    intervals: mode === 'hours' ? collectBlockedIntervals() : []
  };

  try {
    await apiFetch('/owner/blocked-dates', { method: 'POST', body: JSON.stringify(body) });
    $d('blockedDateForm').reset();
    $d('blockedDate').min = localISODate(new Date());
    buildBlockedIntervalsEditor();
    toggleBlockedMode();
    await loadBlockedDates();
    await loadOwnerSlots();
  } catch (error) {
    alert(error.message);
  }
}

async function handleBlockedDateAction(event) {
  const dayButton = event.target.closest('[data-blocked-id]');
  const hourButton = event.target.closest('[data-blocked-hour-id]');

  if (dayButton) {
    if (!confirm('¿Desbloquear todo ese día?')) return;
    try {
      await apiFetch(`/owner/blocked-dates/${dayButton.dataset.blockedId}`, { method: 'DELETE' });
      await loadBlockedDates();
      await loadOwnerSlots();
      await loadScheduleEditor();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  if (hourButton) {
    if (!confirm('¿Quitar este bloqueo de horas?')) return;
    try {
      await apiFetch(`/owner/blocked-hours/${hourButton.dataset.blockedHourId}`, { method: 'DELETE' });
      await loadBlockedDates();
      await loadOwnerSlots();
      await loadScheduleEditor();
    } catch (error) {
      alert(error.message);
    }
  }
}

async function loadOwnerGallery() {
  const data = await apiFetch('/owner/portfolio');
  ownerPhotosCache = Array.isArray(data.photos) ? data.photos : [];
  if ($d('photoCount')) $d('photoCount').textContent = ownerPhotosCache.length;
  const loginPhotos = ownerPhotosCache.filter(photo => photo.visibility === 'login' || photo.visibility === 'both');
  const clientPhotos = ownerPhotosCache.filter(photo => photo.visibility === 'client' || photo.visibility === 'both');
  if ($d('loginPhotoCount')) $d('loginPhotoCount').textContent = loginPhotos.length;
  if ($d('clientPhotoCount')) $d('clientPhotoCount').textContent = clientPhotos.length;
  renderOwnerPhotoGroup($d('ownerLoginGallery'), loginPhotos, 'login');
  renderOwnerPhotoGroup($d('ownerClientGallery'), clientPhotos, 'client');
  renderOwnerPhotoGroup($d('ownerClientOnlyGallery'), clientPhotos, 'client');
  if ($d('clientPhotoCountOnly')) $d('clientPhotoCountOnly').textContent = clientPhotos.length;
}

function renderOwnerPhotoGroup(container, photos, visibility) {
  if (!container) return;
  container.innerHTML = '';
  if (!photos.length) {
    container.innerHTML = `<div class="empty-state">Todavía no hay fotos en ${visibility === 'login' ? 'inicio de sesión' : 'la página de clienta'}.</div>`;
    return;
  }
  photos.forEach((photo, index) => {
    const figure = document.createElement('figure');
    figure.className = 'portfolio-photo owner-photo';
    figure.innerHTML = `
      <div class="owner-photo-number">${index + 1}</div>
      <img src="${escapeAttribute(photo.image_url)}" alt="${escapeAttribute(photo.title || 'Diseño de Suldery Nails')}" loading="lazy" decoding="async">
      <figcaption>${escapeHtml(photo.title || 'Diseño Suldery Nails')}</figcaption>
      <div class="photo-actions photo-actions-vertical">
        <div class="photo-order-actions">
          <button type="button" class="small-button ghost" data-photo-action="move-up" data-id="${photo.id}" ${index === 0 ? 'disabled' : ''}>↑ Subir</button>
          <button type="button" class="small-button ghost" data-photo-action="move-down" data-id="${photo.id}" ${index === photos.length - 1 ? 'disabled' : ''}>↓ Bajar</button>
        </div>
        <button type="button" class="small-button ghost" data-photo-action="replace" data-id="${photo.id}">Actualizar foto</button>
        <button type="button" class="remove-photo" data-photo-action="delete" data-id="${photo.id}">Eliminar foto</button>
      </div>`;
    container.appendChild(figure);
  });
}

async function handlePhotoVisibilityChange(event) {
  const select = event.target.closest('[data-photo-visibility]');
  if (!select) return;
  try {
    await apiFetch(`/owner/portfolio/${select.dataset.photoVisibility}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility: select.value })
    });
  } catch (error) {
    alert(error.message);
    await loadOwnerGallery();
  }
}

function handleGalleryAction(event) {
  const button = event.target.closest('[data-photo-action]');
  if (!button || button.disabled) return;
  const id = Number(button.dataset.id);
  if (button.dataset.photoAction === 'delete') eliminarFoto(id);
  if (button.dataset.photoAction === 'replace') prepararReemplazoFoto(id);
  if (button.dataset.photoAction === 'set-visibility') setPhotoVisibility(id, button.dataset.visibility);
  if (button.dataset.photoAction === 'move-up') moverFoto(id, 'up');
  if (button.dataset.photoAction === 'move-down') moverFoto(id, 'down');
}

async function setPhotoVisibility(id, visibility) {
  if (!['login', 'client'].includes(visibility)) return;
  try {
    await apiFetch(`/owner/portfolio/${id}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility }) });
    await loadOwnerGallery();
  } catch (error) {
    alert(error.message);
  }
}

function seleccionarFoto(event, visibility) {
  const file = event.target.files?.[0] || null;
  pendingPhotoFiles[visibility] = file;
  const status = $d(visibility === 'login' ? 'loginPhotoSelection' : 'clientPhotoSelection');
  const button = $d(visibility === 'login' ? 'saveLoginPhotoButton' : 'saveClientPhotoButton');
  if (status) status.textContent = file ? `Lista para guardar: ${file.name}` : 'No hay una foto pendiente.';
  if (button) button.disabled = !file;
}

async function guardarFotoSeleccionada(visibility) {
  const file = pendingPhotoFiles[visibility];
  if (!file) return;
  const messageEl = $d(visibility === 'login' ? 'photoManagerMessage' : 'clientPhotoManagerMessage');
  const button = $d(visibility === 'login' ? 'saveLoginPhotoButton' : 'saveClientPhotoButton');
  const status = $d(visibility === 'login' ? 'loginPhotoSelection' : 'clientPhotoSelection');
  try {
    button.disabled = true;
    setMessage(messageEl, 'Guardando la foto…');
    const form = new FormData();
    form.append('photo', file);
    form.append('title', 'Diseño Suldery Nails');
    form.append('visibility', visibility);
    await apiFetch('/owner/portfolio', { method: 'POST', body: form });
    pendingPhotoFiles[visibility] = null;
    if (status) status.textContent = 'Foto guardada. Puedes elegir otra.';
    setMessage(messageEl, 'La foto quedó guardada correctamente. ✨', true);
    if (visibility === 'login') $d('photoPickerLogin').value = '';
    if (visibility === 'client') $d('photoPickerClientOnly').value = '';
    await loadOwnerGallery();
  } catch (error) {
    setMessage(messageEl, error.message);
  } finally {
    if (!pendingPhotoFiles[visibility] && button) button.disabled = true;
  }
}

function prepararReemplazoFoto(id){const input=$d('photoReplacePicker');if(!input)return;input.dataset.photoId=String(id);input.value='';input.click();}

async function reemplazarFoto(event){const file=event.target.files[0];const id=Number(event.target.dataset.photoId);if(!file||!id)return;const form=new FormData();form.append('photo',file);try{await apiFetch(`/owner/portfolio/${id}/image`,{method:'PATCH',body:form});await loadOwnerGallery();}catch(error){alert(error.message);}finally{event.target.value='';delete event.target.dataset.photoId;}}
async function eliminarFoto(id){if(!confirm('¿Eliminar esta foto?'))return;try{await apiFetch(`/owner/portfolio/${id}`,{method:'DELETE'});await loadOwnerGallery();}catch(error){alert(error.message);}}
async function moverFoto(id,direction){try{await apiFetch(`/owner/portfolio/${id}/move`,{method:'PATCH',body:JSON.stringify({direction})});await loadOwnerGallery();}catch(error){alert(error.message);}}
function actionButton(text,cls,handler){const button=document.createElement('button');button.type='button';button.className=cls;button.textContent=text;button.addEventListener('click',handler);return button;}
function statusLabel(status){return status==='accepted'?'Confirmada':status==='pending'?'Pendiente':status==='cancelled'?'Cancelada':status==='rejected'?'Rechazada':status;}
function escapeHtml(text){return String(text??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escapeAttribute(text){return escapeHtml(text);}



async function loadOwnerCatalog() {
  try {
    const data = await apiFetch('/owner/catalog');
    ownerCatalogCache = Array.isArray(data.photos) ? data.photos : [];
    if (ownerCatalogIndex >= ownerCatalogCache.length) ownerCatalogIndex = Math.max(0, ownerCatalogCache.length - 1);
    renderCatalogOwnerViewer();
  } catch (error) {
    setMessage($d('catalogManagerMessage'), error.message);
  }
}

function preloadOwnerCatalogNeighbors() {
  if (!ownerCatalogCache.length) return;
  const offsets = [1, 2, -1, -2];
  offsets.forEach(offset => {
    const index = (ownerCatalogIndex + offset + ownerCatalogCache.length) % ownerCatalogCache.length;
    const photo = ownerCatalogCache[index];
    if (!photo?.image_url) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = photo.image_url;
  });
}

function renderCatalogOwnerViewer() {
  const counter = $d('catalogOwnerCounter');
  const title = $d('catalogOwnerTitle');
  const image = $d('catalogOwnerImage');
  const empty = $d('catalogOwnerEmpty');
  const stage = document.querySelector('.catalog-owner-stage');
  const actions = document.querySelector('.catalog-owner-actions');
  if (!ownerCatalogCache.length) {
    if (counter) counter.textContent = '0 fotos';
    if (title) title.textContent = '';
    if (image) { image.removeAttribute('src'); image.alt = 'Sin fotos de catálogo'; }
    empty?.classList.remove('hidden');
    if (stage) stage.classList.add('empty-catalog');
    if (actions) actions.classList.add('hidden');
    return;
  }
  empty?.classList.add('hidden');
  stage?.classList.remove('empty-catalog');
  actions?.classList.remove('hidden');
  const photo = ownerCatalogCache[ownerCatalogIndex];
  if (counter) counter.textContent = `${ownerCatalogIndex + 1} de ${ownerCatalogCache.length}`;
  if (title) title.textContent = photo.title || 'Diseño Suldery Nails';
  if (image) {
    image.src = photo.image_url;
    image.alt = photo.title || 'Diseño de Suldery Nails';
    image.loading = 'eager';
    image.decoding = 'async';
  }
  preloadOwnerCatalogNeighbors();
}

function moveCatalogViewer(direction) {
  if (!ownerCatalogCache.length) return;
  ownerCatalogIndex = (ownerCatalogIndex + direction + ownerCatalogCache.length) % ownerCatalogCache.length;
  renderCatalogOwnerViewer();
}

async function subirCatalogoFoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('photo', file);
  form.append('title', ($d('catalogPhotoTitle')?.value || '').trim() || 'Diseño Suldery Nails');
  try {
    await apiFetch('/owner/catalog', { method:'POST', body:form });
    if ($d('catalogPhotoTitle')) $d('catalogPhotoTitle').value = '';
    setMessage($d('catalogManagerMessage'), 'Foto agregada al catálogo. 💕', true);
    await loadOwnerCatalog();
  } catch (error) {
    setMessage($d('catalogManagerMessage'), error.message);
  } finally {
    event.target.value = '';
  }
}

function prepararReemplazoCatalogoActual() {
  if (!ownerCatalogCache.length) return;
  const input = $d('catalogReplacePicker');
  if (!input) return;
  input.dataset.photoId = String(ownerCatalogCache[ownerCatalogIndex].id);
  input.value = '';
  input.click();
}

async function reemplazarCatalogoFoto(event) {
  const file = event.target.files[0];
  const id = Number(event.target.dataset.photoId);
  if (!file || !id) return;
  const form = new FormData();
  form.append('photo', file);
  try {
    await apiFetch(`/owner/catalog/${id}/image`, { method:'PATCH', body:form });
    setMessage($d('catalogManagerMessage'), 'Foto actualizada. ✨', true);
    await loadOwnerCatalog();
  } catch (error) {
    setMessage($d('catalogManagerMessage'), error.message);
  } finally {
    event.target.value = '';
    delete event.target.dataset.photoId;
  }
}

async function eliminarCatalogoFotoActual() {
  if (!ownerCatalogCache.length) return;
  const photo = ownerCatalogCache[ownerCatalogIndex];
  if (!confirm(`¿Eliminar “${photo.title || 'este diseño'}” del catálogo?`)) return;
  try {
    await apiFetch(`/owner/catalog/${photo.id}`, { method:'DELETE' });
    ownerCatalogIndex = Math.max(0, ownerCatalogIndex - 1);
    await loadOwnerCatalog();
  } catch (error) {
    setMessage($d('catalogManagerMessage'), error.message);
  }
}

async function moverCatalogoActual(direction) {
  if (!ownerCatalogCache.length) return;
  const id = ownerCatalogCache[ownerCatalogIndex].id;
  try {
    await apiFetch(`/owner/catalog/${id}/move`, { method:'PATCH', body:JSON.stringify({ direction }) });
    if (direction === 'up') ownerCatalogIndex = Math.max(0, ownerCatalogIndex - 1);
    if (direction === 'down') ownerCatalogIndex = Math.min(ownerCatalogCache.length - 1, ownerCatalogIndex + 1);
    await loadOwnerCatalog();
  } catch (error) {
    setMessage($d('catalogManagerMessage'), error.message);
  }
}

const NAIL_CARE_GUIDES = {
  'Manicure semipermanente': {
    title: 'Manicure semipermanente',
    tips: ['Evita usar las uñas como herramientas durante las primeras horas.', 'Aplica aceite de cutícula 1–2 veces al día para mantenerlas flexibles y cuidadas.', 'Para que el acabado dure más, usa guantes al limpiar con productos fuertes.'],
  },
  'Pedicure semipermanente': {
    title: 'Pedicure semipermanente',
    tips: ['Evita golpes y presión innecesaria en las uñas durante el primer día.', 'Mantén la cutícula hidratada y seca bien los pies después de bañarte.', 'Usa productos suaves y evita retirar el esmalte por tu cuenta.'],
  },
  'Dipping': {
    title: 'Dipping',
    tips: ['No uses las uñas para abrir, raspar o despegar objetos.', 'Hidrata cutículas y manos a diario para conservar el acabado bonito.', 'Si una uña se levanta o se golpea, avisa a Suldery en lugar de arrancarla.'],
  },
  'Press on': {
    title: 'Press on',
    tips: ['Evita sumergir las manos en agua caliente durante mucho tiempo.', 'Seca bien las manos y evita tirar de las puntas para prolongar la duración.', 'Si una pieza se despega, guárdala y consulta a Suldery para colocarla nuevamente.'],
  }
};

function renderCareGuide() {
  const service = $d('careGuideService')?.value || 'Manicure semipermanente';
  const guide = NAIL_CARE_GUIDES[service];
  if (!guide) return;
  const tips = $d('careGuideTips');
  if (tips) tips.innerHTML = guide.tips.map((tip, index) => `<li><span>${index + 1}</span><p>${escapeHtml(tip)}</p></li>`).join('');
  const name = ($d('careGuideClientName')?.value || '').trim() || 'hermosa';
  const message = `Hola ${name} 💕, gracias por tu cita en Suldery Nails. Para que ${guide.title.toLowerCase()} se mantenga bonito y cuidado por más tiempo: ${guide.tips.join(' ')}. Cualquier novedad, puedes escribirme y con gusto te ayudo. ✨💅`;
  if ($d('careGuideMessage')) $d('careGuideMessage').value = message;
}

async function copyCareMessage() {
  const text = $d('careGuideMessage')?.value || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const status = $d('careGuideCopyStatus');
    if (status) { status.textContent = 'Mensaje copiado ✓'; window.setTimeout(() => status.textContent = '', 2200); }
  } catch {
    const input = $d('careGuideMessage');
    if (input) { input.select(); document.execCommand('copy'); }
  }
}


const AI_NAIL_KNOWLEDGE = [

  { title:'Pedicure semipermanente', category:'Servicio Suldery', level:'Inicial', text:'Servicio de pies con acabado semipermanente. En Suldery dura 1 hora y debe planificarse dejando libre el bloque de almuerzo.', steps:['Revisa el estado de las uñas y piel antes de empezar.', 'Realiza una preparación cuidadosa y limpia.', 'Aplica el sistema siguiendo las indicaciones del fabricante.', 'Comprueba que el acabado quede uniforme y cómodo.'], safety:'No realices el servicio sobre lesiones, sangrado o signos compatibles con infección.' },
  { title:'Manicure semipermanente', category:'Servicio Suldery', level:'Inicial', text:'Manicure de acabado duradero. En la agenda de Suldery ocupa 1 hora y 30 minutos, por lo que las horas disponibles dependen del tiempo completo.', steps:['Evalúa uñas y cutículas.', 'Prepara sin agredir la placa natural.', 'Aplica capas finas y uniformes.', 'Cura y sella respetando el sistema utilizado.'], safety:'Evita producto sobre piel y respeta los tiempos del fabricante.' },
  { title:'Dipping en Suldery', category:'Servicio Suldery', level:'Intermedio', text:'Sistema de polvo/polímero que en la agenda de Suldery ocupa 2 horas completas.', steps:['Prepara la uña con suavidad.', 'Controla el grosor y la estructura.', 'Sigue el sistema y los tiempos del fabricante.', 'Perfecciona la superficie antes del acabado.'], safety:'No arranques el producto; retíralo con el protocolo adecuado del sistema.' },
  { title:'Press on en Suldery', category:'Servicio Suldery', level:'Intermedio', text:'Diseños prefabricados personalizados. En la agenda de Suldery ocupan 2 horas para selección, ajuste y acabado.', steps:['Mide y selecciona el tamaño correcto.', 'Ajusta el diseño a la forma natural.', 'Prepara las superficies según el adhesivo elegido.', 'Comprueba comodidad, alineación y sellado.'], safety:'No fuerces una pieza que no ajuste; el ajuste correcto evita presión innecesaria.' },
  { title:'Teoría del color para uñas', category:'Diseño', level:'Intermedio', text:'Combinar tonos cercanos genera armonía; usar un contraste controlado crea un punto protagonista.', steps:['Define el tono principal.', 'Elige uno o dos acentos como máximo.', 'Comprueba el contraste con la piel y el estilo de la clienta.', 'Repite un detalle para que el conjunto tenga unidad.'], safety:'La elección estética debe considerar preferencia de la clienta y legibilidad del diseño.' },
  { title:'Retirada segura', category:'Seguridad', level:'Inicial', text:'La retirada debe respetar el sistema utilizado y evitar arrancar o limar en exceso la placa natural.', steps:['Identifica el producto antes de retirarlo.', 'Usa el método compatible con el sistema.', 'Trabaja de forma progresiva y sin forzar.', 'Evalúa la superficie al terminar.'], safety:'Si aparece dolor, calor, sangrado o daño evidente, detén el proceso y deriva a valoración profesional.' },
  { title:'Higiene de herramientas', category:'Seguridad', level:'Inicial', text:'La limpieza, desinfección o esterilización debe seguir el tipo de herramienta y el protocolo aplicable al entorno de trabajo.', steps:['Retira residuos visibles.', 'Aplica el proceso adecuado al material y a la herramienta.', 'Respeta concentración y tiempo del producto utilizado.', 'Guarda las herramientas de forma protegida y ordenada.'], safety:'No sustituyas protocolos sanitarios por soluciones caseras o improvisadas.' },
  { title:'Diagnóstico visual antes del servicio', category:'Seguridad', level:'Inicial', text:'Antes de comenzar conviene observar la placa, la piel, la longitud y el estado general para decidir si el servicio es apropiado.', steps:['Pregunta por molestias o antecedentes relevantes.', 'Observa cambios visibles en uñas y piel.', 'Adapta el servicio al estado observado.', 'Registra cualquier recomendación importante para la clienta.'], safety:'Ante signos de posible infección o lesión, no realices el servicio y recomienda valoración profesional.' },
  { title:'Diseño para fotografía', category:'Diseño', level:'Intermedio', text:'Un diseño pensado para fotos necesita contraste, limpieza de contornos y un detalle que se entienda a distancia corta.', steps:['Elige una base que permita leer el diseño.', 'Define un detalle protagonista.', 'Cuida bordes y simetría.', 'Fotografía con luz uniforme y foco en la mano.'], safety:'No priorices el efecto visual por encima de la integridad de la uña.' },
  { title:'Plan de aprendizaje Suldery', category:'Aprendizaje', level:'Inicial', text:'Una técnica mejora más rápido cuando se practica con objetivos pequeños y revisiones constantes.', steps:['Elige una técnica por semana.', 'Practica en tip o modelo de entrenamiento.', 'Toma fotos del antes y después.', 'Anota qué falló y qué cambiarás en la siguiente práctica.'], safety:'Practica técnicas nuevas en un entorno controlado antes de aplicarlas a una clienta.' },
  { title:'Cat eye', category:'Decoración', level:'Intermedio', text:'Acabado magnético que crea una franja luminosa. Funciona mejor con una base oscura o profunda y un imán colocado con movimientos cortos y controlados.', steps:['Prepara la uña y aplica la base correspondiente al sistema.', 'Aplica una capa fina del color magnético.', 'Acerca el imán sin tocar la uña para concentrar el reflejo.', 'Cura según el producto y sella con top coat.'], safety:'Respeta siempre el tiempo de curado indicado por el fabricante.' },
  { title:'Aura nails', category:'Diseño', level:'Intermedio', text:'Degradado suave que concentra el color alrededor de un punto central y da una sensación difuminada.', steps:['Elige una base clara o translúcida.', 'Coloca el color central con esponja o herramienta de difuminado.', 'Suaviza los bordes sin sobrecargar.', 'Sella y cura correctamente.'], safety:'Evita capas demasiado gruesas.' },
  { title:'Francesa moderna', category:'Diseño', level:'Inicial', text:'Versión contemporánea de la francesa con puntas finas, doble línea, color o acabados metálicos.', steps:['Define la base.', 'Marca una sonrisa fina y uniforme.', 'Añade una segunda línea o detalle si corresponde.', 'Sella para proteger el borde libre.'], safety:'La simetría visual importa más que hacer la línea excesivamente gruesa.' },
  { title:'Chrome', category:'Acabado', level:'Intermedio', text:'Acabado espejo que resalta sobre bases adecuadas. Requiere una superficie muy uniforme para que el reflejo quede limpio.', steps:['Deja la superficie lisa y bien curada.', 'Usa la base recomendada para el pigmento.', 'Frota el pigmento de forma uniforme.', 'Sella los bordes y finaliza.'], safety:'Sigue las indicaciones del fabricante del pigmento.' },
  { title:'Relieve 3D', category:'Decoración', level:'Avanzado', text:'Volumen decorativo con flores, lazos, perlas u otros elementos moldeados.', steps:['Planifica el diseño para no sobrecargar la uña.', 'Construye el volumen en pequeñas porciones.', 'Cura o fija según el material usado.', 'Protege las zonas de roce.'], safety:'El relieve debe quedar estable y sin bordes que enganchen.' },
  { title:'Estructura y forma', category:'Técnica', level:'Inicial', text:'La forma final debe adaptarse a la longitud, el ancho y el estilo de vida de la clienta, no solo a la tendencia.', steps:['Observa la placa y el crecimiento.', 'Elige una forma proporcional a la mano.', 'Mantén laterales equilibrados.', 'Comprueba el resultado desde varios ángulos.'], safety:'No fuerces la forma natural de una uña débil o lesionada.' },
  { title:'Preparación de cutícula', category:'Técnica', level:'Inicial', text:'Una preparación limpia y cuidadosa mejora el aspecto y ayuda a que el producto quede ordenado.', steps:['Trabaja con herramientas limpias y adecuadas.', 'Retira solo tejido que corresponda según la técnica.', 'Evita cortes innecesarios.', 'Elimina residuos antes del producto.'], safety:'Si hay dolor, inflamación, herida o infección visible, no procedas.' },
  { title:'Diseño minimalista', category:'Diseño', level:'Inicial', text:'Pocas líneas, pequeños puntos y espacios limpios para lograr un acabado moderno y elegante.', steps:['Elige una base que contraste suavemente.', 'Usa un detalle principal por uña o por par de uñas.', 'Respeta espacios negativos.', 'Sella con una capa uniforme.'], safety:'Menos elementos facilitan mantener la lectura visual del diseño.' }
];

const AI_CATALOG = [
  { name:'Aura romántica', mood:'Suave · femenina · moderna', colors:'Rosa empolvado + leche', detail:'Aura central con microflores y brillo delicado.' },
  { name:'Francesa vino', mood:'Elegante · sofisticada', colors:'Nude + vino', detail:'Francesa fina con una línea secundaria ultradelgada.' },
  { name:'Chrome perlado', mood:'Limpio · luminoso', colors:'Milky + perla', detail:'Base lechosa con reflejo perlado y un detalle cromado.' },
  { name:'Latte elegante', mood:'Cálido · natural', colors:'Café latte + crema', detail:'Degradado suave con puntos dorados mínimos.' },
  { name:'Noche estelar', mood:'Atrevido · glam', colors:'Negro + perla', detail:'Base oscura con pequeños puntos de luz y acabado brillante.' },
  { name:'Hielo magnético', mood:'Fresco · moderno', colors:'Azul hielo', detail:'Cat eye suave con una línea francesa metálica.' }
];

function switchAiTab(name) {
  document.querySelectorAll('[data-ai-tab]').forEach(button => button.classList.toggle('active', button.dataset.aiTab === name));
  document.querySelectorAll('[data-ai-panel]').forEach(panel => panel.classList.toggle('hidden-ai-panel', panel.dataset.aiPanel !== name));
}

function nailColorPalette(name) {
  const palettes = {
    rosa: ['#f6b7ce','#fff3f8','#c62868'],
    vino: ['#6f1838','#f4d7df','#b83c67'],
    leche: ['#f9f1e8','#fffdf8','#c89b55'],
    cafe: ['#aa7d68','#f4e6dd','#6d4a3b'],
    negro: ['#171423','#f1e6ee','#d7b2c4'],
    azul: ['#a9e2ee','#eefbff','#4e9fb0']
  };
  return palettes[name] || palettes.rosa;
}

function nailShapePath(shape, x, y, w, h) {
  const cx = x + w / 2;
  if (shape === 'almendra') return `M ${cx} ${y} C ${x+w*.9} ${y+h*.2} ${x+w*.86} ${y+h*.82} ${cx} ${y+h} C ${x+w*.14} ${y+h*.82} ${x+w*.1} ${y+h*.2} ${cx} ${y} Z`;
  if (shape === 'coffin') return `M ${x+w*.18} ${y} L ${x+w*.82} ${y} L ${x+w*.95} ${y+h*.9} Q ${cx} ${y+h} ${x+w*.05} ${y+h*.9} Z`;
  if (shape === 'stiletto') return `M ${cx} ${y} L ${x+w} ${y+h} Q ${cx} ${y+h*.92} ${x} ${y+h} Z`;
  if (shape === 'ovalada') return `M ${cx} ${y} C ${x+w*.9} ${y+h*.25} ${x+w*.9} ${y+h*.78} ${cx} ${y+h} C ${x+w*.1} ${y+h*.78} ${x+w*.1} ${y+h*.25} ${cx} ${y} Z`;
  return `M ${x+w*.14} ${y} Q ${cx} ${y-.05*h} ${x+w*.86} ${y} L ${x+w} ${y+h*.8} Q ${x+w*.9} ${y+h} ${x+w*.1} ${y+h} Q ${x} ${y+h*.8} ${x+w*.14} ${y} Z`;
}

function buildDesignSvg(shape, palette, finish, inspiration) {
  const [base, accent, detail] = nailColorPalette(palette);
  const nails = Array.from({length:5}, (_, i) => {
    const x = 20 + i * 78;
    const y = 22 + (i % 2) * 4;
    const h = finish === '3d' ? 132 : 122;
    const path = nailShapePath(shape, x, y, 54, h);
    const decor = inspiration?.toLowerCase().includes('flor')
      ? `<circle cx="${x+27}" cy="${y+66}" r="8" fill="${accent}" opacity=".95"/><circle cx="${x+27}" cy="${y+54}" r="5" fill="${detail}"/><circle cx="${x+39}" cy="${y+61}" r="5" fill="${detail}"/><circle cx="${x+15}" cy="${y+61}" r="5" fill="${detail}"/>`
      : `<path d="M ${x+10} ${y+74} Q ${x+27} ${y+55} ${x+44} ${y+74}" fill="none" stroke="${detail}" stroke-width="4" stroke-linecap="round"/>`;
    const finishOverlay = finish === 'chrome'
      ? `<path d="M ${x+8} ${y+18} Q ${x+27} ${y+2} ${x+46} ${y+18}" fill="none" stroke="#ffffff" stroke-width="5" opacity=".75"/>`
      : finish === 'cat-eye'
        ? `<line x1="${x+18}" y1="${y+18}" x2="${x+38}" y2="${y+h-12}" stroke="#ffffff" stroke-width="5" opacity=".7"/>`
        : '';
    return `<path d="${path}" fill="${base}" stroke="${accent}" stroke-width="2"/>${decor}${finishOverlay}`;
  }).join('');
  return `<svg viewBox="0 0 360 180" role="img" aria-label="Previsualización del diseño generado"><rect width="360" height="180" rx="24" fill="${palette==='negro' ? '#100e18' : '#fff8fc'}"/>${nails}</svg>`;
}

function generateAiDesign() {
  const shape = $d('aiShape')?.value || 'almendra';
  const length = $d('aiLength')?.value || 'medio';
  const palette = $d('aiPalette')?.value || 'rosa';
  const finish = $d('aiFinish')?.value || 'brillo';
  const occasion = $d('aiOccasion')?.value || 'diario';
  const inspiration = ($d('aiInspiration')?.value || '').trim();

  const adjectives = {
    diario:'versátil y limpio',
    evento:'de impacto y fotogénico',
    romantico:'delicado y femenino',
    elegante:'sofisticado y equilibrado',
    atrevido:'marcado y protagonista'
  };
  const finishText = {
    brillo:'brillante',
    mate:'mate',
    chrome:'cromado',
    'cat-eye':'magnético tipo cat eye',
    '3d':'con detalle 3D'
  };

  const inspText = inspiration ? ` con inspiración en ${inspiration}` : '';
  const title = `${shape[0].toUpperCase()+shape.slice(1)} ${palette} · ${finishText[finish]}`;
  const concept = `Una propuesta ${adjectives[occasion]} para largo ${length}, con una base de la paleta ${palette} y acabado ${finishText[finish]}${inspText}. La idea busca que el diseño tenga un detalle protagonista sin perder armonía.`;

  const details = [
    `Forma: ${shape}`,
    `Largo: ${length}`,
    `Paleta: ${palette}`,
    `Acabado: ${finishText[finish]}`,
    `Ocasión: ${occasion}`
  ];
  if (inspiration) details.push(`Inspiración: ${inspiration}`);

  if ($d('aiDesignTitle')) $d('aiDesignTitle').textContent = title;
  if ($d('aiDesignConcept')) $d('aiDesignConcept').textContent = concept;
  if ($d('aiDesignPreview')) $d('aiDesignPreview').innerHTML = buildDesignSvg(shape, palette, finish, inspiration);
  if ($d('aiDesignDetails')) $d('aiDesignDetails').innerHTML = details.map(item => `<span>${escapeHtml(item)}</span>`).join('');
}


function normalizeAiText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerAiAssistant() {
  const input = $d('aiAssistantQuestion');
  const answer = $d('aiAssistantAnswer');
  if (!input || !answer) return;
  const question = input.value.trim();
  if (!question) {
    answer.innerHTML = '<strong>Soy la SulNail IA de Suldery 💕</strong><p>Pregúntame sobre técnicas, preparación, servicios de Suldery, diseños, cuidado, seguridad, organización o ideas para tus clientas.</p>';
    return;
  }

  const normalized = normalizeAiText(question);
  const outOfScope = !/(una|unas|uña|unas|manicure|pedicure|dipping|press|nail|esmalte|gel|acril|cuticula|cuticula|diseno|francesa|chrome|cat eye|decor|forma|almendra|coffin|stiletto|segur|higiene|cuidado|retirada|servicio|clienta|cliente|cita|agenda|color|pigment|top coat|base|curar|lampara|estructura|prepar|limar|polvo)/i.test(normalized);
  if (outOfScope) {
    answer.innerHTML = '<strong>Esta es la SulNail IA de Suldery 💅</strong><p>Estoy especializada en el mundo de las uñas y en apoyar el trabajo de Suldery Nails. Puedo ayudarte con técnicas, diseños, servicios, preparación, cuidado, seguridad y organización del trabajo.</p><p>Prueba con algo como: “¿cómo mejorar un semipermanente?”, “dame un diseño elegante” o “¿qué debo revisar antes de un dipping?”.</p>';
    return;
  }

  const words = normalized.split(' ').filter(word => word.length > 3);
  const scored = AI_NAIL_KNOWLEDGE.map(item => {
    const corpus = normalizeAiText(`${item.title} ${item.category} ${item.text} ${item.steps.join(' ')} ${item.safety}`);
    let score = 0;
    words.forEach(word => { if (corpus.includes(word)) score += word.length >= 7 ? 2 : 1; });
    if (normalized.includes('suldery')) score += 2;
    if (normalized.includes('segur') && normalizeAiText(item.category).includes('segur')) score += 5;
    if (normalized.includes('dipping') && normalizeAiText(item.title).includes('dipping')) score += 6;
    if (normalized.includes('pedicure') && normalizeAiText(item.title).includes('pedicure')) score += 6;
    if (normalized.includes('manicure') && normalizeAiText(item.title).includes('manicure')) score += 6;
    if (normalized.includes('press on') && normalizeAiText(item.title).includes('press on')) score += 6;
    return { item, score };
  }).sort((a,b) => b.score - a.score);

  const best = scored[0]?.score > 0 ? scored[0].item : null;
  const safetyQuestion = /infecc|hongo|dolor|sangr|herida|inflam|alerg|lesion|danada|dana|enferm|ardor|pus/.test(normalized);

  if (!best) {
    answer.innerHTML = '<strong>Vamos paso a paso 💕</strong><p>No tengo una ficha específica para esa pregunta. Puedo ayudarte a plantear un protocolo general de trabajo: preparación → producto adecuado → capas y estructura → curado según fabricante → acabado → cuidado posterior.</p><p><b>Seguridad:</b> si hay dolor, sangrado, inflamación o signos compatibles con infección, no realices el servicio y recomienda valoración profesional.</p>';
    return;
  }

  const extra = safetyQuestion ? ' Si existe dolor, inflamación, sangrado, herida o una posible infección, detén el servicio y recomienda valoración profesional.' : '';
  answer.innerHTML = `<div class="ai-answer-title"><span>${escapeHtml(best.category)}</span><h3>${escapeHtml(best.title)}</h3></div><p>${escapeHtml(best.text)}</p><ol>${best.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol><p class="ai-answer-safety"><b>Nota de Suldery:</b> ${escapeHtml(best.safety)}${escapeHtml(extra)}</p>`;
}
function renderAiKnowledge() {
  const list = $d('aiKnowledgeList');
  if (!list) return;
  const query = String($d('aiKnowledgeSearch')?.value || '').trim().toLowerCase();
  const items = AI_NAIL_KNOWLEDGE.filter(item => !query || `${item.title} ${item.category} ${item.text}`.toLowerCase().includes(query));
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">No encontré una entrada con esa búsqueda. Prueba con “francesa”, “chrome”, “cutícula” o “cat eye”.</div>';
    return;
  }
  list.innerHTML = items.map(item => `
    <article class="ai-knowledge-card">
      <div class="ai-knowledge-head"><div><p class="eyebrow">${escapeHtml(item.category)}</p><h3>${escapeHtml(item.title)}</h3></div><span>${escapeHtml(item.level)}</span></div>
      <p>${escapeHtml(item.text)}</p>
      <ol>${item.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
      <small>Nota: ${escapeHtml(item.safety)}</small>
    </article>`).join('');
}

function renderAiCatalog() {
  const grid = $d('aiCatalogGrid');
  if (!grid) return;
  grid.innerHTML = AI_CATALOG.map(item => `
    <article class="ai-catalog-card">
      <div class="ai-catalog-swatch"></div>
      <p class="eyebrow">IDEA</p>
      <h3>${escapeHtml(item.name)}</h3>
      <strong>${escapeHtml(item.mood)}</strong>
      <p>${escapeHtml(item.colors)}</p>
      <small>${escapeHtml(item.detail)}</small>
    </article>`).join('');
}

document.addEventListener('DOMContentLoaded',initDuena);
