$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pub = Join-Path $root "public"
if (!(Test-Path $pub)) { throw "No encuentro public. Ejecuta el instalador desde una copia del proyecto Suldery Nails." }
$cssSrc = Join-Path $PSScriptRoot "Suldery-Correccion-Visual.css"
if (!(Test-Path $cssSrc)) { throw "No encuentro el CSS incluido en el ZIP." }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root "backup-correccion-visual-$stamp"
New-Item -ItemType Directory -Path $backup | Out-Null
foreach($f in @("style.css","cliente.js","cliente.html","duena.html","duena.js")) {
  $p=Join-Path $pub $f
  if(Test-Path $p){Copy-Item $p (Join-Path $backup $f) -Force}
}
Copy-Item $cssSrc (Join-Path $pub "suldery-correccion-visual.css") -Force
foreach($f in @("index.html","registro.html","cliente.html","duena.html")) {
  $p=Join-Path $pub $f
  if(!(Test-Path $p)){continue}
  $html=Get-Content -Raw -Encoding UTF8 $p
  if($html -notmatch 'suldery-correccion-visual\.css'){
    $tag='<link rel="stylesheet" href="suldery-correccion-visual.css?v=20261015-fix02">'
    if($html -match '(?i)</head>'){$html=[regex]::Replace($html,'(?i)(</head>)',"  $tag`r`n`$1",1)}
    else{throw "No se encontró </head> en $f"}
  }
  Set-Content -Path $p -Value $html -Encoding UTF8
}
# La captura muestra "Can't find variable: escapeAttribute" en el carrusel de reseñas.
# cliente.js usa esa función pero no la declara; agregarla solo si realmente falta.
$clientJs=Join-Path $pub "cliente.js"
if(Test-Path $clientJs){
  $js=Get-Content -Raw -Encoding UTF8 $clientJs
  if($js -notmatch 'function\s+escapeAttribute\s*\('){
    $fix=@'
function escapeAttribute(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

'@
    if($js -match 'document\.addEventListener\('){
      $js=[regex]::Replace($js,'(?=document\.addEventListener\()', [System.Text.RegularExpressions.MatchEvaluator]{param($m) $fix},1)
    } else {$js += "`r`n$fix"}
    Set-Content -Path $clientJs -Value $js -Encoding UTF8
  }
}
Write-Host ""
Write-Host "Corrección visual y parche de reseñas aplicados." -ForegroundColor Magenta
Write-Host "Copia de seguridad: $backup"
Write-Host "El cambio no reemplaza los JS de agenda, cuentas, calendario ni catálogo."
Write-Host "Revisa en local y después despliega con railway up."
