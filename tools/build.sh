#!/usr/bin/env bash
# Compila l'APK firmato e lo copia con un nome leggibile. Eseguito da GitHub Actions.
set -euxo pipefail
gradle assembleRelease --no-daemon --stacktrace
cp app/build/outputs/apk/release/app-release.apk "IMieiAffitti-1.0.${GITHUB_RUN_NUMBER:-1}.apk"
# copia con nome fisso: il pulsante "Scarica l'ultima versione" dell'app punta a questo file
cp app/build/outputs/apk/release/app-release.apk "IMieiAffitti-ultima.apk"
