param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$botRoot = Split-Path -Parent $PSScriptRoot
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'TwitchSongRequestBot.lnk'
if ($Remove) {
  if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
  Write-Host 'Autostart entfernt.'
} else {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $shortcut.Arguments = '"' + (Join-Path $botRoot 'Start-Bot.vbs') + '"'
  $shortcut.WorkingDirectory = $botRoot
  $shortcut.Save()
  Write-Host 'Autostart eingerichtet.'
}
