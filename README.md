# I miei Affitti

App Android per tenere traccia dei pagamenti mensili degli affitti (box, appartamenti, negozi, terreni…).
Statistiche e grafici, esportazione in Excel, backup. **Tutti i dati restano sul telefono.**

## Scaricare l'APK
Ad ogni modifica caricata su GitHub, l'APK viene compilato in automatico
(scheda **Actions**) e pubblicato nella pagina **Releases** del repository.

1. Dal telefono apri la pagina *Releases* e scarica il file `IMieiAffitti-….apk`.
2. Aprilo e, se richiesto, consenti l'installazione di app da questa fonte.
3. Per aggiornare basta installare il nuovo APK sopra il vecchio: i dati restano.

> Disinstallare l'app cancella i dati. Usa *Esporta → Salva backup* prima di farlo.

## Struttura
- `app/src/main/assets/www/` – l'app vera e propria (HTML/JS), modificabile come una pagina web
- `app/src/main/java/.../MainActivity.java` – contenitore Android (WebView, salvataggio file in Download, condivisione)
- `app/affitti.keystore` – chiave di firma, creata da GitHub alla prima compilazione: non cancellarla, altrimenti
  gli aggiornamenti non si installano sopra la versione precedente.
- `.github/workflows/build-apk.yml` – compilazione automatica su GitHub
- `tools/make_icons.py` – genera le icone durante la compilazione
