/* I miei Affitti — tutti i dati restano sul telefono (localStorage). */
(function () {
"use strict";
const LS = "affitti-dati-v1";
const LS_OLD = "box-pagamenti-v1";
const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const MESI3 = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
const TIPI = ["Box / garage","Posto auto","Appartamento","Stanza","Negozio","Ufficio","Magazzino","Terreno","Casa vacanze","Altro"];
const METODI = ["Contanti","Bonifico","Ricarica carta","Altro"];
const METODI_RAPIDI = [["Contanti","💶"],["Bonifico","🏦"],["Ricarica carta","💳"]];
const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const nowYM = () => today().slice(0, 7);
const ymAdd = (ym, k) => { let [y, m] = ym.split("-").map(Number); m += k; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + "-" + pad(m); };
const ymName = ym => { const [y, m] = ym.split("-").map(Number); return MESI[m - 1] + " " + y; };
const fmtDate = d => { if (!d) return ""; const [y, m, g] = d.split("-"); return g + "/" + m + "/" + y; };
const num = v => { let t = String(v == null ? "" : v).replace(/[€\s]/g, ""); if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", "."); const n = parseFloat(t); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const dayDiff = (a, b) => Math.round((Date.UTC(...a.split("-").map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...b.split("-").map((v, i) => i === 1 ? v - 1 : +v))) / 86400000);

let state = { props: [], current: null };
let tab = "mesi";
let viewYear = new Date().getFullYear();
let statScope = "one";
let statYear = new Date().getFullYear();

/* ---------- archiviazione locale ---------- */
function migrateOld(o) {
  // versione precedente "Affitto Box": {boxes:[...]}
  return { props: (o.boxes || []).map(b => ({ ...b, type: "Box / garage", address: "" })), current: o.current };
}
function load() {
  try {
    const s = localStorage.getItem(LS);
    if (s) { const o = JSON.parse(s); if (o && Array.isArray(o.props)) return o; }
    const old = localStorage.getItem(LS_OLD);
    if (old) { const o = JSON.parse(old); if (o && Array.isArray(o.boxes)) return migrateOld(o); }
  } catch (e) {}
  return null;
}
function persist() {
  state.savedAt = new Date().toISOString();
  try { localStorage.setItem(LS, JSON.stringify(state)); }
  catch (e) { toast("Impossibile salvare: memoria del browser piena o bloccata"); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- modello ---------- */
function fix() {
  state.props.forEach(p => {
    p.payments = p.payments || {};
    p.rates = (p.rates && p.rates.length) ? p.rates : [{ from: p.start || nowYM(), amount: 0 }];
    p.dueDay = p.dueDay || 5;
    p.type = p.type || "Altro";
  });
  if (!state.props.find(p => p.id === state.current)) state.current = state.props[0] ? state.props[0].id : null;
  state.settings = Object.assign({ autoReceipt: true }, state.settings || {});
  // numera le ricevute dei pagamenti che non hanno ancora un numero (in ordine di data)
  state.rseq = state.rseq || {};
  const missing = [];
  state.props.forEach(p => Object.keys(p.payments).forEach(ym => p.payments[ym].forEach(x => { if (!x.rn) missing.push(x); })));
  missing.sort((a, b) => (a.date || "") < (b.date || "") ? -1 : 1).forEach(assignReceipt);
  if (missing.length) persist();
}
function assignReceipt(x) {
  const y = (x.date || today()).slice(0, 4);
  state.rseq[y] = (state.rseq[y] || 0) + 1;
  x.rn = y + "/" + String(state.rseq[y]).padStart(3, "0");
}
const tenantName = p => (p.tenant || "").trim() || "Conduttore";
const cur = () => state.props.find(p => p.id === state.current);
function dueOf(p, ym) {
  if (!inContract(p, ym)) return 0;
  const r = [...p.rates].sort((a, c) => a.from < c.from ? -1 : 1);
  let v = r.length ? r[0].amount : 0;
  r.forEach(x => { if (x.from <= ym) v = x.amount; });
  return num(v);
}
const inContract = (p, ym) => ym >= p.start && (!p.end || ym <= p.end);
const paysOf = (p, ym) => p.payments[ym] || [];
const paidOf = (p, ym) => paysOf(p, ym).reduce((s, x) => s + num(x.amount), 0);
function dueDate(p, ym) { const [y, m] = ym.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return ym + "-" + pad(Math.min(p.dueDay, last)); }
function status(p, ym) {
  if (!inContract(p, ym)) return paidOf(p, ym) > 0 ? "pagato" : "fuori";
  const due = dueOf(p, ym), paid = paidOf(p, ym), t = today();
  if (paid >= due - 0.004 && (due > 0 || paid > 0)) return "pagato";
  if (ym > nowYM()) return paid > 0 ? "parziale" : "futuro";
  if (t > dueDate(p, ym)) return "ritardo";
  return paid > 0 ? "parziale" : "scadenza";
}
const LAB = { pagato: "Pagato", parziale: "Parziale", ritardo: "In ritardo", scadenza: "Da pagare", futuro: "Futuro", fuori: "Fuori contratto" };
/* data in cui il mese risulta saldato (o null) */
function settledOn(p, ym) {
  const due = dueOf(p, ym); if (due <= 0) return null;
  const list = [...paysOf(p, ym)].sort((a, b) => (a.date || "") < (b.date || "") ? -1 : 1);
  let s = 0; for (const x of list) { s += num(x.amount); if (s >= due - 0.004) return x.date || null; }
  return null;
}
/* giorni di ritardo: >0 in ritardo, <=0 puntuale; null se non scaduto e non saldato */
function delayOf(p, ym) {
  const dd = dueDate(p, ym), s = settledOn(p, ym);
  if (s) return dayDiff(s, dd);
  if (today() > dd && dueOf(p, ym) > 0) return dayDiff(today(), dd);
  return null;
}
function monthsUntilNow(p) {
  const out = []; let ym = p.start; const end = p.end && p.end < nowYM() ? p.end : nowYM(); let g = 0;
  while (ym <= end && g < 1200) { out.push(ym); ym = ymAdd(ym, 1); g++; }
  return out;
}
function summary(p) {
  let arr = 0, nArr = 0, next = null;
  monthsUntilNow(p).forEach(ym => {
    const st = status(p, ym);
    if (st === "ritardo") { arr += Math.max(0, dueOf(p, ym) - paidOf(p, ym)); nArr++; }
    if (!next && st !== "pagato" && st !== "fuori") next = ym;
  });
  if (!next) {
    let ym = ymAdd(nowYM(), 1), g = 0;
    while (g < 240 && inContract(p, ym) && status(p, ym) === "pagato") { ym = ymAdd(ym, 1); g++; }
    next = inContract(p, ym) ? ym : null;
  }
  return { arr, nArr, next };
}

/* ---------- interfaccia ---------- */
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400); }
function renderHeader() {
  const p = cur();
  $("#propsel").innerHTML = state.props.map(x => `<button class="chip${x.id === state.current ? " on" : ""}" data-prop="${x.id}">${esc(x.name)}</button>`).join("") +
    `<button class="chip" data-add="1">＋ Immobile</button>`;
  $("#propsel").classList.toggle("hidden", !state.props.length);
  $("#title").textContent = p ? p.name : "I miei Affitti";
  $("#hsub").textContent = p ? [p.type, p.tenant].filter(Boolean).join(" · ") : "";
  $("#bSet").classList.toggle("hidden", !p);
}
function render() {
  fix(); renderHeader();
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  if (!state.props.length && tab !== "exp") return renderEmpty();
  if (tab === "mesi") renderMonths();
  else if (tab === "stat") renderStats();
  else renderExport();
}
function renderEmpty() {
  $("#main").innerHTML = `<div class="empty"><p style="font-size:44px;margin:10px 0">🏠</p>
    <p><b>Nessun immobile ancora.</b><br>Aggiungi un box, un appartamento, un negozio o qualsiasi altro affitto per iniziare a segnare i pagamenti.</p>
    <div class="gap"></div><button class="btn" id="bFirst">Aggiungi immobile</button>
    <div class="gap"></div><p class="muted">Hai un backup? Puoi ripristinarlo dalla scheda «Esporta».</p></div>`;
  $("#bFirst").onclick = () => openProp(null);
}

function renderMonths() {
  const p = cur(); const s = summary(p);
  const startY = +p.start.slice(0, 4);
  const endY = p.end ? +p.end.slice(0, 4) : Infinity;
  if (viewYear < startY) viewYear = startY;
  let rows = "";
  for (let m = 1; m <= 12; m++) {
    const ym = viewYear + "-" + pad(m);
    if (!inContract(p, ym) && !paysOf(p, ym).length) continue;
    const st = status(p, ym), due = dueOf(p, ym), paid = paidOf(p, ym);
    const pl = paysOf(p, ym); const lastP = pl.length ? pl[pl.length - 1] : null;
    const sub = st === "pagato" ? `${eur.format(paid)}${lastP && lastP.date ? " · il " + fmtDate(lastP.date) : ""}`
      : paid > 0 ? `${eur.format(paid)} di ${eur.format(due)} · mancano ${eur.format(due - paid)}`
      : `${eur.format(due)} · scade il ${fmtDate(dueDate(p, ym))}`;
    const act = (st === "ritardo" || st === "scadenza" || st === "parziale") ? `<button class="quick" data-quick="${ym}">✓ Pagato</button>` : `<span class="tag ${st}">${LAB[st]}</span>`;
    rows += `<div class="m ${st}" data-ym="${ym}"><div class="t"><div class="n"><span class="mn">${MESI[m - 1]}</span>${act.startsWith("<button") ? ` <span class="tag ${st}">${LAB[st]}</span>` : ""}</div><div class="s">${sub}</div></div>${act}</div>`;
  }
  if (!rows) rows = `<div class="empty">Nessun mese di contratto nel ${viewYear}.</div>`;
  $("#main").innerHTML = `
  <div class="stats">
    <div class="stat ${s.arr > 0 ? "bad" : "good"}"><div class="l">Arretrati</div><div class="v">${eur.format(s.arr)}</div><div class="muted">${s.nArr ? s.nArr + (s.nArr === 1 ? " mese" : " mesi") + " in ritardo" : "Tutto in regola"}</div></div>
    <div class="stat"><div class="l">Canone attuale</div><div class="v">${eur.format(dueOf(p, nowYM()) || dueOf(p, s.next || p.start))}</div><div class="muted">scadenza il giorno ${p.dueDay}</div></div>
    ${s.next ? `<div class="stat wide"><div><div class="l">Prossimo da pagare</div><div class="v" style="font-size:18px;text-transform:capitalize">${ymName(s.next)}</div><div class="muted">${eur.format(Math.max(0, dueOf(p, s.next) - paidOf(p, s.next)))} entro il ${fmtDate(dueDate(p, s.next))}</div></div><button class="quick" data-quick="${s.next}">✓ Pagato</button></div>`
      : `<div class="stat wide"><div><div class="l">Contratto</div><div class="v" style="font-size:18px">Concluso</div><div class="muted">Ultimo mese: ${ymName(p.end)}</div></div></div>`}
  </div>
  <div class="yrs"><button id="yPrev" aria-label="Anno precedente"${viewYear <= startY ? " disabled" : ""}>‹</button><b>${viewYear}</b><button id="yNext" aria-label="Anno successivo"${viewYear >= endY ? " disabled" : ""}>›</button></div>
  <div class="list">${rows}</div>
  ${p.address ? `<p class="muted" style="text-align:center;margin-top:16px">${esc(p.address)}</p>` : ""}`;
  $("#yPrev").onclick = () => { viewYear--; render(); };
  $("#yNext").onclick = () => { viewYear++; render(); };
}

/* ---------- statistiche ---------- */
function scopeProps() { return statScope === "all" ? state.props : [cur()]; }
function yearsRange(props) {
  let a = Infinity, b = -Infinity;
  props.forEach(p => {
    a = Math.min(a, +p.start.slice(0, 4));
    b = Math.max(b, Math.min(new Date().getFullYear(), p.end ? +p.end.slice(0, 4) : 9999));
    Object.keys(p.payments).forEach(ym => { const y = +ym.slice(0, 4); a = Math.min(a, y); b = Math.max(b, y); });
  });
  if (!isFinite(a)) a = b = new Date().getFullYear();
  return [a, b];
}
function renderStats() {
  const props = scopeProps();
  const [y0, y1] = yearsRange(props);
  if (statYear < y0) statYear = y0; if (statYear > y1) statYear = y1;
  const nym = nowYM();
  // per mese dell'anno
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const ym = statYear + "-" + pad(m);
    let due = 0, paid = 0;
    props.forEach(p => { due += dueOf(p, ym); paid += paidOf(p, ym); });
    months.push({ ym, label: MESI3[m - 1], due, paid });
  }
  const dueToDate = months.filter(x => x.ym <= nym).reduce((s, x) => s + x.due, 0);
  const paidYear = months.reduce((s, x) => s + x.paid, 0);
  const dueYear = months.reduce((s, x) => s + x.due, 0);
  // arretrati complessivi (tutti gli anni)
  let arr = 0; props.forEach(p => { arr += summary(p).arr; });
  // puntualità nell'anno
  let onTime = 0, late = 0, lateDays = [], open = 0;
  props.forEach(p => {
    for (let m = 1; m <= 12; m++) {
      const ym = statYear + "-" + pad(m);
      if (!inContract(p, ym) || dueOf(p, ym) <= 0) continue;
      const d = delayOf(p, ym); if (d === null) continue;
      if (!settledOn(p, ym)) { open++; continue; }
      if (d <= 0) onTime++; else { late++; lateDays.push(d); }
    }
  });
  const closed = onTime + late;
  const pct = closed ? Math.round(onTime / closed * 100) : null;
  const avgLate = lateDays.length ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : 0;
  // per anno
  const years = [];
  for (let y = y0; y <= y1; y++) {
    let due = 0, paid = 0;
    props.forEach(p => { for (let m = 1; m <= 12; m++) { const ym = y + "-" + pad(m); if (ym <= nym) due += dueOf(p, ym); paid += paidOf(p, ym); } });
    years.push({ label: String(y), due, paid });
  }
  // metodi
  const met = {};
  props.forEach(p => Object.keys(p.payments).forEach(ym => { if (+ym.slice(0, 4) !== statYear) return; p.payments[ym].forEach(x => { met[x.method || "Altro"] = (met[x.method || "Altro"] || 0) + num(x.amount); }); }));
  const metList = Object.entries(met).sort((a, b) => b[1] - a[1]);
  // per immobile
  const perProp = state.props.map(p => { let s = 0; for (let m = 1; m <= 12; m++) s += paidOf(p, statYear + "-" + pad(m)); return [p.name, s]; }).sort((a, b) => b[1] - a[1]);
  const paidMonths = months.filter(x => x.paid > 0).length;

  $("#main").innerHTML = `
  ${state.props.length > 1 ? `<div class="chips light" style="margin:0 0 12px"><button class="chip${statScope === "one" ? " on" : ""}" data-scope="one">${esc(cur().name)}</button><button class="chip${statScope === "all" ? " on" : ""}" data-scope="all">Tutti gli immobili</button></div>` : ""}
  <div class="yrs"><button id="sPrev"${statYear <= y0 ? " disabled" : ""} aria-label="Anno precedente">‹</button><b>${statYear}</b><button id="sNext"${statYear >= y1 ? " disabled" : ""} aria-label="Anno successivo">›</button></div>
  <div class="stats">
    <div class="stat good"><div class="l">Pagato ${statYear}</div><div class="v">${eur.format(paidYear)}</div><div class="muted">su ${eur.format(dueYear)} dell'anno</div></div>
    <div class="stat ${dueToDate - paidYear > 0.004 ? "bad" : ""}"><div class="l">Mancante ad oggi</div><div class="v">${eur.format(Math.max(0, dueToDate - paidYear))}</div><div class="muted">arretrati totali ${eur.format(arr)}</div></div>
    <div class="stat"><div class="l">Puntualità</div><div class="v">${pct === null ? "—" : pct + "%"}</div><div class="muted">${closed ? `${onTime} su ${closed} mesi in orario` : "nessun mese saldato"}</div></div>
    <div class="stat"><div class="l">Ritardo medio</div><div class="v">${late ? avgLate + " gg" : "0 gg"}</div><div class="muted">${late ? `${late} ${late === 1 ? "mese pagato" : "mesi pagati"} in ritardo` : "nessun ritardo"}${open ? ` · ${open} aperti` : ""}</div></div>
  </div>

  <div class="card chart">
    <h3>Mese per mese</h3><div class="cs">Dovuto e pagato per ogni mese del ${statYear}. Tocca una colonna per i dettagli.</div>
    <div class="legend"><span><i style="background:var(--barDue)"></i>Dovuto</span><span><i style="background:var(--barPaid)"></i>Pagato</span></div>
    <div class="readout" id="ro1">&nbsp;</div>
    <div id="c1"></div>
    <details><summary>Mostra tabella</summary>
      <table class="tbl"><tr><th>Mese</th><th class="r">Dovuto</th><th class="r">Pagato</th><th class="r">Differenza</th></tr>
      ${months.map(x => `<tr><td style="text-transform:capitalize">${MESI[+x.ym.slice(5) - 1]}</td><td class="r">${eur.format(x.due)}</td><td class="r">${eur.format(x.paid)}</td><td class="r">${eur.format(x.paid - x.due)}</td></tr>`).join("")}
      <tr><td><b>Totale</b></td><td class="r"><b>${eur.format(dueYear)}</b></td><td class="r"><b>${eur.format(paidYear)}</b></td><td class="r"><b>${eur.format(paidYear - dueYear)}</b></td></tr></table>
    </details>
  </div>

  <div class="card"><h3>Puntualità ${statYear}</h3><div class="cs">Al centro: percentuale di mesi saldati entro la scadenza.</div>
    <div class="ring">${ring(onTime, late, open)}<div>
      <div class="legend" style="flex-direction:column;gap:6px"><span><i style="background:var(--ok)"></i>In orario: <b>${onTime}</b></span><span><i style="background:var(--warn)"></i>Saldati in ritardo: <b>${late}</b></span><span><i style="background:var(--bad)"></i>Ancora aperti: <b>${open}</b></span></div>
    </div></div>
  </div>

  ${years.length > 1 ? `<div class="card chart"><h3>Andamento negli anni</h3><div class="cs">Totale pagato per anno di competenza.</div>
    <div class="legend"><span><i style="background:var(--barDue)"></i>Dovuto</span><span><i style="background:var(--barPaid)"></i>Pagato</span></div>
    <div class="readout" id="ro2">&nbsp;</div><div id="c2"></div></div>` : ""}

  <div class="card"><h3>Metodi di pagamento ${statYear}</h3><div class="cs">Importi incassati per metodo.</div>
    ${metList.length ? hbars(metList) : `<p class="muted">Nessun pagamento registrato nel ${statYear}.</p>`}
  </div>

  ${statScope === "all" && state.props.length > 1 ? `<div class="card"><h3>Per immobile ${statYear}</h3><div class="cs">Totale pagato per ciascun immobile.</div>${hbars(perProp)}</div>` : ""}

  <p class="muted" style="text-align:center">Media mensile pagata: <b>${eur.format(paidMonths ? paidYear / paidMonths : 0)}</b> · mesi con pagamenti: ${paidMonths}</p>`;

  barChart($("#c1"), months, $("#ro1"), x => `<b style="text-transform:capitalize">${ymName(x.ym)}</b> · dovuto ${eur.format(x.due)} · pagato ${eur.format(x.paid)}`);
  if (years.length > 1) barChart($("#c2"), years, $("#ro2"), x => `<b>${x.label}</b> · dovuto ${eur.format(x.due)} · pagato ${eur.format(x.paid)}`);
  $("#sPrev").onclick = () => { statYear--; render(); };
  $("#sNext").onclick = () => { statYear++; render(); };
  document.querySelectorAll("[data-scope]").forEach(b => b.onclick = () => { statScope = b.dataset.scope; render(); });
}
function niceMax(v) { if (v <= 0) return 100; const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
function barChart(el, data, ro, fmt) {
  const W = 340, H = 180, L = 40, R = 4, T = 8, B = 22;
  const max = niceMax(Math.max(...data.map(d => Math.max(d.due, d.paid))));
  const n = data.length, gw = (W - L - R) / n, bw = Math.max(3, Math.min(14, gw * 0.32));
  const y = v => T + (H - T - B) * (1 - v / max);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafico dovuto e pagato">`;
  for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${eur0.format(v).replace(/\s?€/, "")}</text>`; }
  data.forEach((d, i) => {
    const cx = L + gw * i + gw / 2;
    s += `<rect class="sel" data-i="${i}" x="${L + gw * i + 1}" y="${T}" width="${gw - 2}" height="${H - T - B}" rx="6" style="display:none"/>`;
    const bar = (v, x, cls) => { if (v <= 0) return ""; const top = y(v), h = (H - B) - top, r = Math.min(4, h, bw / 2); return `<path class="${cls}" d="M${x},${H - B} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - B} Z"/>`; };
    s += bar(d.due, cx - bw - 1, "bd") + bar(d.paid, cx + 1, "bp");
    s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${d.label}</text>`;
    s += `<rect class="hit" data-i="${i}" x="${L + gw * i}" y="0" width="${gw}" height="${H}"/>`;
  });
  s += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--muted)" stroke-width="1"/></svg>`;
  el.innerHTML = s;
  const pick = i => { el.querySelectorAll(".sel").forEach(r => r.style.display = +r.dataset.i === i ? "" : "none"); ro.innerHTML = fmt(data[i]); };
  el.querySelectorAll(".hit").forEach(h => { h.addEventListener("click", () => pick(+h.dataset.i)); h.addEventListener("mouseenter", () => pick(+h.dataset.i)); });
}
function hbars(list) {
  const max = Math.max(...list.map(x => x[1]), 1);
  return list.map(([n, v]) => `<div class="hb"><span class="nm">${esc(n)}</span><span class="tr"><i style="width:${Math.max(v > 0 ? 2 : 0, v / max * 100)}%"></i></span><span class="vv">${eur.format(v)}</span></div>`).join("");
}
function ring(a, b, c) {
  const tot = a + b + c, R = 34, C = 2 * Math.PI * R;
  if (!tot) return `<svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--futSoft)" stroke-width="12"/><text x="42" y="47" text-anchor="middle" fill="var(--muted)" font-size="14">—</text></svg>`;
  let off = 0, s = `<svg viewBox="0 0 84 84"><g transform="rotate(-90 42 42)">`;
  [[a, "var(--ok)"], [b, "var(--warn)"], [c, "var(--bad)"]].forEach(([v, col]) => {
    if (!v) return; const len = v / tot * C; const gap = tot > v ? 2 : 0;
    s += `<circle cx="42" cy="42" r="${R}" fill="none" stroke="${col}" stroke-width="12" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}"/>`; off += len;
  });
  return s + `</g><text x="42" y="47" text-anchor="middle" fill="var(--ink)" font-size="16" font-weight="700">${a + b ? Math.round(a / (a + b) * 100) + "%" : "—"}</text></svg>`;
}

/* ---------- esportazione ---------- */
function xlDate(d) { if (!d) return ""; const [y, m, g] = d.split("-").map(Number); return (Date.UTC(y, m - 1, g) - Date.UTC(1899, 11, 30)) / 86400000; }
function buildWorkbook() {
  const XL = window.XLSX; const wb = XL.utils.book_new();
  const EUR = '#,##0.00 "€"', DATE = "dd/mm/yyyy", MON = "mmm yyyy";
  const fmtCols = (ws, rows, map) => { for (let r = 1; r <= rows; r++) for (const [c, z] of Object.entries(map)) { const a = c + (r + 1); if (ws[a] && ws[a].t === "n") ws[a].z = z; } };
  const fin = (ws, cols, nRows, lastCol) => { ws["!cols"] = cols.map(w => ({ wch: w })); ws["!autofilter"] = { ref: `A1:${lastCol}${nRows + 1}` }; };

  // 1. Pagamenti
  const pay = [["Immobile", "Tipo", "Mese di competenza", "Anno", "Data pagamento", "Importo", "Metodo", "Nota", "Giorni di ritardo", "Ricevuta n.", "Conduttore"]];
  state.props.forEach(p => Object.keys(p.payments).sort().forEach(ym => p.payments[ym].forEach(x => {
    pay.push([p.name, p.type, xlDate(ym + "-01"), +ym.slice(0, 4), xlDate(x.date), num(x.amount), x.method || "", x.note || "", x.date ? dayDiff(x.date, dueDate(p, ym)) : "", x.rn || "", tenantName(p)]);
  })));
  const ws1 = XL.utils.aoa_to_sheet(pay); fmtCols(ws1, pay.length - 1, { C: MON, E: DATE, F: EUR });
  fin(ws1, [22, 14, 16, 7, 15, 12, 16, 28, 10, 12, 22], pay.length - 1, "K");

  // 2. Riepilogo mensile (con formule)
  const mm = [["Immobile", "Tipo", "Mese", "Anno", "Scadenza", "Dovuto", "Pagato", "Differenza", "Stato", "Giorni di ritardo"]];
  state.props.forEach(p => {
    const lastPaid = Object.keys(p.payments).sort().pop() || p.start;
    const ctrEnd = p.end && p.end < nowYM() ? p.end : nowYM();
    let ym = p.start, g = 0; const end = lastPaid > ctrEnd ? lastPaid : ctrEnd;
    while (ym <= end && g < 1200) {
      const r = mm.length + 1; const d = delayOf(p, ym);
      mm.push([p.name, p.type, xlDate(ym + "-01"), +ym.slice(0, 4), xlDate(dueDate(p, ym)), dueOf(p, ym), paidOf(p, ym), { f: `G${r}-F${r}` }, LAB[status(p, ym)], d === null ? "" : d]);
      ym = ymAdd(ym, 1); g++;
    }
  });
  const nM = mm.length - 1;
  mm.push([]); mm.push(["TOTALE", "", "", "", "", { f: `SUBTOTAL(9,F2:F${nM + 1})` }, { f: `SUBTOTAL(9,G2:G${nM + 1})` }, { f: `SUBTOTAL(9,H2:H${nM + 1})` }]);
  const ws2 = XL.utils.aoa_to_sheet(mm);
  for (let r = 2; r <= mm.length; r++) { ["F", "G", "H"].forEach(c => { if (ws2[c + r]) ws2[c + r].z = EUR; }); if (ws2["C" + r]) ws2["C" + r].z = MON; if (ws2["E" + r]) ws2["E" + r].z = DATE; }
  fin(ws2, [22, 14, 12, 7, 12, 12, 12, 12, 15, 10], nM, "J");

  // 3. Riepilogo annuale (formule SOMMA.PIÙ.SE sul riepilogo mensile)
  const ya = [["Immobile", "Anno", "Dovuto", "Pagato", "Differenza", "% pagato"]];
  state.props.forEach(p => {
    const ys = new Set(); for (let i = 1; i <= nM; i++) if (mm[i][0] === p.name) ys.add(mm[i][3]);
    [...ys].sort().forEach(y => {
      const r = ya.length + 1, rg = `'Riepilogo mensile'!`;
      ya.push([p.name, y,
        { f: `SUMIFS(${rg}$F$2:$F$${nM + 1},${rg}$A$2:$A$${nM + 1},A${r},${rg}$D$2:$D$${nM + 1},B${r})` },
        { f: `SUMIFS(${rg}$G$2:$G$${nM + 1},${rg}$A$2:$A$${nM + 1},A${r},${rg}$D$2:$D$${nM + 1},B${r})` },
        { f: `D${r}-C${r}` }, { f: `IF(C${r}=0,"",D${r}/C${r})` }]);
    });
  });
  const ws3 = XL.utils.aoa_to_sheet(ya);
  for (let r = 2; r <= ya.length; r++) { ["C", "D", "E"].forEach(c => { if (ws3[c + r]) ws3[c + r].z = EUR; }); if (ws3["F" + r]) ws3["F" + r].z = "0%"; }
  fin(ws3, [22, 8, 13, 13, 13, 10], ya.length - 1, "F");

  // 4. Immobili e canoni
  const im = [["Immobile", "Tipo", "Indirizzo", "Inquilino / note", "Inizio contratto", "Fine contratto", "Giorno scadenza", "Canone dal", "Canone mensile"]];
  state.props.forEach(p => [...p.rates].sort((a, b) => a.from < b.from ? -1 : 1).forEach((r, i) => {
    im.push(i === 0 ? [p.name, p.type, p.address || "", p.tenant || "", xlDate(p.start + "-01"), p.end ? xlDate(p.end + "-01") : "", p.dueDay, xlDate(r.from + "-01"), num(r.amount)]
      : [p.name, "", "", "", "", "", "", xlDate(r.from + "-01"), num(r.amount)]);
  }));
  const ws4 = XL.utils.aoa_to_sheet(im); fmtCols(ws4, im.length - 1, { E: MON, F: MON, H: MON, I: EUR });
  fin(ws4, [22, 14, 26, 24, 14, 14, 10, 12, 13], im.length - 1, "I");

  XL.utils.book_append_sheet(wb, ws2, "Riepilogo mensile");
  XL.utils.book_append_sheet(wb, ws3, "Riepilogo annuale");
  XL.utils.book_append_sheet(wb, ws1, "Pagamenti");
  XL.utils.book_append_sheet(wb, ws4, "Immobili");
  wb.Props = { Title: "I miei Affitti", CreatedDate: new Date() };
  return wb;
}
function xlsxFile() {
  const out = window.XLSX.write(buildWorkbook(), { bookType: "xlsx", type: "array" });
  const name = `Affitti_${today()}.xlsx`;
  return new File([out], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const AB = window.AndroidBridge || null; // presente solo nell'app Android (APK)
async function toB64(file) {
  const u = new Uint8Array(await file.arrayBuffer()); let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
async function download(file) {
  if (AB) {
    const r = AB.saveFile(file.name, file.type, await toB64(file));
    if (r === "ok") return "Salvato nella cartella Download: " + file.name;
    if (r === "shared") return "Scegli dove salvare il file";
    return "Impossibile salvare il file";
  }
  const url = URL.createObjectURL(file); const a = document.createElement("a");
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "File scaricato: " + file.name;
}
async function share(file) {
  if (AB) { try { return AB.shareFile(file.name, file.type, await toB64(file)) === "ok"; } catch (e) { return false; } }
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: file.name }); return true; }
  } catch (e) { if (e && e.name === "AbortError") return true; }
  return false;
}
function backupFile() {
  return new File([JSON.stringify({ app: "I miei Affitti", version: 1, exportedAt: new Date().toISOString(), data: state }, null, 1)], `Affitti_backup_${today()}.json`, { type: "application/json" });
}
/* ---------- ricevute PDF ---------- */
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const slug = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
function receiptName(p, ym, x) { return `Ricevuta_${(x.rn || "").replace("/", "-")}_${slug(p.name)}_${slug(ymName(ym))}.pdf`; }
function receiptPdf(p, ym, x) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const W = 148, M = 14;
  const green = [23, 97, 61], ink = [21, 32, 26], gray = [95, 111, 102], red = [190, 30, 30];
  // intestazione
  doc.setFillColor(...green); doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("RICEVUTA DI PAGAMENTO", M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text("Canone di locazione", M, 22);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("N. " + (x.rn || "-"), W - M, 14, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text("Data " + fmtDate(x.date || today()), W - M, 22, { align: "right" });
  // dati
  let y = 44;
  const row = (label, value, big) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...gray); doc.text(label.toUpperCase(), M, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(big ? 15 : 12); doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(String(value), W - 2 * M);
    doc.text(lines, M, y + (big ? 7 : 6));
    y += (big ? 16 : 13) + (lines.length - 1) * 5.5;
  };
  row("Ricevuto da", tenantName(p));
  row("Immobile", p.name + (p.type ? "  (" + p.type + ")" : "") + (p.address ? "\n" + p.address : ""));
  row("Mese di riferimento", cap(ymName(ym)));
  row("Importo", eur.format(num(x.amount)), true);
  row("Mezzo di pagamento", x.method || "-");
  if (x.note) row("Note", x.note);
  doc.setDrawColor(225, 232, 228); doc.setLineWidth(0.3); doc.line(M, y - 3, W - M, y - 3);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...gray);
  doc.text(doc.splitTextToSize(`Si dichiara di aver ricevuto la somma di ${eur.format(num(x.amount))} a titolo di canone di locazione per ${ymName(ym)}, relativo all'immobile sopra indicato.`, W - 2 * M), M, y + 3);
  // timbro PAGATO (ruotato)
  const cx = 46, cy = 172, a = 12 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const R = (dx, dy) => [cx + dx * ca + dy * sa, cy - dx * sa + dy * ca];
  const box = (w, h) => { const pts = [R(-w / 2, -h / 2), R(w / 2, -h / 2), R(w / 2, h / 2), R(-w / 2, h / 2)]; for (let i = 0; i < 4; i++) { const p1 = pts[i], p2 = pts[(i + 1) % 4]; doc.line(p1[0], p1[1], p2[0], p2[1]); } };
  doc.setDrawColor(...red); doc.setLineWidth(1); box(62, 25); doc.setLineWidth(0.35); box(57, 20);
  doc.setTextColor(...red);
  const stampText = (t, size, dy) => { doc.setFont("helvetica", "bold"); doc.setFontSize(size); const w = doc.getTextWidth(t); const h = size * 0.3528 * 0.7; const s0 = R(-w / 2, dy + h / 2); doc.text(t, s0[0], s0[1], { angle: 12 }); };
  stampText("PAGATO", 24, -2.5); stampText(fmtDate(x.date || today()), 9, 6.5);
  // firma e piè di pagina
  doc.setTextColor(...gray); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Firma", W - M - 46, 178); doc.setDrawColor(...gray); doc.setLineWidth(0.3); doc.line(W - M - 46, 190, W - M, 190);
  doc.setFontSize(7.5); doc.text("Ricevuta generata con I miei Affitti", W / 2, 202, { align: "center" });
  doc.setProperties({ title: "Ricevuta " + (x.rn || ""), subject: p.name + " - " + ymName(ym) });
  return new File([doc.output("arraybuffer")], receiptName(p, ym, x), { type: "application/pdf" });
}
async function saveReceipt(p, ym, x, auto) {
  const file = receiptPdf(p, ym, x);
  if (AB && AB.saveFileIn) {
    const r = AB.saveFileIn(file.name, file.type, await toB64(file), "Ricevute affitti");
    if (r === "ok") return "Ricevuta salvata in Download › Ricevute affitti.";
    if (auto) return "";
  } else if (auto) return "";
  return await download(file);
}
function openReceipt(p, ym, x, msg) {
  if (!x) return;
  if (!window.jspdf) { toast("Componente PDF non caricato: riapri l'app"); return; }
  openSheet(`
   <h2>Ricevuta n. ${esc(x.rn || "")}</h2>
   ${msg ? `<div class="note">${esc(msg)}</div>` : ""}
   <table class="tbl rcp">
     <tr><td>Ricevuto da</td><td>${esc(tenantName(p))}</td></tr>
     <tr><td>Immobile</td><td>${esc(p.name)}</td></tr>
     <tr><td>Mese</td><td style="text-transform:capitalize">${ymName(ym)}</td></tr>
     <tr><td>Importo</td><td><b>${eur.format(num(x.amount))}</b></td></tr>
     <tr><td>Pagamento</td><td>${esc(x.method)} · ${fmtDate(x.date)}</td></tr>
   </table>
   <div class="gap"></div>
   <button class="btn" id="rSh">📤 Invia ricevuta (WhatsApp, email…)</button>
   <div class="gap"></div>
   <button class="btn sec" id="rSv">Salva PDF sul telefono</button>
   <div class="gap"></div>
   <button class="btn sec" id="rCl">Chiudi</button>`, () => {
    const g = f => async () => { try { await f(); } catch (e) { console.error(e); toast("Errore nella creazione della ricevuta"); } };
    $("#rSh").onclick = g(async () => { const f = receiptPdf(p, ym, x); if (!(await share(f))) toast(await download(f)); });
    $("#rSv").onclick = g(async () => toast(await saveReceipt(p, ym, x, false)));
    $("#rCl").onclick = closeSheet;
  });
}
function allReceipts() {
  const out = [];
  state.props.forEach(p => Object.keys(p.payments).forEach(ym => p.payments[ym].forEach(x => out.push({ p, ym, x }))));
  return out.sort((a, b) => ((b.x.date || "") + b.x.rn).localeCompare((a.x.date || "") + a.x.rn));
}
let recShown = 20;
function renderExport() {
  const nPay = state.props.reduce((s, p) => s + Object.values(p.payments).reduce((a, l) => a + l.length, 0), 0);
  const canShare = !!(navigator.canShare || AB);
  const recs = allReceipts();
  $("#main").innerHTML = `
  <div class="card"><h3>Ricevute</h3>
    <div class="cs">Ogni pagamento ha la sua ricevuta in PDF, sempre disponibile qui. Tocca una ricevuta per inviarla o salvarla.</div>
    ${AB ? `<label class="sw"><input type="checkbox" id="autoR"${state.settings.autoReceipt ? " checked" : ""}><span>Salva automaticamente ogni nuova ricevuta in <b>Download › Ricevute affitti</b></span></label>` : ""}
    ${recs.length ? `<div class="rlist">${recs.slice(0, recShown).map(r => `<button class="ritem" data-rp="${r.p.id}" data-rym="${r.ym}" data-rid="${r.x.id}"><span class="rn">${esc(r.x.rn || "")}</span><span class="rt"><b>${esc(r.p.name)}</b> · <span style="text-transform:capitalize">${ymName(r.ym)}</span><br><span class="muted">${eur.format(num(r.x.amount))} · ${esc(r.x.method)} · ${fmtDate(r.x.date)}</span></span><span>🧾</span></button>`).join("")}</div>
      ${recs.length > recShown ? `<button class="btn sec sm" id="rMore" style="margin-top:8px">Mostra altre (${recs.length - recShown})</button>` : ""}` : `<p class="muted">Nessun pagamento registrato.</p>`}
  </div>
  <div class="card"><h3>File Excel</h3>
    <div class="cs">Crea un file .xlsx con ${state.props.length} ${state.props.length === 1 ? "immobile" : "immobili"} e ${nPay} pagamenti, pronto per filtri e calcoli. Contiene: riepilogo mensile con le differenze già calcolate, riepilogo annuale con le formule, elenco completo dei pagamenti, immobili e canoni.</div>
    <button class="btn" id="xDl"${state.props.length ? "" : " disabled"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Scarica file Excel</button>
    ${canShare ? `<div class="gap"></div><button class="btn sec" id="xSh"${state.props.length ? "" : " disabled"}>Condividi file Excel (Drive, WhatsApp, email…)</button>` : ""}
  </div>
  <div class="card"><h3>Backup dei dati</h3>
    <div class="cs">I dati sono salvati <b>solo su questo telefono</b>. Fai un backup ogni tanto: se cancelli i dati del browser o cambi telefono, potrai ripristinarli da questo file.</div>
    <button class="btn sec" id="bDl">Salva backup</button>
    ${canShare ? `<div class="gap"></div><button class="btn sec" id="bSh">Condividi backup</button>` : ""}
    <div class="gap"></div>
    <label class="btn sec" style="cursor:pointer">Ripristina da backup<input type="file" id="bIn" accept=".json,application/json" hidden></label>
    ${state.savedAt ? `<p class="muted" style="margin:10px 0 0">Ultima modifica: ${new Date(state.savedAt).toLocaleString("it-IT")}</p>` : ""}
  </div>
  <div class="card" id="instCard"><h3>Installa l'app</h3>
    <div class="cs">Per aprirla come un'app dalla schermata Home: in Chrome tocca il menu ⋮ e scegli «Installa app» o «Aggiungi a schermata Home». Una volta installata funziona anche senza internet.</div>
    <button class="btn ${deferredInstall ? "" : "hidden"}" id="bInst">Installa ora</button>
  </div>`;
  if ($("#autoR")) $("#autoR").onchange = e => { state.settings.autoReceipt = e.target.checked; persist(); };
  if ($("#rMore")) $("#rMore").onclick = () => { recShown += 50; render(); };
  $("#main").querySelectorAll(".ritem").forEach(b => b.onclick = () => {
    const p = state.props.find(q => q.id === b.dataset.rp); if (!p) return;
    openReceipt(p, b.dataset.rym, paysOf(p, b.dataset.rym).find(x => x.id === b.dataset.rid));
  });
  const guard = f => async () => { if (!window.XLSX) { toast("Componente Excel non caricato: riapri l'app"); return; } try { await f(); } catch (e) { console.error(e); toast("Errore nella creazione del file"); } };
  if (state.props.length) {
    $("#xDl").onclick = guard(async () => toast(await download(xlsxFile())));
    if ($("#xSh")) $("#xSh").onclick = guard(async () => { if (!(await share(xlsxFile()))) toast(await download(xlsxFile())); });
  }
  $("#bDl").onclick = async () => toast(await download(backupFile()));
  if ($("#bSh")) $("#bSh").onclick = async () => { if (!(await share(backupFile()))) toast(await download(backupFile())); };
  $("#bIn").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const o = JSON.parse(rd.result); let d = o && o.data ? o.data : o;
        if (d && Array.isArray(d.boxes)) d = migrateOld(d);
        if (!d || !Array.isArray(d.props)) throw 0;
        confirmSheet(`Ripristinare il backup?`, `Contiene ${d.props.length} immobili. I dati attuali su questo telefono verranno sostituiti.`, "Ripristina", () => {
          state = d; fix(); persist(); tab = "mesi"; render(); toast("Backup ripristinato");
        });
      } catch (err) { toast("Il file non è un backup valido"); }
    };
    rd.readAsText(f); e.target.value = "";
  };
  if ($("#bInst")) $("#bInst").onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; render(); };
  if (AB || window.matchMedia("(display-mode: standalone)").matches) $("#instCard").classList.add("hidden");
}

/* ---------- fogli (dialoghi) ---------- */
function openSheet(html, after) { $("#sh").innerHTML = '<div class="grab"></div>' + html; $("#ov").classList.add("on"); $("#sh").scrollTop = 0; if (after) after(); }
function closeSheet() { $("#ov").classList.remove("on"); }
$("#ov").addEventListener("click", e => { if (e.target.id === "ov") closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
function confirmSheet(title, text, okLabel, fn) {
  openSheet(`<h2>${esc(title)}</h2><div class="sub">${esc(text)}</div><button class="btn danger" id="cOk">${esc(okLabel)}</button><div class="gap"></div><button class="btn sec" id="cNo">Annulla</button>`, () => {
    $("#cOk").onclick = () => { closeSheet(); fn(); }; $("#cNo").onclick = closeSheet;
  });
}
function confirmBtn(btn, label, fn) { btn.onclick = () => { if (btn.dataset.arm) fn(); else { btn.dataset.arm = 1; const o = btn.textContent; btn.textContent = label; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.arm; btn.textContent = o; } }, 3000); } }; }

function quickPay(ym) {
  const p = cur(); const rest = Math.max(0, dueOf(p, ym) - paidOf(p, ym));
  if (rest <= 0) { openMonth(ym); return; }
  openSheet(`
   <h2><span class="mn">${ymName(ym)}</span></h2>
   <div class="sub">${esc(p.name)} · ${eur.format(rest)} — come è stato pagato?</div>
   <div class="mgrid">${METODI_RAPIDI.map(([m, ic]) => `<button class="mbtn" data-m="${m}"><span>${ic}</span>${m}</button>`).join("")}</div>
   <div class="gap"></div>
   <button class="btn sec" id="qMore">Altro metodo, importo o data diversa…</button>
   <div class="gap"></div><button class="btn sec" id="qClose">Annulla</button>`, () => {
    $("#sh").querySelectorAll(".mbtn").forEach(b => b.onclick = () => {
      const x = addPayment(p, ym, { amount: rest, date: today(), method: b.dataset.m, note: "" });
      render(); afterPayment(p, ym, x);
    });
    $("#qMore").onclick = () => openMonth(ym);
    $("#qClose").onclick = closeSheet;
  });
}
function addPayment(p, ym, data) {
  const x = Object.assign({ id: uid() }, data);
  assignReceipt(x);
  p.lastMethod = x.method;
  (p.payments[ym] = p.payments[ym] || []).push(x);
  persist();
  return x;
}
/* dopo un pagamento: salva la ricevuta (solo app Android) e offre di inviarla */
async function afterPayment(p, ym, x) {
  let saved = "";
  if (AB && state.settings.autoReceipt && window.jspdf) {
    try { saved = await saveReceipt(p, ym, x, true); } catch (e) { saved = ""; }
  }
  openReceipt(p, ym, x, `Pagamento registrato. ${saved}`);
}
function openMonth(ym) {
  const p = cur(); const due = dueOf(p, ym), paid = paidOf(p, ym), st = status(p, ym); const rest = Math.max(0, due - paid);
  const list = paysOf(p, ym); const pct = due > 0 ? Math.min(100, paid / due * 100) : (paid > 0 ? 100 : 0);
  const d = delayOf(p, ym);
  openSheet(`
   <h2><span class="mn">${ymName(ym)}</span></h2>
   <div class="sub"><span class="tag ${st}">${LAB[st]}</span> &nbsp;Dovuto ${eur.format(due)} · scadenza ${fmtDate(dueDate(p, ym))}${d !== null && d > 0 ? ` · ${d} gg di ritardo` : ""}</div>
   <div class="prog"><i style="width:${pct}%"></i></div>
   ${list.length ? `<div class="sec-t">Pagamenti registrati</div>` + list.map(x => `<div class="pay"><div class="t"><span class="a">${eur.format(num(x.amount))}</span><br><span class="muted">${fmtDate(x.date)} · ${esc(x.method)}${x.note ? " · " + esc(x.note) : ""}${x.rn ? " · ric. " + x.rn : ""}</span></div><button class="rbtn" data-rec="${x.id}">🧾 Ricevuta</button><button class="x" data-del="${x.id}">Elimina</button></div>`).join("") : `<p class="muted">Nessun pagamento registrato per questo mese.</p>`}
   <div class="sec-t">${list.length ? "Aggiungi un altro pagamento" : "Registra pagamento"}</div>
   <div class="row2">
     <label class="fld"><span>Importo (€)</span><input id="pA" inputmode="decimal" value="${(rest || due).toFixed(2).replace(".", ",")}"></label>
     <label class="fld"><span>Data pagamento</span><input id="pD" type="date" value="${today()}"></label>
   </div>
   <label class="fld"><span>Metodo</span><select id="pM">${METODI.map(m => `<option${m === (p.lastMethod || "Contanti") ? " selected" : ""}>${m}</option>`).join("")}</select></label>
   <label class="fld"><span>Nota (facoltativa)</span><input id="pN" placeholder="es. ricevuta n. 12"></label>
   <button class="btn" id="pSave">Salva pagamento</button>
   <div class="gap"></div><button class="btn sec" id="pClose">Chiudi</button>`, () => {
    $("#pSave").onclick = () => {
      const a = num($("#pA").value); if (a <= 0) { toast("Inserisci un importo valido"); return; }
      const x = addPayment(p, ym, { amount: a, date: $("#pD").value || today(), method: $("#pM").value, note: $("#pN").value.trim() });
      render(); afterPayment(p, ym, x);
    };
    $("#pClose").onclick = closeSheet;
    $("#sh").querySelectorAll("[data-rec]").forEach(b => b.onclick = () => openReceipt(p, ym, paysOf(p, ym).find(x => x.id === b.dataset.rec)));
    $("#sh").querySelectorAll("[data-del]").forEach(btn => confirmBtn(btn, "Conferma", () => {
      p.payments[ym] = paysOf(p, ym).filter(x => x.id !== btn.dataset.del);
      if (!p.payments[ym].length) delete p.payments[ym];
      persist(); render(); openMonth(ym); toast("Pagamento eliminato");
    }));
  });
}
function openProp(id) {
  const p = id ? state.props.find(x => x.id === id) : null;
  const rates = p ? [...p.rates].sort((a, c) => a.from < c.from ? -1 : 1) : [{ from: nowYM(), amount: "" }];
  const rateRow = (r, i) => `<div class="rate">${i === 0 ? `<input class="rF0" value="Dall'inizio" disabled aria-label="Valido dall'inizio del contratto">` : `<input type="month" class="rF" value="${esc(r.from)}" aria-label="Valido dal mese">`}<input class="rA" inputmode="decimal" placeholder="€ al mese" aria-label="Importo mensile" value="${r.amount === "" ? "" : String(r.amount).replace(".", ",")}"><button class="x rX"${i === 0 ? " style='visibility:hidden'" : ""} aria-label="Rimuovi">✕</button></div>`;
  openSheet(`
   <h2>${p ? "Modifica immobile" : "Nuovo immobile"}</h2>
   <div class="sub">${p ? "Dati del contratto di affitto." : "Box, appartamento, negozio, terreno… qualsiasi affitto."}</div>
   <label class="fld"><span>Nome</span><input id="fN" value="${esc(p ? p.name : "")}" placeholder="es. Box piccolo, Bilocale via Roma"></label>
   <div class="row2">
     <label class="fld"><span>Tipo</span><select id="fTy">${TIPI.map(t => `<option${t === (p ? p.type : "Box / garage") ? " selected" : ""}>${t}</option>`).join("")}</select></label>
     <label class="fld"><span>Scadenza (giorno)</span><input id="fG" type="number" min="1" max="31" inputmode="numeric" value="${p ? p.dueDay : 5}"></label>
   </div>
   <label class="fld"><span>Conduttore (inquilino)</span><input id="fT" value="${esc(p ? p.tenant || "" : "")}" placeholder="es. Mario Rossi — appare sulle ricevute"></label>
   <label class="fld"><span>Indirizzo (facoltativo)</span><input id="fA" value="${esc(p ? p.address || "" : "")}" placeholder="es. Via Roma 10, Roma"></label>
   <div class="row2">
     <label class="fld"><span>Primo mese da pagare</span><input id="fS" type="month" value="${esc(p ? p.start : rates[0].from)}"></label>
     <label class="fld"><span>Ultimo mese (facoltativo)</span><input id="fE" type="month" value="${esc(p && p.end ? p.end : "")}"></label>
   </div>
   <div class="sec-t">Canone mensile</div>
   <p class="muted" style="margin-top:-4px">Se il canone cambia (es. aggiornamento ISTAT), aggiungi una riga con il mese da cui vale il nuovo importo: i mesi precedenti restano invariati.</p>
   <div id="rates">${rates.map(rateRow).join("")}</div>
   <button class="btn sec sm" id="rAdd">＋ Cambio canone</button>
   <div class="gap"></div><div class="gap"></div>
   <button class="btn" id="fSave">Salva</button>
   <div class="gap"></div>
   ${p ? `<button class="btn danger" id="fDel">Elimina immobile</button><div class="gap"></div>` : ""}
   <button class="btn sec" id="fClose">Annulla</button>`, () => {
    const wire = () => $("#rates").querySelectorAll(".rX").forEach(x => x.onclick = () => x.parentElement.remove());
    wire();
    $("#rAdd").onclick = () => { $("#rates").insertAdjacentHTML("beforeend", rateRow({ from: nowYM(), amount: "" }, $("#rates").children.length)); wire(); };
    $("#fClose").onclick = closeSheet;
    $("#fSave").onclick = () => {
      const name = $("#fN").value.trim(); if (!name) { toast("Dai un nome all'immobile"); return; }
      const start = $("#fS").value || nowYM(); const end = $("#fE").value || "";
      if (end && end < start) { toast("L'ultimo mese è prima del primo"); return; }
      const dd = Math.min(31, Math.max(1, parseInt($("#fG").value) || 5));
      const rs = [...$("#rates").children].map((r, i) => ({ from: i === 0 ? start : (r.querySelector(".rF").value || ""), amount: num(r.querySelector(".rA").value) })).filter(r => r.from);
      if (!rs.length || rs.some(r => r.amount <= 0)) { toast("Inserisci l'importo del canone"); return; }
      if (rs.slice(1).some(r => r.from <= start)) { toast("I cambi di canone devono essere dopo il primo mese"); return; }
      rs.sort((a, c) => a.from < c.from ? -1 : 1);
      const data = { name, type: $("#fTy").value, tenant: $("#fT").value.trim(), address: $("#fA").value.trim(), start, end, dueDay: dd, rates: rs };
      if (p) Object.assign(p, data);
      else { const np = { id: uid(), ...data, payments: {} }; state.props.push(np); state.current = np.id; viewYear = new Date().getFullYear(); tab = "mesi"; }
      persist(); render(); closeSheet(); toast("Salvato");
    };
    if (p) $("#fDel").onclick = () => confirmSheet(`Eliminare «${p.name}»?`, "Verranno cancellati anche tutti i suoi pagamenti. L'operazione non si può annullare (a meno di avere un backup).", "Elimina definitivamente", () => {
      state.props = state.props.filter(x => x.id !== p.id); fix(); persist(); render(); toast("Immobile eliminato");
    });
  });
}

/* ---------- eventi ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-prop],[data-add],[data-quick],[data-ym],[data-tab]"); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.prop) { state.current = t.dataset.prop; persist(); render(); return; }
  if (t.dataset.add) { openProp(null); return; }
  if (t.dataset.quick) { e.stopPropagation(); quickPay(t.dataset.quick); return; }
  if (t.dataset.ym && t.closest("#main")) openMonth(t.dataset.ym);
});
$("#bSet").onclick = () => { if (cur()) openProp(state.current); };
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; if (tab === "exp") render(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
if (!AB && "serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
/* tasto Indietro di Android: chiude prima i pannelli, poi torna alla scheda Pagamenti */
window.__androidBack = () => {
  if ($("#ov").classList.contains("on")) { closeSheet(); return true; }
  if (tab !== "mesi") { tab = "mesi"; render(); return true; }
  return false;
};

const l = load(); if (l) state = l;
render();
})();
