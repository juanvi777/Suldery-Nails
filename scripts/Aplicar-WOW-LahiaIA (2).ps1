$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root "public"
$cssPath = Join-Path $public "style.css"
if (!(Test-Path $cssPath) -or !(Test-Path (Join-Path $public "duena.html"))) {
  throw "No encuentro public\style.css y public\duena.html. Ejecuta el instalador desde la carpeta raíz de Suldery Nails."
}
$backup = Join-Path $root ("backup-wow-lahia-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path (Join-Path $backup "public") -Force | Out-Null
Copy-Item $cssPath (Join-Path $backup "public\style.css")
foreach ($name in @("duena.html","cliente.html","index.html","registro.html","duena.js","cliente.js","login.js","auth.js","sw.js")) {
  $p = Join-Path $public $name
  if (Test-Path $p) { Copy-Item $p (Join-Path $backup ("public\" + $name)) -Force }
}

$sourceJs = Join-Path $PSScriptRoot "..\public\suldery-wow.js"
$sourceCss = Join-Path $PSScriptRoot "..\public\suldery-wow.css"
$destJs = Join-Path $projectRoot "public\suldery-wow.js"
$destCss = Join-Path $projectRoot "public\suldery-wow.css"

if ([System.IO.Path]::GetFullPath($sourceJs) -ne [System.IO.Path]::GetFullPath($destJs)) {
    Copy-Item $sourceJs $destJs -Force
}

if ([System.IO.Path]::GetFullPath($sourceCss) -ne [System.IO.Path]::GetFullPath($destCss)) {
    Copy-Item $sourceCss $destCss -Force
}

$css = [IO.File]::ReadAllText($cssPath,[Text.Encoding]::UTF8)
$wowCss = [IO.File]::ReadAllText((Join-Path $public "suldery-wow.css"),[Text.Encoding]::UTF8)
if (!$css.Contains("SULDERY NAILS WOW — marfil")) {
  $css += "`r`n`r`n" + $wowCss
  [IO.File]::WriteAllText($cssPath,$css,[Text.UTF8Encoding]::new($false))
}
# Add script and separate CSS links to public pages without replacing their existing code.
foreach ($name in @("duena.html","cliente.html","index.html","registro.html")) {
  $p = Join-Path $public $name
  if (!(Test-Path $p)) { continue }
  $html = [IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)
  if (!$html.Contains("suldery-wow.css")) {
    $html = $html.Replace("</head>", '  <link rel="stylesheet" href="suldery-wow.css?v=20261015-wow1">`r`n</head>')
    $html = $html.Replace('`r`n', "`r`n")
  }
  if (!$html.Contains("suldery-wow.js")) {
    $scriptTag = '  <script src="suldery-wow.js?v=20261015-wow1" defer></script>' + "`r`n"
    if ($html.Contains("</body>")) { $html = $html.Replace("</body>", $scriptTag + "</body>") }
    else { $html += "`r`n" + $scriptTag }
  }
  # Cache bust the main stylesheet so the new design appears immediately.
  $html = [regex]::Replace($html, 'style\.css\?v=[^"'' >]+', 'style.css?v=20261015-wow1')
  [IO.File]::WriteAllText($p,$html,[Text.UTF8Encoding]::new($false))
}
# Change IA tool labels conservatively in owner HTML.
$ownerPath = Join-Path $public "duena.html"
$owner = [IO.File]::ReadAllText($ownerPath,[Text.Encoding]::UTF8)
$owner = $owner.Replace('<strong>SulNail IA</strong>','<strong>Lahia IA</strong>')
$owner = $owner.Replace('<span><strong>SulNail IA</strong><small>Diseños, técnicas y aprendizaje</small></span>','<span><strong>Lahia IA</strong><small>Tu asistente de uñas y belleza</small></span>')
$owner = $owner.Replace('Consultar SulNail IA <span>✦</span>','Consultar a Lahia IA <span>✦</span>')
$owner = $owner.Replace('<p class="eyebrow">SULNAIL IA</p><h2>Ideas para crear y seguir aprendiendo</h2>','<p class="eyebrow">LAHIA IA</p><h2>Tu asistente inteligente de Suldery Nails</h2>')
$owner = $owner.Replace('style.css?v=20261008-v56.0','style.css?v=20261015-wow1')
[IO.File]::WriteAllText($ownerPath,$owner,[Text.UTF8Encoding]::new($false))
Write-Host "Actualización visual WOW + Lahia IA aplicada." -ForegroundColor Green
Write-Host "Incluye tonos marfil/rosa empolvado/oro rosado, marcos de fotos, ajuste sin fondo blanco y transiciones al desplazarse." -ForegroundColor Cyan
Write-Host "Se conservaron las funciones existentes; EMPRE.IA no se conecta todavía y se indica como pendiente." -ForegroundColor Yellow
Write-Host "Copia de seguridad: $backup" -ForegroundColor DarkCyan
