$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
$botRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $botRoot
try {
  $node = (Get-Command node -ErrorAction Stop).Source
  if (!(Test-Path 'node_modules') -or !(Test-Path 'dist/server.cjs')) { throw 'Bitte zuerst Installieren.bat ausfuehren.' }
  try { $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 2 } catch { $health = $null }
  if ($health -and $health.status -eq 'ok' -and ($health.app -eq 'twitch-music-bot' -or $health.app -eq 'twitch-ytm-song-request-bot')) { Start-Process 'http://127.0.0.1:3000'; exit }
  New-Item -ItemType Directory -Path 'data' -Force | Out-Null
  $entry = Join-Path $PSScriptRoot 'start.cjs'
  $proc = Start-Process -FilePath $node -ArgumentList ('"' + $entry + '"') -WorkingDirectory $botRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $botRoot 'data/server-stdout.log') -RedirectStandardError (Join-Path $botRoot 'data/server-stderr.log') -PassThru
  $proc.Id | Set-Content (Join-Path $botRoot 'data/bot.pid')
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($proc.HasExited) { throw 'Bot konnte nicht starten. Siehe data/server-stderr.log; eventuell ist Port 3000 bereits belegt.' }
    try { $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 1 } catch { continue }
    if ($health -and $health.status -eq 'ok' -and ($health.app -eq 'twitch-music-bot' -or $health.app -eq 'twitch-ytm-song-request-bot')) { Start-Process 'http://127.0.0.1:3000'; exit }
  }
  throw 'Botstart dauert zu lange. Siehe data/server-stderr.log.'
} catch { [System.Windows.MessageBox]::Show($_.Exception.Message, 'Song Request Bot') | Out-Null; exit 1 }
