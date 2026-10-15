$ErrorActionPreference = 'Stop'
$root = Read-Host 'Pega la ruta de la carpeta raíz de Suldery Nails (la que contiene server.js)'
if (-not (Test-Path (Join-Path $root 'server.js'))) { throw "No encuentro server.js en esa carpeta." }
$public = Join-Path $root 'public'
$serverPath = Join-Path $root 'server.js'
$ownerHtml = Join-Path $public 'duena.html'
$loginHtml = Join-Path $public 'index.html'
$clientHtml = Join-Path $public 'cliente.html'
$ownerJs = Join-Path $public 'duena.js'
foreach ($p in @($public,$serverPath,$ownerHtml,$loginHtml,$clientHtml,$ownerJs)) { if (-not (Test-Path $p)) { throw "Falta el archivo requerido: $p" } }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $root "backup-suldery-visual-$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($p in @($serverPath,$ownerHtml,$loginHtml,$clientHtml,$ownerJs)) {
  $rel = $p.Substring($root.Length).TrimStart('\')
  $dest = Join-Path $backup $rel
  New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  Copy-Item $p $dest -Force
}
$package = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item (Join-Path $package 'suldery-bienvenida.css') (Join-Path $public 'suldery-bienvenida.css') -Force
Copy-Item (Join-Path $package 'suldery-carga.js') (Join-Path $public 'suldery-carga.js') -Force
Copy-Item (Join-Path $package 'suldery-resenas.js') (Join-Path $public 'suldery-resenas.js') -Force
Copy-Item (Join-Path $package 'suldery-reprogramar-cita.js') (Join-Path $public 'suldery-reprogramar-cita.js') -Force

function Add-HeadLink($path) {
  $html = [IO.File]::ReadAllText($path)
  if ($html -notmatch 'suldery-bienvenida\.css') {
    $html = [regex]::Replace($html,'(?i)</head>','<link rel="stylesheet" href="suldery-bienvenida.css?v=20261015-v2">'+"`r`n"+'</head>',1)
  }
  [IO.File]::WriteAllText($path,$html,[Text.UTF8Encoding]::new($false))
}
Add-HeadLink $loginHtml
Add-HeadLink $ownerHtml
Add-HeadLink $clientHtml

$html = [IO.File]::ReadAllText($loginHtml)
if ($html -notmatch 'suldery-carga\.js') {
  $html = [regex]::Replace($html,'(?i)</body>','<script src="suldery-carga.js?v=20261015-v2" defer></script>'+"`r`n"+'</body>',1)
}
[IO.File]::WriteAllText($loginHtml,$html,[Text.UTF8Encoding]::new($false))

$html = [IO.File]::ReadAllText($clientHtml)
# Remove only the exclusive portfolio section requested to be removed, if present.
$html = [regex]::Replace($html,'(?s)\s*<section class="portfolio-section" id="exclusivePhotosSection">.*?</section>','',1)
if ($html -notmatch 'suldery-resenas\.js') {
  $html = [regex]::Replace($html,'(?i)</body>','<script src="suldery-resenas.js?v=20261015-v2" defer></script>'+"`r`n"+'</body>',1)
}
[IO.File]::WriteAllText($clientHtml,$html,[Text.UTF8Encoding]::new($false))

$ownerHtmlText = [IO.File]::ReadAllText($ownerHtml)
if ($ownerHtmlText -notmatch 'suldery-reprogramar-cita\.js') {
  $ownerHtmlText = [regex]::Replace($ownerHtmlText,'(?i)</body>','<script src="suldery-reprogramar-cita.js?v=20261015-v2" defer></script>'+"`r`n"+'</body>',1)
}
[IO.File]::WriteAllText($ownerHtml,$ownerHtmlText,[Text.UTF8Encoding]::new($false))

$jsPath = $ownerJs
$js = [IO.File]::ReadAllText($jsPath)
if ($js -notmatch 'data-owner-edit-appointment') {
  $old = 'item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${safeFormatTime12(appt.appointment_time)} · ${DURATION_LABELS[appt.service] || `${Number(appt.duration_minutes)||60} min`}</p><small>${escapeHtml(source)}${appt.client_email ? ` · ${escapeHtml(appt.client_email)}` : ''}${appt.client_phone ? ` · Tel: ${escapeHtml(appt.client_phone)}` : ''}</small></div><span class="status accepted">Confirmada</span>`;'
  $new = 'item.innerHTML = `<div class="admin-item-main"><strong>${escapeHtml(appt.client_name)}</strong><p>${escapeHtml(appt.service)} · ${formatDate(appt.appointment_date)} · ${safeFormatTime12(appt.appointment_time)} · ${DURATION_LABELS[appt.service] || `${Number(appt.duration_minutes)||60} min`}</p><small>${escapeHtml(source)}${appt.client_email ? ` · ${escapeHtml(appt.client_email)}` : ''}${appt.client_phone ? ` · Tel: ${escapeHtml(appt.client_phone)}` : ''}</small></div><div class="admin-actions"><span class="status accepted">Confirmada</span><button type="button" class="small-button" data-owner-edit-appointment="${appt.id}" data-date="${String(appt.appointment_date).slice(0,10)}" data-time="${String(appt.appointment_time).slice(0,5)}">Cambiar día/hora</button></div>`;'
  if (-not $js.Contains($old)) { throw "No pude localizar la plantilla exacta de la lista de citas; restauración disponible en $backup. No se completó el cambio de citas." }
  $js = $js.Replace($old,$new)
  [IO.File]::WriteAllText($jsPath,$js,[Text.UTF8Encoding]::new($false))
}

$server = [IO.File]::ReadAllText($serverPath)
if ($server -notmatch "/owner/appointments/:id/reschedule") {
  $route = @'
app.patch('/api/owner/appointments/:id/reschedule', authRequired, ownerRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const date = String(req.body.appointment_date || '').trim();
    const time = String(req.body.appointment_time || '').trim();
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Cita inválida.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00'))) {
      return res.status(400).json({ message: 'Fecha inválida. Usa AAAA-MM-DD.' });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(400).json({ message: 'Hora inválida. Usa HH:MM en formato de 24 horas.' });
    }
    const [currentRows] = await pool.query(
      'SELECT id,status,service,duration_minutes,appointment_date,appointment_time FROM appointments WHERE id=? LIMIT 1',
      [id]
    );
    const current = currentRows[0];
    if (!current) return res.status(404).json({ message: 'No se encontró la cita.' });
    if (!['accepted','pending'].includes(current.status)) {
      return res.status(400).json({ message: 'Solo puedes reprogramar citas pendientes o confirmadas.' });
    }
    const today = dateOnly(new Date());
    if (date < today) return res.status(400).json({ message: 'No puedes mover una cita a una fecha pasada.' });
    const duration = Math.max(1, Number(current.duration_minutes) || 60);
    const [otherRows] = await pool.query(
      `SELECT id,appointment_time,duration_minutes FROM appointments
       WHERE appointment_date=? AND id<>? AND status IN ('pending','accepted')`,
      [date, id]
    );
    const toMinutes = value => {
      const parts = String(value || '').slice(0,5).split(':').map(Number);
      return parts[0] * 60 + parts[1];
    };
    const start = toMinutes(time);
    const end = start + duration;
    const conflict = otherRows.some(row => {
      const otherStart = toMinutes(row.appointment_time);
      const otherEnd = otherStart + Math.max(1, Number(row.duration_minutes) || 60);
      return start < otherEnd && end > otherStart;
    });
    if (conflict) return res.status(409).json({ message: 'Ese horario se cruza con otra cita pendiente o confirmada. Elige otra hora.' });
    await pool.query(
      'UPDATE appointments SET appointment_date=?, appointment_time=? WHERE id=?',
      [date, time, id]
    );
    res.json({ message: 'Cita reprogramada correctamente.' });
  } catch (error) {
    console.error('No se pudo reprogramar la cita:', error);
    res.status(500).json({ message: 'No se pudo reprogramar la cita.' });
  }
});

'@
  $anchor = "app.patch('/api/owner/appointments/:id/status'"
  $pos = $server.IndexOf($anchor)
  if ($pos -lt 0) { throw "No encontré la ruta de estado de citas para insertar la reprogramación. Copia de seguridad en $backup." }
  $server = $server.Insert($pos,$route)
  [IO.File]::WriteAllText($serverPath,$server,[Text.UTF8Encoding]::new($false))
}

Write-Host "`nActualización instalada. Copia de seguridad: $backup" -ForegroundColor Green
Write-Host "Incluye bienvenida con logo, formulario de reseña desplegable y reprogramación de citas con control de cruces." -ForegroundColor Cyan
Write-Host "Prueba primero en local y despliega server.js junto con public/ para que funcione el nuevo endpoint." -ForegroundColor Yellow
