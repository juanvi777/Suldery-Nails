const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
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
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)) return true;
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
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
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

  for (const appt of appointmentRows) {
    const date = appt.appointment_date instanceof Date ? appt.appointment_date.toISOString().slice(0,10) : String(appt.appointment_date).slice(0,10);
    if (isDateBlockedCached(date)) continue;
    const override = existingOverrides.get(date);
    const weekday = dateWeekday(date);
    const daySchedule = override || { is_open: Array.isArray(weeklySchedule[weekday]) && weeklySchedule[weekday].length > 0, intervals: weeklySchedule[weekday] || [] };
    const start = toMinutes(appt.appointment_time);
    const duration = Number(appt.duration_minutes) || 60;
    if (!daySchedule.is_open || !slotFitsSchedule(start, start + duration, daySchedule)) {
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

function slotFitsSchedule(start, end, scheduleDay) {
  if (!scheduleDay?.is_open || !Array.isArray(scheduleDay.intervals)) return false;
  if (slotOverlapsLunch(start, end)) return false;
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

function slotsForDate(date, scheduleDay, appointments, duration = 60) {
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
      if (!slotFitsSchedule(minute, slotEnd, scheduleDay)) continue;
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
    await pool.query(
      `INSERT INTO users(name,email,phone,password_hash,role,status) VALUES(?,?,?,?,'client','pending')`,
      [name, email, phone, passwordHash]
    );
    void notifyNewClientAccount({ name, email, phone });
    res.status(201).json({ message: `Solicitud enviada a Suldery. Tu cuenta queda pendiente de aprobación. Teléfono registrado: ${phone}. Suldery podrá llamarte o escribirte si necesita comunicarse contigo.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo crear la cuenta.' });
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

      const slots = slotsForDate(date, scheduleDay, grouped.get(date) || [], duration);
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

    const appointments = await getDayAppointments(date);
    const slots = slotsForDate(date, scheduleDay, appointments, duration);
    res.json({ date, service, duration, slots, message: dayMessage(date, scheduleDay, slots) });
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

async function sendOwnerSms(message) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const to = String(process.env.OWNER_SMS_TO || '').trim();
  const from = String(process.env.TWILIO_FROM || '').trim();
  if (!accountSid || !authToken || !to || !from) return { sent: false, skipped: true };

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twilio ${response.status}: ${detail.slice(0, 300)}`);
  }
  return { sent: true };
}

async function notifyNewClientAccount({ name, email, phone }) {
  try {
    return await sendOwnerSms(
      `Suldery Nails: nueva cuenta pendiente. ${name} · ${email} · Tel: ${phone}. Revisa y acepta/rechaza: https://suldery-nails-production.up.railway.app/duena.html`
    );
  } catch (error) {
    console.error('No se pudo enviar el SMS por nueva cuenta:', error.message);
    return { sent: false, error: error.message };
  }
}

async function notifyNewClientAppointment({ clientName, phone, service, date, time }) {
  try {
    return await sendOwnerSms(
      `Suldery Nails: nueva cita pendiente. ${clientName} · Tel: ${phone || 'sin teléfono'} · ${service} · ${date.split('-').reverse().join('/')} ${time}. Revisa y confirma: https://suldery-nails-production.up.railway.app/duena.html`
    );
  } catch (error) {
    console.error('No se pudo enviar el SMS a la dueña:', error.message);
    return { sent: false, error: error.message };
  }
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

    await withAppointmentDateLock(date, async connection => {
      const lockedAppointments = await getDayAppointmentsWithConnection(connection, date);
      if (!slotIsFree(start, duration, lockedAppointments)) {
        const error = new Error('Ese horario ya no está disponible. Elige otro.');
        error.statusCode = 409;
        throw error;
      }
      const [same] = await connection.query(
        `SELECT id FROM appointments
         WHERE user_id=? AND appointment_date=? AND status IN ('pending','accepted')
         AND appointment_time < ? AND ADDTIME(appointment_time, SEC_TO_TIME(duration_minutes*60)) > ?`,
        [req.auth.id, date, `${time}:00`, `${time}:00`]
      );
      if (same.length) {
        const error = new Error('Ya tienes una cita que se cruza con ese horario.');
        error.statusCode = 409;
        throw error;
      }
      await connection.query(
        `INSERT INTO appointments(user_id,client_name,client_phone,service,duration_minutes,appointment_date,appointment_time,status)
         VALUES(?,?,?,?,?,?,?,'pending')`,
        [req.auth.id, user.name, user.phone || null, service, duration, date, `${time}:00`]
      );
    });
    void notifyNewClientAppointment({ clientName: user.name, phone: user.phone || '', service, date, time });
    res.status(201).json({ message: `Solicitud de cita enviada a Suldery. Queda pendiente de confirmación. Teléfono registrado: ${user.phone || 'sin teléfono'}.` });
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
    res.json({ message: 'Cita cancelada.' });
  } catch {
    res.status(500).json({ message: 'No se pudo cancelar la cita.' });
  }
});

app.get('/api/portfolio', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,title,image_url,display_order,created_at
       FROM portfolio_photos ORDER BY display_order ASC, created_at DESC LIMIT 6`
    );
    res.json({ photos: rows });
  } catch {
    res.status(500).json({ message: 'No se pudo cargar el portafolio.' });
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
    const [result] = await pool.query(
      `UPDATE users SET status=? WHERE id=? AND role='client'`,
      [status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Clienta no encontrada.' });
    res.json({ message: 'Estado actualizado correctamente.' });
  } catch {
    res.status(500).json({ message: 'No se pudo actualizar la cuenta.' });
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
    const [result] = await pool.query('UPDATE appointments SET status=? WHERE id=?', [status, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Cita no encontrada.' });
    res.json({ message: 'Estado de la cita actualizado.' });
  } catch {
    res.status(500).json({ message: 'No se pudo actualizar la cita.' });
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
    const [rows] = await pool.query('SELECT id, blocked_date, reason FROM blocked_dates ORDER BY blocked_date');
    res.json({
      dates: rows.map(row => ({
        id: row.id,
        date: row.blocked_date instanceof Date ? row.blocked_date.toISOString().slice(0, 10) : String(row.blocked_date).slice(0, 10),
        reason: row.reason || ''
      }))
    });
  } catch {
    res.status(500).json({ message: 'No se pudieron cargar los días bloqueados.' });
  }
});

app.post('/api/owner/blocked-dates', authRequired, ownerRequired, async (req, res) => {
  try {
    const date = toISODate(req.body.date);
    const reason = String(req.body.reason || '').trim().slice(0, 255);
    if (!date) return res.status(400).json({ message: 'Selecciona una fecha válida.' });
    if (isDateInPast(date)) return res.status(400).json({ message: 'No puedes bloquear una fecha que ya pasó.' });
    const existingAppointments = await getDayAppointments(date);
    if (existingAppointments.length) return res.status(409).json({ message: 'No puedes bloquear ese día porque ya tiene citas pendientes o confirmadas. Primero cancélalas o reubícalas.' });
    const result = await pool.query(
      `INSERT INTO blocked_dates(blocked_date,reason) VALUES(?,?)
       ON DUPLICATE KEY UPDATE reason=VALUES(reason)`,
      [date, reason || null]
    );
    res.status(201).json({ message: 'Día bloqueado correctamente.', date, reason, result: result[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'No se pudo bloquear el día.' });
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
    const appointments = await getDayAppointments(date);
    res.json({ date, service, duration, slots: slotsForDate(date, scheduleDay, appointments, duration) });
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

app.post('/api/owner/portfolio', authRequired, ownerRequired, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen.' });
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM portfolio_photos');
    if (Number(countRows[0].total) >= 6) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ message: 'Ya tienes 6 fotos. Elimina una antes de subir otra.' });
    }

    const title = String(req.body.title || 'Diseño Suldery Nails').trim().slice(0, 120) || 'Diseño Suldery Nails';
    const imageUrl = `/uploads/portfolio/${encodeURIComponent(req.file.filename)}`;
    const [orderRows] = await pool.query('SELECT COALESCE(MAX(display_order),0) + 1 AS next_order FROM portfolio_photos');
    const displayOrder = Number(orderRows[0].next_order) || 1;
    const [result] = await pool.query(
      'INSERT INTO portfolio_photos(title,image_url,display_order) VALUES(?,?,?)',
      [title, imageUrl, displayOrder]
    );
    res.status(201).json({ photo: { id: result.insertId, title, image_url: imageUrl, display_order: displayOrder } });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: error.message || 'No se pudo subir la foto.' });
  }
});

app.delete('/api/owner/portfolio/:id', authRequired, ownerRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_url FROM portfolio_photos WHERE id=?', [req.params.id]);
    const photo = rows[0];
    if (!photo) return res.status(404).json({ message: 'Foto no encontrada.' });

    await pool.query('DELETE FROM portfolio_photos WHERE id=?', [req.params.id]);
    const fileName = decodeURIComponent(photo.image_url.replace('/uploads/portfolio/', ''));
    const filePath = path.join(uploadDir, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    await pool.query(`ALTER TABLE portfolio_photos ADD COLUMN display_order INT NOT NULL DEFAULT 0`)
      .catch(error => {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
      });
    await normalizePortfolioOrder();
    app.listen(PORT, () => console.log(`Suldery Nails funcionando en http://localhost:${PORT}`));
  } catch (error) {
    console.error('\nNo se pudo iniciar Suldery Nails.');
    console.error(error.message);
    console.error('\nRevisa tu archivo .env y las credenciales de MySQL.\n');
    process.exit(1);
  }
})();
