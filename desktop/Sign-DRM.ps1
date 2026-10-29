param([ValidateSet('signup', 'login', 'sign', 'verify')][string]$Action = 'verify')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonExe = Join-Path $PSScriptRoot '.evs-venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pythonExe)) {
  & py -3 -m venv (Join-Path $PSScriptRoot '.evs-venv')
  if ($LASTEXITCODE -ne 0) { throw 'Python 3 is required to prepare the signing tool.' }
}
& $pythonExe -c 'import castlabs_evs' 2>$null
if ($LASTEXITCODE -ne 0) {
  & $pythonExe -m pip install 'castlabs-evs==1.3.2'
  if ($LASTEXITCODE -ne 0) { throw 'Could not install the Castlabs signing tool.' }
}
$runtimeDirectory = Join-Path $PSScriptRoot 'node_modules\electron\dist'
if ($Action -eq 'sign') {
  $runtimeExe = Join-Path $runtimeDirectory 'electron.exe'
  if (Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $runtimeExe }) {
    throw 'Please close Music Bot before signing, then run the setup again.'
  }
}
switch ($Action) {
  'signup' { & $pythonExe -m castlabs_evs.account signup }
  'login' { & $pythonExe -m castlabs_evs.account reauth }
  'sign' { & $pythonExe -m castlabs_evs.vmp sign-pkg $runtimeDirectory }
  'verify' { & $pythonExe -m castlabs_evs.vmp verify-pkg $runtimeDirectory }
}
if ($LASTEXITCODE -ne 0) { throw 'Castlabs could not complete the selected operation.' }
