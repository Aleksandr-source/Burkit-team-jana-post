#!/usr/bin/env bash
set -u
ASAR_ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$ASAR_ROOT" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Asar: установите Node.js 24.11 или новее. Затем запустите этот файл снова.'
  exit 1
fi
exec node "$ASAR_ROOT/scripts/portable-start.mjs"
