<#
.SYNOPSIS
  Altlığı (erzurum.pmtiles) ve OSRM verisini aynı OSM kaynağından yeniden üretir.

.DESCRIPTION
  Tek kaynak: <OsmDir>\erzurum.osm.pbf. OSM'yi elle düzenledikten sonra bu betiği çalıştır:
    1. OSRM: osrm-backend container'ı durdurulur, extract -> partition -> customize (MLD), container başlatılır.
    2. Altlık: tilemaker ile OpenMapTiles şemasında erzurum.pmtiles üretilir ve istemcinin public/tiles
       klasörüne kopyalanır (Vite statik sunar; tarayıcıyı yenilemek yeterli).
  Backend reposuna dokunulmaz; OSRM yalnızca docker imajı olarak çağrılır.

.PARAMETER SkipOsrm
  Yalnızca altlığı üretir (OSRM verisine ve container'a dokunmaz).

.PARAMETER Profile
  OSRM profil dosyası (imaj içindeki yol). Varsayılan: /opt/car.lua

.EXAMPLE
  .\scripts\rebuild-map.ps1
  .\scripts\rebuild-map.ps1 -SkipOsrm
#>
param(
  [string]$OsmDir = 'C:\Users\Melik\Documents\KentKart\osrm-data',
  [string]$ToolsDir = 'C:\Users\Melik\Documents\KentKart\map-tools',
  [string]$Profile = '/opt/car.lua',
  [string]$OsrmContainer = 'osrm-backend',
  [switch]$SkipOsrm
)

$ErrorActionPreference = 'Stop'
$OsrmImage = 'ghcr.io/project-osrm/osrm-backend:latest'
$TilemakerImage = 'ghcr.io/systemed/tilemaker:master'
$ClientTilesDir = Join-Path $PSScriptRoot '..\public\tiles'

function Invoke-Docker {
  param([string[]]$Arguments)
  # Araçlar ilerlemeyi stderr'e yazar; Windows PowerShell 5.1 bunu 'Stop' altında hata sayar.
  # Başarı yalnızca çıkış koduna göre değerlendirilir.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & docker @Arguments 2>&1 | ForEach-Object { "$_" } |
      Where-Object { $_ -notmatch 'DOCKER WARNING|^-{20,}$' }
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($LASTEXITCODE -ne 0) { throw "docker $($Arguments -join ' ') başarısız (çıkış kodu $LASTEXITCODE)" }
}

$pbf = Join-Path $OsmDir 'erzurum.osm.pbf'
$osmXml = Join-Path $OsmDir 'erzurum.osm'
if (-not (Test-Path $pbf)) { throw "Kaynak bulunamadı: $pbf" }

# .osm (XML) .pbf'den yeniyse düzenleme XML'e yapılmış demektir; tilemaker yalnızca .pbf okur
if ((Test-Path $osmXml) -and ((Get-Item $osmXml).LastWriteTime -gt (Get-Item $pbf).LastWriteTime)) {
  throw "erzurum.osm, erzurum.osm.pbf'den daha yeni. Düzenlemeyi .pbf olarak kaydet (ya da dönüştür) ve tekrar çalıştır."
}

Write-Host "Kaynak: $pbf ($([math]::Round((Get-Item $pbf).Length / 1MB, 2)) MB)"

# ---- 1. OSRM ----
if (-not $SkipOsrm) {
  Write-Host "`n[OSRM] $OsrmContainer durduruluyor..."
  $running = (& docker ps --filter "name=^$OsrmContainer$" --format '{{.Names}}')
  if ($running) { Invoke-Docker @('stop', $OsrmContainer) | Out-Null }

  $dataMount = "${OsmDir}:/data"
  Write-Host '[OSRM] extract...'
  Invoke-Docker @('run', '--rm', '-v', $dataMount, $OsrmImage, 'osrm-extract', '-p', $Profile, '/data/erzurum.osm.pbf')
  Write-Host '[OSRM] partition...'
  Invoke-Docker @('run', '--rm', '-v', $dataMount, $OsrmImage, 'osrm-partition', '/data/erzurum.osrm')
  Write-Host '[OSRM] customize...'
  Invoke-Docker @('run', '--rm', '-v', $dataMount, $OsrmImage, 'osrm-customize', '/data/erzurum.osrm')

  Write-Host "[OSRM] $OsrmContainer başlatılıyor..."
  Invoke-Docker @('start', $OsrmContainer) | Out-Null
}

# ---- 2. Altlık ----
Write-Host "`n[Altlık] tilemaker..."
Invoke-Docker @(
  'run', '--rm',
  '-v', "${OsmDir}:/data",
  '-v', "${ToolsDir}:/tools",
  $TilemakerImage,
  '--input', '/data/erzurum.osm.pbf',
  '--output', '/tools/erzurum.pmtiles',
  '--config', '/tools/config-erzurum.json',
  '--process', '/tools/process-erzurum.lua',
  '--quiet'
)

New-Item -ItemType Directory -Force $ClientTilesDir | Out-Null
Copy-Item (Join-Path $ToolsDir 'erzurum.pmtiles') $ClientTilesDir -Force
$out = Join-Path $ClientTilesDir 'erzurum.pmtiles'
Write-Host "[Altlık] $out ($([math]::Round((Get-Item $out).Length / 1MB, 2)) MB)"

Write-Host "`nBitti. Tarayıcıyı yenile."
