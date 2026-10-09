#!/usr/bin/env bash
# Instalador para Mac y Linux. Uso, desde la carpeta del repo:
#   bash scripts/instalar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js. Instalalo desde https://nodejs.org (versión LTS) o con 'brew install node' y volvé a correr este script."
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "Falta git. En Mac se instala con 'xcode-select --install'."
  exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "Instalando Claude Code..."
  npm install -g @anthropic-ai/claude-code
fi

echo "Instalando dependencias..."
npm install --no-audit --no-fund

node scripts/instalar.mjs "$@"
