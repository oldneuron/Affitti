#!/usr/bin/env bash
# Prepara i file generati: icone e componente Excel. Eseguito da GitHub Actions.
set -euxo pipefail
python3 -c "import PIL" 2>/dev/null || \
  python3 -m pip install --quiet pillow 2>/dev/null || \
  python3 -m pip install --quiet --break-system-packages pillow || \
  (sudo apt-get update -qq && sudo apt-get install -y -qq python3-pil)
python3 tools/make_icons.py
npm install --no-save --no-package-lock xlsx@0.18.5
cp node_modules/xlsx/dist/xlsx.mini.min.js app/src/main/assets/www/
ls -la app/src/main/assets/www app/src/main/res
