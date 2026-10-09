# Instalador para Windows. Uso, desde la carpeta del repo:
#   powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Falta Node.js. Instalalo desde https://nodejs.org (versión LTS) y volvé a correr este script.'
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host 'Falta git. Instalalo desde https://git-scm.com y volvé a correr este script.'
  exit 1
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host 'Instalando Claude Code...'
  npm install -g @anthropic-ai/claude-code
}

Write-Host 'Instalando dependencias...'
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/instalar.mjs @args
