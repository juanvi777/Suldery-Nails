$ErrorActionPreference = 'Stop'
$root = Read-Host 'Pega la ruta de la carpeta raíz de Suldery Nails (la que contiene server.js)'
if (-not (Test-Path (Join-Path $root 'server.js'))) { throw "No encuentro server.js en esa carpeta. No se modificó nada." }
if (-not (Test-Path (Join-Path $root 'public\index.html'))) { throw "No encuentro public\index.html. No se modificó nada." }
if (-not (Test-Path (Join-Path $root 'public\cliente.html'))) { throw "No encuentro public\cliente.html. No se modificó nada." }
if (-not (Test-Path (Join-Path $root 'public\duena.html'))) { throw "No encuentro public\duena.html. No se modificó nada." }
$pkg = Split-Path -Parent $MyInvocation.MyCommand.Path
foreach ($f in @('suldery-redisenio.css','suldery-experience.js','suldery-reprogramar-cita.js','suldery-mascota.svg','suldery-marco-horizontal.svg','suldery-marco-vertical.svg')) {
  if (-not (Test-Path (Join-Path $pkg $f))) { throw "Falta $f dentro del ZIP." }
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path (Split-Path -Parent $root) ("backup-suldery-redisenio-" + $stamp)
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Write-Host "Copia de seguridad: $backup" -ForegroundColor Cyan

function Backup-File([string]$path) {
  if (-not (Test-Path $path)) { return }
  $rel = $path.Substring($root.Length).TrimStart('\')
  $dest = Join-Path $backup $rel
  New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  Copy-Item $path $dest -Force
}
function Ensure-Style([string]$html) {
  if ($html -notmatch 'suldery-redisenio\.css') {
    $tag = '<link rel="stylesheet" href="suldery-redisenio.css?v=20261015-final03">'
    $html = [regex]::Replace($html,'(?i)</head>',($tag + "`r`n</head>"),1)
  }
  return $html
}
function Ensure-Script([string]$html,[string]$file) {
  $escaped = [regex]::Escape($file)
  if ($html -notmatch $escaped) {
    $tag = '<script src="' + $file + '?v=20261015-final03" defer></script>'
    $html = [regex]::Replace($html,'(?i)</body>',($tag + "`r`n</body>"),1)
  }
  return $html
}
function Patch-ClientHtml([string]$html) {
  $pattern = '(?s)\s*<section class="portfolio-section" id="exclusivePhotosSection">.*?</section>'
  $match = [regex]::Match($html,$pattern)
  if ($match.Success) { $html = $html.Remove($match.Index,$match.Length) }
  return (Ensure-Script $html 'suldery-experience.js')
}
function Patch-LoginHtml([string]$html) {
  return (Ensure-Script $html 'suldery-experience.js')
}
function Patch-OwnerHtml([string]$html) {
  return (Ensure-Script $html 'suldery-reprogramar-cita.js')
}

# Preparar y validar todos los cambios de código antes de escribirlos.
$changes = @{}
$serverPath = Join-Path $root 'server.js'
$ownerJsPath = Join-Path $root 'public\duena.js'
$server = [IO.File]::ReadAllText($serverPath)
$ownerJs = [IO.File]::ReadAllText($ownerJsPath)
$renderPattern = '(?s)function renderScheduledAppointments\(\) \{.*?\n\}\s*(?=async function loadPendingUsers\(\))'
if ($ownerJs -notmatch 'data-owner-edit-appointment') {
  $newFunction = @'
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
    item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${safeFormatTime12(appt.appointment_time)} · ${DURATION_LABELS[appt.service] || `${Number(appt.duration_minutes)||60} min`}</p><small>${escapeHtml(source)}${appt.client_email ? ` · ${appt.client_email}` : ''}${appt.client_phone ? ` · Tel: ${appt.client_phone}` : ''}</small></div><div class="admin-actions"><span class="status accepted">Confirmada</span><button type="button" class="small-button" data-owner-edit-appointment="${appt.id}" data-date="${String(appt.appointment_date).slice(0,10)}" data-time="${String(appt.appointment_time).slice(0,5)}">Cambiar día/hora</button></div>`;
    list.appendChild(item);
  });
}
'@
  $m = [regex]::Match($ownerJs,$renderPattern)
  if (-not $m.Success) { throw "No se encontró la función renderScheduledAppointments esperada. No se modificó el código." }
  $ownerJs = $ownerJs.Substring(0,$m.Index) + $newFunction + "`r`n`r`n" + $ownerJs.Substring($m.Index + $m.Length)
  $changes[$ownerJsPath] = $ownerJs
}
if ($server -notmatch "/owner/appointments/:id/reschedule") {
  $route = @'
app.patch('/api/owner/appointments/:id/reschedule', authRequired, ownerRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const date = String(req.body.appointment_date || '').trim();
    const time = String(req.body.appointment_time || '').trim();
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Cita inválida.' });
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!dateMatch) return res.status(400).json({ message: 'Fecha inválida. Usa AAAA-MM-DD.' });
    const utcDate = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
    if (utcDate.toISOString().slice(0,10) !== date) return res.status(400).json({ message: 'La fecha no existe en el calendario.' });
    const normalizedTime = normalizeTimeValue(time);
    if (!normalizedTime) return res.status(400).json({ message: 'Usa una hora válida en bloques de 30 minutos, por ejemplo 14:30.' });
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
    const part = Object.fromEntries(parts.map(p => [p.type,p.value]));
    const today = `${part.year}-${part.month}-${part.day}`;
    const proposedDateTime = new Date(`${date}T${normalizedTime}:00-05:00`);
    if (date < today || proposedDateTime <= now) return res.status(400).json({ message: 'Elige una fecha y hora futuras.' });

    const [currentRows] = await pool.query(
      'SELECT id,status,service,duration_minutes,appointment_date,appointment_time FROM appointments WHERE id=? LIMIT 1',
      [id]
    );
    const current = currentRows[0];
    if (!current) return res.status(404).json({ message: 'No se encontró la cita.' });
    if (!['accepted','pending'].includes(current.status)) {
      return res.status(400).json({ message: 'Solo se pueden reprogramar citas pendientes o confirmadas.' });
    }
    const blocked = await isDateBlocked(date);
    if (blocked) return res.status(400).json({ message: `Ese día está bloqueado${blocked.reason ? ': ' + blocked.reason : '.'}` });
    const scheduleDay = await getScheduleDay(dateWeekday(date), date);
    if (!scheduleDay.is_open || !Array.isArray(scheduleDay.intervals) || !scheduleDay.intervals.length) {
      return res.status(400).json({ message: 'Ese día figura como descanso o no tiene horario de atención.' });
    }
    const duration = Math.max(1, Number(current.duration_minutes) || serviceDuration(current.service) || 60);
    const startMin = toMinutes(normalizedTime);
    const endMin = startMin + duration;
    const insideSchedule = scheduleDay.intervals.some(interval =>
      startMin >= toMinutes(interval.start_time) && endMin <= toMinutes(interval.end_time)
    );
    if (!insideSchedule) return res.status(400).json({ message: 'La hora elegida no cabe completa dentro del horario de atención.' });

    const [otherRows] = await pool.query(
      `SELECT id,appointment_time,duration_minutes,service FROM appointments
       WHERE appointment_date=? AND id<>? AND status IN ('pending','accepted')`,
      [date, id]
    );
    const overlaps = otherRows.some(row => {
      const otherStart = toMinutes(formatDbTime(row.appointment_time));
      const otherEnd = otherStart + Math.max(1, Number(row.duration_minutes) || serviceDuration(row.service) || 60);
      return startMin < otherEnd && endMin > otherStart;
    });
    if (overlaps) return res.status(409).json({ message: 'Ese horario se cruza con otra cita pendiente o confirmada. Elige otra hora.' });

    await pool.query('UPDATE appointments SET appointment_date=?, appointment_time=? WHERE id=?', [date, normalizedTime, id]);
    res.json({ message: 'Cita reprogramada. Confirma el nuevo horario con la clienta para que esté enterada.' });
  } catch (error) {
    console.error('No se pudo reprogramar la cita:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'No se pudo reprogramar la cita.' });
  }
});

'@
  $anchor = "app.patch('/api/owner/appointments/:id/status'"
  $pos = $server.IndexOf($anchor)
  if ($pos -lt 0) { throw "No se encontró la ruta original de estado de citas. No se modificó el servidor." }
  $server = $server.Insert($pos,$route + "`r`n")
  $changes[$serverPath] = $server
}

# Páginas existentes: añadir hoja visual sin duplicar secciones.
$targets = @()
foreach ($folder in @('public','docs')) {
  $dir = Join-Path $root $folder
  if (Test-Path $dir) { $targets += $dir }
}
foreach ($dir in $targets) {
  $htmlFiles = Get-ChildItem -Path $dir -Filter '*.html' -File -ErrorAction SilentlyContinue
  foreach ($file in $htmlFiles) {
    $html = [IO.File]::ReadAllText($file.FullName)
    $original = $html
    $html = Ensure-Style $html
    switch ($file.Name.ToLowerInvariant()) {
      'index.html' { $html = Patch-LoginHtml $html }
      'cliente.html' { $html = Patch-ClientHtml $html }
      'duena.html' { $html = Patch-OwnerHtml $html }
    }
    if ($html -ne $original) { $changes[$file.FullName] = $html }
  }
}

# Copia de seguridad de los archivos de código que se cambiarán.
foreach ($path in $changes.Keys) { Backup-File $path }
foreach ($rel in @('suldery-redisenio.css','suldery-experience.js','suldery-reprogramar-cita.js')) {
  foreach ($dir in $targets) {
    $dest = Join-Path $dir $rel
    Backup-File $dest
    Copy-Item (Join-Path $pkg $rel) $dest -Force
  }
}
foreach ($rel in @('suldery-mascota.svg','suldery-marco-horizontal.svg','suldery-marco-vertical.svg')) {
  foreach ($dir in $targets) {
    $assetDir = Join-Path $dir 'assets'
    if (-not (Test-Path $assetDir)) { New-Item -ItemType Directory -Path $assetDir -Force | Out-Null }
    $dest = Join-Path $assetDir $rel
    Backup-File $dest
    Copy-Item (Join-Path $pkg $rel) $dest -Force
  }
}
foreach ($path in $changes.Keys) {
  [IO.File]::WriteAllText($path, [string]$changes[$path], [Text.UTF8Encoding]::new($false))
}

Write-Host "`nRediseño instalado. Copia de seguridad: $backup" -ForegroundColor Green
Write-Host "Login: título centrado, destellos y mascota animada; loading con logo en oro rosado." -ForegroundColor Cyan
Write-Host "Clientas: marcos ornamentales, historia larga en capítulos y botón para abrir reseñas." -ForegroundColor Cyan
Write-Host "Dueña: botón para reprogramar citas con comprobación de horario y cruces." -ForegroundColor Cyan
Write-Host "Prueba localmente antes de publicar server.js y public/. Los contadores existentes se conservan." -ForegroundColor Yellow
