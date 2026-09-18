const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const isGithubPages = location.hostname.endsWith('.github.io');
const API_BASE = isLocal
  ? '/api'
  : isGithubPages
    ? 'https://suldery-nails-production.up.railway.app/api'
    : '/api';
const SITE_BASE = (() => {
  const path = location.pathname;
  if (path.includes('/Suldery-Nails/')) return '/Suldery-Nails/';
  return '/';
})();

function pageUrl(file = 'index.html') {
  return `${SITE_BASE}${file}`.replace('//', '/');
}


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

async function requireRole(role) {
  try {
    const data = await apiFetch('/me');
    if (data.user.role !== role || data.user.status !== 'accepted') {
      location.href = pageUrl(data.user.role === 'owner' ? 'duena.html' : 'cliente.html');
      return null;
    }
    return data.user;
  } catch {
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

// PWA: permite instalar Suldery Nails como una app con su propio icono y ventana.
let deferredInstallPrompt = null;

function isInstalledPWA() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}

function updateInstallButtons() {
  document.querySelectorAll('#installAppButton').forEach(button => {
    button.hidden = isInstalledPWA() || !deferredInstallPrompt;
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
  if (!button || !deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch {}
  deferredInstallPrompt = null;
  updateInstallButtons();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=20260918', { scope: './' }).catch(() => {});
  });
}

window.setTimeout(updateInstallButtons, 0);
