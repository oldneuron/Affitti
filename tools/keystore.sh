#!/usr/bin/env bash
# Crea la chiave di firma solo la prima volta e la salva nel repository,
# così tutti gli APK successivi hanno la stessa firma e si aggiornano senza perdere i dati.
set -euxo pipefail
if [ ! -f app/affitti.keystore ]; then
  keytool -genkeypair -keystore app/affitti.keystore -storepass affitti123 -keypass affitti123 \
    -alias affitti -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=I miei Affitti, C=IT"
  git config user.name "github-actions[bot]"
  git config user.email "41898283+github-actions[bot]@users.noreply.github.com"
  git add -f app/affitti.keystore
  git commit -m "Aggiunge la chiave di firma dell'APK"
  git push
fi
