const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('dotenv').config();
const { pool, initDatabase, testConnection, ensureUploadDirectory } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET debe existir en .env y tener al menos 32 caracteres.');
}
const isProduction = process.env.NODE_ENV === 'production';
const uploadDir = path.join(__dirname, 'uploads', 'portfolio');

// Railway debe encontrar siempre el frontend. Si una versión se despliega
// con docs/ pero sin public/, recuperamos automáticamente el frontend desde
// docs/ para que / no termine en ENOENT /app/public/index.html.
const publicDir = path.join(__dirname, 'public');
const docsDir = path.join(__dirname, 'docs');
function ensureFrontendDirectory() {
  const publicIndex = path.join(publicDir, 'index.html');
  const docsIndex = path.join(docsDir, 'index.html');
  if (!fs.existsSync(publicIndex) && fs.existsSync(docsIndex)) {
    fs.mkdirSync(publicDir, { recursive: true });
    fs.cpSync(docsDir, publicDir, { recursive: true });
  }
  if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
    throw new Error('No se encontró public/index.html ni docs/index.html en el despliegue.');
  }
}
ensureFrontendDirectory();
const frontendDir = publicDir;

const services = {
  'Manicure semipermanente': 90,
  'Pedicure semipermanente': 60,
  'Dipping': 120,
  'Press on': 120
};
const LUNCH_START = 12 * 60;
const LUNCH_END = 13 * 60;
const SLOT_STEP = 30;
const APP_TIME_ZONE = 'America/Bogota';
const DEFAULT_WEEKLY_INTERVALS = {
  1: [{ start_time: '07:00', end_time: '12:00' }, { start_time: '13:00', end_time: '18:00' }],
  2: [{ start_time: '07:00', end_time: '12:00' }, { start_time: '13:00', end_time: '18:00' }],
  3: [{ start_time: '07:00', end_time: '12:00' }, { start_time: '13:00', end_time: '18:00' }],
  4: [{ start_time: '07:00', end_time: '12:00' }, { start_time: '13:00', end_time: '18:00' }],
  5: [{ start_time: '07:00', end_time: '12:00' }, { start_time: '13:00', end_time: '18:00' }],
  6: [{ start_time: '07:00', end_time: '12:00' }, { start_time: '13:00', end_time: '18:00' }],
  7: []
};

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' https://suldery-nails-production.up.railway.app; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});
const requiredCorsOrigins = [
  'https://juanvi777.github.io',
  'https://suldery-nails-production.up.railway.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const allowedCorsOrigins = new Set([...requiredCorsOrigins, ...configuredCorsOrigins]);
function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (allowedCorsOrigins.has(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/i.test(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
const corsOptions = {
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS.'));
  },
  credentials: false,
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Conserva enlaces antiguos sin duplicar la raíz pública.
app.use('/public', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const target = req.path === '/' ? '/' : req.path;
  res.redirect(302, target);
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(frontendDir));

const upload = multer({
  // Las fotos del portafolio se guardan en MySQL para que no desaparezcan
  // cuando Railway crea un nuevo contenedor o vuelve a desplegar la app.
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) {
      return cb(new Error('Solo se permiten imágenes JPG, PNG, WEBP, GIF o AVIF.'));
    }
    cb(null, true);
  }
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const loginAttempts = new Map();

function loginAttemptKey(req, email) {
  return `${req.ip || req.socket.remoteAddress || 'unknown'}:${email}`;
}

function loginIsBlocked(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function registerLoginFailure(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, startedAt: now });
    return;
  }
  entry.count += 1;
}
function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '8h' });
}

function readCookie(req, name) {
  const prefix = `${name}=`;
  const item = String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

function setSessionCookie(res, token) {
  const flags = [`suldery_session=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=28800'];
  if (isProduction) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

function clearSessionCookie(res) {
  const flags = ['suldery_session=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProduction) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = readCookie(req, 'suldery_session') || (header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!token) return res.status(401).json({ message: 'Sesión no válida.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(payload.id);
    if (!user || user.status !== 'accepted') {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Tu sesión ya no está activa.' });
    }
    req.auth = { id: user.id, role: user.role, user };
    next();
  } catch {
    clearSessionCookie(res);
    res.status(401).json({ message: 'Tu sesión expiró. Inicia sesión nuevamente.' });
  }
}

function ownerRequired(req, res, next) {
  if (req.auth?.role !== 'owner') return res.status(403).json({ message: 'No tienes permisos de dueña.' });
  next();
}

function toMinutes(time) {
  const text = String(time).slice(0, 5);
  if (text === '24:00') return 1440;
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

function toTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
}

function toISODate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : text;
}

function colombiaNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute'))
  };
}

function colombiaTodayISO() {
  const now = colombiaNowParts();
  return `${String(now.year).padStart(4, '0')}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
}

function colombiaCurrentMinutes() {
  const now = colombiaNowParts();
  return now.hour * 60 + now.minute;
}

function isDateInPast(date) {
  return date < colombiaTodayISO();
}

function isToday(date) {
  return date === colombiaTodayISO();
}

function dateWeekday(date) {
  const jsDay = new Date(`${date}T12:00:00`).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function formatDbTime(value) {
  return value ? String(value).slice(0, 5) : null;
}


function formatTime12Server(value) {
  const text = String(value || '').slice(0, 5);
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return text || 'hora pendiente';
  let hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}

function serviceDuration(service) {
  return services[service] || null;
}

function normalizeTimeValue(value, allowEndOfDay = false) {
  const text = String(value || '').slice(0, 5);
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute % 30 !== 0) return null;
  if (allowEndOfDay && text === '24:00') return '24:00';
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (!allowEndOfDay && hour === 23 && minute !== 0 && minute !== 30) return null;
  return text;
}

function sanitizeIntervals(intervals) {
  if (!Array.isArray(intervals)) return [];
  const cleaned = [];
  for (const item of intervals) {
    const start = normalizeTimeValue(item?.start_time || item?.start);
    const end = normalizeTimeValue(item?.end_time || item?.end, true);
    if (!start || !end) throw Object.assign(new Error('Usa horarios en bloques de 30 minutos.'), { statusCode: 400 });
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    if (endMin <= startMin) throw Object.assign(new Error('La hora final debe ser posterior a la hora inicial.'), { statusCode: 400 });

    // El almuerzo es fijo. Si un tramo lo cruza, se parte automáticamente para evitar errores.
    if (startMin < LUNCH_START && endMin > LUNCH_END) {
      cleaned.push({ start_time: start, end_time: '12:00' });
      cleaned.push({ start_time: '13:00', end_time: end });
    } else if (startMin < LUNCH_START && endMin > LUNCH_START && endMin <= LUNCH_END) {
      cleaned.push({ start_time: start, end_time: '12:00' });
    } else if (startMin >= LUNCH_START && endMin <= LUNCH_END) {
      continue;
    } else if (startMin < LUNCH_END && endMin > LUNCH_END) {
      cleaned.push({ start_time: '13:00', end_time: end });
    } else {
      cleaned.push({ start_time: start, end_time: end });
    }
  }
  cleaned.sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
  const result = [];
  for (const interval of cleaned) {
    const start = toMinutes(interval.start_time);
    const end = toMinutes(interval.end_time);
    if (end <= start) continue;
    const previous = result[result.length - 1];
    if (previous && start < toMinutes(previous.end_time)) {
      throw Object.assign(new Error('Los tramos horarios no pueden cruzarse.'), { statusCode: 400 });
    }
    result.push(interval);
  }
  return result;
}

async function ensureDefaultSchedule() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM working_intervals');
  if (Number(rows[0]?.total) > 0) return;
  for (const [weekday, intervals] of Object.entries(DEFAULT_WEEKLY_INTERVALS)) {
    for (const interval of intervals) {
      await pool.query(
        'INSERT IGNORE INTO working_intervals(weekday,start_time,end_time) VALUES(?,?,?)',
        [Number(weekday), `${interval.start_time}:00`, `${interval.end_time}:00`]
      );
    }
  }
}

async function getBlockedDates(startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT blocked_date, reason FROM blocked_dates WHERE blocked_date BETWEEN ? AND ? ORDER BY blocked_date`,
    [startDate, endDate]
  );
  return rows.map(row => ({
    date: row.blocked_date instanceof Date
      ? row.blocked_date.toISOString().slice(0, 10)
      : String(row.blocked_date).slice(0, 10),
    reason: row.reason || ''
  }));
}

async function isDateBlocked(date) {
  const [rows] = await pool.query(
    'SELECT blocked_date, reason FROM blocked_dates WHERE blocked_date=? LIMIT 1',
    [date]
  );
  if (!rows.length) return null;
  return {
    date,
    reason: rows[0].reason || ''
  };
}

async function getDayAppointments(date) {
  const [rows] = await pool.query(
    `SELECT appointment_time,duration_minutes,status
     FROM appointments
     WHERE appointment_date=? AND status IN ('pending','accepted')
     ORDER BY appointment_time`,
    [date]
  );
  return rows;
}

async function getSchedule() {
  const [rows] = await pool.query(
    'SELECT weekday, start_time, end_time FROM working_intervals ORDER BY weekday,start_time'
  );
  const schedule = Object.fromEntries(Object.keys(DEFAULT_WEEKLY_INTERVALS).map(day => [Number(day), []]));
  rows.forEach(row => {
    schedule[Number(row.weekday)].push({
      start_time: formatDbTime(row.start_time),
      end_time: formatDbTime(row.end_time)
    });
  });
  return schedule;
}

function parseIntervalsJson(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

async function getScheduleDay(weekday, date = null) {
  if (date) {
    const [overrideRows] = await pool.query(
      'SELECT override_date,is_open,intervals_json,note FROM schedule_overrides WHERE override_date=? LIMIT 1',
      [date]
    );
    if (overrideRows[0]) {
      const intervals = parseIntervalsJson(overrideRows[0].intervals_json);
      return {
        weekday: Number(weekday),
        is_open: Boolean(overrideRows[0].is_open),
        intervals: sanitizeIntervals(intervals),
        source: 'override',
        note: overrideRows[0].note || ''
      };
    }
  }
  const schedule = await getSchedule();
  const intervals = schedule[Number(weekday)] || [];
  return {
    weekday: Number(weekday),
    is_open: intervals.length > 0,
    intervals,
    source: 'weekly',
    note: ''
  };
}

async function getScheduleEditorData() {
  const weekly = await getSchedule();
  const [overrideRows] = await pool.query(
    'SELECT override_date,is_open,intervals_json,note FROM schedule_overrides WHERE override_date >= CURDATE() ORDER BY override_date'
  );
  const overrides = overrideRows.map(row => {
    const intervals = parseIntervalsJson(row.intervals_json);
    return {
      date: row.override_date instanceof Date ? row.override_date.toISOString().slice(0, 10) : String(row.override_date).slice(0, 10),
      is_open: Boolean(row.is_open),
      intervals,
      note: row.note || ''
    };
  });
  return { weekly, overrides };
}

async function validateScheduleAgainstAppointments(weeklySchedule, overrideDate = null, overrideSchedule = null) {
  const [appointmentRows] = await pool.query(
    `SELECT appointment_date,appointment_time,duration_minutes
     FROM appointments
     WHERE appointment_date >= CURDATE()
       AND appointment_date <= DATE_ADD(CURDATE(), INTERVAL 1 YEAR)
       AND status IN ('pending','accepted')
     ORDER BY appointment_date,appointment_time`
  );
  if (!appointmentRows.length) return;

  const [overrideRows] = await pool.query(
    `SELECT override_date,is_open,intervals_json
     FROM schedule_overrides
     WHERE override_date >= CURDATE()
       AND override_date <= DATE_ADD(CURDATE(), INTERVAL 1 YEAR)`
  );
  const existingOverrides = new Map(overrideRows.map(row => [
    row.override_date instanceof Date ? row.override_date.toISOString().slice(0,10) : String(row.override_date).slice(0,10),
    {
      is_open: Boolean(row.is_open),
      intervals: sanitizeIntervals(parseIntervalsJson(row.intervals_json))
    }
  ]));
  if (overrideDate && overrideSchedule) existingOverrides.set(overrideDate, overrideSchedule);
  const blockedIntervalsMap = await getBlockedIntervalsMap(
    colombiaTodayISO(),
    (() => { const now = new Date(`${colombiaTodayISO()}T12:00:00-05:00`); now.setUTCDate(now.getUTCDate() + 365); return now.toISOString().slice(0,10); })()
  );

  for (const appt of appointmentRows) {
    const date = appt.appointment_date instanceof Date ? appt.appointment_date.toISOString().slice(0,10) : String(appt.appointment_date).slice(0,10);
    if (isDateBlockedCached(date)) continue;
    const override = existingOverrides.get(date);
    const weekday = dateWeekday(date);
    const daySchedule = override || { is_open: Array.isArray(weeklySchedule[weekday]) && weeklySchedule[weekday].length > 0, intervals: weeklySchedule[weekday] || [] };
    const start = toMinutes(appt.appointment_time);
    const duration = Number(appt.duration_minutes) || 60;
    if (!daySchedule.is_open || !slotFitsSchedule(start, start + duration, daySchedule, blockedIntervalsMap.get(date) || [])) {
      const error = new Error(`No se puede guardar el horario: ya existe una cita el ${date.split('-').reverse().join('/')} a las ${String(appt.appointment_time).slice(0,5)} que quedaría fuera del nuevo horario.`);
      error.statusCode = 409;
      throw error;
    }
  }
}

// Se reemplaza por la consulta real solo dentro de la validación masiva para no hacer una consulta por cita.
let blockedDateCache = null;
function isDateBlockedCached(date) {
  if (!blockedDateCache) return false;
  return blockedDateCache.has(date);
}

async function buildBlockedDateCache() {
  const [rows] = await pool.query(
    `SELECT blocked_date FROM blocked_dates WHERE blocked_date >= CURDATE() AND blocked_date <= DATE_ADD(CURDATE(), INTERVAL 1 YEAR)`
  );
  blockedDateCache = new Set(rows.map(row => row.blocked_date instanceof Date ? row.blocked_date.toISOString().slice(0,10) : String(row.blocked_date).slice(0,10)));
}

async function saveWeeklySchedule(scheduleInput) {
  if (!scheduleInput || typeof scheduleInput !== 'object') {
    throw Object.assign(new Error('Horario semanal inválido.'), { statusCode: 400 });
  }
  const normalized = {};
  for (let weekday = 1; weekday <= 7; weekday++) {
    normalized[weekday] = sanitizeIntervals(scheduleInput[weekday] || []);
  }
  await buildBlockedDateCache();
  await validateScheduleAgainstAppointments(normalized);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM working_intervals');
    for (const [weekday, intervals] of Object.entries(normalized)) {
      for (const interval of intervals) {
        await connection.query(
          'INSERT INTO working_intervals(weekday,start_time,end_time) VALUES(?,?,?)',
          [Number(weekday), `${interval.start_time}:00`, `${interval.end_time}:00`]
        );
      }
    }
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
    blockedDateCache = null;
  }
  return normalized;
}

function slotOverlapsLunch(start, end) {
  return start < LUNCH_END && end > LUNCH_START;
}

function slotOverlapsIntervals(start, end, intervals = []) {
  return intervals.some(interval => {
    const blockedStart = toMinutes(interval.start_time);
    const blockedEnd = toMinutes(interval.end_time);
    return start < blockedEnd && end > blockedStart;
  });
}

function slotFitsSchedule(start, end, scheduleDay, blockedIntervals = []) {
  if (!scheduleDay?.is_open || !Array.isArray(scheduleDay.intervals)) return false;
  if (slotOverlapsLunch(start, end)) return false;
  if (slotOverlapsIntervals(start, end, blockedIntervals)) return false;
  return scheduleDay.intervals.some(interval => {
    const intervalStart = toMinutes(interval.start_time);
    const intervalEnd = toMinutes(interval.end_time);
    return start >= intervalStart && end <= intervalEnd;
  });
}

function slotIsFree(start, duration, appointments) {
  const end = start + duration;
  return !appointments.some(appt => {
    const aStart = toMinutes(appt.appointment_time);
    const aDuration = Number(appt.duration_minutes) || 60;
    const aEnd = aStart + aDuration;
    return start < aEnd && end > aStart;
  });
}

async function getBlockedIntervals(date) {
  const [rows] = await pool.query(
    `SELECT id, blocked_date, start_time, end_time, reason
     FROM blocked_intervals
     WHERE blocked_date=?
     ORDER BY start_time`,
    [date]
  );
  return rows.map(row => ({
    id: row.id,
    date: dateOnly(row.blocked_date),
    start_time: formatDbTime(row.start_time),
    end_time: formatDbTime(row.end_time),
    reason: row.reason || ''
  }));
}

async function getBlockedIntervalsMap(startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT id, blocked_date, start_time, end_time, reason
     FROM blocked_intervals
     WHERE blocked_date BETWEEN ? AND ?
     ORDER BY blocked_date,start_time`,
    [startDate, endDate]
  );
  const map = new Map();
  for (const row of rows) {
    const date = dateOnly(row.blocked_date);
    if (!map.has(date)) map.set(date, []);
    map.get(date).push({
      id: row.id,
      date,
      start_time: formatDbTime(row.start_time),
      end_time: formatDbTime(row.end_time),
      reason: row.reason || ''
    });
  }
  return map;
}

async function hasAppointmentOverlap(date, start, end) {
  const [rows] = await pool.query(
    `SELECT id,client_name,appointment_time,duration_minutes
     FROM appointments
     WHERE appointment_date=? AND status IN ('pending','accepted')
       AND appointment_time < ADDTIME(?, SEC_TO_TIME(?))
       AND ADDTIME(appointment_time, SEC_TO_TIME(duration_minutes*60)) > ?
     LIMIT 1`,
    [date, `${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}:00`, end - start, `${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}:00`]
  );
  return rows[0] || null;
}

function buildDayTimeline(date, scheduleDay, appointments, duration, blockedIntervals = []) {
  if (!scheduleDay?.is_open || !Array.isArray(scheduleDay.intervals) || !scheduleDay.intervals.length) return [];

  const starts = scheduleDay.intervals.map(interval => toMinutes(interval.start_time));
  const ends = scheduleDay.intervals.map(interval => toMinutes(interval.end_time));
  const firstStart = Math.min(...starts);
  const lastEnd = Math.max(...ends);
  const earliestAllowed = isToday(date)
    ? Math.max(0, Math.ceil(colombiaCurrentMinutes() / SLOT_STEP) * SLOT_STEP)
    : 0;
  const timeline = [];

  for (let minute = firstStart; minute < lastEnd; minute += SLOT_STEP) {
    const end = minute + duration;
    let status = 'unavailable';
    let reason = 'No hay tiempo suficiente para terminar el servicio en este tramo.';
    const appointment = appointments.find(appt => {
      const start = toMinutes(appt.appointment_time);
      const apptEnd = start + (Number(appt.duration_minutes) || 60);
      return minute < apptEnd && end > start;
    });

    if (isToday(date) && minute < earliestAllowed) {
      status = 'past';
      reason = 'Esta hora ya pasó.';
    } else if (slotOverlapsLunch(minute, end)) {
      status = 'lunch';
      reason = 'Almuerzo de Suldery: 12:00 PM – 1:00 PM.';
    } else if (slotOverlapsIntervals(minute, end, blockedIntervals)) {
      status = 'blocked';
      reason = 'Hay una pausa/bloqueo en este horario.';
    } else if (appointment) {
      status = 'occupied';
      reason = `${appointment.client_name || 'Una clienta'} ya ocupa parte de este horario.`;
    } else if (slotFitsSchedule(minute, end, scheduleDay, blockedIntervals)) {
      status = 'available';
      reason = 'Este horario está disponible para el servicio elegido.';
    }

    timeline.push({
      time: toTime(minute).slice(0, 5),
      status,
      reason,
      client_name: appointment?.client_name || null
    });
  }
  return timeline;
}

function slotsForDate(date, scheduleDay, appointments, duration = 60, blockedIntervals = []) {
  if (!scheduleDay?.is_open || !Array.isArray(scheduleDay.intervals)) return [];
  const slots = [];
  let earliest = 0;
  if (isToday(date)) {
    const current = colombiaCurrentMinutes();
    earliest = Math.max(0, Math.ceil(current / SLOT_STEP) * SLOT_STEP);
  }

  for (const interval of scheduleDay.intervals) {
    const start = toMinutes(interval.start_time);
    const end = toMinutes(interval.end_time);
    for (let minute = start; minute + duration <= end; minute += SLOT_STEP) {
      if (minute < earliest) continue;
      const slotEnd = minute + duration;
      if (!slotFitsSchedule(minute, slotEnd, scheduleDay, blockedIntervals)) continue;
      if (slotIsFree(minute, duration, appointments)) slots.push(toTime(minute).slice(0, 5));
    }
  }
  return [...new Set(slots)].sort();
}

function dayMessage(date, scheduleDay, slots) {
  if (dateWeekday(date) === 7 && !scheduleDay?.is_open) return 'Bebé, hoy estoy descansando. Nos vemos otro día. ♡';
  if (!scheduleDay?.is_open) return 'Bebé, hoy no estoy atendiendo. Elige otro día. ♡';
  if (!slots.length) return 'Bebé, no hay un turno que complete todo el servicio en ese día.';
  return '';
}

async function findUserById(id) {
  const [rows] = await pool.query(
    'SELECT id,name,email,phone,role,status,created_at FROM users WHERE id=?',
    [id]
  );
  return rows[0] || null;
}


app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();
    res.json({ ok: true, message: 'Servidor y MySQL conectados.' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'No se pudo conectar a MySQL.', detail: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');
    if (name.length < 2) return res.status(400).json({ message: 'Escribe tu nombre completo.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Escribe un correo válido.' });
    if (!/^\+?[0-9][0-9\s().-]{6,18}$/.test(phone)) return res.status(400).json({ message: 'Escribe un número de teléfono válido.' });
    if (password.length < 6) return res.status(400).json({ message: 'La contraseña debe tener mínimo 6 caracteres.' });

    const [existing] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (existing.length) return res.status(409).json({ message: 'Ese correo ya está registrado.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      `INSERT INTO users(name,email,phone,password_hash,role,status) VALUES(?,?,?,?,'client','pending')`,
      [name, email, phone, passwordHash]
    );
    const pushRegistrationToken = await issuePendingPushToken(result.insertId);
    void notifyNewClientAccount({ id: result.insertId, name, email, phone });
    const firstName = name.split(/\s+/)[0] || name;
    res.status(201).json({
      message: `Hola ${firstName} 💕, ya recibimos tu solicitud para unirte a Suldery Nails. Solo falta que Suldery la apruebe. Te avisaremos apenas esté lista para ti. ¡Gracias por confiar en Suldery! 💅✨`,
      push_registration_token: pushRegistrationToken
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/auth/recovery/request', async (req, res) => {
  try {
    const rawPhone = String(req.body?.phone || '').trim();
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length < 7) return res.status(400).json({ message: 'Escribe un número de teléfono válido.' });

    const [rows] = await pool.query(
      `SELECT id,name,phone,status FROM users WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')','') LIKE ? LIMIT 1`,
      [`%${digits.slice(-10)}`]
    );

    // Respuesta genérica para no revelar si un número está registrado.
    if (!rows.length) {
      return res.json({ message: 'Recibimos tu solicitud. Si el número pertenece a una cuenta, Suldery verá la solicitud en su panel y podrá ayudarte a recuperar el acceso. 💕' });
    }
    const user = rows[0];
    if (user.status === 'rejected') {
      return res.json({ message: 'Recibimos tu solicitud. Suldery podrá revisarla desde su panel.' });
    }

    await pool.query(
      `INSERT INTO password_reset_requests(user_id,phone,status) VALUES(?,?, 'pending')`,
      [user.id, user.phone || rawPhone]
    );
    void notifyOwners(
      `Hola Suldery 💕, ${user.name} solicitó recuperar el acceso a su cuenta.\n📱 ${user.phone || rawPhone}\nPuedes revisar la solicitud desde tu panel.`,
      `password-recovery:${user.id}:${Date.now()}`,
      'password_recovery_owner_push'
    );
    return res.json({ message: 'Listo 💕. Tu solicitud de recuperación quedó enviada a Suldery. Ella podrá ayudarte desde su panel usando el número con el que registraste tu cuenta.' });
  } catch (error) {
    console.error('No se pudo crear la solicitud de recuperación:', error.message);
    res.status(500).json({ message: 'No se pudo enviar la solicitud. Inténtalo nuevamente.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ message: 'Completa correo y contraseña.' });
    const attemptKey = loginAttemptKey(req, email);
    if (loginIsBlocked(attemptKey)) return res.status(429).json({ message: 'Demasiados intentos. Espera 15 minutos antes de reintentar.' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email=? LIMIT 1', [email]);
    const user = rows[0];
    if (!user) { registerLoginFailure(attemptKey); return res.status(401).json({ message: 'Correo o contraseña incorrectos.' }); }
    if (!(await bcrypt.compare(password, user.password_hash))) { registerLoginFailure(attemptKey); return res.status(401).json({ message: 'Correo o contraseña incorrectos.' }); }
    if (user.status === 'pending') return res.status(403).json({ message: 'Tu cuenta todavía está pendiente de aprobación.' });
    if (user.status === 'rejected') return res.status(403).json({ message: 'Tu cuenta fue rechazada. Comunícate con Suldery.' });

    const safeUser = { id: user.id, name: user.name, email: user.email, phone: user.phone || '', role: user.role, status: user.status };
    loginAttempts.delete(attemptKey);
    const token = signToken(user);
    setSessionCookie(res, token);
    res.json({ user: safeUser, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo iniciar sesión.' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.get('/api/me', authRequired, async (req, res) => {
  try {
    const user = await findUserById(req.auth.id);
    if (!user) return res.status(401).json({ message: 'Usuario no encontrado.' });
    res.json({ user });
  } catch {
    res.status(500).json({ message: 'No se pudo cargar tu cuenta.' });
  }
});

app.get('/api/schedule', authRequired, async (_req, res) => {
  try { res.json({ schedule: await getSchedule() }); }
  catch { res.status(500).json({ message: 'No se pudo cargar el horario.' }); }
});

app.get('/api/calendar', authRequired, async (req, res) => {
  try {
    const month = String(req.query.month || '');
    const service = String(req.query.service || 'Manicure semipermanente');
    const duration = serviceDuration(service);
    if (!/^\d{4}-\d{2}$/.test(month) || !duration) return res.status(400).json({ message: 'Mes o servicio inválido.' });

    const [year, monthNumber] = month.split('-').map(Number);
    if (monthNumber < 1 || monthNumber > 12) return res.status(400).json({ message: 'Mes inválido.' });

    const totalDays = new Date(year, monthNumber, 0).getDate();
    const weeklySchedule = await getSchedule();
    const startDate = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;
    const blockedRows = await getBlockedDates(startDate, endDate);
    const blockedMap = new Map(blockedRows.map(row => [row.date, row]));
    const blockedIntervalsMap = await getBlockedIntervalsMap(startDate, endDate);
    const [appointments] = await pool.query(
      `SELECT appointment_date, appointment_time, duration_minutes
       FROM appointments
       WHERE appointment_date BETWEEN ? AND ?
       AND status IN ('pending','accepted')
       ORDER BY appointment_date, appointment_time`,
      [startDate, endDate]
    );

    const grouped = new Map();
    appointments.forEach(item => {
      const key = item.appointment_date instanceof Date
        ? item.appointment_date.toISOString().slice(0, 10)
        : String(item.appointment_date).slice(0, 10);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });

    const days = [];
    for (let d = 1; d <= totalDays; d++) {
      const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (isDateInPast(date)) {
        days.push({ date, status: 'past', slots: 0, message: 'Esta fecha ya pasó.' });
        continue;
      }

      const weekday = dateWeekday(date);
      const scheduleDay = await getScheduleDay(weekday, date);
      const blocked = blockedMap.get(date);
      if (blocked) {
        days.push({ date, status: 'blocked', slots: 0, message: blocked.reason ? `No hay atención: ${blocked.reason}` : 'Este día no está disponible para citas.' });
        continue;
      }
      if (weekday === 7 || !scheduleDay?.is_open) {
        days.push({ date, status: 'rest', slots: 0, message: dayMessage(date, scheduleDay, []) });
        continue;
      }

      const slots = slotsForDate(date, scheduleDay, grouped.get(date) || [], duration, blockedIntervalsMap.get(date) || []);
      if (!slots.length) {
        days.push({ date, status: 'full', slots: 0, message: 'Bebé, hoy ya tengo todas las citas agendadas.' });
      } else {
        days.push({ date, status: 'available', slots: slots.length, message: '', duration, services: Object.keys(services) });
      }
    }
    res.json({ month, service, duration, days });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo cargar el calendario.' });
  }
});

app.get('/api/appointments/slots', authRequired, async (req, res) => {
  try {
    const date = toISODate(req.query.date);
    const service = String(req.query.service || 'Manicure semipermanente');
    const duration = serviceDuration(service);
    if (!date || !duration) return res.status(400).json({ message: 'Fecha o servicio inválido.' });
    if (isDateInPast(date)) return res.json({ date, service, duration, slots: [], message: 'Esta fecha ya pasó.' });

    const blocked = await isDateBlocked(date);
    if (blocked) return res.json({ date, service, duration, slots: [], message: blocked.reason ? `No hay atención: ${blocked.reason}` : 'Este día no está disponible para citas.' });

    const scheduleDay = await getScheduleDay(dateWeekday(date), date);
    if (!scheduleDay?.is_open || dateWeekday(date) === 7) {
      return res.json({ date, service, duration, slots: [], message: 'Bebé, hoy estoy descansando. Nos vemos otro día. ♡' });
    }

    const [appointments, blockedIntervals] = await Promise.all([
      getDayAppointments(date),
      getBlockedIntervals(date)
    ]);
    const slots = slotsForDate(date, scheduleDay, appointments, duration, blockedIntervals);
    const timeline = buildDayTimeline(date, scheduleDay, appointments, duration, blockedIntervals);
    res.json({ date, service, duration, blocked_intervals: blockedIntervals, slots, timeline, message: dayMessage(date, scheduleDay, slots) });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar los horarios.' });
  }
});

app.get('/api/appointments/my', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,client_name,service,duration_minutes,appointment_date,appointment_time,status,created_at
       FROM appointments WHERE user_id=? ORDER BY appointment_date,appointment_time`,
      [req.auth.id]
    );
    res.json({ appointments: rows });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar tus citas.' });
  }
});

async function withAppointmentDateLock(date, work) {
  const connection = await pool.getConnection();
  const lockName = `suldery:appointment:${date}`;
  let locked = false;
  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
    locked = Number(rows[0]?.acquired) === 1;
    if (!locked) {
      const error = new Error('No se pudo asegurar el turno. Inténtalo nuevamente.');
      error.statusCode = 409;
      throw error;
    }
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    if (locked) { try { await connection.query('SELECT RELEASE_LOCK(?)', [lockName]); } catch {} }
    connection.release();
  }
}

async function getDayAppointmentsWithConnection(connection, date) {
  const [rows] = await connection.query(
    `SELECT appointment_time, duration_minutes, status
     FROM appointments
     WHERE appointment_date=? AND status IN ('pending','accepted')
     ORDER BY appointment_time`,
    [date]
  );
  return rows;
}

function normalizePhoneNumber(phone, defaultCountry = '57') {
  let value = String(phone || '').trim().replace(/[^0-9+]/g, '');
  if (!value) return '';
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('+')) return value;
  if (value.length === 10 && value.startsWith('3')) return `+${defaultCountry}${value}`;
  return value;
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : text.slice(0, 10);
}

function formatHumanDate(date) {
  const text = dateOnly(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'fecha pendiente';
  const d = new Date(`${text}T12:00:00-05:00`);
  if (Number.isNaN(d.getTime())) return 'fecha pendiente';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatShortDate(date) {
  const text = dateOnly(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'fecha pendiente';
  return text.split('-').reverse().join('/');
}

function colombiaDateTime(date, time) {
  const safeDate = String(date || '').slice(0, 10);
  const safeTime = String(time || '').slice(0, 5);
  return new Date(`${safeDate}T${safeTime}:00-05:00`);
}


let vapidConfig = null;
const VAPID_SUBJECT = 'mailto:notifications@sulderynails.app';

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(value) {
  const text = String(value || '');
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4), 'base64');
}

function hkdfExtract(salt, ikm) {
  return crypto.createHmac('sha256', salt).update(ikm).digest();
}

function hkdfExpand(prk, info, length) {
  const result = [];
  let previous = Buffer.alloc(0);
  for (let counter = 1; Buffer.concat(result).length < length; counter += 1) {
    previous = crypto.createHmac('sha256', prk)
      .update(Buffer.concat([previous, Buffer.from(info), Buffer.from([counter])]))
      .digest();
    result.push(previous);
    if (counter > 255) throw new Error('HKDF demasiado largo.');
  }
  return Buffer.concat(result).subarray(0, length);
}

function publicKeyBytesFromJwk(jwk) {
  return Buffer.concat([Buffer.from([4]), fromBase64url(jwk.x), fromBase64url(jwk.y)]);
}

function encryptSetting(plainText) {
  const key = crypto.createHash('sha256').update(JWT_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: base64url(iv), data: base64url(ciphertext), tag: base64url(cipher.getAuthTag()) });
}

function decryptSetting(payload) {
  const parsed = JSON.parse(String(payload || '{}'));
  const key = crypto.createHash('sha256').update(JWT_SECRET).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, fromBase64url(parsed.iv));
  decipher.setAuthTag(fromBase64url(parsed.tag));
  return Buffer.concat([decipher.update(fromBase64url(parsed.data)), decipher.final()]).toString('utf8');
}

async function ensureVapidKeys() {
  const [rows] = await pool.query(
    `SELECT setting_key,setting_value FROM app_settings WHERE setting_key IN ('vapid_public_key','vapid_private_key')`
  );
  const values = new Map(rows.map(row => [row.setting_key, row.setting_value]));

  if (values.has('vapid_public_key') && values.has('vapid_private_key')) {
    try {
      const privateJwk = JSON.parse(decryptSetting(values.get('vapid_private_key')));
      const privateKey = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
      vapidConfig = { privateKey, publicKey: values.get('vapid_public_key') };
      return vapidConfig;
    } catch (error) {
      console.error('No se pudieron recuperar las claves de avisos. Se generarán nuevas.', error.message);
    }
  }

  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateJwk = pair.privateKey.export({ format: 'jwk' });
  const publicJwk = pair.publicKey.export({ format: 'jwk' });
  const publicKey = base64url(publicKeyBytesFromJwk(publicJwk));

  await pool.query(
    `INSERT INTO app_settings(setting_key,setting_value) VALUES('vapid_public_key',?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)`,
    [publicKey]
  );
  await pool.query(
    `INSERT INTO app_settings(setting_key,setting_value) VALUES('vapid_private_key',?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)`,
    [encryptSetting(JSON.stringify(privateJwk))]
  );

  vapidConfig = { privateKey: pair.privateKey, publicKey };
  return vapidConfig;
}

function createVapidJwt(audience) {
  if (!vapidConfig) throw new Error('Los avisos todavía no están preparados.');
  const header = base64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT
  })));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createSign('SHA256')
    .update(unsigned)
    .end()
    .sign({ key: vapidConfig.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${base64url(signature)}`;
}

function encryptWebPushPayload(subscription, message) {
  const receiverPublic = fromBase64url(subscription.p256dh);
  const authSecret = fromBase64url(subscription.auth);
  if (receiverPublic.length !== 65) throw new Error('La suscripción tiene una clave pública inválida.');
  if (authSecret.length !== 16) throw new Error('La suscripción tiene un secreto de autenticación inválido.');

  const receiverKey = crypto.createPublicKey({
    key: {
      kty: 'EC', crv: 'P-256',
      x: base64url(receiverPublic.subarray(1, 33)),
      y: base64url(receiverPublic.subarray(33, 65))
    },
    format: 'jwk'
  });

  const senderPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const senderPublic = publicKeyBytesFromJwk(senderPair.publicKey.export({ format: 'jwk' }));
  const ecdhSecret = crypto.diffieHellman({ privateKey: senderPair.privateKey, publicKey: receiverKey });

  const prkKey = hkdfExtract(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), receiverPublic, senderPublic]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);

  const salt = crypto.randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);

  const padded = Buffer.concat([Buffer.from(String(message), 'utf8'), Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([senderPublic.length]), senderPublic, encrypted]);
}

function requestBytes(urlString, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode || 0,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function sendWebPush(subscription, payload) {
  const endpoint = new URL(subscription.endpoint);
  const body = encryptWebPushPayload(subscription, JSON.stringify(payload));
  const audience = `${endpoint.protocol}//${endpoint.host}`;
  const response = await requestBytes(subscription.endpoint, body, {
    TTL: '86400',
    Urgency: 'high',
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    Authorization: `vapid t=${createVapidJwt(audience)}, k=${vapidConfig.publicKey}`
  });

  if (response.statusCode === 404 || response.statusCode === 410) return { sent: false, gone: true };
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`El servicio de avisos respondió ${response.statusCode}: ${response.body.slice(0, 250)}`);
  }
  return { sent: true };
}

async function sendPushToUser(userId, message, url) {
  if (!vapidConfig) await ensureVapidKeys();
  const [rows] = await pool.query(
    `SELECT id,endpoint,p256dh,auth,content_encoding FROM push_subscriptions WHERE user_id=?`,
    [userId]
  );
  if (!rows.length) return { sent: false, skipped: true, missing: ['avisos no activados en el dispositivo'] };

  let delivered = 0;
  for (const subscription of rows) {
    try {
      const result = await sendWebPush(subscription, {
        title: 'Suldery Nails 💕',
        body: message,
        url: url || ownerPanelUrl(),
        icon: 'assets/suldery-nails-icon-192.png',
        tag: `suldery-${Date.now()}`
      });
      if (result.sent) delivered += 1;
      if (result.gone) await pool.query('DELETE FROM push_subscriptions WHERE id=?', [subscription.id]);
    } catch (error) {
      console.error('No se pudo enviar un aviso push:', error.message);
    }
  }
  return { sent: delivered > 0, delivered, total: rows.length };
}

async function sendPushOnce(notificationKey, notificationType, userId, message, url) {
  const [existing] = await pool.query('SELECT id FROM notification_log WHERE notification_key=? LIMIT 1', [notificationKey]);
  if (existing.length) return { sent: true, alreadySent: true };

  const result = await sendPushToUser(userId, message, url);
  if (!result.sent) return result;

  await pool.query(
    `INSERT INTO notification_log(notification_key,notification_type) VALUES(?,?)
     ON DUPLICATE KEY UPDATE notification_key=notification_key`,
    [notificationKey, notificationType]
  );
  return result;
}

function firstNameOf(value) {
  return String(value || '').trim().split(/\s+/)[0] || 'hola';
}

function ownerPanelUrl() {
  return 'https://suldery-nails-production.up.railway.app/duena.html';
}

function clientPanelUrl() {
  return 'https://suldery-nails-production.up.railway.app/cliente.html';
}

function notificationDateTime(date, time) {
  return `${formatHumanDate(date)} a las ${formatTime12Server(time)}`;
}

async function getOwnerIds() {
  const [rows] = await pool.query(`SELECT id FROM users WHERE role='owner' AND status='accepted'`);
  return rows.map(row => Number(row.id));
}

async function notifyOwners(message, keyPrefix, type) {
  const ownerIds = await getOwnerIds();
  return Promise.all(ownerIds.map(ownerId => sendPushOnce(`${keyPrefix}:owner:${ownerId}`, type, ownerId, message, ownerPanelUrl())));
}

async function issuePendingPushToken(userId) {
  const rawToken = base64url(crypto.randomBytes(36));
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await pool.query('DELETE FROM pending_push_registrations WHERE user_id=? OR expires_at<NOW()', [userId]);
  await pool.query(
    `INSERT INTO pending_push_registrations(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
    [userId, tokenHash]
  );
  return rawToken;
}

async function notifyNewClientAccount({ id, name, email, phone }) {
  return notifyOwners(
    `Hola Suldery 💕, una nueva clienta quiere ser parte de Suldery Nails.\n\n👤 ${name}\n✉️ ${email}\n📱 ${phone || 'sin teléfono'}\n\nSu cuenta quedó pendiente de aprobación. Cuando tengas un momento, puedes revisarla en tu panel.`,
    `account-pending:${id}`,
    'account_pending_owner_push'
  );
}

async function notifyClientAccountAccepted({ id, name }) {
  return sendPushOnce(
    `account-accepted:client:${id}`,
    'account_accepted_client_push',
    id,
    `Hola ${firstNameOf(name)} 💕, ¡qué alegría tenerte en Suldery Nails! Tu cuenta ya fue activada y ya puedes entrar para elegir tu próxima cita. Te esperamos con mucho cariño. 💅✨`,
    clientPanelUrl()
  );
}

async function notifyClientAccountRejected({ id, name }) {
  return sendPushOnce(
    `account-rejected:client:${id}`,
    'account_rejected_client_push',
    id,
    `Hola ${firstNameOf(name)} 💕, por ahora no pudimos activar tu cuenta en Suldery Nails. Si necesitas hablar con Suldery, puedes escribirle o llamarle al 310 631 9093.`,
    'https://suldery-nails-production.up.railway.app/'
  );
}

async function notifyNewClientAppointment({ id, clientName, phone, service, date, time }) {
  return notifyOwners(
    `Hola Suldery 💕, ${clientName} acaba de solicitar una cita.\n\n💅 ${service}\n📅 ${notificationDateTime(date, time)}\n📱 ${phone || 'sin teléfono'}\n\nLa solicitud está pendiente de confirmación.`,
    `appointment-pending:${id}`,
    'appointment_pending_owner_push'
  );
}

async function notifyClientAppointmentAccepted({ id, clientName, service, date, time }) {
  const [rows] = await pool.query('SELECT user_id FROM appointments WHERE id=? LIMIT 1', [id]);
  const userId = rows[0]?.user_id;
  if (!userId) return { sent: false, skipped: true };
  return sendPushOnce(
    `appointment-accepted:client:${id}`,
    'appointment_accepted_client_push',
    userId,
    `Hola ${firstNameOf(clientName)} 💕, tu cita en Suldery Nails ya quedó confirmada para ${notificationDateTime(date, time)}, para tu ${service}. ¡Te esperamos! 💅✨`,
    clientPanelUrl()
  );
}

async function notifyClientAppointmentRejected({ id, clientName, service, date, time }) {
  const [rows] = await pool.query('SELECT user_id FROM appointments WHERE id=? LIMIT 1', [id]);
  const userId = rows[0]?.user_id;
  if (!userId) return { sent: false, skipped: true };
  return sendPushOnce(
    `appointment-rejected:client:${id}`,
    'appointment_rejected_client_push',
    userId,
    `Hola ${firstNameOf(clientName)}, la solicitud de tu cita para ${notificationDateTime(date, time)} de ${service} no pudo ser confirmada. Puedes volver a Suldery Nails y elegir otro horario. 💕`,
    clientPanelUrl()
  );
}

async function notifyClientAppointmentCancelled({ id, clientName, service, date, time }) {
  const [rows] = await pool.query('SELECT user_id FROM appointments WHERE id=? LIMIT 1', [id]);
  const userId = rows[0]?.user_id;
  if (!userId) return { sent: false, skipped: true };
  return sendPushOnce(
    `appointment-cancelled:client:${id}`,
    'appointment_cancelled_client_push',
    userId,
    `Hola ${firstNameOf(clientName)}, tu cita de ${service} para ${notificationDateTime(date, time)} fue cancelada. Puedes entrar a Suldery Nails para buscar otro espacio. 💕`,
    clientPanelUrl()
  );
}

async function notifyOwnerAppointmentCancelled({ id, clientName, phone, service, date, time }) {
  return notifyOwners(
    `Hola Suldery 💕, ${clientName} canceló su cita.\n\n💅 ${service}\n📅 ${notificationDateTime(date, time)}\n📱 ${phone || 'sin teléfono'}\n\nEl espacio ya quedó libre en tu agenda.`,
    `appointment-cancelled:${id}`,
    'appointment_cancelled_owner_push'
  );
}

async function sendPendingSummary() {
  try {
    const [users] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE role='client' AND status='pending'`);
    const [appointments] = await pool.query(`SELECT COUNT(*) AS total FROM appointments WHERE status='pending' AND appointment_date >= ?`, [colombiaTodayISO()]);
    const pendingUsers = Number(users[0]?.total || 0);
    const pendingAppointments = Number(appointments[0]?.total || 0);
    if (!pendingUsers && !pendingAppointments) return;

    const bucket = new Date().toISOString().slice(0, 13);
    const parts = [];
    if (pendingUsers) parts.push(`${pendingUsers} cuenta${pendingUsers === 1 ? '' : 's'} pendiente${pendingUsers === 1 ? '' : 's'} de aprobación`);
    if (pendingAppointments) parts.push(`${pendingAppointments} cita${pendingAppointments === 1 ? '' : 's'} pendiente${pendingAppointments === 1 ? '' : 's'} de confirmar`);
    await notifyOwners(`Hola Suldery 💕, tienes ${parts.join(' y ')}. Cuando tengas un momento, puedes revisarlas en tu panel.`, `pending-summary:${bucket}`, 'pending_summary_owner_push');
  } catch (error) {
    console.error('No se pudo preparar el resumen de pendientes:', error.message);
  }
}

async function sendUpcomingAppointmentReminders() {
  try {
    const today = colombiaTodayISO();
    const upper = new Date(`${today}T12:00:00-05:00`);
    upper.setUTCDate(upper.getUTCDate() + 2);
    const upperDate = upper.toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT a.id,a.user_id,a.client_name,a.client_phone,a.service,a.appointment_date,a.appointment_time,u.phone AS user_phone
       FROM appointments a LEFT JOIN users u ON u.id=a.user_id
       WHERE a.status='accepted' AND a.appointment_date BETWEEN ? AND ?
       ORDER BY a.appointment_date,a.appointment_time`, [today, upperDate]
    );
    const now = Date.now();

    for (const appt of rows) {
      const dateText = dateOnly(appt.appointment_date);
      const timeText = formatDbTime(appt.appointment_time);
      const when = colombiaDateTime(dateText, timeText).getTime();
      const minutesAway = (when - now) / 60000;
      const clientPhone = appt.client_phone || appt.user_phone || '';

      if (minutesAway > 23 * 60 && minutesAway <= 25 * 60) {
        await notifyOwners(
          `Hola Suldery 💕, recordatorio para mañana: tienes a ${appt.client_name} a las ${formatTime12Server(timeText)} para ${appt.service}. 📱 ${clientPhone || 'sin teléfono'}.`,
          `appointment-reminder-24h:${appt.id}`,
          'appointment_reminder_24h_owner_push'
        );
        if (appt.user_id) {
          await sendPushOnce(
            `appointment-reminder-24h:client:${appt.id}`,
            'appointment_reminder_24h_client_push',
            appt.user_id,
            `Hola ${firstNameOf(appt.client_name)} 💕, mañana tienes tu cita en Suldery Nails a las ${formatTime12Server(timeText)} para ${appt.service}. ¡Te esperamos! 💅✨`,
            clientPanelUrl()
          );
        }
      }

      if (minutesAway > 25 && minutesAway <= 35) {
        await notifyOwners(
          `Hola Suldery 💕, faltan unos 30 minutos para la cita de ${appt.client_name} (${appt.service}) a las ${formatTime12Server(timeText)}. 📱 ${clientPhone || 'sin teléfono'}. ✨`,
          `appointment-reminder-30m:${appt.id}`,
          'appointment_reminder_30m_owner_push'
        );
        if (appt.user_id) {
          await sendPushOnce(
            `appointment-reminder-30m:client:${appt.id}`,
            'appointment_reminder_30m_client_push',
            appt.user_id,
            `Hola ${firstNameOf(appt.client_name)} 💕, faltan unos 30 minutos para tu cita en Suldery Nails: ${formatTime12Server(timeText)} para ${appt.service}. 💅✨`,
            clientPanelUrl()
          );
        }
      }
    }
  } catch (error) {
    console.error('No se pudieron enviar recordatorios de citas:', error.message);
  }
}

function startOwnerNotificationBot() {
  const run = async () => {
    await sendPendingSummary();
    await sendUpcomingAppointmentReminders();
  };
  setTimeout(run, 10000);
  setInterval(run, 60 * 1000);
}

app.post('/api/appointments', authRequired, async (req, res) => {
  try {
    const user = await findUserById(req.auth.id);
    if (!user || user.role !== 'client' || user.status !== 'accepted') return res.status(403).json({ message: 'Tu cuenta no puede solicitar citas todavía.' });

    const service = String(req.body.service || '').trim();
    const date = toISODate(req.body.date);
    const time = String(req.body.time || '').trim();
    const duration = serviceDuration(service);
    if (!duration || !date || !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ message: 'Selecciona un servicio, día y hora válidos.' });
    if (isDateInPast(date)) return res.status(400).json({ message: 'La fecha ya pasó.' });

    const blocked = await isDateBlocked(date);
    if (blocked) return res.status(409).json({ message: blocked.reason ? `No hay atención ese día: ${blocked.reason}` : 'Ese día no está disponible para citas.' });

    const scheduleDay = await getScheduleDay(dateWeekday(date), date);
    if (!scheduleDay?.is_open || dateWeekday(date) === 7) return res.status(400).json({ message: 'Bebé, ese día es de descanso. Elige otro.' });

    const start = toMinutes(time);
    const end = start + duration;
    if (start % SLOT_STEP !== 0 || !slotFitsSchedule(start, end, scheduleDay)) {
      return res.status(409).json({ message: 'Ese horario está fuera de la jornada disponible o coincide con el almuerzo (12:00–13:00).' });
    }
    if (isToday(date)) {
      const currentMinutes = colombiaCurrentMinutes();
      if (start <= currentMinutes) return res.status(409).json({ message: 'Esa hora ya pasó. Elige otra.' });
    }

    const result = await withAppointmentDateLock(date, async connection => {
      const [sameExact] = await connection.query(
        `SELECT id FROM appointments
         WHERE user_id=? AND appointment_date=? AND appointment_time=? AND service=?
           AND status IN ('pending','accepted') LIMIT 1`,
        [req.auth.id, date, `${time}:00`, service]
      );
      if (sameExact.length) return { id: sameExact[0].id, alreadyExists: true };

      const lockedAppointments = await getDayAppointmentsWithConnection(connection, date);
      if (!slotIsFree(start, duration, lockedAppointments)) {
        const error = new Error('Ese horario ya no está disponible. Elige otro.');
        error.statusCode = 409;
        throw error;
      }

      const [sameOverlap] = await connection.query(
        `SELECT id FROM appointments
         WHERE user_id=? AND appointment_date=? AND status IN ('pending','accepted')
         AND appointment_time < ? AND ADDTIME(appointment_time, SEC_TO_TIME(duration_minutes*60)) > ?`,
        [req.auth.id, date, `${time}:00`, `${time}:00`]
      );
      if (sameOverlap.length) {
        const error = new Error('Ya tienes otra cita que se cruza con ese horario. Elige el espacio que está marcado como disponible.');
        error.statusCode = 409;
        throw error;
      }

      const [insertResult] = await connection.query(
        `INSERT INTO appointments(user_id,client_name,client_phone,service,duration_minutes,appointment_date,appointment_time,status)
         VALUES(?,?,?,?,?,?,?,'pending')`,
        [req.auth.id, user.name, user.phone || null, service, duration, date, `${time}:00`]
      );
      return { id: insertResult.insertId, alreadyExists: false };
    });

    if (!result.alreadyExists) {
      void notifyNewClientAppointment({ id: result.id, clientName: user.name, phone: user.phone || '', service, date, time });
    }

    const firstName = user.name.split(/\s+/)[0] || user.name;
    const prettyDate = date.split('-').reverse().join('/');
    res.status(result.alreadyExists ? 200 : 201).json({
      already_exists: result.alreadyExists,
      appointment_id: result.id,
      message: result.alreadyExists
        ? `Hola ${firstName} 💕, esta solicitud ya quedó registrada para el ${prettyDate} a las ${formatTime12Server(time)} para ${service}. Suldery ya puede revisarla; no necesitas volver a enviarla. ✨`
        : `Hola ${firstName} 💕, tu cita quedó solicitada para el ${prettyDate} a las ${formatTime12Server(time)} para ${service}. La solicitud está en espera de confirmación por parte de Suldery. Te avisaremos apenas haya una respuesta. 💕✨`
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo crear la cita.' });
  }
});

app.patch('/api/appointments/:id/cancel', authRequired, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE appointments SET status='cancelled'
       WHERE id=? AND user_id=? AND status IN ('pending','accepted')`,
      [req.params.id, req.auth.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'No se encontró la cita.' });

    const [rows] = await pool.query(
      `SELECT client_name,client_phone,service,appointment_date,appointment_time
       FROM appointments WHERE id=? LIMIT 1`,
      [req.params.id]
    );
    if (rows[0]) {
      void notifyOwnerAppointmentCancelled({
        id: req.params.id,
        clientName: rows[0].client_name,
        phone: rows[0].client_phone || '',
        service: rows[0].service,
        date: dateOnly(rows[0].appointment_date),
        time: formatDbTime(rows[0].appointment_time)
      });
    }

    res.json({ message: 'Cita cancelada.' });
  } catch {
    res.status(500).json({ message: 'No se pudo cancelar la cita.' });
  }
});

app.get('/api/portfolio', async (req, res) => {
  try {
    const visibility = String(req.query.visibility || 'client').trim();
    const allowed = ['login','client'];
    if (!allowed.includes(visibility)) return res.status(400).json({ message: 'Visibilidad inválida.' });

    const [rows] = await pool.query(
      `SELECT id,title,image_url,image_data,image_mime,visibility,display_order,created_at
       FROM portfolio_photos
       WHERE visibility IN (?, 'both')
       ORDER BY display_order ASC, created_at DESC
       LIMIT 8`,
      [visibility]
    );
    const photos = rows.map(row => ({
      id: row.id,
      title: row.title,
      image_url: row.image_data
        ? `data:${row.image_mime || 'image/jpeg'};base64,${Buffer.from(row.image_data).toString('base64')}`
        : row.image_url,
      visibility: row.visibility || 'login',
      display_order: row.display_order,
      created_at: row.created_at
    }));
    res.json({ photos });
  } catch (error) {
    console.error('No se pudo cargar el portafolio:', error.message);
    res.status(500).json({ message: 'No se pudo cargar el portafolio.' });
  }
});

app.get('/api/catalog', authRequired, async (req, res) => {
  if (req.auth.role !== 'client' && req.auth.role !== 'owner') {
    return res.status(403).json({ message: 'No tienes permiso para ver el catálogo.' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT id,title,display_order,created_at
       FROM catalog_photos
       ORDER BY display_order ASC, created_at DESC`
    );
    res.json({ photos: rows.map(row => ({
      id: row.id,
      title: row.title,
      display_order: row.display_order,
      created_at: row.created_at,
      image_url: `/api/catalog/${row.id}/image`
    })) });
  } catch (error) {
    console.error('No se pudo cargar el catálogo:', error.message);
    res.status(500).json({ message: 'No se pudo cargar el catálogo.' });
  }
});

app.get('/api/catalog/:id/image', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT image_data,image_mime FROM catalog_photos WHERE id=? LIMIT 1',
      [req.params.id]
    );
    const photo = rows[0];
    if (!photo) return res.status(404).send('Imagen no encontrada.');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type(photo.image_mime || 'image/jpeg');
    res.send(photo.image_data);
  } catch (error) {
    console.error('No se pudo cargar una imagen del catálogo:', error.message);
    res.status(500).send('No se pudo cargar la imagen.');
  }
});

app.get('/api/owner/catalog', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,title,display_order,created_at
       FROM catalog_photos
       ORDER BY display_order ASC, created_at DESC`
    );
    res.json({ photos: rows.map(row => ({
      id: row.id,
      title: row.title,
      display_order: row.display_order,
      created_at: row.created_at,
      image_url: `/api/catalog/${row.id}/image`
    })) });
  } catch (error) {
    console.error('No se pudo cargar el catálogo de Suldery:', error.message);
    res.status(500).json({ message: 'No se pudo cargar el catálogo.' });
  }
});

app.post('/api/owner/catalog', authRequired, ownerRequired, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen.' });
    const title = String(req.body.title || 'Diseño Suldery Nails').trim().slice(0, 160) || 'Diseño Suldery Nails';
    const [orderRows] = await pool.query('SELECT COALESCE(MAX(display_order),0) + 1 AS next_order FROM catalog_photos');
    const displayOrder = Number(orderRows[0].next_order) || 1;
    const [result] = await pool.query(
      'INSERT INTO catalog_photos(title,image_data,image_mime,display_order) VALUES(?,?,?,?)',
      [title, req.file.buffer, req.file.mimetype, displayOrder]
    );
    res.status(201).json({
      message: 'Foto agregada al catálogo.',
      photo: {
        id: result.insertId,
        title,
        display_order: displayOrder,
        image_url: `/api/catalog/${result.insertId}/image`
      }
    });
  } catch (error) {
    console.error('No se pudo subir una foto al catálogo:', error.message);
    res.status(500).json({ message: error.message || 'No se pudo subir la foto al catálogo.' });
  }
});

app.patch('/api/owner/catalog/:id/image', authRequired, ownerRequired, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen nueva.' });
    const [rows] = await pool.query('SELECT id FROM catalog_photos WHERE id=? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Foto de catálogo no encontrada.' });
    await pool.query(
      'UPDATE catalog_photos SET image_data=?, image_mime=? WHERE id=?',
      [req.file.buffer, req.file.mimetype, req.params.id]
    );
    res.json({ message: 'Foto del catálogo actualizada.', image_url: `/api/catalog/${req.params.id}/image` });
  } catch (error) {
    console.error('No se pudo cambiar la foto del catálogo:', error.message);
    res.status(500).json({ message: 'No se pudo cambiar la foto del catálogo.' });
  }
});

app.delete('/api/owner/catalog/:id', authRequired, ownerRequired, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM catalog_photos WHERE id=?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Foto de catálogo no encontrada.' });
    await normalizeCatalogOrder();
    res.json({ message: 'Foto eliminada del catálogo.' });
  } catch (error) {
    console.error('No se pudo eliminar la foto del catálogo:', error.message);
    res.status(500).json({ message: 'No se pudo eliminar la foto del catálogo.' });
  }
});

async function normalizeCatalogOrder() {
  const [rows] = await pool.query('SELECT id FROM catalog_photos ORDER BY display_order ASC, created_at DESC');
  for (let index = 0; index < rows.length; index++) {
    await pool.query('UPDATE catalog_photos SET display_order=? WHERE id=?', [index + 1, rows[index].id]);
  }
}

app.patch('/api/owner/catalog/:id/move', authRequired, ownerRequired, async (req, res) => {
  try {
    const direction = req.body.direction === 'up' ? 'up' : req.body.direction === 'down' ? 'down' : null;
    if (!direction) return res.status(400).json({ message: 'Movimiento inválido.' });
    const [rows] = await pool.query('SELECT id,display_order FROM catalog_photos ORDER BY display_order ASC, created_at DESC');
    const index = rows.findIndex(row => String(row.id) === String(req.params.id));
    if (index === -1) return res.status(404).json({ message: 'Foto de catálogo no encontrada.' });
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return res.json({ message: 'La foto ya está en ese extremo.' });
    const current = rows[index];
    const target = rows[targetIndex];
    await pool.query('UPDATE catalog_photos SET display_order=? WHERE id=?', [target.display_order, current.id]);
    await pool.query('UPDATE catalog_photos SET display_order=? WHERE id=?', [current.display_order, target.id]);
    await normalizeCatalogOrder();
    res.json({ message: 'Orden del catálogo actualizado.' });
  } catch (error) {
    console.error('No se pudo cambiar el orden del catálogo:', error.message);
    res.status(500).json({ message: 'No se pudo cambiar el orden del catálogo.' });
  }
});

app.get('/api/notifications/public-key', async (_req, res) => {
  try {
    if (!vapidConfig) await ensureVapidKeys();
    res.json({ publicKey: vapidConfig.publicKey });
  } catch (error) {
    console.error('No se pudo preparar la clave pública de avisos:', error.message);
    res.status(500).json({ message: 'No se pudieron preparar los avisos.' });
  }
});

app.get('/api/notifications/status', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM push_subscriptions WHERE user_id=?', [req.auth.id]);
    res.json({ subscribed: Number(rows[0]?.total || 0) > 0, devices: Number(rows[0]?.total || 0) });
  } catch {
    res.status(500).json({ message: 'No se pudo comprobar el estado de los avisos.' });
  }
});

app.post('/api/notifications/subscribe', authRequired, async (req, res) => {
  try {
    const subscription = req.body || {};
    const endpoint = String(subscription.endpoint || '').trim();
    const p256dh = String(subscription.keys?.p256dh || '').trim();
    const auth = String(subscription.keys?.auth || '').trim();
    if (!/^https:\/\//i.test(endpoint) || !p256dh || !auth) return res.status(400).json({ message: 'Suscripción de avisos inválida.' });
    const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex');
    await pool.query(
      `INSERT INTO push_subscriptions(user_id,endpoint_hash,endpoint,p256dh,auth,content_encoding)
       VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),endpoint=VALUES(endpoint),p256dh=VALUES(p256dh),auth=VALUES(auth),content_encoding=VALUES(content_encoding),updated_at=CURRENT_TIMESTAMP`,
      [req.auth.id, endpointHash, endpoint, p256dh, auth, String(subscription.contentEncoding || subscription.content_encoding || 'aes128gcm')]
    );
    res.json({ message: 'Avisos activados en este dispositivo.' });
  } catch (error) {
    console.error('No se pudo guardar la suscripción de avisos:', error.message);
    res.status(500).json({ message: 'No se pudieron activar los avisos.' });
  }
});

app.post('/api/notifications/subscribe-pending', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const subscription = req.body?.subscription || {};
    const endpoint = String(subscription.endpoint || '').trim();
    const p256dh = String(subscription.keys?.p256dh || '').trim();
    const auth = String(subscription.keys?.auth || '').trim();
    if (!token || !/^https:\/\//i.test(endpoint) || !p256dh || !auth) return res.status(400).json({ message: 'No se pudo guardar el aviso del dispositivo.' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await pool.query(
      `SELECT id,user_id FROM pending_push_registrations WHERE token_hash=? AND expires_at>NOW() AND used_at IS NULL LIMIT 1`,
      [tokenHash]
    );
    if (!rows.length) return res.status(400).json({ message: 'El permiso de avisos de registro ya venció. Puedes activarlo de nuevo al iniciar sesión.' });

    const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex');
    await pool.query(
      `INSERT INTO push_subscriptions(user_id,endpoint_hash,endpoint,p256dh,auth,content_encoding)
       VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),endpoint=VALUES(endpoint),p256dh=VALUES(p256dh),auth=VALUES(auth),content_encoding=VALUES(content_encoding),updated_at=CURRENT_TIMESTAMP`,
      [rows[0].user_id, endpointHash, endpoint, p256dh, auth, String(subscription.contentEncoding || subscription.content_encoding || 'aes128gcm')]
    );
    await pool.query('UPDATE pending_push_registrations SET used_at=NOW() WHERE id=?', [rows[0].id]);
    res.json({ message: 'Avisos activados.' });
  } catch (error) {
    console.error('No se pudo guardar el aviso pendiente:', error.message);
    res.status(500).json({ message: 'No se pudo activar el aviso de registro.' });
  }
});

app.delete('/api/notifications/subscribe', authRequired, async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (endpoint) {
      const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex');
      await pool.query('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint_hash=?', [req.auth.id, endpointHash]);
    }
    res.json({ message: 'Avisos desactivados en este dispositivo.' });
  } catch {
    res.status(500).json({ message: 'No se pudieron desactivar los avisos.' });
  }
});

app.get('/api/owner/notifications/status', authRequired, ownerRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM push_subscriptions WHERE user_id=?', [req.auth.id]);
    const devices = Number(rows[0]?.total || 0);
    res.json({ configured: true, subscribed: devices > 0, devices, mode: 'web-push-free' });
  } catch {
    res.status(500).json({ message: 'No se pudo comprobar el estado de los avisos.' });
  }
});

app.post('/api/owner/notifications/test', authRequired, ownerRequired, async (req, res) => {
  try {
    const result = await sendPushToUser(
      req.auth.id,
      'Hola Suldery 💕, este es un aviso de prueba. Las notificaciones gratuitas ya están conectadas a este dispositivo. ✨',
      ownerPanelUrl()
    );
    if (!result.sent) return res.status(503).json({ message: 'Primero pulsa “Activar avisos” en este dispositivo.' });
    res.json({ message: 'Aviso de prueba enviado. 💕' });
  } catch (error) {
    console.error('No se pudo enviar el aviso de prueba:', error.message);
    res.status(502).json({ message: 'No se pudo enviar el aviso de prueba.' });
  }
});

app.get('/api/owner/users', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,name,email,phone,role,status,created_at FROM users
       WHERE role='client'
       ORDER BY FIELD(status,'pending','accepted','rejected'),created_at DESC`
    );
    res.json({ users: rows });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar las solicitudes.' });
  }
});

app.patch('/api/owner/users/:id/status', authRequired, ownerRequired, async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!['accepted', 'rejected', 'pending'].includes(status)) return res.status(400).json({ message: 'Estado inválido.' });
    const [rows] = await pool.query(
      `SELECT id,name,email,phone,role,status FROM users WHERE id=? AND role='client' LIMIT 1`,
      [req.params.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'Clienta no encontrada.' });

    const [result] = await pool.query(
      `UPDATE users SET status=? WHERE id=? AND role='client'`,
      [status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Clienta no encontrada.' });

    if (status === 'accepted') void notifyClientAccountAccepted({ id: user.id, name: user.name, phone: user.phone });
    if (status === 'rejected') void notifyClientAccountRejected({ id: user.id, name: user.name, phone: user.phone });

    res.json({ message: 'Estado actualizado correctamente.' });
  } catch {
    res.status(500).json({ message: 'No se pudo actualizar la cuenta.' });
  }
});

app.get('/api/owner/password-recovery-requests', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id,r.user_id,r.phone,r.status,r.created_at,r.resolved_at,
              u.name,u.email,u.phone AS account_phone
       FROM password_reset_requests r
       JOIN users u ON u.id=r.user_id
       WHERE r.status='pending'
       ORDER BY r.created_at ASC`
    );
    res.json({ requests: rows });
  } catch (error) {
    console.error('No se pudieron cargar las solicitudes de recuperación:', error.message);
    res.status(500).json({ message: 'No se pudieron cargar las solicitudes de recuperación.' });
  }
});

app.patch('/api/owner/password-recovery-requests/:id/reset', authRequired, ownerRequired, async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    if (password.length < 6) return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });

    const [rows] = await pool.query(
      `SELECT r.id,r.user_id,u.name,u.email,u.phone,r.status
       FROM password_reset_requests r
       JOIN users u ON u.id=r.user_id
       WHERE r.id=? AND r.status='pending'
       LIMIT 1`,
      [req.params.id]
    );
    const request = rows[0];
    if (!request) return res.status(404).json({ message: 'La solicitud ya no está pendiente o no existe.' });

    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, request.user_id]);
    await pool.query(`UPDATE password_reset_requests SET status='resolved', resolved_at=NOW() WHERE id=?`, [request.id]);

    void sendPushToUser(request.user_id,
      `Hola ${firstNameOf(request.name)}, Suldery ya te ayudó a recuperar tu acceso. Puedes iniciar sesión con tu nueva contraseña. 💕`,
      clientPanelUrl()
    );

    res.json({ message: 'Contraseña restablecida correctamente.' });
  } catch (error) {
    console.error('No se pudo restablecer la contraseña:', error.message);
    res.status(500).json({ message: 'No se pudo restablecer la contraseña.' });
  }
});

app.patch('/api/owner/password-recovery-requests/:id/status', authRequired, ownerRequired, async (req, res) => {
  try {
    const status = String(req.body?.status || '').trim();
    if (!['resolved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Estado inválido.' });
    }
    const [result] = await pool.query(
      `UPDATE password_reset_requests
       SET status=?, resolved_at=CASE WHEN ?='pending' THEN NULL ELSE NOW() END
       WHERE id=?`,
      [status, status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Solicitud de recuperación no encontrada.' });
    res.json({ message: status === 'resolved' ? 'Solicitud marcada como atendida.' : status === 'rejected' ? 'Solicitud rechazada.' : 'Solicitud devuelta a pendientes.' });
  } catch (error) {
    console.error('No se pudo actualizar la solicitud de recuperación:', error.message);
    res.status(500).json({ message: 'No se pudo actualizar la solicitud de recuperación.' });
  }
});

app.get('/api/owner/appointments', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id,a.client_name,COALESCE(a.client_phone,u.phone) AS client_phone,a.service,a.duration_minutes,a.appointment_date,a.appointment_time,a.status,u.email AS client_email
       FROM appointments a LEFT JOIN users u ON u.id=a.user_id
       ORDER BY a.appointment_date,a.appointment_time`
    );
    res.json({ appointments: rows });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar las citas.' });
  }
});

app.patch('/api/owner/appointments/:id/status', authRequired, ownerRequired, async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!['accepted', 'rejected', 'cancelled', 'pending'].includes(status)) return res.status(400).json({ message: 'Estado inválido.' });

    const [rows] = await pool.query(
      `SELECT a.id,a.client_name,a.client_phone,a.service,a.appointment_date,a.appointment_time,a.user_id,
              u.phone AS user_phone
       FROM appointments a
       LEFT JOIN users u ON u.id=a.user_id
       WHERE a.id=? LIMIT 1`,
      [req.params.id]
    );
    const appointment = rows[0];
    if (!appointment) return res.status(404).json({ message: 'Cita no encontrada.' });

    const [result] = await pool.query('UPDATE appointments SET status=? WHERE id=?', [status, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Cita no encontrada.' });

    const phone = appointment.client_phone || appointment.user_phone || '';
    const details = {
      id: appointment.id,
      clientName: appointment.client_name,
      phone,
      service: appointment.service,
      date: dateOnly(appointment.appointment_date),
      time: formatDbTime(appointment.appointment_time)
    };

    if (status === 'accepted') void notifyClientAppointmentAccepted(details);
    if (status === 'rejected') void notifyClientAppointmentRejected(details);
    if (status === 'cancelled') void notifyClientAppointmentCancelled(details);

    res.json({ message: status === 'accepted' ? 'Cita confirmada. La clienta recibirá un aviso en su dispositivo si activó las notificaciones.' : 'Estado de la cita actualizado.' });
  } catch {
    res.status(500).json({ message: 'No se pudo actualizar la cita.' });
  }
});


async function getOwnerDayAppointments(date) {
  const [rows] = await pool.query(
    `SELECT a.id,
            a.client_name,
            COALESCE(a.client_phone, u.phone) AS client_phone,
            a.service,
            a.duration_minutes,
            a.appointment_date,
            a.appointment_time,
            a.status,
            u.email AS client_email,
            a.user_id
     FROM appointments a
     LEFT JOIN users u ON u.id=a.user_id
     WHERE a.appointment_date=?
       AND a.status IN ('pending','accepted')
     ORDER BY a.appointment_time`,
    [date]
  );
  return rows.map(row => ({
    id: row.id,
    client_name: row.client_name,
    client_phone: row.client_phone || '',
    client_email: row.client_email || '',
    service: row.service,
    duration_minutes: Number(row.duration_minutes) || 60,
    appointment_date: dateOnly(row.appointment_date),
    appointment_time: formatDbTime(row.appointment_time),
    status: row.status,
    user_id: row.user_id
  }));
}

function monthDateList(year, monthNumber) {
  const totalDays = new Date(year, monthNumber, 0).getDate();
  const days = [];
  for (let day = 1; day <= totalDays; day++) {
    days.push(`${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return days;
}

app.get('/api/owner/calendar', authRequired, ownerRequired, async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ message: 'Mes inválido.' });
    const [year, monthNumber] = month.split('-').map(Number);
    if (monthNumber < 1 || monthNumber > 12) return res.status(400).json({ message: 'Mes inválido.' });

    const dates = monthDateList(year, monthNumber);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const [appointmentRows] = await pool.query(
      `SELECT appointment_date, appointment_time, duration_minutes, status
       FROM appointments
       WHERE appointment_date BETWEEN ? AND ?
         AND status IN ('pending','accepted')
       ORDER BY appointment_date, appointment_time`,
      [startDate, endDate]
    );

    const grouped = new Map();
    for (const row of appointmentRows) {
      const date = dateOnly(row.appointment_date);
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date).push(row);
    }

    const blockedRows = await getBlockedDates(startDate, endDate);
    const blockedMap = new Map(blockedRows.map(row => [row.date, row]));
    const blockedIntervalsMap = await getBlockedIntervalsMap(startDate, endDate);

    const days = [];
    for (const date of dates) {
      const appointments = grouped.get(date) || [];
      const blocked = blockedMap.get(date);
      const scheduleDay = await getScheduleDay(dateWeekday(date), date);
      let status = 'available';
      let label = 'Libre';
      if (blocked) {
        status = 'blocked';
        label = 'Bloqueado';
      } else if (!scheduleDay?.is_open || dateWeekday(date) === 7) {
        status = 'rest';
        label = 'Descanso';
      } else if (appointments.length) {
        const pending = appointments.filter(item => item.status === 'pending').length;
        status = pending ? 'pending' : 'appointments';
        label = pending ? `${pending} pendiente${pending === 1 ? '' : 's'}` : `${appointments.length} cita${appointments.length === 1 ? '' : 's'}`;
      } else if ((blockedIntervalsMap.get(date) || []).length) {
        status = 'available';
        label = 'Con horas bloqueadas';
      }

      days.push({
        date,
        status,
        label,
        appointment_count: appointments.length,
        pending_count: appointments.filter(item => item.status === 'pending').length,
        accepted_count: appointments.filter(item => item.status === 'accepted').length
      });
    }

    res.json({ month, days });
  } catch (error) {
    console.error('No se pudo cargar el calendario de la dueña:', error);
    res.status(500).json({ message: 'No se pudo cargar el calendario de la dueña.' });
  }
});

app.get('/api/owner/calendar/day', authRequired, ownerRequired, async (req, res) => {
  try {
    const date = toISODate(req.query.date);
    const service = String(req.query.service || 'Manicure semipermanente');
    const duration = serviceDuration(service);
    if (!date || !duration) return res.status(400).json({ message: 'Fecha o servicio inválido.' });

    const blocked = await isDateBlocked(date);
    const scheduleDay = await getScheduleDay(dateWeekday(date), date);
    const appointments = await getOwnerDayAppointments(date);
    const blockedIntervals = await getBlockedIntervals(date);
    const isPast = isDateInPast(date);
    const freeSlots = blocked || !scheduleDay?.is_open || dateWeekday(date) === 7 || isPast
      ? []
      : slotsForDate(date, scheduleDay, appointments, duration, blockedIntervals);

    res.json({
      date,
      service,
      duration,
      is_past: isPast,
      blocked: blocked || null,
      blocked_intervals: blockedIntervals,
      schedule: scheduleDay?.intervals || [],
      appointments,
      free_slots: freeSlots
    });
  } catch (error) {
    console.error('No se pudo cargar el día del calendario de la dueña:', error);
    res.status(500).json({ message: 'No se pudo cargar el detalle del día.' });
  }
});

app.get('/api/owner/schedule', authRequired, ownerRequired, async (_req, res) => {
  try { res.json({ schedule: await getSchedule() }); }
  catch { res.status(500).json({ message: 'No se pudo cargar el horario.' }); }
});

app.get('/api/owner/schedule-editor', authRequired, ownerRequired, async (_req, res) => {
  try { res.json(await getScheduleEditorData()); }
  catch { res.status(500).json({ message: 'No se pudo cargar el configurador de horario.' }); }
});

app.put('/api/owner/schedule-editor', authRequired, ownerRequired, async (req, res) => {
  try {
    const weekly = await saveWeeklySchedule(req.body?.weekly);
    res.json({ message: 'Horario semanal guardado correctamente.', weekly });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo guardar el horario.' });
  }
});

app.post('/api/owner/schedule-overrides', authRequired, ownerRequired, async (req, res) => {
  try {
    const date = toISODate(req.body?.date);
    if (!date || isDateInPast(date)) return res.status(400).json({ message: 'Selecciona una fecha futura válida.' });
    const isOpen = Boolean(req.body?.is_open);
    const note = String(req.body?.note || '').trim().slice(0, 255);
    const intervals = isOpen ? sanitizeIntervals(req.body?.intervals || []) : [];
    if (isOpen && !intervals.length) return res.status(400).json({ message: 'Agrega al menos un tramo horario para esa fecha.' });
    await buildBlockedDateCache();
    const currentWeeklySchedule = await getSchedule();
    await validateScheduleAgainstAppointments(currentWeeklySchedule, date, { is_open: isOpen, intervals });
    blockedDateCache = null;
    await pool.query(
      `INSERT INTO schedule_overrides(override_date,is_open,intervals_json,note) VALUES(?,?,?,?)
       ON DUPLICATE KEY UPDATE is_open=VALUES(is_open),intervals_json=VALUES(intervals_json),note=VALUES(note)`,
      [date, isOpen ? 1 : 0, JSON.stringify(intervals), note || null]
    );
    res.status(201).json({ message: isOpen ? 'Horario especial guardado.' : 'Día marcado como descanso especial.', date, is_open: isOpen, intervals, note });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo guardar el horario especial.' });
  }
});

app.delete('/api/owner/schedule-overrides/:date', authRequired, ownerRequired, async (req, res) => {
  try {
    const date = toISODate(req.params.date);
    if (!date) return res.status(400).json({ message: 'Fecha inválida.' });
    const [result] = await pool.query('DELETE FROM schedule_overrides WHERE override_date=?', [date]);
    if (!result.affectedRows) return res.status(404).json({ message: 'No existe una excepción para esa fecha.' });
    res.json({ message: 'Horario especial eliminado.' });
  } catch {
    res.status(500).json({ message: 'No se pudo eliminar el horario especial.' });
  }
});

app.get('/api/owner/blocked-dates', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [fullRows] = await pool.query(
      'SELECT id,blocked_date,reason FROM blocked_dates ORDER BY blocked_date'
    );
    const [partialRows] = await pool.query(
      'SELECT id,blocked_date,start_time,end_time,reason FROM blocked_intervals ORDER BY blocked_date,start_time'
    );

    res.json({
      dates: fullRows.map(row => ({
        id: row.id,
        type: 'full',
        date: dateOnly(row.blocked_date),
        reason: row.reason || '',
        intervals: []
      })),
      hours: partialRows.map(row => ({
        id: row.id,
        type: 'hours',
        date: dateOnly(row.blocked_date),
        start_time: formatDbTime(row.start_time),
        end_time: formatDbTime(row.end_time),
        reason: row.reason || ''
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudieron cargar los bloqueos.' });
  }
});

app.post('/api/owner/blocked-dates', authRequired, ownerRequired, async (req, res) => {
  try {
    const date = toISODate(req.body.date);
    const reason = String(req.body.reason || '').trim().slice(0, 255);
    const mode = req.body.mode === 'hours' ? 'hours' : 'full';
    if (!date) return res.status(400).json({ message: 'Selecciona una fecha válida.' });
    if (isDateInPast(date)) return res.status(400).json({ message: 'No puedes bloquear una fecha que ya pasó.' });

    const existingAppointments = await getDayAppointments(date);

    if (mode === 'full') {
      if (existingAppointments.length) {
        return res.status(409).json({ message: 'No puedes bloquear todo el día porque ya tiene citas. Primero cancélalas o reubícalas.' });
      }

      await pool.query(
        `INSERT INTO blocked_dates(blocked_date,reason) VALUES(?,?)
         ON DUPLICATE KEY UPDATE reason=VALUES(reason)`,
        [date, reason || null]
      );
      await pool.query('DELETE FROM blocked_intervals WHERE blocked_date=?', [date]);

      return res.status(201).json({ message: 'Día bloqueado correctamente.', date, reason });
    }

    const rawIntervals = Array.isArray(req.body.intervals) ? req.body.intervals : [];
    if (!rawIntervals.length) return res.status(400).json({ message: 'Agrega al menos un tramo de horas para bloquear.' });
    if (await isDateBlocked(date)) return res.status(409).json({ message: 'Ese día ya está bloqueado completo.' });

    const intervals = sanitizeIntervals(rawIntervals);
    const ordered = intervals.map(item => ({
      start_time: item.start_time,
      end_time: item.end_time,
      start: toMinutes(item.start_time),
      end: toMinutes(item.end_time)
    }));

    for (let i = 0; i < ordered.length; i++) {
      const block = ordered[i];
      const overlappingAppointment = existingAppointments.find(appt => {
        const apptStart = toMinutes(formatDbTime(appt.appointment_time));
        const apptEnd = apptStart + (Number(appt.duration_minutes) || 60);
        return block.start < apptEnd && block.end > apptStart;
      });
      if (overlappingAppointment) {
        return res.status(409).json({ message: `No puedes bloquear ${block.start_time}–${block.end_time} porque se cruza con una cita ya agendada.` });
      }
      const duplicate = ordered.slice(i + 1).some(other => block.start < other.end && block.end > other.start);
      if (duplicate) return res.status(400).json({ message: 'Los bloqueos de horas no pueden cruzarse entre sí.' });
    }

    for (const interval of ordered) {
      await pool.query(
        `INSERT INTO blocked_intervals(blocked_date,start_time,end_time,reason)
         VALUES(?,?,?,?)
         ON DUPLICATE KEY UPDATE reason=VALUES(reason)`,
        [date, `${interval.start_time}:00`, `${interval.end_time}:00`, reason || null]
      );
    }

    res.status(201).json({ message: 'Horas bloqueadas correctamente.', date, intervals, reason });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo guardar el bloqueo.' });
  }
});

app.delete('/api/owner/blocked-dates/:id', authRequired, ownerRequired, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM blocked_dates WHERE id=?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Día bloqueado no encontrado.' });
    res.json({ message: 'Día desbloqueado correctamente.' });
  } catch {
    res.status(500).json({ message: 'No se pudo desbloquear el día.' });
  }
});

app.delete('/api/owner/blocked-hours/:id', authRequired, ownerRequired, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM blocked_intervals WHERE id=?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Bloqueo de horas no encontrado.' });
    res.json({ message: 'Bloqueo de horas eliminado.' });
  } catch {
    res.status(500).json({ message: 'No se pudo quitar el bloqueo de horas.' });
  }
});

app.get('/api/owner/slots', authRequired, ownerRequired, async (req, res) => {
  try {
    const date = toISODate(req.query.date);
    const service = String(req.query.service || 'Manicure semipermanente');
    const duration = serviceDuration(service);
    if (!date || !duration) return res.status(400).json({ message: 'Fecha o servicio inválido.' });
    if (isDateInPast(date)) return res.json({ date, service, duration, slots: [] });

    const blocked = await isDateBlocked(date);
    if (blocked) return res.json({ date, service, duration, slots: [] });
    const scheduleDay = await getScheduleDay(dateWeekday(date), date);
    if (!scheduleDay?.is_open || dateWeekday(date) === 7) return res.json({ date, service, duration, slots: [] });
    const [appointments, blockedIntervals] = await Promise.all([getDayAppointments(date), getBlockedIntervals(date)]);
    res.json({ date, service, duration, slots: slotsForDate(date, scheduleDay, appointments, duration, blockedIntervals) });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar los horarios.' });
  }
});

app.post('/api/owner/appointments', authRequired, ownerRequired, async (req, res) => {
  try {
    const clientName = String(req.body.clientName || '').trim();
    const clientPhone = String(req.body.clientPhone || '').trim();
    const service = String(req.body.service || '').trim();
    const date = toISODate(req.body.date);
    const time = String(req.body.time || '').trim();
    const duration = serviceDuration(service);
    if (!clientName || !duration || !date || !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ message: 'Completa todos los datos.' });
    if (clientPhone && !/^\+?[0-9][0-9\s().-]{6,18}$/.test(clientPhone)) return res.status(400).json({ message: 'El teléfono de la clienta no es válido.' });
    if (isDateInPast(date)) return res.status(400).json({ message: 'La fecha ya pasó.' });

    const blocked = await isDateBlocked(date);
    if (blocked) return res.status(409).json({ message: blocked.reason ? `No hay atención ese día: ${blocked.reason}` : 'Ese día no está disponible para citas.' });

    const scheduleDay = await getScheduleDay(dateWeekday(date), date);
    if (!scheduleDay?.is_open || dateWeekday(date) === 7) return res.status(400).json({ message: 'Ese día está marcado como descanso.' });

    const start = toMinutes(time);
    const end = start + duration;
    if (start % SLOT_STEP !== 0 || !slotFitsSchedule(start, end, scheduleDay)) {
      return res.status(409).json({ message: 'Ese horario está fuera de tu jornada o coincide con el almuerzo (12:00–13:00).' });
    }
    if (isToday(date)) {
      const currentMinutes = colombiaCurrentMinutes();
      if (start <= currentMinutes) return res.status(409).json({ message: 'Esa hora ya pasó. Elige otra.' });
    }
    await withAppointmentDateLock(date, async connection => {
      const lockedAppointments = await getDayAppointmentsWithConnection(connection, date);
      if (!slotIsFree(start, duration, lockedAppointments)) {
        const error = new Error('Ese horario está ocupado.');
        error.statusCode = 409;
        throw error;
      }
      await connection.query(
        `INSERT INTO appointments(user_id,client_name,client_phone,service,duration_minutes,appointment_date,appointment_time,status)
         VALUES(NULL,?,?,?,?,?,?,'accepted')`,
        [clientName, clientPhone || null, service, duration, date, `${time}:00`]
      );
    });
    res.status(201).json({ message: 'Cita manual registrada y confirmada.' });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo registrar la cita.' });
  }
});

app.get('/api/owner/portfolio', authRequired, ownerRequired, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,title,image_url,image_data,image_mime,visibility,display_order,created_at
       FROM portfolio_photos
       ORDER BY display_order ASC, created_at DESC`
    );

    const photos = rows.map(row => ({
      id: row.id,
      title: row.title,
      visibility: row.visibility || 'login',
      image_url: row.image_data
        ? `data:${row.image_mime || 'image/jpeg'};base64,${Buffer.from(row.image_data).toString('base64')}`
        : row.image_url,
      display_order: row.display_order,
      created_at: row.created_at
    }));

    res.json({ photos });
  } catch (error) {
    console.error('No se pudo cargar el portafolio de Suldery:', error.message);
    res.status(500).json({ message: 'No se pudo cargar el portafolio.' });
  }
});

app.post('/api/owner/portfolio', authRequired, ownerRequired, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen.' });
    const title = String(req.body.title || 'Diseño Suldery Nails').trim().slice(0, 120) || 'Diseño Suldery Nails';
    const visibility = ['login','client'].includes(String(req.body.visibility || 'login')) ? String(req.body.visibility || 'login') : 'login';

    // Límites independientes: 8 fotos para el inicio y 10 para la galería privada de clientas.
    // Se cuentan también las fotos antiguas marcadas como "both" para no sobrepasar los límites.
    const maxPhotos = visibility === 'client' ? 10 : 8;
    const visibilityWhere = visibility === 'client' ? `visibility IN ('client','both')` : `visibility IN ('login','both')`;
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM portfolio_photos WHERE ${visibilityWhere}`);
    if (Number(countRows[0].total) >= maxPhotos) {
      return res.status(409).json({
        message: visibility === 'client'
          ? 'Ya tienes 10 fotos de clientas. Elimina o cambia una foto antes de subir otra.'
          : 'Ya tienes 8 fotos de inicio. Elimina o cambia una foto antes de subir otra.'
      });
    }
    const [orderRows] = await pool.query('SELECT COALESCE(MAX(display_order),0) + 1 AS next_order FROM portfolio_photos');
    const displayOrder = Number(orderRows[0].next_order) || 1;
    const [result] = await pool.query(
      'INSERT INTO portfolio_photos(title,image_url,image_data,image_mime,visibility,display_order) VALUES(?,?,?,?,?,?)',
      [title, '', req.file.buffer, req.file.mimetype, visibility, displayOrder]
    );
    res.status(201).json({
      photo: {
        id: result.insertId,
        title,
        visibility,
        image_url: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
        display_order: displayOrder
      }
    });
  } catch (error) {
    console.error('No se pudo subir la foto:', error);
    res.status(500).json({ message: error.message || 'No se pudo subir la foto.' });
  }
});

app.patch('/api/owner/portfolio/:id/visibility', authRequired, ownerRequired, async (req, res) => {
  try {
    const visibility = String(req.body.visibility || '').trim();
    if (!['login','client'].includes(visibility)) {
      return res.status(400).json({ message: 'Visibilidad inválida.' });
    }

    const [result] = await pool.query(
      'UPDATE portfolio_photos SET visibility=? WHERE id=?',
      [visibility, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Foto no encontrada.' });
    res.json({ message: 'Dónde se muestra la foto actualizado.', visibility });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo actualizar la visibilidad de la foto.' });
  }
});

app.patch('/api/owner/portfolio/:id/image', authRequired, ownerRequired, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen nueva.' });
    const [rows] = await pool.query('SELECT id FROM portfolio_photos WHERE id=? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Foto no encontrada.' });

    await pool.query(
      'UPDATE portfolio_photos SET image_url=?, image_data=?, image_mime=? WHERE id=?',
      ['', req.file.buffer, req.file.mimetype, req.params.id]
    );

    res.json({
      message: 'Foto actualizada correctamente.',
      image_url: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    });
  } catch (error) {
    console.error('No se pudo cambiar la foto:', error.message);
    res.status(500).json({ message: 'No se pudo cambiar la foto.' });
  }
});

app.delete('/api/owner/portfolio/:id' , authRequired, ownerRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM portfolio_photos WHERE id=?', [req.params.id]);
    const photo = rows[0];
    if (!photo) return res.status(404).json({ message: 'Foto no encontrada.' });

    await pool.query('DELETE FROM portfolio_photos WHERE id=?', [req.params.id]);
    if (photo.image_url && photo.image_url.startsWith('/uploads/portfolio/')) {
      const fileName = decodeURIComponent(photo.image_url.replace('/uploads/portfolio/', ''));
      const filePath = path.join(uploadDir, fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await normalizePortfolioOrder();
    res.json({ message: 'Foto eliminada.' });
  } catch {
    res.status(500).json({ message: 'No se pudo eliminar la foto.' });
  }
});

async function normalizePortfolioOrder() {
  const [rows] = await pool.query('SELECT id FROM portfolio_photos ORDER BY display_order ASC, created_at DESC');
  for (let index = 0; index < rows.length; index++) {
    await pool.query('UPDATE portfolio_photos SET display_order=? WHERE id=?', [index + 1, rows[index].id]);
  }
}

app.patch('/api/owner/portfolio/:id/move', authRequired, ownerRequired, async (req, res) => {
  try {
    const direction = req.body.direction === 'up' ? 'up' : req.body.direction === 'down' ? 'down' : null;
    if (!direction) return res.status(400).json({ message: 'Movimiento inválido.' });

    const [rows] = await pool.query(
      'SELECT id,display_order FROM portfolio_photos ORDER BY display_order ASC, created_at DESC'
    );
    const index = rows.findIndex(row => String(row.id) === String(req.params.id));
    if (index === -1) return res.status(404).json({ message: 'Foto no encontrada.' });
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return res.json({ message: 'La foto ya está en ese extremo.' });

    const current = rows[index];
    const target = rows[targetIndex];
    await pool.query('UPDATE portfolio_photos SET display_order=? WHERE id=?', [target.display_order, current.id]);
    await pool.query('UPDATE portfolio_photos SET display_order=? WHERE id=?', [current.display_order, target.id]);
    await normalizePortfolioOrder();
    res.json({ message: 'Orden del portafolio actualizado.' });
  } catch {
    res.status(500).json({ message: 'No se pudo cambiar el orden de las fotos.' });
  }
});

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ message: error.message || 'Solicitud inválida.' });
});

(async () => {
  try {
    ensureUploadDirectory();
    await initDatabase();
    await ensureDefaultSchedule();
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      phone VARCHAR(30) NOT NULL,
      status ENUM('pending','resolved','rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_password_reset_user (user_id),
      KEY idx_password_reset_status_created (status, created_at),
      CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await pool.query(`ALTER TABLE portfolio_photos ADD COLUMN visibility ENUM('login','client','both') NOT NULL DEFAULT 'both' AFTER image_mime`)
      .catch(error => {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      });
    await pool.query(`ALTER TABLE portfolio_photos ADD COLUMN display_order INT NOT NULL DEFAULT 0`)
      .catch(error => {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      });
    await normalizePortfolioOrder();
    await ensureVapidKeys();
    app.listen(PORT, () => {
      console.log(`Suldery Nails funcionando en el puerto ${PORT}`);
      console.log('Avisos gratuitos por notificación web preparados.');
      startOwnerNotificationBot();
    });
  } catch (error) {
    console.error('\nNo se pudo iniciar Suldery Nails.');
    console.error(error.message);
    console.error('\nRevisa tu archivo .env y las credenciales de MySQL.\n');
    process.exit(1);
  }
})();
