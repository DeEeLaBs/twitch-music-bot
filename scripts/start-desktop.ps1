$ErrorActionPreference = 'Stop'
Remove-Item env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
[System.Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
[System.Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'User')

$botRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $botRoot

try {
  $node = (Get-Command node -ErrorAction Stop).Source
  $desktopCjs = Join-Path $botRoot 'scripts\desktop.cjs'
  & $node $desktopCjs
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($_.Exception.Message, 'Music Bot') | Out-Null
  exit 1
}
