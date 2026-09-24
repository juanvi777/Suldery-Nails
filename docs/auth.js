const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const isGithubPages = location.hostname.endsWith('.github.io');
const API_BASE = isLocal
  ? '/api'
  : isGithubPages
    ? 'https://suldery-nails-production.up.railway.app/api'
    : '/api';
const SITE_BASE = location.pathname.includes('/Suldery-Nails/') ? '/Suldery-Nails/' : '/';

function pageUrl(file = 'index.html') {
  return `${SITE_BASE}${String(file).replace(/^\/+/, '')}`;
}


// Protección básica de interfaz: dificulta menús y atajos accidentales, pero el código del navegador nunca puede ocultarse al 100%.
(function deterBasicInspection(){
  document.addEventListener('contextmenu', e => e.preventDefault(), {capture:true});
  document.addEventListener('keydown', e => {
    const k = String(e.key || '').toLowerCase();
    if (k === 'f12' || (e.ctrlKey && e.shiftKey && ['i','j','c'].includes(k)) || (e.ctrlKey && k === 'u')) e.preventDefault();
  }, {capture:true});
})();

function clearSession() {
  localStorage.removeItem('suldery_token');
  localStorage.removeItem('suldery_user');
}


async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }


  const token = localStorage.getItem('suldery_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store'
    });
  } catch (error) {
    console.error('Error de conexión con la API de Suldery Nails:', error);
    throw new Error('No se pudo conectar con el servidor. Comprueba tu conexión a Internet e inténtalo nuevamente.');
  }
  let data = {};
  try { data = await response.json(); } catch {}

  if (response.status === 401) {
    clearSession();
    const publicPage = /\/(?:index\.html|registro\.html)?$/.test(location.pathname) || location.pathname.endsWith('/Suldery-Nails/');
    if (!publicPage) location.href = pageUrl('index.html');
  }

  if (!response.ok) {
    throw new Error(data.message || 'Ocurrió un error. Inténtalo nuevamente.');
  }

  return data;
}

function setMessage(element, text, success = false) {
  if (!element) return;
  element.textContent = text || '';
  element.classList.toggle('success', Boolean(success));
}

function shake(element) {
  if (!element) return;
  element.classList.remove('shake');
  void element.offsetWidth;
  element.classList.add('shake');
  window.setTimeout(() => element.classList.remove('shake'), 500);
}

function normalizeDateOnly(dateValue) {
  if (dateValue instanceof Date) {
    const y = dateValue.getFullYear();
    const m = String(dateValue.getMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(dateValue ?? '').trim();
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : text;
}

function formatTime12(timeValue) {
  const text = String(timeValue || '').slice(0, 5);
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return text || 'Hora pendiente';
  let hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}

function formatDate(dateValue) {
  const safe = normalizeDateOnly(dateValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return 'Fecha pendiente';
  const d = new Date(`${safe}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Fecha pendiente';
  return d.toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('suldery_user') || 'null'); }
  catch { return null; }
}

async function requireRole(role) {
  const cachedUser = getStoredUser();
  try {
    const data = await apiFetch('/me');
    const user = data.user;
    if (!user || user.status !== 'accepted') {
      clearSession();
      location.replace(pageUrl('index.html'));
      return null;
    }
    if (user.role !== role) {
      location.replace(pageUrl(user.role === 'owner' ? 'duena.html' : 'cliente.html'));
      return null;
    }
    localStorage.setItem('suldery_user', JSON.stringify(user));
    return user;
  } catch (error) {
    // If the API is temporarily unreachable, keep the screen usable with the
    // last verified profile. Server-side authorization still protects actions.
    if (cachedUser && cachedUser.role === role && cachedUser.status === 'accepted') {
      return cachedUser;
    }
    clearSession();
    location.replace(pageUrl('index.html'));
    return null;
  }
}

async function logout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); }
  catch { /* La navegación limpia igualmente el estado local heredado. */ }
  clearSession();
  location.href = pageUrl('index.html');
}

window.pageUrl = pageUrl;
window.apiFetch = apiFetch;
window.clearSession = clearSession;
window.setMessage = setMessage;
window.shake = shake;
window.formatDate = formatDate;
window.formatTime12 = formatTime12;
window.requireRole = requireRole;
function updateThemeToggle() {
  const dark = document.body.classList.contains('dark-mode');
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.querySelector('.theme-icon').textContent = dark ? '☀' : '☾';
    button.querySelector('.theme-label').textContent = dark ? 'Modo claro' : 'Modo oscuro';
    button.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
    button.setAttribute('aria-pressed', String(dark));
  });
}

function applySavedTheme() {
  const saved = localStorage.getItem('suldery_theme');
  document.body.classList.toggle('dark-mode', saved === 'dark');
  updateThemeToggle();
}

function toggleTheme() {
  const dark = !document.body.classList.contains('dark-mode');
  document.body.classList.toggle('dark-mode', dark);
  localStorage.setItem('suldery_theme', dark ? 'dark' : 'light');
  updateThemeToggle();
}
document.addEventListener('DOMContentLoaded', () => {
  applySavedTheme();
  document.querySelectorAll('[data-action="logout"]').forEach(button => button.addEventListener('click', logout));
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', toggleTheme));
});

// PWA: instalación y notificaciones, incluyendo el flujo especial de iPhone/iPad.
let deferredInstallPrompt = null;
let sulderyServiceWorkerRegistration = null;
let sulderyPushPromise = null;

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalledPWA() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || window.navigator.standalone === true;
}

function ensureIOSInstallGuide() {
  if (document.getElementById('iosInstallGuide')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'iosInstallGuide';
  wrapper.className = 'ios-install-guide hidden';
  wrapper.innerHTML = `
    <div class="ios-install-backdrop" data-ios-close></div>
    <section class="ios-install-dialog" role="dialog" aria-modal="true" aria-labelledby="iosInstallTitle">
      <button type="button" class="ios-install-close" data-ios-close aria-label="Cerrar">×</button>
      <p class="eyebrow">IPHONE / IPAD</p>
      <h2 id="iosInstallTitle">Instala Suldery Nails como una app 💕</h2>
      <p>En iPhone, Apple activa las notificaciones cuando la web está instalada en la pantalla de inicio.</p>
      <ol>
        <li>Abre Suldery Nails en <strong>Safari</strong>.</li>
        <li>Toca el botón <strong>Compartir</strong> del navegador.</li>
        <li>Elige <strong>Agregar a pantalla de inicio</strong> y confirma.</li>
        <li>Abre Suldery Nails desde el nuevo icono.</li>
        <li>Entra a tu cuenta y pulsa <strong>Activar avisos</strong>.</li>
      </ol>
      <p class="ios-install-note">Después de instalarla, las notificaciones se pueden permitir desde el propio botón de avisos.</p>
      <button type="button" class="primary-button" data-ios-close>Entendido</button>
    </section>`;
  document.body.appendChild(wrapper);
  wrapper.addEventListener('click', event => {
    if (event.target.closest('[data-ios-close]')) wrapper.classList.add('hidden');
  });
}

function showIOSInstallGuide() {
  ensureIOSInstallGuide();
  document.getElementById('iosInstallGuide')?.classList.remove('hidden');
}

function updateInstallButtons() {
  document.querySelectorAll('#installAppButton').forEach(button => {
    const iosNeedsInstall = isIOSDevice() && !isInstalledPWA();
    if (isInstalledPWA()) {
      button.hidden = true;
      return;
    }
    button.hidden = !deferredInstallPrompt && !iosNeedsInstall;
    if (iosNeedsInstall) button.textContent = '＋ Cómo instalar';
    else if (deferredInstallPrompt) button.textContent = '＋ Instalar app';
  });
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtons();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallButtons();
});

document.addEventListener('click', async event => {
  const button = event.target.closest('#installAppButton');
  if (!button) return;

  if (isIOSDevice()) {
    showIOSInstallGuide();
    return;
  }
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch {}
  deferredInstallPrompt = null;
  updateInstallButtons();
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function getSulderyServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Este dispositivo no permite instalar el sistema de avisos.');
  }
  if (!sulderyServiceWorkerRegistration) {
    const swUrl = new URL('sw.js?v=20260923-v51', location.href);
    sulderyServiceWorkerRegistration = await navigator.serviceWorker.register(swUrl, { scope: './' });
  }
  return await navigator.serviceWorker.ready;
}

async function getPushPublicKey() {
  const data = await apiFetch('/notifications/public-key');
  if (!data.publicKey) throw new Error('No se pudo preparar el sistema de notificaciones.');
  return data.publicKey;
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    throw new Error('Este dispositivo no permite notificaciones web.');
  }
  // Safari/iOS y otros navegadores pueden usar callback; soportamos ambos formatos.
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const result = Notification.requestPermission(permission => finish(permission));
      if (result && typeof result.then === 'function') {
        result.then(finish).catch(reject);
      } else if (typeof result === 'string') {
        finish(result);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function ensureIOSStandaloneForPush() {
  if (isIOSDevice() && !isInstalledPWA()) {
    showIOSInstallGuide();
    throw new Error('En iPhone primero instala Suldery Nails en la pantalla de inicio y luego activa los avisos desde la app.');
  }
}

async function createOrRefreshSulderyPushSubscription(registration, publicKey) {
  const storedKey = localStorage.getItem('suldery_vapid_public_key') || '';
  let existing = await registration.pushManager.getSubscription();
  if (existing && storedKey && storedKey !== publicKey) {
    try { await existing.unsubscribe(); } catch {}
    existing = null;
  }
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
  localStorage.setItem('suldery_vapid_public_key', publicKey);
  await apiFetch('/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON())
  });
  return subscription;
}

async function syncExistingSulderyPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, skipped: true };
  if ('Notification' in window && Notification.permission !== 'granted') return { ok: false, skipped: true };
  if (isIOSDevice() && !isInstalledPWA()) return { ok: false, skipped: true };
  try {
    const registration = await getSulderyServiceWorker();
    const publicKey = await getPushPublicKey();
    const existing = await registration.pushManager.getSubscription();
    // Si el permiso ya fue concedido pero el navegador perdió la suscripción,
    // la recuperamos automáticamente al volver a abrir la app.
    await createOrRefreshSulderyPushSubscription(registration, publicKey);
    return { ok: true, hadSubscription: Boolean(existing) };
  } catch (error) {
    console.warn('No se pudo sincronizar el aviso de este dispositivo:', error.message);
    return { ok: false, error: error.message };
  }
}

async function enableSulderyPush() {
  if (sulderyPushPromise) return sulderyPushPromise;
  sulderyPushPromise = (async () => {
    ensureIOSStandaloneForPush();
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Este navegador no admite notificaciones push.');
    }

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      throw new Error('Debes permitir las notificaciones para recibir los avisos.');
    }

    const registration = await getSulderyServiceWorker();
    const publicKey = await getPushPublicKey();
    await createOrRefreshSulderyPushSubscription(registration, publicKey);
    return { ok: true };
  })().finally(() => { sulderyPushPromise = null; });
  return sulderyPushPromise;
}

async function getSulderyPushStatus() {
  try { return await apiFetch('/notifications/status'); }
  catch { return { subscribed: false, devices: 0 }; }
}

async function enablePendingSulderyPush(registrationToken) {
  if (!registrationToken) throw new Error('No se pudo preparar el aviso de registro.');
  ensureIOSStandaloneForPush();
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Este navegador no permite avisos web.');
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('Debes permitir los avisos para recibir la confirmación de tu cuenta.');
  }

  const registration = await getSulderyServiceWorker();
  const publicKey = await getPushPublicKey();
  const storedKey = localStorage.getItem('suldery_vapid_public_key') || '';
  let existing = await registration.pushManager.getSubscription();
  if (existing && storedKey && storedKey !== publicKey) {
    try { await existing.unsubscribe(); } catch {}
    existing = null;
  }
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });
  localStorage.setItem('suldery_vapid_public_key', publicKey);

  await apiFetch('/notifications/subscribe-pending', {
    method: 'POST',
    body: JSON.stringify({ token: registrationToken, subscription: subscription.toJSON() })
  });
  return { ok: true };
}

window.isIOSDevice = isIOSDevice;
window.isInstalledPWA = isInstalledPWA;
window.showIOSInstallGuide = showIOSInstallGuide;
window.enableSulderyPush = enableSulderyPush;
window.getSulderyPushStatus = getSulderyPushStatus;
window.checkSulderyPush = async function(){ return apiFetch('/notifications/check',{method:'POST'}); };
window.getSulderyServiceWorker = getSulderyServiceWorker;
window.enablePendingSulderyPush = enablePendingSulderyPush;
window.syncExistingSulderyPushSubscription = syncExistingSulderyPushSubscription;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js?v=20260923-v51', location.href);
    navigator.serviceWorker.register(swUrl, { scope: './' }).catch(() => {});
  });
}

window.setTimeout(() => {
  ensureIOSInstallGuide();
  updateInstallButtons();
}, 0);


window.addEventListener('pageshow', () => {
  if (typeof syncExistingSulderyPushSubscription === 'function') void syncExistingSulderyPushSubscription();
});
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof syncExistingSulderyPushSubscription === 'function') void syncExistingSulderyPushSubscription();
});
