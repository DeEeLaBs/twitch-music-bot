$botRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $botRoot 'data/bot.pid'
$entry = Join-Path $PSScriptRoot 'start.cjs'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Host 'Keine gespeicherte Bot-PID. Bei Terminalstart dort Strg+C verwenden.'; exit }
$botProcessId = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $botProcessId"
if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains($entry)) {
  Stop-Process -Id $botProcessId
  Remove-Item -LiteralPath $pidFile
  Write-Host 'Bot beendet.'
} else { Write-Host 'Kein passender Bot-Prozess gefunden. Andere Prozesse bleiben unveraendert.' }
