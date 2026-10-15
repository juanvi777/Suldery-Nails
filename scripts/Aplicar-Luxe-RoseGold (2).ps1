$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $projectRoot "public"
$cssSource = Join-Path $PSScriptRoot "Suldery-Luxe-Override.css"
$jsSource = Join-Path $PSScriptRoot "Suldery-Luxe-Experience.js"
if (!(Test-Path $publicDir)) { throw "No encuentro la carpeta public en $projectRoot" }
if (!(Test-Path $cssSource)) { throw "Falta scripts\Suldery-Luxe-Override.css. Extrae todo el ZIP conservando las carpetas." }
if (!(Test-Path $jsSource)) { throw "Falta scripts\Suldery-Luxe-Experience.js. Extrae todo el ZIP conservando las carpetas." }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $projectRoot "backup-luxe-rose-gold-$stamp"
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($file in @("style.css","index.html","registro.html","cliente.html","duena.html","suldery-wow.css","suldery-wow.js")) {
  $path = Join-Path $publicDir $file
  if (Test-Path $path) { Copy-Item $path (Join-Path $backup $file) -Force }
}
Copy-Item $cssSource (Join-Path $publicDir "suldery-luxe.css") -Force
Copy-Item $jsSource (Join-Path $publicDir "suldery-luxe.js") -Force

$pages = @("index.html","registro.html","cliente.html","duena.html")
foreach ($page in $pages) {
  $path = Join-Path $publicDir $page
  if (!(Test-Path $path)) { continue }
  $html = Get-Content -Raw -Encoding UTF8 $path
  if ($html -notmatch 'suldery-luxe\.css') {
    $link = '<link rel="stylesheet" href="suldery-luxe.css?v=20261015-luxe01">'
    if ($html -match '(?i)</head>') {
      $html = [regex]::Replace($html, '(?i)(</head>)', "  $link`r`n`$1", 1)
    } else { throw "No encuentro </head> en $page" }
  }
  if ($html -notmatch 'suldery-luxe\.js') {
    $script = '<script src="suldery-luxe.js?v=20261015-luxe01"></script>'
    if ($html -match '(?i)</body>') {
      $html = [regex]::Replace($html, '(?i)(</body>)', "  $script`r`n`$1", 1)
    } else { throw "No encuentro </body> en $page" }
  }
  Set-Content -Path $path -Value $html -Encoding UTF8
}
Write-Host ""
Write-Host "Actualización LUXE ROSE GOLD aplicada." -ForegroundColor Magenta
Write-Host "Incluye acabado metálico oro rosa, biseles de espejo en fotografías, títulos elegantes, menús renovados y animaciones secuenciales."
Write-Host "Se conservaron los archivos JS de agenda, cuentas, catálogo y panel de dueña."
Write-Host "Copia de seguridad: $backup"
Write-Host "Siguiente paso: railway up"
