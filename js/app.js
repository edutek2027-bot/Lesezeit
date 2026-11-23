/* Lesezeit – App-Logik (Vanilla JS, Daten im localStorage) */
(() => {
  "use strict";

  const D = window.LZ_DATA;
  const STORE_KEY = "lesezeit.v1";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------- Sprache ----------
  // Deutsche Texte sind die Schlüssel; js/i18n.js liefert Übersetzungen für en, tr, bs.
  const I18N = window.LZ_I18N || {};
  const LOCALES = { de: "de-DE", en: "en-GB", tr: "tr-TR", bs: "bs-BA" };
  let lang = "de";
  const LOC = () => LOCALES[lang];
  // Manche Browser (z. B. Chrome) haben keine bosnischen Sprachdaten: dann eigene Namen,
  // und für Zahlen/Mehrzahl Kroatisch (gleiche Regeln: 1 dan, 2 dana, 5 dana).
  // Echte Probe statt supportedLocalesOf (das meldet bs manchmal, liefert aber englische Namen)
  const BS_OK = (() => { try { return new Intl.DateTimeFormat("bs-BA", { month: "long" }).format(new Date(2020, 10, 2)).toLowerCase().startsWith("novemb"); } catch { return false; } })();
  const NUMLOC = () => (lang === "bs" && !BS_OK ? "hr-HR" : LOC());
  const BS_M = ["januar", "februar", "mart", "april", "maj", "juni", "juli", "august", "septembar", "oktobar", "novembar", "decembar"];
  const BS_WD = ["nedjelja", "ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota"];
  function fd(d, o) {
    if (lang !== "bs" || BS_OK) return d.toLocaleDateString(LOC(), o);
    const wd = o.weekday ? (o.weekday === "long" ? BS_WD[d.getDay()] : BS_WD[d.getDay()].slice(0, 3)) : "";
    const mon = o.month === "long" ? BS_M[d.getMonth()] : BS_M[d.getMonth()].slice(0, 3);
    const dm = o.day && o.month ? (o.month === "numeric" ? `${d.getDate()}. ${d.getMonth() + 1}.` : `${d.getDate()}. ${mon}`) : o.day ? `${d.getDate()}.` : o.month ? mon : "";
    return [wd, dm].filter(Boolean).join(", ");
  }
  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : s);
  function t(src, vars) {
    const tr = lang !== "de" && I18N[lang] ? I18N[lang][src] : null;
    return fill(typeof tr === "string" ? tr : src, vars);
  }
  // Mehrzahl: Schlüssel "Einzahl|Mehrzahl"; Übersetzungen können {one, few, other} liefern
  function tn(n, one, other, vars = {}) {
    const e = lang !== "de" && I18N[lang] ? I18N[lang][one + "|" + other] : null;
    let s = n === 1 ? one : other;
    if (typeof e === "string") s = e;
    else if (e && typeof e === "object") s = e[new Intl.PluralRules(NUMLOC()).select(n)] || e.other;
    return fill(s, { ...vars, n: n.toLocaleString(NUMLOC()) });
  }
  const quoted = (x) => t("„{q}“", { q: x });
  // Statische Texte im HTML einmal erfassen (data-t, Platzhalter, ARIA-Labels, Titel)
  const ATTRS = ["placeholder", "aria-label", "title", "alt"];
  $$("[data-t]").forEach((el) => (el.dataset.tsrc = el.textContent.trim()));
  ATTRS.forEach((a) => $$(`[${a}]`).forEach((el) => (el.dataset["src" + a.replace("-", "")] = el.getAttribute(a))));
  function applyStatic() {
    document.documentElement.lang = lang;
    $$("[data-tsrc]").forEach((el) => (el.textContent = t(el.dataset.tsrc)));
    ATTRS.forEach((a) => { const k = "src" + a.replace("-", ""); $$(`[data-${k}]`).forEach((el) => el.setAttribute(a, t(el.dataset[k]))); });
    $("#langSel").value = lang; $("#pLang").value = lang;
  }

  // ---------- Hilfsfunktionen ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((parseKey(dateKey(b)) - parseKey(dateKey(a))) / 86400000);
  const WD = (d) => fd(d, { weekday: "short" }).replace(/\.$/, "");
  const fmtDate = (k) => fd(parseKey(k), { day: "numeric", month: "short" });

  const COVER_COLORS = ["#2d6a4f", "#40916c", "#1b4332", "#52796f", "#3a5a40", "#588157", "#2f5d62", "#5f7a3a", "#a1862f", "#35614f"];
  const coverColor = (t) => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COVER_COLORS[h % COVER_COLORS.length]; };
  const GENRE_EMOJI = { Roman: "📘", Abenteuer: "🗺️", Fantasy: "🐉", Krimi: "🔎", Sachbuch: "🔬", Comic: "💥", Klassiker: "🎩", Jugendbuch: "🎒", Kinderbuch: "🧸", Biografie: "👤", Lyrik: "🪶", Sonstiges: "📗" };
  const STATUS_LABEL = { lesen: "Lese ich", gelesen: "Gelesen", wunsch: "Wunsch" }; // über t() angezeigt

  // ---------- Zustand ----------
  const defaultState = () => ({ profile: null, books: [], sessions: [], words: [], lines: [], timer: null, seenBadges: [], tipIndex: 0 });
  let state;
  try { state = Object.assign(defaultState(), JSON.parse(localStorage.getItem(STORE_KEY)) || {}); }
  catch { state = defaultState(); }
  if (!Array.isArray(state.words)) state.words = [];
  if (!Array.isArray(state.lines)) state.lines = [];
  if (!Array.isArray(state.recoHidden)) state.recoHidden = [];
  if (!Array.isArray(state.recoCustom)) state.recoCustom = [];
  if (!state.recoEdits || typeof state.recoEdits !== "object") state.recoEdits = {};
  lang = LOCALES[state.lang] ? state.lang : (LOCALES[(navigator.language || "de").slice(0, 2)] ? navigator.language.slice(0, 2) : "de");
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* Speicher nicht verfügbar */ } };

  const bookById = (id) => state.books.find((b) => b.id === id);
  const dayOfYear = (d = new Date()) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const quoteOfDay = () => D.quotes[dayOfYear() % D.quotes.length];
  const rot = (k) => { let h = 0; for (const c of k) h = (h * 33 + c.charCodeAt(0)) >>> 0; return (h % 23) - 14; }; // feste "Stempel-Schräge" je Datum
  const group = () => state.profile?.group || "erwachsene";

  // ---------- Kennzahlen ----------
  function minutesByDay() {
    const m = {};
    for (const s of state.sessions) m[s.date] = (m[s.date] || 0) + s.minutes;
    return m;
  }
  function pagesByDay() {
    const m = {};
    for (const s of state.sessions) m[s.date] = (m[s.date] || 0) + (s.pages || 0);
    return m;
  }
  const PAGE_DEFAULT = { kinder: 10, jugend: 15, erwachsene: 20 };
  const goalMin = () => state.profile?.goal || 20;
  const goalPg = () => state.profile?.goalPages || PAGE_DEFAULT[group()];
  // Ein Tagesziel: entweder Seiten oder Minuten (Standard: Seiten)
  const goalType = () => (state.profile?.goalType === "minutes" ? "minutes" : "pages");
  const goalIsPages = () => goalType() === "pages";
  const goalTarget = () => (goalIsPages() ? goalPg() : goalMin());
  const goalVal = (min, pg) => (goalIsPages() ? pg : min);
  const goalLen = (n) => (goalIsPages() ? tn(n, "{n} Seite", "{n} Seiten") : tn(n, "{n} Minute", "{n} Minuten"));
  const goalDone = (min, pg) => goalVal(min, pg) >= goalTarget();
  // Lesetempo (Minuten pro Seite): aus eigenen Einträgen mit Minuten UND Seiten, sonst Startwert nach Altersgruppe.
  // Startwerte nach Studien zur Lesegeschwindigkeit (Erwachsene ca. 240–260 Wörter/Min., Kinder deutlich langsamer).
  const PACE_DEFAULT = { kinder: 3, jugend: 2, erwachsene: 1.5 };
  function paceInfo() {
    let m = 0, p = 0, n = 0;
    for (const s of state.sessions) if (!s.estMin && s.minutes > 0 && s.pages > 0) { m += s.minutes; p += s.pages; n++; }
    if (n >= 3 && p >= 30) return { mpp: Math.min(8, Math.max(0.4, m / p)), own: true, n };
    return { mpp: PACE_DEFAULT[group()] || 1.5, own: false, n };
  }
  const minPerPage = () => paceInfo().mpp;
  const autoMinOn = () => state.profile?.autoMin !== false;
  const fmtPace = (v) => v.toLocaleString(NUMLOC(), { maximumFractionDigits: 1, minimumFractionDigits: v % 1 ? 1 : 0 });
  // Ein Tag zählt als Lesetag, wenn Minuten ODER Seiten eingetragen sind
  function readSet() {
    const r = new Set();
    for (const s of state.sessions) if ((s.minutes || 0) > 0 || (s.pages || 0) > 0) r.add(s.date);
    return r;
  }
  function streak() {
    const r = readSet();
    let d = new Date();
    if (!r.has(dateKey(d))) d = addDays(d, -1); // heute noch offen → Serie zählt ab gestern
    let n = 0;
    while (r.has(dateKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }
  function bestStreak() {
    const days = [...readSet()].sort();
    let best = 0, cur = 0, prev = null;
    for (const k of days) { cur = prev && daysBetween(parseKey(prev), parseKey(k)) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = k; }
    return best;
  }
  function totals() {
    const minutes = state.sessions.reduce((a, s) => a + s.minutes, 0);
    const pages = state.sessions.reduce((a, s) => a + (s.pages || 0), 0);
    const finished = state.books.filter((b) => b.status === "gelesen").length;
    return { minutes, pages, finished, sessions: state.sessions.length };
  }
  const fmtDuration = (min) => (min < 60 ? t("{n} Min.", { n: min }) : min % 60 ? t("{h} Std. {m} Min.", { h: Math.floor(min / 60), m: min % 60 }) : t("{h} Std.", { h: Math.floor(min / 60) }));

  function sinceText(b) {
    if (b.status === "wunsch") return t("auf der Wunschliste");
    if (!b.startDate) return "";
    const start = parseKey(b.startDate);
    if (b.status === "gelesen" && b.endDate) {
      const n = Math.max(1, daysBetween(start, parseKey(b.endDate)) + 1);
      return t("in {len} gelesen", { len: tn(n, "{n} Tag", "{n} Tagen") });
    }
    const n = daysBetween(start, new Date());
    if (n <= 0) return t("seit heute");
    if (n === 1) return t("seit gestern");
    if (n < 14) return tn(n, "seit {n} Tag", "seit {n} Tagen");
    if (n < 60) return tn(Math.round(n / 7), "seit {n} Woche", "seit {n} Wochen");
    return tn(Math.round(n / 30), "seit {n} Monat", "seit {n} Monaten");
  }
  // Erste Textseite (z. B. 11): die Seiten davor zählen weder für den Fortschritt noch als gelesene Seiten
  const firstPage = (b) => Math.max(1, b?.firstPage || 1);
  const pct = (b) => {
    if (!b.pages) return b.status === "gelesen" ? 100 : 0;
    if (b.status === "gelesen") return 100;
    const base = firstPage(b) - 1, span = b.pages - base;
    return span > 0 ? Math.max(0, Math.min(100, Math.round(((Math.max(base, b.currentPage || 0) - base) / span) * 100))) : 0;
  };
  const bookMinutes = (id) => state.sessions.filter((s) => s.bookId === id).reduce((a, s) => a + s.minutes, 0);

  // ---------- Erfolge ----------
  const BADGES = [
    { id: "first-book", ico: "📗", name: "Regal eröffnet", desc: "Erstes Buch hinzugefügt", test: () => state.books.length >= 1 },
    { id: "first-session", ico: "⏱️", name: "Los geht's", desc: "Erste Lese-Einheit", test: () => state.sessions.length >= 1 },
    { id: "goal", ico: "🎯", name: "Ziel erreicht", desc: "Tagesziel an einem Tag erreicht", test: () => { const pm = pagesByDay(); return Object.entries(minutesByDay()).some(([k, m]) => goalDone(m, pm[k] || 0)); } },
    { id: "streak3", ico: "🌱", name: "Drei am Stück", desc: "3 Tage in Folge gelesen", test: () => bestStreak() >= 3 },
    { id: "streak7", ico: "🌳", name: "Wochen-Held", desc: "7 Tage in Folge gelesen", test: () => bestStreak() >= 7 },
    { id: "streak30", ico: "🏆", name: "Gewohnheit!", desc: "30 Tage in Folge gelesen", test: () => bestStreak() >= 30 },
    { id: "finish1", ico: "✅", name: "Ausgelesen", desc: "Erstes Buch beendet", test: () => totals().finished >= 1 },
    { id: "finish5", ico: "📚", name: "Bücherstapel", desc: "5 Bücher beendet", test: () => totals().finished >= 5 },
    { id: "pages100", ico: "📄", name: "100 Seiten", desc: "100 Seiten gelesen", test: () => totals().pages >= 100 },
    { id: "pages1000", ico: "🗻", name: "Seitenberg", desc: "1.000 Seiten gelesen", test: () => totals().pages >= 1000 },
    { id: "hours10", ico: "⌛", name: "10 Stunden", desc: "Insgesamt 10 Stunden gelesen", test: () => totals().minutes >= 600 },
    { id: "long", ico: "🧘", name: "Tief versunken", desc: "45 Minuten am Stück", test: () => state.sessions.some((s) => s.minutes >= 45) },
    { id: "early", ico: "🌅", name: "Frühaufsteher/in", desc: "Vor 8 Uhr gelesen", test: () => state.sessions.some((s) => s.hour != null && s.hour < 8) },
    { id: "owl", ico: "🦉", name: "Nachteule", desc: "Nach 21 Uhr gelesen", test: () => state.sessions.some((s) => s.hour != null && s.hour >= 21) },
    { id: "critic", ico: "✍️", name: "Rezensent/in", desc: "Ein Buch bewertet und Notizen geschrieben", test: () => state.books.some((b) => b.rating && b.notes?.trim()) },
    { id: "words10", ico: "🔤", name: "Wortsammler/in", desc: "10 Wörter im Wortschatz", test: () => state.words.length >= 10 },
    { id: "journal5", ico: "✒️", name: "Tagebuch", desc: "5 Einträge mit einem Satz zum Lesen", test: () => state.sessions.filter((x) => x.note).length >= 5 },
    { id: "lines5", ico: "📜", name: "Zitatesammler/in", desc: "5 wichtige Sätze gesammelt", test: () => state.lines.length >= 5 },
    { id: "patch1", ico: "🪡", name: "Nicht aufgegeben", desc: "Einen gerissenen Faden geflickt", test: () => state.sessions.some((x) => x.patched) },
    { id: "genres", ico: "🎨", name: "Vielleser/in", desc: "Bücher aus 3 Gattungen", test: () => new Set(state.books.filter((b) => b.status !== "wunsch").map((b) => b.genre)).size >= 3 }
  ];
  let quietBadges = false;
  function checkBadges() {
    if (quietBadges) return;
    checkRewards(true);
    const fresh = BADGES.filter((b) => b.test() && !state.seenBadges.includes(b.id));
    if (!fresh.length) return;
    state.seenBadges.push(...fresh.map((b) => b.id));
    save();
    setTimeout(() => { toast(`${fresh[0].ico} ` + t("Neuer Erfolg: {name}!", { name: t(fresh[0].name) })); confetti(); }, 400);
  }

  // ---------- Navigation ----------
  function go(view) {
    editSid = null;
    if (!$("#view-" + view)) view = "uebersicht";
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
    if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    render(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.addEventListener("click", (e) => {
    const n = e.target.closest("[data-nav]");
    if (n) { e.preventDefault(); go(n.dataset.nav); }
  });

  // ---------- Rendering ----------
  function render(view = location.hash.slice(1) || "uebersicht") {
    ({ uebersicht: renderDashboard, regal: renderShelf, timer: renderTimerView, entdecken: renderDiscover, erfolge: renderBadges }[view] || renderDashboard)();
  }

  // Fadenkreis: der Faden läuft beim Lesen im Kreis; ist der Kreis geschlossen, wird oben ein Knoten geknüpft
  function spoolSvg(r) {
    const R = 46, C = 2 * Math.PI * R, done = r >= 1;
    const a = -Math.PI / 2 + r * 2 * Math.PI, x = (60 + R * Math.cos(a)).toFixed(1), y = (60 + R * Math.sin(a)).toFixed(1);
    return `<circle class="fr-track" cx="60" cy="60" r="${R}"/>
      <circle class="fr-thread" cx="60" cy="60" r="${R}" transform="rotate(-90 60 60)" style="--c:${C.toFixed(1)};--to:${(C * (1 - r)).toFixed(1)}" stroke-dasharray="${C.toFixed(1)}"/>
      ${done
        ? `<g class="fr-knot"><circle cx="60" cy="14" r="9"/><path d="M54 12q6-4 12 0M53.5 16q6.5-4 13 0"/></g><path class="fr-check" d="M48 61l8 8 16-17"/>`
        : `${r > 0 ? `<circle class="fr-needle" cx="${x}" cy="${y}" r="5"/>` : ""}<text class="fr-pct" x="60" y="66" text-anchor="middle">${Math.round(r * 100)}%</text>`}`;
  }
  // „Heute“-Karte: mit ‹ › zu gestern und früheren Tagen blättern (0 = heute, -1 = gestern …)
  let goalOffset = 0;
  function renderGoal() {
    const d = addDays(new Date(), goalOffset), k = dateKey(d), isToday = goalOffset === 0;
    const mn = minutesByDay()[k] || 0, pg = pagesByDay()[k] || 0;
    const target = goalTarget(), v = goalVal(mn, pg), r = Math.min(1, v / target), done = r >= 1;
    $("#goalTitle").textContent = isToday ? t("Heute") : goalOffset === -1 ? t("Gestern") : fd(d, { weekday: "short", day: "numeric", month: "short" });
    $("#goalNext").disabled = isToday;
    $("#goalPrev").disabled = goalOffset <= -60;
    $("#goalLbl").textContent = t(goalIsPages() ? "Seiten" : "Minuten");
    $("#goalSpool").innerHTML = spoolSvg(r);
    $("#goalSpool").classList.toggle("done", done);
    countUp($("#goalVal"), v);
    $("#goalOfV").textContent = target;
    $("#goalVal").closest(".spool-num").classList.toggle("ok", done);
    // der andere Wert nur zur Info
    const other = goalIsPages() ? mn : pg;
    $("#goalOther").textContent = other ? (goalIsPages() ? tn(mn, "{n} Minute", "{n} Minuten") : tn(pg, "{n} Seite", "{n} Seiten")) + " " + t("zusätzlich eingetragen") : "";
    $("#goalPct").textContent = done ? t("geschafft") : "";
    $("#goalStamp").hidden = !done;
    const list = goalLen(target - v);
    $("#goalHint").textContent = isToday
      ? (done ? t("Heute ist dein Stempel sicher.") : !mn && !pg ? t("Noch nicht gelesen. Zehn Minuten reichen für den Anfang.") : t("Noch {list}.", { list }))
      : (done ? t("An diesem Tag hast du dein Ziel erreicht.") : !mn && !pg ? t(patchableDays().includes(k) ? "An diesem Tag ist der Faden gerissen. Du kannst ihn noch flicken." : "An diesem Tag wurde nicht gelesen.") : t("Es fehlten {list}.", { list }));
  }
  $("#goalEdit").addEventListener("click", () => openDay(dateKey(addDays(new Date(), goalOffset)), "day"));
  $("#goalPrev").addEventListener("click", () => { goalOffset = Math.max(-60, goalOffset - 1); renderGoal(); });
  $("#goalNext").addEventListener("click", () => { goalOffset = Math.min(0, goalOffset + 1); renderGoal(); });

  function renderDashboard() {
    const p = state.profile;
    const h = new Date().getHours();
    const hello = t(h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend");
    $("#greeting").textContent = p?.name ? `${hello}, ${p.name}.` : `${hello}.`;
    $("#todayLabel").textContent = fd(new Date(), { weekday: "long", day: "numeric", month: "long" }).replace(",", " ·");
    const q = quoteOfDay();
    $("#quoteText").textContent = `„${q.text}“`;
    $("#quoteBy").textContent = "— " + t(q.by);
    const qTr = t(q.text);
    $("#quoteTr").hidden = qTr === q.text;
    $("#quoteTr").textContent = qTr === q.text ? "" : quoted(qTr);

    renderGoal();

    // Leseschal: jeder Lesetag strickt eine Reihe (grün = Ziel erreicht, orange = gelesen)
    renderScarf();
    const m = minutesByDay();

    // Zahlen
    const tot = totals();
    countUp($("#statBooks"), tot.finished);
    countUp($("#statPages"), tot.pages);
    const pi = paceInfo(), anyEst = state.sessions.some((x) => x.estMin);
    $("#statPace").textContent = t("Ø Lesetempo: ca. {n} Min. pro Seite", { n: fmtPace(pi.mpp) }) + " · " + t(pi.own ? "aus deinen Lesezeiten" : "Startwert") + (anyEst ? " · " + t("Lesezeit teils geschätzt") : "");
    $("#statHours").textContent = tot.minutes < 60 ? t("{n} Min.", { n: tot.minutes }) : t("{h} Std.", { h: (tot.minutes / 60).toLocaleString(NUMLOC(), { maximumFractionDigits: 1 }) });
    countUp($("#statWords"), state.words.length);
    countUp($("#statSessions"), tot.sessions);
    $("#statBest").textContent = t("{n} T.", { n: bestStreak() });

    renderThread();
    renderWords();

    // Aktuelle Bücher
    const cur = state.books.filter((b) => b.status === "lesen");
    $("#currentList").innerHTML = cur.length
      ? cur.map((b) => `
        <div class="current">
          <button type="button" class="mini-cover" data-edit="${b.id}" style="--c:${coverColor(b.title)}" aria-label="${esc(t("Buch bearbeiten"))}">${b.emoji || GENRE_EMOJI[b.genre] || "📘"}</button>
          <button type="button" class="current-main" data-edit="${b.id}">
            <h3>${esc(b.title)}</h3>
            <p>${esc(b.author || t("Unbekannt"))} · ${b.pages ? t("Seite {a} von {b}", { a: b.currentPage || 0, b: b.pages }) : t("Seitenzahl offen")} · ${t("{d} gelesen", { d: fmtDuration(bookMinutes(b.id)) })}</p>
            <div class="progress"><i data-w="${pct(b)}"></i></div>
          </button>
          <div class="current-side"><span class="since">${esc(sinceText(b))}</span><button type="button" class="btn small" data-pages="${b.id}">＋ ${esc(t("Seiten"))}</button></div>
        </div>`).join("")
      : `<div class="empty"><span class="em">${t("Gerade kein Buch auf dem Nachttisch.")}</span><button class="link" data-nav="entdecken">${t("Empfehlungen ansehen →")}</button></div>`;
    animateProgress($("#currentList"));

    renderChart();

    showTip(false);
  }

  // Lesegarderobe: jeden Monat ein neues Strickstück. Jeder Tag des Monats ist eine Reihe (von unten nach oben):
  // grün = Tagesziel erreicht, orange = gelesen, blass = nicht gelesen. Die heutige Reihe wächst mit dem Tagesziel.
  // Vergangene Monate bleiben als kleine Sammlung des Jahres sichtbar.
  const GARMENTS = [
    { name: "Mütze", done: "Deine Mütze ist fertig!", d: ["M38 82Q36 34 70 30Q104 34 102 82Z", "M33 78h74a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H33a3 3 0 0 1-3-3V81a3 3 0 0 1 3-3Z", "M70 12a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z"] },
    { name: "Fäustlinge", done: "Deine Fäustlinge sind fertig!", d: ["M58 96V46Q58 20 79 20Q100 20 100 46V96Z", "M58 58Q42 56 41 44Q41 34 49 33Q57 33 58 44Z"] },
    { name: "Schal", done: "Dein Schal ist fertig!", d: ["M56 8h30v80h-30Z", "M56 8h30l4 14H52Z"] },
    { name: "Socken", done: "Deine Socken sind fertig!", d: ["M54 8H82V58L100 72Q110 82 103 92Q97 99 86 97L60 92Q50 89 52 78Z"] },
    { name: "Pullover", done: "Dein Pullover ist fertig!", d: ["M52 14L61 9H79L88 14L108 28L102 52L92 46V96H48V46L38 52L32 28Z"] },
    { name: "Teppich", done: "Dein Teppich ist fertig!", d: ["M32 26h76v62H32Z"] },
  ];
  const garmentFor = (m) => GARMENTS[m % GARMENTS.length];
  function garmentSvg(g, key, cells, todayR, mini) {
    // cells: Liste pro Monatstag: "goal" | "read" | "miss" | "future" | "today"
    const n = cells.length, top = 8, bot = 97, h = (bot - top) / n;
    let rows = "";
    cells.forEach((c, i) => {
      if (c === "future") return;
      const y = bot - (i + 1) * h, w = c === "today" ? Math.max(.08, todayR) * 140 : 140;
      const cls = c === "today" ? (todayR >= 1 ? "k-goal" : "k-read") : "k-" + c;
      rows += `<rect class="${cls}" x="0" y="${y.toFixed(2)}" width="${w.toFixed(1)}" height="${(h + .25).toFixed(2)}"${mini ? "" : ` style="animation-delay:${(.1 + i * .035).toFixed(2)}s"`}/>`;
    });
    const shapes = g.d.map((d) => `<path d="${d}"/>`).join("");
    const outline = g.d.map((d) => `<path class="k-line" d="${d}"/>`).join("");
    const fringe = g.name === "Teppich" ? [32, 108].map((x) => [0, 1, 2, 3, 4, 5, 6].map((j) => `<path class="k-fringe" d="M${x} ${30 + j * 9}h${x < 70 ? -6 : 6}"/>`).join("")).join("")
      : g.name === "Schal" ? [0, 1, 2, 3, 4].map((j) => `<path class="k-fringe" d="M${59 + j * 6} 88v8"/>`).join("") : "";
    return `<defs><clipPath id="clip-${key}">${shapes}</clipPath><pattern id="knit-${key}" width="6" height="5" patternUnits="userSpaceOnUse"><path d="M0 0l3 4l3-4" class="k-tex"/></pattern></defs>
      <g clip-path="url(#clip-${key})"><rect class="k-base" x="0" y="0" width="140" height="104"/>${rows}<rect x="0" y="0" width="140" height="104" fill="url(#knit-${key})"/></g>${outline}${fringe}`;
  }
  function monthCells(y, m, mins, pgs) {
    const today = dateKey(new Date()), n = new Date(y, m + 1, 0).getDate(), out = [];
    for (let d = 1; d <= n; d++) {
      const k = dateKey(new Date(y, m, d)), mn = mins[k] || 0, pg = pgs[k] || 0;
      if (k === today) out.push("today");
      else if (k > today) out.push("future");
      else out.push(goalDone(mn, pg) ? "goal" : mn || pg ? "read" : "miss");
    }
    return out;
  }
  function renderScarf() {
    const mins = minutesByDay(), pgs = pagesByDay(), now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const today = dateKey(now), tMin = mins[today] || 0, tPg = pgs[today] || 0, readToday = tMin > 0 || tPg > 0;
    const r = Math.min(1, goalVal(tMin, tPg) / goalTarget());
    const cells = monthCells(y, m, mins, pgs), g = garmentFor(m);
    const knitted = cells.filter((c) => c === "goal" || c === "read").length + (readToday ? 1 : 0), green = cells.filter((c) => c === "goal").length + (r >= 1 ? 1 : 0);
    $("#treeStage").textContent = `${fd(now, { month: "long" })} · ${t(g.name)}`;
    $("#streakDays").textContent = Math.round((knitted / cells.length) * 100) + " %";
    $("#streakWord").textContent = t("gestrickt");
    $("#petalNext").textContent = r >= 1 ? t("Die heutige Reihe ist fertig.") : readToday ? t("Noch {len}, dann ist die heutige Reihe grün.", { len: goalLen(goalTarget() - goalVal(tMin, tPg)) }) : t("Lies heute, dann strickst du eine neue Reihe.");
    $("#tree").innerHTML = garmentSvg(g, "now", cells, readToday ? r : 0, false);
    const leftDays = PATCH_MIN - knitted;
    if (leftDays > 0 && !ensureRewards().patches[`${y}-${pad(m + 1)}`]) $("#petalNext").textContent += " " + tn(leftDays, "Noch {n} Lesetag, dann ist dein Stück fertig.", "Noch {n} Lesetage, dann ist dein Stück fertig.");
    // Sammlung: die fertigen Stücke dieses Jahres
    let ward = "";
    for (let mm = 0; mm < m; mm++) {
      const c = monthCells(y, mm, mins, pgs), any = !!ensureRewards().patches[`${y}-${pad(mm + 1)}`];
      ward += `<figure class="w-item${any ? "" : " w-empty"}" title="${fd(new Date(y, mm, 1), { month: "long" })} · ${t(garmentFor(mm).name)}"><svg class="knit" viewBox="0 0 140 104">${garmentSvg(garmentFor(mm), "m" + mm, c, 0, true)}</svg><figcaption>${fd(new Date(y, mm, 1), { month: "short" })}</figcaption></figure>`;
    }
    $("#wardrobe").innerHTML = ward ? `<p class="w-title">${t("Fertig in {y}", { y })}</p><div class="w-row">${ward}</div>` : "";
    $("#gardenNote").textContent = t("1 Reihe = 1 Tag · grün = Ziel erreicht") + (green ? ` · ${tn(green, "{n} × Ziel", "{n} × Ziel")}` : "");
  }

  // Lesefaden: die letzten 4 Wochen als Schlangenlinie. Jeder Lesetag ist ein Kreuzstich,
  // aufeinanderfolgende Lesetage werden mit Faden verbunden, eine Lücke lässt ihn reißen.
  // Lesefaden pro Kalendermonat: Tag 1 oben links, dann als Schlangenlinie (7 Tage pro Zeile)
  const F_COLS = 7, F_COLW = 100, F_ROWH = 84;
  let fadenMonth = 0; // 0 = aktueller Monat, -1 = Vormonat …
  function fPos(i) {
    const r = Math.floor(i / F_COLS), c = i % F_COLS;
    const ltr = r % 2 === 0;
    return [50 + (ltr ? c : F_COLS - 1 - c) * F_COLW, 42 + r * F_ROWH];
  }
  function fSeg(i) {
    const [x1, y1] = fPos(i), [x2, y2] = fPos(i + 1);
    if (y1 === y2) return `M${x1} ${y1} L${x2} ${y2}`;
    const dir = x1 > 350 ? 1 : -1; // Wende am Zeilenende als Bogen nach außen
    return `M${x1} ${y1} C${x1 + dir * 72} ${y1} ${x2 + dir * 72} ${y2} ${x2} ${y2}`;
  }
  // Knoten im Faden: umwickeltes Garnknötchen, das sich beim Erscheinen festzieht.
  // Grün = gelesen, Gold mit Ring = Tagesziel erreicht.
  function knot(x, y, gold, dl) {
    return `<g transform="translate(${x} ${y})"><g class="knot ${gold ? "gold" : ""}" style="animation-delay:${dl}s">
      ${gold ? `<circle class="kr" r="17"/>` : ""}
      <circle class="kb" r="${gold ? 11 : 9.5}"/>
      <path class="kw" d="M-6.8 -4Q0 -9.6 6.8 -4M-8.6 1Q0 -5 8.6 1M-6.4 5.6Q0 .8 6.4 5.6"${gold ? ` transform="scale(1.15)"` : ""}/>
      <circle class="ks" cx="-3.4" cy="-4.4" r="${gold ? 2.2 : 1.8}"/></g></g>`;
  }
  function renderThread() {
    const mins = minutesByDay(), pgs = pagesByDay(), now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + fadenMonth, 1);
    const N = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: N }, (_, i) => dateKey(new Date(first.getFullYear(), first.getMonth(), i + 1)));
    const rows = Math.ceil(N / F_COLS);
    $("#faden").setAttribute("viewBox", `-14 -10 728 ${rows * F_ROWH + 16}`);
    const isCur = fadenMonth === 0, todayK = dateKey();
    const T = isCur ? days.indexOf(todayK) : N - 1; // letzter Tag, der schon war
    const rs = readSet(), read = days.map((k) => rs.has(k));
    const full = days.map((k) => goalDone(mins[k] || 0, pgs[k] || 0));
    const patchedSet = new Set(state.sessions.filter((x) => x.patched).map((x) => x.date));
    const canPatch = new Set(patchableDays());
    const delay = (i) => 0.3 + i * 0.06;
    let guide = "", threads = "", marks = "", labels = "", extra = "", hits = "";
    for (let i = 0; i < N - 1; i++) guide += fSeg(i) + " ";
    for (let i = 0; i < N; i++) {
      const [x, y] = fPos(i), d = parseKey(days[i]);
      if (i > T) { // Zukunft: nur angedeutet
        marks += `<circle class="hole future" cx="${x}" cy="${y}" r="4"/>`;
        labels += `<text class="lbl future" x="${x}" y="${y + 36}">${d.getDate()}</text>`;
        continue;
      }
      if (i < T && read[i] && read[i + 1]) {
        threads += `<path class="thread" pathLength="1" d="${fSeg(i)}" style="animation-delay:${delay(i) + 0.12}s"/><path class="twist" d="${fSeg(i)}" style="animation-delay:${delay(i) + 0.45}s"/>`;
      }
      if (read[i] && i < T && !read[i + 1]) {
        const [nx, ny] = fPos(i + 1);
        const sx = ny === y ? Math.sign(nx - x) : (x > 350 ? 1 : -1), sy = ny === y ? 0 : 1;
        const ex = x + sx * 30, ey = y + sy * 24;
        extra += `<g class="fray" style="animation-delay:${delay(i) + 0.2}s"><path d="M${x} ${y} L${ex} ${ey}"/>
          <path class="fiber" d="M${ex} ${ey} q${sx * 8 || 6} ${sy ? 8 : -6} ${sx * 15 || 4} ${sy ? 15 : -5}"/>
          <path class="fiber" d="M${ex} ${ey} q${sx * 9 || -6} ${sy ? 4 : 5} ${sx * 16 || -4} ${sy ? 12 : 9}" style="animation-delay:-1.2s"/></g>`;
      }
      if (read[i] && patchedSet.has(days[i])) {
        marks += `<rect class="patch" x="${x - 20}" y="${y - 20}" width="40" height="40" rx="5" transform="rotate(${rot(days[i]) / 2} ${x} ${y})" style="animation-delay:${delay(i) - 0.1}s"/>`;
      }
      if (read[i]) {
        marks += knot(x, y, full[i], delay(i));
      } else if (canPatch.has(days[i])) {
        marks += `<g class="patchable" data-patch="${days[i]}" role="button" tabindex="0" aria-label="${t("{d} flicken", { d: fd(d, { day: "numeric", month: "long" }) })}">
               <circle class="ph-ring" cx="${x}" cy="${y}" r="15"/><path class="ph-plus" d="M${x - 6} ${y}H${x + 6}M${x} ${y - 6}V${y + 6}"/></g>`;
      } else {
        marks += `<circle class="hole" cx="${x}" cy="${y}" r="5.5"/>`;
      }
      const isToday = isCur && i === T;
      labels += `<text class="lbl ${isToday ? "today" : ""}" x="${x}" y="${y + 36}">${isToday ? t("Heute") : d.getDate()}</text>`;
      if (!canPatch.has(days[i])) hits += `<circle class="hit" cx="${x}" cy="${y + 8}" r="34" data-day="${days[i]}" role="button" tabindex="0" aria-label="${t("{d} ansehen", { d: fd(d, { weekday: "long", day: "numeric", month: "long" }) })}"/>`;
    }
    // Nadel nur im laufenden Monat: nach dem heutigen Knoten – oder wartend über dem heutigen Loch
    if (isCur && T >= 0) {
      const [tx, ty] = fPos(T), endDelay = delay(T) + 0.4;
      const needle = (x, y) => `<g class="needle" transform="translate(${x} ${y}) rotate(-45)" style="animation-delay:${endDelay}s"><g class="needle-move">
          <path class="needle-body" d="M0 -3.2 L58 -1.6 Q66 0 58 1.6 L0 3.2 Q-4 0 0 -3.2Z" transform="translate(-6 0)"/>
          <ellipse class="needle-eye" cx="1" cy="0" rx="4" ry="1.3"/></g></g>`;
      if (read[T]) {
        extra += `<path class="needle-thread" d="M${tx} ${ty} q14 -2 18 -18" style="opacity:0;animation:fadeIn .4s ease ${endDelay}s forwards"/>` + needle(tx + 18, ty - 18);
      } else {
        extra += `<circle class="today-ring" cx="${tx}" cy="${ty}" r="14"/>`;
        if (T > 0 && read[T - 1]) extra += `<path class="pending" d="${fSeg(T - 1)}"/>`;
        extra += needle(tx + 8, ty - 8);
      }
    }
    // Monatskopf mit Bilanz
    const mName = fd(first, { month: "long" });
    $("#fadenMonthLbl").textContent = mName.charAt(0).toLocaleUpperCase(LOC()) + mName.slice(1) + " " + first.getFullYear();
    $("#fadenPrev").disabled = fadenMonth <= -24;
    $("#fadenNext").disabled = isCur;
    const past = days.slice(0, T + 1);
    const mRead = past.filter((k) => rs.has(k)).length, mGoal = past.filter((k) => goalDone(mins[k] || 0, pgs[k] || 0)).length;
    const mPages = past.reduce((a2, k) => a2 + (pgs[k] || 0), 0);
    $("#fadenMonthStat").textContent = `${tn(mRead, "{n} Lesetag", "{n} Lesetage")} · ${t("{n}× Ziel", { n: mGoal })} · ${tn(mPages, "{n} Seite", "{n} Seiten")}`;
    $("#faden").innerHTML = `<path class="guide" d="${guide}"/>${threads}${extra}${marks}${labels}${hits}`;

    const st = streak(), best = bestStreak();
    $("#fadenStat").textContent = t("Faden {a} T. · Rekord {b} T.", { a: st, b: best });
    $("#fadenSub").textContent = read[T]
      ? t("Heutiger Knoten geknüpft. Dein Faden ist {len} lang.", { len: tn(st, "{n} Tag", "{n} Tage") })
      : st > 0 ? t("Heute fehlt noch ein Knoten, sonst reißt dein Faden.")
      : t("Jeder Lesetag ist ein Knoten im Faden. Lies heute und fang einen neuen Faden an.");
    const gaps = patchableDays();
    $("#patchNote").hidden = !gaps.length;
    if (gaps.length) {
      const last = fd(parseKey(gaps[gaps.length - 1]), { weekday: "long", day: "numeric", month: "long" });
      $("#patchNoteText").textContent = gaps.length === 1
        ? t("Am {day} ist der Faden gerissen. Lies {len} nach, dann flickst du ihn.", { day: last, len: goalLen(goalTarget()) })
        : t("{count} Tage lassen sich noch flicken. Pro Tag liest du {len} nach.", { count: gaps.length, len: goalLen(goalTarget()) });
    }
  }

  // ---------- Faden flicken ----------
  // Verpasste Tage der letzten 7 Tage (nach dem ersten Lesetag) lassen sich nachholen:
  // einmal das Tagesziel in Minuten nachlesen, dann zählt der Tag wieder als Lesetag.
  const PATCH_WINDOW = 7;
  function patchableDays() {
    const rs = readSet(), keys = [...rs].sort();
    if (!keys.length) return [];
    const first = keys[0], out = [];
    for (let i = PATCH_WINDOW; i >= 1; i--) {
      const k = dateKey(addDays(new Date(), -i));
      if (k > first && !rs.has(k)) out.push(k);
    }
    return out;
  }
  let patchPick = null, patchPending = null; // patchPending: Tag, für den der nächste Timer flickt
  const longDay = (k) => fd(parseKey(k), { weekday: "long", day: "numeric", month: "long" });
  function openPatch(day) {
    const gaps = patchableDays();
    if (!gaps.length) { toast(t("Gerade gibt es nichts zu flicken.")); return; }
    patchPick = gaps.includes(day) ? day : gaps[gaps.length - 1];
    $("#patchManualBox").hidden = true;
    $("#patchManual").hidden = false;
    $("#patchGo").textContent = t("Mit Timer nachlesen");
    renderPatchDialog();
    $("#patchDialog").showModal();
  }
  function renderPatchDialog() {
    $("#patchDays").innerHTML = patchableDays().map((k) => `<button type="button" class="chip ${k === patchPick ? "active" : ""}" data-pday="${k}">${fd(parseKey(k), { weekday: "short", day: "numeric", month: "short" })}</button>`).join("");
    $("#patchRule").textContent = t("Lies einmal {len} am Stück nach. Das zählt dann für {day}, nicht für heute.", { len: goalLen(goalTarget()), day: longDay(patchPick) });
  }
  $("#patchDays").addEventListener("click", (e) => { const c = e.target.closest("[data-pday]"); if (c) { patchPick = c.dataset.pday; renderPatchDialog(); } });
  $("#patchCancel").addEventListener("click", () => $("#patchDialog").close());
  $("#patchOpen").addEventListener("click", () => openPatch());
  const fadenAct = (el) => { const g = el.closest("[data-patch]"); if (g) return openPatch(g.dataset.patch); const h = el.closest("[data-day]"); if (h) openDay(h.dataset.day, "day"); };
  $("#faden").addEventListener("click", (e) => fadenAct(e.target));
  $("#faden").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-patch],[data-day]")) { e.preventDefault(); fadenAct(e.target); } });
  $("#fadenPrev").addEventListener("click", () => { fadenMonth = Math.max(-24, fadenMonth - 1); renderThread(); });
  $("#fadenNext").addEventListener("click", () => { fadenMonth = Math.min(0, fadenMonth + 1); renderThread(); });
  $("#weekOpen").addEventListener("click", () => openDay(dateKey(), "week"));

  // ---------- Tages- und Wochenblick ----------
  let dvDay = dateKey(), dvMode = "day";
  const sessionsOn = (k) => state.sessions.filter((x) => x.date === k);
  const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7); };
  const mondayOf = (k) => { const d = parseKey(k); return addDays(d, -((d.getDay() + 6) % 7)); };
  function openDay(k, mode = "day") {
    editSid = null;
    dvDay = k > dateKey() ? dateKey() : k; dvMode = mode;
    renderDayView();
    if (!$("#dayDialog").open) $("#dayDialog").showModal();
  }
  function renderDayView() {
    $$("#dayMode button").forEach((b) => b.classList.toggle("active", b.dataset.dmode === dvMode));
    if (dvMode === "day") renderDayBody(); else renderWeekBody();
  }
  // „· 25 Min. · 18 S. · nachgelesen am 20. Nov.“
  const sessionMeta = (x) => "· " + [x.pages ? t("{n} S.", { n: x.pages }) : "", x.minutes ? (x.estMin ? t("ca. {n} Min.", { n: x.minutes }) : t("{n} Min.", { n: x.minutes })) : ""].filter(Boolean).join(" · ") + (x.patched ? " · " + t("nachgelesen am {d}", { d: fmtDate(x.readOn) }) : "");
  // Bearbeiten eines Eintrags (editSid = id) oder neuer Eintrag (editSid = "new")
  let editSid = null;
  function sessionForm(x) {
    const books = state.books.filter((b) => b.status !== "wunsch");
    const bookSel = x ? "" : `<label class="field"><span>${t("Buch")}</span><select data-f="book">${books.filter((b) => b.status === "lesen").map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("")}<option value="">${t("Ohne bestimmtes Buch")}</option></select></label>`;
    return `<li class="ds-form" data-sid="${x ? x.id : "new"}">
      ${x ? `<strong>${esc(bookById(x.bookId)?.title || t("Freies Lesen"))}</strong>` : ""}
      ${bookSel}
      <div class="row">
        <label class="field"><span>${t("Seiten")}</span><input type="number" min="0" max="2000" inputmode="numeric" data-f="pages" value="${x ? x.pages || 0 : ""}" placeholder="0"></label>
        <label class="field"><span>${t("Minuten")} <small>${t("(optional)")}</small></span><input type="number" min="0" max="600" inputmode="numeric" data-f="minutes" value="${x ? x.minutes || "" : ""}" placeholder="0"></label>
      </div>
      <label class="field"><span>${t("Ein Satz zum Lesen")} <small>${t("(optional)")}</small></span><input data-f="note" maxlength="200" value="${x ? esc(x.note || "") : ""}" placeholder="${t("Was ist passiert?")}"></label>
      ${x ? `<label class="field"><span>${t("Datum")}</span><input type="date" data-f="date" value="${x.date}" max="${dateKey()}"></label>` : ""}
      <div class="modal-actions">
        ${x ? `<button type="button" class="btn danger" data-s-del>${t("Löschen")}</button>` : ""}
        <span class="spacer"></span>
        <button type="button" class="btn" data-s-cancel>${t("Abbrechen")}</button>
        <button type="button" class="btn primary" data-s-save>${t("Speichern")}</button>
      </div></li>`;
  }
  // Seitenänderung eines Eintrags auch auf die aktuelle Seite des Buchs übertragen
  function shiftBook(bookId, delta) {
    const b = bookById(bookId); if (!b || !delta) return;
    b.currentPage = Math.max(0, (b.currentPage || 0) + delta);
    if (b.pages) b.currentPage = Math.min(b.pages, b.currentPage);
    if (b.status === "gelesen" && b.pages && b.currentPage < b.pages) { b.status = "lesen"; b.endDate = null; }
    b.updated = Date.now();
  }
  function saveSessionForm(li) {
    const pages = Math.max(0, Math.min(2000, parseInt(li.querySelector('[data-f="pages"]').value) || 0));
    const minutes = Math.max(0, Math.min(600, parseInt(li.querySelector('[data-f="minutes"]').value) || 0));
    if (!minutes && !pages) { toast(t("Bitte Seiten oder Minuten eintragen.")); return; }
    const note = li.querySelector('[data-f="note"]').value.trim().slice(0, 200);
    if (li.dataset.sid === "new") {
      editSid = null;
      logSession({ bookId: li.querySelector('[data-f="book"]').value, minutes, pagesRead: pages, note, date: dvDay });
    } else {
      const x = state.sessions.find((s) => s.id === li.dataset.sid); if (!x) return;
      const date = li.querySelector('[data-f="date"]').value || x.date;
      if (date > dateKey()) { toast(t("Das Datum liegt in der Zukunft.")); return; }
      shiftBook(x.bookId, pages - (x.pages || 0));
      if (date !== x.date) { x.date = date; x.hour = null; }
      if (x.estMin && minutes === x.minutes && pages !== x.pages && autoMinOn()) minutes = pages ? Math.max(1, Math.round(pages * minPerPage())) : 0;
      else if (minutes !== x.minutes) delete x.estMin;
      x.pages = pages; x.minutes = minutes; x.note = note;
      editSid = null; save(); checkBadges(); render(); toast(t("Gespeichert ✓"));
    }
    if ($("#dayDialog").open) renderDayBody();
  }
  async function deleteSession(id) {
    const x = state.sessions.find((s) => s.id === id); if (!x) return;
    if (!(await askConfirm(t("Diesen Eintrag löschen?")))) return;
    shiftBook(x.bookId, -(x.pages || 0));
    state.sessions = state.sessions.filter((s) => s.id !== id);
    editSid = null; save(); render(); if ($("#dayDialog").open) renderDayBody(); toast(t("Eintrag gelöscht."));
  }
  function renderDayBody() {
    const k = dvDay, d = parseKey(k), ss = sessionsOn(k);
    const m = ss.reduce((a, x) => a + x.minutes, 0), pg = ss.reduce((a, x) => a + (x.pages || 0), 0);
    const isToday = k === dateKey(), done = goalDone(m, pg), patched = ss.some((x) => x.patched);
    $("#dayKicker").textContent = isToday ? t("Heute") : t("KW {n}", { n: isoWeek(d) });
    $("#dayTitle").textContent = fd(d, { weekday: "long", day: "numeric", month: "long" });
    $("#dayNext").disabled = isToday;
    const words = state.words.filter((w) => w.date === k), lines = state.lines.filter((l) => l.date === k);
    const pt = patched ? " · " + t("geflickt") : "";
    const status = !m && !pg ? `<span class="day-status">${t(isToday ? "Noch kein Knoten" : "Nicht gelesen")}</span>`
      : done ? `<span class="day-status gold">● ${t("Ziel erreicht")}${pt}</span>`
      : `<span class="day-status ok">● ${t("Gelesen")}${pt}</span>`;
    const canP = patchableDays().includes(k);
    $("#dayBody").innerHTML = `${status}
      ${m || pg ? `<div>
        <div class="ruler-block"><div class="ruler-head"><span>${t(goalIsPages() ? "Seiten" : "Minuten")}</span><strong class="${goalVal(m, pg) >= goalTarget() ? "ok" : ""}">${goalVal(m, pg)} / ${goalTarget()}</strong></div><div class="ruler"><i style="width:${Math.min(100, (goalVal(m, pg) / goalTarget()) * 100)}%"></i></div></div>
        ${(goalIsPages() ? m : pg) ? `<p class="goal-other">${goalIsPages() ? tn(m, "{n} Minute", "{n} Minuten") : tn(pg, "{n} Seite", "{n} Seiten")} ${t("zusätzlich eingetragen")}</p>` : ""}
      </div>
      <ul class="day-sessions">${ss.map((x) => editSid === x.id ? sessionForm(x) : `<li><div class="ds-row"><span><strong>${esc(bookById(x.bookId)?.title || t("Freies Lesen"))}</strong> <span class="muted">${sessionMeta(x)}</span></span>
        <button type="button" class="link ds-edit" data-edit-s="${x.id}" aria-label="${t("Eintrag bearbeiten")}">✎ ${t("Bearbeiten")}</button></div>${x.note ? `<p class="entry-note">${esc(quoted(x.note))}</p>` : ""}</li>`).join("")}</ul>`
      : `<p class="day-empty">${t(isToday ? "Heute fehlt noch ein Knoten." : canP ? "An diesem Tag ist der Faden gerissen. Du kannst ihn noch flicken." : "An diesem Tag wurde nicht gelesen.")}</p>`}
      ${words.length ? `<div><p class="kicker" style="margin-bottom:.4rem">${t("Neue Wörter")}</p><div class="words">${words.map((w) => `<span class="word">${esc(w.w)}</span>`).join("")}</div></div>` : ""}
      ${lines.length ? `<div class="lines">${lines.map((l) => `<figure class="line"><blockquote>${esc(quoted(l.text))}</blockquote><figcaption>${esc(bookById(l.bookId)?.title || "")}${l.page ? " · " + t("S. {n}", { n: l.page }) : ""}</figcaption></figure>`).join("")}</div>` : ""}
      ${isToday && !done ? `<div class="day-actions"><button class="btn primary" type="button" data-dv="read">${t("Jetzt lesen")}</button></div>` : ""}
      ${canP ? `<div class="day-actions"><button class="btn primary" type="button" data-dv="patch">${t("Faden flicken")}</button></div>` : ""}
      ${editSid === "new" ? `<ul class="day-sessions">${sessionForm(null)}</ul>` : `<div class="day-actions"><button class="btn" type="button" data-add-s>＋ ${t("Seiten & Minuten eintragen")}</button></div>`}`;
  }
  let wkMode = null; // Wochenblick: startet mit dem Maß des Tagesziels
  function renderWeekBody() {
    if (!wkMode) wkMode = goalIsPages() ? "pg" : "min";
    const mon = mondayOf(dvDay), todayK = dateKey();
    const days = Array.from({ length: 7 }, (_, i) => dateKey(addDays(mon, i)));
    const mins = minutesByDay(), pgs = pagesByDay();
    const past = days.filter((k) => k <= todayK), n = past.length || 1;
    const sumM = past.reduce((a, k) => a + (mins[k] || 0), 0), sumP = past.reduce((a, k) => a + (pgs[k] || 0), 0);
    const rsW = readSet(), readDays = past.filter((k) => rsW.has(k)).length, goals = past.filter((k) => goalDone(mins[k] || 0, pgs[k] || 0)).length;
    const pgMode = wkMode === "pg", src = pgMode ? pgs : mins;
    const prev = Array.from({ length: 7 }, (_, i) => dateKey(addDays(mon, i - 7))).reduce((a, k) => a + (src[k] || 0), 0);
    const prevAvg = prev / 7, avg = (pgMode ? sumP : sumM) / n;
    const best = past.reduce((b, k) => ((src[k] || 0) > (src[b] || 0) ? k : b), past[0]);
    const sun = addDays(mon, 6);
    $("#dayKicker").textContent = t("KW {n}", { n: isoWeek(mon) });
    $("#dayTitle").textContent = `${fd(mon, mon.getMonth() !== sun.getMonth() ? { day: "numeric", month: "short" } : { day: "numeric" })} – ${fd(sun, { day: "numeric", month: "long" })}`;
    $("#dayNext").disabled = days.includes(todayK);
    const fmt1 = (v) => v.toLocaleString(NUMLOC(), { maximumFractionDigits: 1 });
    const goalV = pgMode ? goalPg() : goalMin();
    const max = Math.max(goalV, ...days.map((k) => src[k] || 0));
    const trend = prev ? Math.round(((avg - prevAvg) / prevAvg) * 100) : null;
    const notes = [];
    const bestDay = fd(parseKey(best), { weekday: "long" });
    if (readDays && src[best]) notes.push(pgMode ? t("Stärkster Tag: {day} mit {n} Seiten.", { day: bestDay, n: src[best] }) : t("Stärkster Tag: {day} mit {n} Minuten.", { day: bestDay, n: src[best] }));
    if (trend !== null) notes.push(pgMode
      ? (trend >= 0 ? t("Ø {n} % mehr Seiten pro Tag als in der Vorwoche.", { n: trend }) : t("Ø {n} % weniger Seiten pro Tag als in der Vorwoche.", { n: -trend }))
      : (trend >= 0 ? t("Ø {n} % mehr Lesezeit pro Tag als in der Vorwoche.", { n: trend }) : t("Ø {n} % weniger Lesezeit pro Tag als in der Vorwoche.", { n: -trend })));
    else if (readDays) notes.push(t("In der Vorwoche gab es noch keine Lesezeit zum Vergleichen."));
    if (past.length < 7) notes.push(t("Die Woche läuft noch: Durchschnitt über {len}.", { len: tn(past.length, "{n} Tag", "{n} Tage") }));
    if (!readDays) notes.push(t("In dieser Woche wurde noch nicht gelesen."));
    $("#dayBody").innerHTML = `
      <dl class="wk-tiles">
        <div class="wk-tile"><dt>${t("Ø Seiten/Tag")}</dt><dd>${fmt1(sumP / n)}</dd></div>
        <div class="wk-tile"><dt>${t("Ø Minuten/Tag")}</dt><dd>${fmt1(sumM / n)}</dd></div>
        <div class="wk-tile"><dt>${t("Lesetage")}</dt><dd>${readDays}/${past.length}</dd></div>
        <div class="wk-tile"><dt>${t("Ziel erreicht")}</dt><dd>${goals}×</dd></div>
      </dl>
      <div class="seg-mini wk-mode" id="wkMode" role="tablist" aria-label="${t("Diagramm zeigt")}">
        <button type="button" data-wkm="pg" class="${pgMode ? "active" : ""}" role="tab">${t("Seiten")}</button>
        <button type="button" data-wkm="min" class="${pgMode ? "" : "active"}" role="tab">${t("Minuten")}</button>
      </div>
      <div class="wk-chart ${pgMode ? "pg" : ""}">
        ${pgMode === goalIsPages() ? `<div class="wk-goal" data-ratio="${goalV / max}"><span>${pgMode ? t("Ziel {n} S.", { n: goalV }) : t("Ziel {n}′", { n: goalV })}</span></div>` : ""}
        ${days.map((k) => { const v = src[k] || 0, fut = k > todayK; return `<button type="button" class="wk-bar ${k === dvDay ? "sel" : ""} ${fut ? "future" : ""}" data-wday="${k}" ${fut ? "disabled" : ""} aria-label="${fd(parseKey(k), { weekday: "long" })}: ${pgMode ? tn(v, "{n} Seite", "{n} Seiten") : tn(v, "{n} Minute", "{n} Minuten")}">
          <div class="col" data-h="${fut ? 100 : (v / max) * 100}">${v ? `<b>${v}</b>` : ""}</div>
          <span>${goalDone(mins[k] || 0, pgs[k] || 0) ? `<i class="kn"></i>` : ""}${WD(parseKey(k))}</span></button>`; }).join("")}
      </div>
      <ul class="wk-notes">${notes.map((t) => `<li>${t}</li>`).join("")}</ul>
      <p class="muted" style="margin:0;font-size:.82rem">${t("Gesamt diese Woche: {p} Seiten · {m} Minuten. Tippe auf einen Balken für den Tag.", { m: sumM, p: sumP })}</p>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$("#dayBody .wk-bar .col").forEach((c) => (c.style.height = c.dataset.h + "%"));
      // Ziel-Linie genau auf Höhe der Balkenskala setzen
      const chart = $("#dayBody .wk-chart"), bar = chart.querySelector(".wk-bar"), lbl = bar.querySelector("span");
      const labelH = bar.getBoundingClientRect().bottom - lbl.getBoundingClientRect().top + 4;
      const area = bar.clientHeight - labelH;
      const g = chart.querySelector(".wk-goal"); if (g) g.style.bottom = `${labelH + area * +g.dataset.ratio}px`;
    }));
  }
  $("#dayBody").addEventListener("click", (e) => { const b = e.target.closest("[data-wkm]"); if (b) { wkMode = b.dataset.wkm; renderWeekBody(); } });
  $("#dayMode").addEventListener("click", (e) => { const b = e.target.closest("[data-dmode]"); if (b) { dvMode = b.dataset.dmode; renderDayView(); } });
  $("#dayPrev").addEventListener("click", () => { editSid = null; dvDay = dateKey(addDays(parseKey(dvDay), dvMode === "day" ? -1 : -7)); renderDayView(); });
  $("#dayNext").addEventListener("click", () => { editSid = null; const n = dateKey(addDays(parseKey(dvDay), dvMode === "day" ? 1 : 7)); dvDay = n > dateKey() ? dateKey() : n; renderDayView(); });
  $("#dayClose").addEventListener("click", () => $("#dayDialog").close());
  $("#dayBody").addEventListener("click", (e) => {
    const w = e.target.closest("[data-wday]"); if (w) { dvDay = w.dataset.wday; dvMode = "day"; editSid = null; renderDayView(); return; }
    const ed = e.target.closest("[data-edit-s]"); if (ed) { editSid = ed.dataset.editS; renderDayBody(); return; }
    if (e.target.closest("[data-add-s]")) { editSid = "new"; renderDayBody(); return; }
    if (e.target.closest("[data-s-cancel]")) { editSid = null; renderDayBody(); return; }
    if (e.target.closest("[data-s-save]")) { saveSessionForm(e.target.closest(".ds-form")); return; }
    if (e.target.closest("[data-s-del]")) { deleteSession(e.target.closest(".ds-form").dataset.sid); return; }
    const a = e.target.closest("[data-dv]"); if (!a) return;
    $("#dayDialog").close();
    if (a.dataset.dv === "read") go("timer"); else openPatch(dvDay);
  });
  $("#patchManual").addEventListener("click", () => {
    $("#patchManualBox").hidden = false; $("#patchManual").hidden = true;
    $("#patchMinLbl").textContent = t(goalIsPages() ? "Wie viele Seiten hast du nachgelesen?" : "Wie lange hast du nachgelesen?");
    $("#patchMin").value = goalTarget(); $("#patchMin").min = goalTarget();
    $("#patchBook").innerHTML = state.books.filter((b) => b.status === "lesen").map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("") + `<option value="">${t("Ohne bestimmtes Buch")}</option>`;
    $("#patchGo").textContent = t("Flicken");
  });
  $("#patchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!patchPick) return;
    if (!$("#patchManualBox").hidden) {
      const m = parseInt($("#patchMin").value) || 0;
      if (m < goalTarget()) { toast(t("Zum Flicken brauchst du mindestens {len}.", { len: goalLen(goalTarget()) })); return; }
      $("#patchDialog").close();
      logSession(goalIsPages() ? { bookId: $("#patchBook").value, minutes: 0, pagesRead: m, date: patchPick, patched: true } : { bookId: $("#patchBook").value, minutes: m, date: patchPick, patched: true });
      return;
    }
    patchPending = patchPick; preset = goalMin();
    $("#patchDialog").close();
    go("timer");
  });
  $("#patchBannerCancel").addEventListener("click", () => { patchPending = null; updateClock(); });

  let collectMode = "words";
  function renderLines() {
    const books = state.books.filter((b) => b.status !== "wunsch");
    const sel = $("#lineBook"), v = sel.value;
    sel.innerHTML = `<option value="">${t("Buch wählen …")}</option>` + books.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("");
    if (v && books.some((b) => b.id === v)) sel.value = v; else if (books.find((b) => b.status === "lesen")) sel.value = books.find((b) => b.status === "lesen").id;
    const list = [...state.lines].sort((a, b) => b.ts - a.ts);
    $("#lines").innerHTML = list.length
      ? list.slice(0, 6).map((l, i) => `<figure class="line" style="animation-delay:${i * 0.04}s"><blockquote>${esc(quoted(l.text))}</blockquote>
          <figcaption>${esc(bookById(l.bookId)?.title || t("ohne Buch"))}${l.page ? " · " + t("S. {n}", { n: l.page }) : ""} · ${fmtDate(l.date)}</figcaption>
          <button type="button" data-delline="${l.id}" aria-label="${t("Satz entfernen")}">×</button></figure>`).join("")
      : `<p class="words-empty">${t("Halte Sätze fest, die dich berühren, überraschen oder zum Nachdenken bringen. Mit Seitenzahl findest du sie wieder.")}</p>`;
  }
  function renderCollectCount() {
    const w = state.words.length, l = state.lines.length;
    $("#wordCount").textContent = [w ? tn(w, "{n} Wort", "{n} Wörter") : "", l ? tn(l, "{n} Satz", "{n} Sätze") : ""].filter(Boolean).join(" · ");
  }
  $("#collectMode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmode]"); if (!b) return;
    collectMode = b.dataset.cmode;
    $$("#collectMode button").forEach((x) => x.classList.toggle("active", x === b));
    $("#collectWords").hidden = collectMode !== "words"; $("#collectLines").hidden = collectMode !== "lines";
    if (collectMode === "lines") renderLines();
  });
  $("#lineForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("#lineInput").value.trim().replace(/^[„"“»«]+|[“"”«»]+$/g, "").trim();
    if (!text) { $("#lineInput").focus(); return; }
    const page = parseInt($("#linePage").value) || null;
    state.lines.push({ id: uid(), text, bookId: $("#lineBook").value || null, page, date: dateKey(), ts: Date.now() });
    save(); $("#lineInput").value = ""; $("#linePage").value = "";
    renderLines(); renderCollectCount(); checkBadges(); toast("📜 " + t("Satz gespeichert."));
  });
  $("#lines").addEventListener("click", (e) => {
    const b = e.target.closest("[data-delline]"); if (!b) return;
    state.lines = state.lines.filter((l) => l.id !== b.dataset.delline); save(); renderLines(); renderCollectCount();
  });

  function renderWords() {
    const list = [...state.words].sort((a, b) => b.ts - a.ts);
    renderCollectCount();
    if (collectMode === "lines") renderLines();
    $("#words").innerHTML = list.length
      ? list.slice(0, 18).map((w, i) => `<span class="word" style="animation-delay:${i * 0.03}s" title="${esc(fmtDate(w.date))}${bookById(w.bookId) ? " · " + esc(bookById(w.bookId).title) : ""}">${esc(w.w)}<button type="button" data-delword="${w.id}" aria-label="${esc(t("{w} entfernen", { w: w.w }))}">×</button></span>`).join("")
      : `<p class="words-empty">${t("Sammle Wörter, die neu, schön oder schwierig sind. Wer sie aufschreibt, behält sie.")}</p>`;
  }
  function addWord(word, bookId = null, date = dateKey()) {
    const w = word.trim().replace(/\s+/g, " ");
    if (!w) return false;
    if (state.words.some((x) => x.w.toLowerCase() === w.toLowerCase())) { toast(t("„{w}“ steht schon in deinem Wortschatz.", { w })); return false; }
    state.words.push({ id: uid(), w, bookId: bookId || null, date, ts: Date.now() });
    return true;
  }
  $("#wordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (addWord($("#wordInput").value)) { save(); $("#wordInput").value = ""; renderWords(); countUp($("#statWords"), state.words.length); checkBadges(); }
  });
  $("#words").addEventListener("click", (e) => {
    const b = e.target.closest("[data-delword]"); if (!b) return;
    state.words = state.words.filter((w) => w.id !== b.dataset.delword); save(); renderWords(); $("#statWords").textContent = state.words.length;
  });

  let chartMode = null, chartSel = null;
  function renderChart() {
    if (!chartMode) chartMode = goalIsPages() ? "pg" : "min";
    $$("#chartMode button").forEach((x) => x.classList.toggle("active", x.dataset.mode === chartMode));
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    const keys = days.map((d) => dateKey(d));
    if (!keys.includes(chartSel)) chartSel = keys[6];
    const pgMode = chartMode === "pg", mins = minutesByDay(), pgs = pagesByDay();
    const src = pgMode ? pgs : mins;
    const vals = keys.map((k) => src[k] || 0);
    const max = Math.max(pgMode ? goalPg() : goalMin(), ...vals);
    $("#weekChart").classList.toggle("pg", pgMode);
    $("#weekChart").innerHTML = days.map((d, i) => `
      <button type="button" class="bar ${keys[i] === chartSel ? "sel" : ""}" data-cday="${keys[i]}" aria-label="${fd(d, { weekday: "long", day: "numeric", month: "long" })}: ${tn(pgs[keys[i]] || 0, "{n} Seite", "{n} Seiten")}, ${tn(mins[keys[i]] || 0, "{n} Minute", "{n} Minuten")}">
        <div class="col" data-h="${(vals[i] / max) * 100}">${vals[i] ? `<b>${vals[i]}</b>` : ""}</div>
        <span>${i === 6 ? t("Heute") : WD(d)}</span>
      </button>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => $$("#weekChart .col").forEach((c) => (c.style.height = c.dataset.h + "%"))));
    renderChartInfo();
  }
  function renderChartInfo() {
    const k = chartSel, d = parseKey(k), pg = pagesByDay()[k] || 0, mn = minutesByDay()[k] || 0;
    const label = k === dateKey() ? t("Heute") : fd(d, { weekday: "long", day: "numeric", month: "long" });
    $("#chartInfo").innerHTML = `<span><strong>${esc(label)}</strong> · <b class="ci-pg">${tn(pg, "{n} Seite", "{n} Seiten")}</b> · ${tn(mn, "{n} Minute", "{n} Minuten")}</span>
      <button type="button" class="link" data-open-day="${k}">${t("Tagesblick →")}</button>`;
  }
  $("#weekChart").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cday]"); if (!b) return;
    chartSel = b.dataset.cday;
    $$("#weekChart .bar").forEach((x) => x.classList.toggle("sel", x === b));
    renderChartInfo();
  });
  $("#chartInfo").addEventListener("click", (e) => { const b = e.target.closest("[data-open-day]"); if (b) openDay(b.dataset.openDay, "day"); });
  $("#chartMode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    chartMode = b.dataset.mode;
    $$("#chartMode button").forEach((x) => x.classList.toggle("active", x === b));
    renderChart();
  });

  function allTips() { return [...D.tips[group()], ...D.tips.alle]; }
  function showTip(next) {
    const tips = allTips();
    if (next) { state.tipIndex = (state.tipIndex + 1) % tips.length; save(); }
    const tip = tips[(state.tipIndex + new Date().getDate()) % tips.length];
    const el = $("#tipOfDay");
    el.innerHTML = `<span class="tip-ico">${tip.ico}</span><p><strong>${esc(t(tip.title))}</strong>${esc(t(tip.text))}</p>`;
    el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap");
  }

  let shelfFilter = "alle";
  function renderShelf() {
    const list = state.books.filter((b) => shelfFilter === "alle" || b.status === shelfFilter);
    const order = { lesen: 0, wunsch: 1, gelesen: 2 };
    list.sort((a, b) => order[a.status] - order[b.status] || (b.updated || 0) - (a.updated || 0));
    $("#shelf").innerHTML = list.map((b, i) => `
      <button class="book" data-edit="${b.id}" style="animation-delay:${i * 0.04}s" aria-label="${esc(t("{t} bearbeiten", { t: b.title }))}">
        <div class="book-inner" style="--c:${coverColor(b.title)}">
          <span class="badge-status">${t(STATUS_LABEL[b.status])}</span>
          <span class="book-emoji">${b.emoji || GENRE_EMOJI[b.genre] || "📘"}</span>
          <div class="book-title">${esc(b.title)}</div>
          <div class="book-author">${esc(b.author)}</div>
          <div class="book-foot">
            ${b.rating ? "★".repeat(b.rating) + "<br>" : ""}
            ${b.status !== "wunsch" && b.pages ? `${pct(b)} % · ${t("{a}/{b} S.", { a: b.status === "gelesen" ? b.pages : b.currentPage || 0, b: b.pages })}` : ""}
            ${b.status !== "wunsch" ? `<div class="progress"><i data-w="${pct(b)}"></i></div>` : ""}
          </div>
        </div>
        <div class="book-meta"><span>${esc(sinceText(b))}</span><span>${bookMinutes(b.id) ? fmtDuration(bookMinutes(b.id)) : ""}</span></div>
      </button>`).join("") + `
      <button class="book add" id="shelfAdd"><div class="book-inner"><span class="book-emoji">＋</span><div class="book-title">${t("Neues Buch")}</div></div></button>`;
    animateProgress($("#shelf"));
  }
  $("#shelfFilters").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    shelfFilter = c.dataset.filter;
    $$("#shelfFilters .chip").forEach((x) => x.classList.toggle("active", x === c));
    renderShelf();
  });

  // Empfehlungen: eingebaute (übersetzbar) + eigene; beide lassen sich bearbeiten oder entfernen
  let discGroup = null;
  function recoList(g) {
    const builtin = D.recommendations[g].map((r, i) => {
      const id = `${g}:${i}`, ed = state.recoEdits[id];
      return { ...r, ...(ed || {}), id, builtin: true, edited: !!ed, group: g };
    }).filter((r) => !state.recoHidden.includes(r.id));
    return [...builtin, ...state.recoCustom.filter((r) => r.group === g)];
  }
  const recoById = (id) => {
    for (const g of Object.keys(D.recommendations)) { const r = recoList(g).find((x) => x.id === id); if (r) return r; }
    return null;
  };
  function renderDiscover(g = discGroup || group()) {
    discGroup = g;
    $$("#recoFilters .chip").forEach((c) => c.classList.toggle("active", c.dataset.group === g));
    const have = new Set(state.books.map((b) => b.title.toLowerCase()));
    const list = recoList(g);
    const txt = (r) => (r.builtin && !r.edited ? t(r.text) : r.text || "");
    $("#recoGrid").innerHTML = list.map((r, i) => `
      <article class="card reco" style="animation-delay:${Math.min(i, 8) * 0.06}s">
        <div class="mini-cover" style="--c:${coverColor(r.title)}">${r.emoji || GENRE_EMOJI[r.genre] || "📘"}</div>
        <div>
          <div class="reco-top"><h3>${esc(r.title)}</h3>
            <span class="reco-tools">
              <button type="button" class="icon-mini" data-reco-edit="${r.id}" aria-label="${esc(t("{t} bearbeiten", { t: r.title }))}" title="${t("Bearbeiten")}">✎</button>
              <button type="button" class="icon-mini" data-reco-del="${r.id}" aria-label="${esc(t("„{t}“ aus den Empfehlungen entfernen?", { t: r.title }))}" title="${t("Entfernen")}">✕</button>
            </span></div>
          <p class="by">${esc(r.author || "")}</p>
          <div class="tags"><span class="tag">${esc(t(r.genre))}</span>${r.pages ? `<span class="tag">${t("ca. {n} Seiten", { n: r.pages })}</span>` : ""}${r.builtin ? "" : `<span class="tag own">${t("Eigene")}</span>`}</div>
          <p>${esc(txt(r))}</p>
          ${have.has(r.title.toLowerCase())
            ? `<button class="btn" disabled>✓ ${t("Im Regal")}</button>`
            : `<button class="btn" data-wish="${r.id}">＋ ${t("Wunschliste")}</button> <button class="btn primary" data-start="${r.id}">${t("Jetzt lesen")}</button>`}
        </div>
      </article>`).join("") || `<p class="words-empty">${t("Keine Empfehlungen in dieser Gruppe. Füge eigene hinzu!")}</p>`;
    const hidden = state.recoHidden.filter((id) => id.startsWith(g + ":")).length;
    $("#recoRestore").hidden = !hidden;
    $("#recoRestore").innerHTML = hidden ? `<button type="button" class="link" id="recoRestoreBtn">${t("Ausgeblendete Empfehlungen wiederherstellen ({n})", { n: hidden })}</button>` : "";
    $("#tipsGrid").innerHTML = [...D.tips[g], ...D.tips.alle].map((tp, i) => `
      <article class="card" style="animation-delay:${i * 0.05}s"><span class="tip-ico">${tp.ico}</span><h3>${esc(t(tp.title))}</h3><p>${esc(t(tp.text))}</p></article>`).join("");
  }
  $("#recoFilters").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) renderDiscover(c.dataset.group); });
  $("#recoGrid").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-reco-edit]"); if (ed) { openReco(ed.dataset.recoEdit); return; }
    const del = e.target.closest("[data-reco-del]"); if (del) { await deleteReco(del.dataset.recoDel); return; }
    const b = e.target.closest("[data-wish],[data-start]"); if (!b) return;
    const r = recoById(b.dataset.wish || b.dataset.start); if (!r) return;
    const g = discGroup;
    const status = b.dataset.start ? "lesen" : "wunsch";
    addBook({ title: r.title, author: r.author, pages: r.pages, genre: r.genre, emoji: r.emoji, status, startDate: status === "lesen" ? dateKey() : null });
    toast(status === "lesen" ? "📖 " + t("Viel Spaß mit „{t}“!", { t: r.title }) : "⭐ " + t("„{t}“ steht auf deiner Wunschliste.", { t: r.title }));
    renderDiscover(g);
  });

  // Empfehlung bearbeiten / hinzufügen / entfernen
  let recoEditId = null;
  function openReco(id = null) {
    recoEditId = id;
    const r = id ? recoById(id) : null;
    $("#recoDialogTitle").textContent = t(r ? "Empfehlung bearbeiten" : "Empfehlung hinzufügen");
    $("#rTitle").value = r?.title || "";
    $("#rAuthor").value = r?.author || "";
    $("#rPages").value = r?.pages || "";
    $("#rGenre").value = r?.genre || "Roman";
    $("#rGroup").value = r?.group || discGroup || group();
    $("#rGroup").disabled = !!r?.builtin;
    $("#rText").value = r ? (r.builtin && !r.edited ? t(r.text) : r.text || "") : "";
    $("#recoDelete").hidden = !r;
    $("#recoDialog").showModal();
  }
  async function deleteReco(id) {
    const r = recoById(id); if (!r) return;
    if (!(await askConfirm(t("„{t}“ aus den Empfehlungen entfernen?", { t: r.title })))) return false;
    if (r.builtin) { if (!state.recoHidden.includes(id)) state.recoHidden.push(id); }
    else state.recoCustom = state.recoCustom.filter((x) => x.id !== id);
    save(); renderDiscover(); toast(t("Empfehlung entfernt."));
    return true;
  }
  $("#recoAdd").addEventListener("click", () => openReco());
  $("#recoCancel").addEventListener("click", () => $("#recoDialog").close());
  $("#recoDelete").addEventListener("click", async () => { if (recoEditId && (await deleteReco(recoEditId))) $("#recoDialog").close(); });
  $("#recoForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = { title: $("#rTitle").value.trim(), author: $("#rAuthor").value.trim(), pages: parseInt($("#rPages").value) || null, genre: $("#rGenre").value, text: $("#rText").value.trim() };
    if (!data.title) return;
    const r = recoEditId ? recoById(recoEditId) : null;
    if (r?.builtin) state.recoEdits[r.id] = data;
    else if (r) Object.assign(state.recoCustom.find((x) => x.id === r.id), data, { group: $("#rGroup").value });
    else state.recoCustom.push({ id: "c" + uid(), group: $("#rGroup").value, ...data });
    save(); $("#recoDialog").close();
    renderDiscover(r?.builtin ? discGroup : $("#rGroup").value);
    toast(t("Gespeichert ✓"));
  });
  $("#recoRestore").addEventListener("click", (e) => {
    if (!e.target.closest("#recoRestoreBtn")) return;
    state.recoHidden = state.recoHidden.filter((id) => !id.startsWith(discGroup + ":"));
    save(); renderDiscover();
  });

  function renderBadges() {
    const tot = totals();
    const pts = tot.minutes + tot.pages + tot.finished * 50;
    const lv = [...D.levels].reverse().find((l) => pts >= l.min);
    const idx = D.levels.indexOf(lv);
    const next = D.levels[idx + 1];
    const prog = next ? Math.round(((pts - lv.min) / (next.min - lv.min)) * 100) : 100;
    $("#levelCard").innerHTML = `
      <span class="lv-ico">${lv.ico}</span>
      <div>
        <p class="kicker">${t("Stufe {a} von {b}", { a: idx + 1, b: D.levels.length })}</p>
        <h2>${t(lv.name)}</h2>
        <p class="muted" style="margin:.2rem 0 .4rem">${t("{n} Lesepunkte", { n: pts })} · ${next ? t("noch {n} bis „{name}“", { n: next.min - pts, name: t(next.name) }) : t("Höchste Stufe erreicht!")}</p>
        <div class="progress"><i data-w="${prog}"></i></div>
        <p class="muted" style="font-size:.78rem;margin:.4rem 0 0">${t("1 Punkt pro Minute und pro Seite, 50 Bonuspunkte pro beendetem Buch.")}</p>
      </div>`;
    animateProgress($("#levelCard"));
    const un = BADGES.filter((b) => b.test());
    $("#badgeCount").textContent = t("{a} von {b} freigeschaltet", { a: un.length, b: BADGES.length });
    renderCollections();
    $("#badges").innerHTML = BADGES.map((b, i) => {
      const ok = b.test();
      return `<article class="card badge ${ok ? "unlocked" : "locked"}" style="animation-delay:${i * 0.04}s;--r:${rot(b.id)}deg">
        <div class="medal">${ok ? b.ico : t("offen")}</div><h3>${t(b.name)}</h3><p>${t(b.desc)}</p></article>`;
    }).join("");
  }

  function animateProgress(root) {
    requestAnimationFrame(() => requestAnimationFrame(() => $$(".progress > i[data-w]", root).forEach((i) => (i.style.width = i.dataset.w + "%"))));
  }
  function countUp(el, to) {
    const from = 0, dur = 900, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString(NUMLOC());
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Bücher ----------
  function addBook(data) {
    const b = {
      id: uid(), title: data.title.trim(), author: (data.author || "").trim(), pages: data.pages || null,
      firstPage: Math.max(1, data.firstPage || 1), currentPage: Math.max(data.currentPage || 0, Math.max(1, data.firstPage || 1) - 1), status: data.status || "lesen", genre: data.genre || "Roman",
      startDate: data.startDate ?? (data.status === "wunsch" ? null : dateKey()), endDate: data.endDate || null,
      rating: data.rating || 0, notes: data.notes || "", emoji: data.emoji || null, color: coverColor(data.title), updated: Date.now()
    };
    state.books.push(b); save(); checkBadges(); return b;
  }

  const bookDialog = $("#bookDialog");
  let editingId = null, rating = 0;
  function renderStars() {
    $("#fStars").innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${n === rating}" aria-label="${tn(n, "{n} Stern", "{n} Sterne")}" class="${n <= rating ? "on" : ""}" data-star="${n}">★</button>`).join("");
  }
  $("#fStars").addEventListener("click", (e) => { const s = e.target.closest("[data-star]"); if (!s) return; rating = +s.dataset.star === rating ? 0 : +s.dataset.star; renderStars(); });

  function openBook(id = null) {
    editingId = id;
    const b = id ? bookById(id) : null;
    $("#bookDialogTitle").textContent = t(b ? "Buch bearbeiten" : "Buch hinzufügen");
    $("#fTitle").value = b?.title || "";
    $("#fAuthor").value = b?.author || "";
    $("#fPages").value = b?.pages || "";
    $("#fCurrent").value = b?.currentPage || 0;
    $("#fFirst").value = firstPage(b);
    $("#fCurrentHint").hidden = !b;
    $("#fStatus").value = b?.status || "lesen";
    $("#fGenre").value = b?.genre || (group() === "kinder" ? "Kinderbuch" : group() === "jugend" ? "Jugendbuch" : "Roman");
    $("#fStart").value = b?.startDate || dateKey();
    $("#fNotes").value = b?.notes || "";
    rating = b?.rating || 0; renderStars();
    $("#deleteBook").hidden = !b;
    bookDialog.showModal();
  }
  document.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"); if (ed) openBook(ed.dataset.edit);
    if (e.target.closest("#shelfAdd, #addBookBtn, #quickAddBtn")) openBook();
  });
  $("#cancelBook").addEventListener("click", () => bookDialog.close());
  $("#fFirst").addEventListener("change", () => {
    const f = Math.max(1, parseInt($("#fFirst").value) || 1), c = parseInt($("#fCurrent").value) || 0;
    if (c < f - 1) $("#fCurrent").value = f - 1;
  });
  function askConfirm(msg) {
    const d = $("#confirmDialog");
    $("#confirmText").textContent = msg;
    return new Promise((res) => {
      const done = (v) => { d.close(); $("#confirmYes").onclick = $("#confirmNo").onclick = d.oncancel = null; res(v); };
      $("#confirmYes").onclick = () => done(true);
      $("#confirmNo").onclick = () => done(false);
      d.oncancel = (e) => { e.preventDefault(); done(false); };
      d.showModal();
    });
  }
  $("#deleteBook").addEventListener("click", async () => {
    const b = bookById(editingId);
    if (!b || !(await askConfirm(t("„{t}“ wirklich löschen? Die Lesezeiten bleiben in deiner Statistik.", { t: b.title })))) return;
    state.books = state.books.filter((x) => x.id !== editingId); save();
    bookDialog.close(); toast(t("Buch gelöscht.")); render();
  });
  $("#bookForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const pages = parseInt($("#fPages").value) || null;
    let first = Math.max(1, parseInt($("#fFirst").value) || 1);
    if (pages) first = Math.min(first, pages);
    let current = Math.max(first - 1, parseInt($("#fCurrent").value) || 0);
    if (pages) current = Math.min(current, pages);
    const status = $("#fStatus").value;
    const data = {
      title: $("#fTitle").value.trim(), author: $("#fAuthor").value.trim(), pages, firstPage: first, currentPage: current, status,
      genre: $("#fGenre").value, startDate: $("#fStart").value || (status === "wunsch" ? null : dateKey()),
      rating, notes: $("#fNotes").value.trim()
    };
    if (!data.title) return;
    if (editingId) {
      const b = bookById(editingId);
      const wasDone = b.status === "gelesen", before = Math.max(b.currentPage || 0, firstPage(b) - 1);
      const readOn = status === "lesen" && data.currentPage > before ? data.currentPage : null;
      if (readOn != null) data.currentPage = before; // die neuen Seiten trägt logSession unten ein
      Object.assign(b, data, { updated: Date.now() });
      if (status === "gelesen" && !wasDone) { b.endDate = dateKey(); if (b.pages) b.currentPage = b.pages; celebrateFinish(b); }
      if (status !== "gelesen") b.endDate = null;
      save();
      if (readOn != null) { bookDialog.close(); logSession({ bookId: b.id, minutes: 0, toPage: readOn }); fillBookSelects(); return; }
      checkBadges(); toast(t("Gespeichert ✓"));
    } else {
      const b = addBook({ ...data, endDate: status === "gelesen" ? dateKey() : null });
      if (status === "gelesen") celebrateFinish(b); else toast("📚 " + t("„{t}“ steht jetzt in deinem Regal.", { t: b.title }));
    }
    bookDialog.close(); render(); fillBookSelects();
  });
  function celebrateFinish(b) { confetti(); toast("🎉 " + t("„{t}“ ausgelesen – Glückwunsch!", { t: b.title })); }

  // ---------- Seiten eintragen: überall gleich ----------
  // Zwei verbundene Felder: „Gelesene Seiten“ und „Jetzt auf Seite“. Eines ausfüllen, das andere rechnet sich selbst.
  // Gespeichert wird immer über logSession → Buch (aktuelle Seite), Heute, Lesefaden und Statistik bleiben gleich.
  function pagePair(px, getBook) {
    const rd = $("#" + px + "Read"), to = $("#" + px + "To"), last = $("#" + px + "Last"), calc = $("#" + px + "Calc");
    const clampTo = (b, v) => (b.pages ? Math.min(b.pages, v) : v);
    const sync = (src) => {
      const b = getBook(), from = b ? Math.max(b.currentPage || 0, firstPage(b) - 1) : 0;
      to.closest(".field").hidden = !b;
      calc.classList.remove("warn", "ok"); calc.textContent = "";
      if (!b) { last.textContent = ""; return; }
      last.textContent = b.pages ? t("Zuletzt gelesen: Seite {n} von {m}", { n: from, m: b.pages }) : t("Zuletzt gelesen: Seite {n}", { n: from });
      to.placeholder = t("z. B. {n}", { n: clampTo(b, from + 10) });
      if (src === "read") to.value = rd.value === "" ? "" : clampTo(b, from + Math.max(0, parseInt(rd.value) || 0));
      if (src === "to") rd.value = to.value === "" ? "" : Math.max(0, clampTo(b, parseInt(to.value) || 0) - from);
      if (to.value === "") return;
      const tv = clampTo(b, parseInt(to.value) || 0);
      if (tv < from) { calc.textContent = t("Seite {b} liegt vor deiner letzten Seite ({a}). Dann wird nur die Seite korrigiert.", { a: from, b: tv }); calc.classList.add("warn"); }
      else if (b.pages && tv >= b.pages) { calc.textContent = t("Damit ist das Buch fertig! 🎉"); calc.classList.add("ok"); }
    };
    rd.addEventListener("input", () => sync("read"));
    to.addEventListener("input", () => sync("to"));
    return {
      refresh() { rd.value = ""; to.value = ""; sync(); },
      // für logSession: mit Buch zählt die Seite, ohne Buch die Anzahl
      value() {
        const b = getBook(), tv = parseInt(to.value), r = parseInt(rd.value);
        if (b && Number.isFinite(tv)) return { toPage: tv };
        if (Number.isFinite(r) && r > 0) return b ? { toPage: Math.max(b.currentPage || 0, firstPage(b) - 1) + r } : { pagesRead: r };
        return {};
      },
      readCount() { const r = parseInt(rd.value); return Number.isFinite(r) ? r : 0; },
      focus() { (getBook() ? to : rd).focus(); },
    };
  }
  const hasPages = (pv) => Number.isFinite(pv.toPage) || pv.pagesRead > 0;

  // ---------- Timer ----------
  let preset = 20, tickHandle = null, booting = true; // während des Intros keine Dialoge öffnen
  const CIRC = 578;
  function fillBookSelects() {
    const reading = state.books.filter((b) => b.status === "lesen").sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const opts = reading.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("") + `<option value="">${t("Ohne bestimmtes Buch")}</option>`;
    for (const sel of [$("#timerBook"), $("#manualBook")]) {
      sel.innerHTML = opts; // immer das zuletzt benutzte Buch vorauswählen
    }
    if (state.timer?.bookId != null) $("#timerBook").value = state.timer.bookId;
    $("#manualBook").dispatchEvent(new Event("change"));
  }
  const elapsedMs = () => { const t = state.timer; return t ? t.acc + (t.running ? Date.now() - t.startedAt : 0) : 0; };

  // Lesetagebuch (neueste zuerst nach Datum); jeder Eintrag lässt sich bearbeiten oder löschen
  let logLimit = 10;
  function renderLog() {
    const all = [...state.sessions].sort((a, b) => (b.date === a.date ? b.ts - a.ts : b.date < a.date ? -1 : 1));
    const recent = all.slice(0, logLimit);
    $("#sessionLog").innerHTML = recent.length
      ? recent.map((s, i) => editSid === s.id ? sessionForm(s) : `<li style="animation-delay:${Math.min(i, 8) * 0.04}s"><time>${fmtDate(s.date)}</time><div>
          <div class="ds-row"><span><strong>${esc(bookById(s.bookId)?.title || t("Freies Lesen"))}</strong> <span class="entry-meta">${sessionMeta(s)}</span></span>
          <button type="button" class="link ds-edit" data-edit-s="${s.id}" aria-label="${t("Eintrag bearbeiten")}">✎ ${t("Bearbeiten")}</button></div>
          ${s.note ? `<p class="entry-note">${esc(quoted(s.note))}</p>` : ""}
          ${s.word ? `<span class="word">${esc(s.word)}</span>` : ""}</div></li>`).join("")
        + (all.length > logLimit ? `<li class="log-more"><button type="button" class="link" data-log-more>${t("Ältere Einträge anzeigen")}</button></li>` : "")
      : `<li><time>—</time><span class="muted">${t("Noch keine Einträge. Nach jeder Lesezeit kannst du hier einen Satz notieren.")}</span></li>`;
  }
  $("#sessionLog").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit-s]"); if (ed) { editSid = ed.dataset.editS; renderLog(); $("#sessionLog .ds-form input")?.focus(); return; }
    if (e.target.closest("[data-log-more]")) { logLimit += 15; renderLog(); return; }
    if (e.target.closest("[data-s-cancel]")) { editSid = null; renderLog(); return; }
    if (e.target.closest("[data-s-save]")) { saveSessionForm(e.target.closest(".ds-form")); return; }
    if (e.target.closest("[data-s-del]")) { deleteSession(e.target.closest(".ds-form").dataset.sid); return; }
  });
  function renderTimerView() {
    fillBookSelects();
    $("#manualDate").value ||= dateKey();
    $("#manualDate").max = dateKey();
    renderLog();
    updateClock();
  }
  function updateClock() {
    const tm = state.timer;
    const target = (tm ? tm.target : preset) * 60000;
    const el = elapsedMs();
    let shown, ratio;
    if (target) { shown = Math.max(0, target - el); ratio = el / target; }
    else { shown = el; ratio = (el % 3600000) / 3600000; }
    const s = Math.round(shown / 1000);
    $("#clockTime").textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    $("#clockMode").textContent = t(target ? (tm ? "noch" : "Countdown") : "Freies Lesen");
    $("#clockRing").style.strokeDashoffset = target ? CIRC * Math.min(1, ratio) : CIRC * (1 - ratio);
    const running = !!tm?.running;
    $(".timer-card").classList.toggle("running", running);
    $("#timerStart").textContent = t(running ? "Pause" : tm ? "Weiter" : "Start");
    $("#timerStop").disabled = !tm;
    $$("#timerPresets .chip").forEach((c) => { c.disabled = !!tm; c.classList.toggle("active", +c.dataset.min === (tm ? tm.target : preset)); });
    $("#timerBook").disabled = !!tm;
    renderStartPage();
    const pf = tm ? tm.patchFor : patchPending;
    $("#patchBanner").hidden = !pf;
    if (pf) $("#patchBannerText").textContent = "🪡 " + t("Flicken für {day} · {n} Min. am Stück", { day: longDay(pf), n: goalMin() });
    $("#patchBannerCancel").hidden = !!tm;
    if (!booting && target && tm && el >= target) finishTimer(true);
  }
  function renderStartPage() {
    const b = bookById($("#timerBook").value), wrap = $("#timerStartWrap");
    wrap.hidden = !b;
    if (!b) return;
    const inp = $("#timerStartPage");
    if (document.activeElement !== inp) inp.value = b.currentPage || 0;
    inp.disabled = !!state.timer;
    $("#timerStartOf").textContent = b.pages ? t("von {n}", { n: b.pages }) : "";
  }
  $("#timerBook").addEventListener("change", renderStartPage);
  $("#timerStartPage").addEventListener("change", (e) => {
    const b = bookById($("#timerBook").value); if (!b) return;
    let v = Math.max(0, parseInt(e.target.value) || 0);
    if (b.pages) v = Math.min(b.pages, v);
    b.currentPage = v; b.updated = Date.now(); e.target.value = v; save();
    toast(t("Startseite gespeichert: {n}.", { n: v }));
  });
  function startTick() { clearInterval(tickHandle); tickHandle = setInterval(updateClock, 500); }
  $("#timerPresets").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c || state.timer) return; preset = +c.dataset.min; updateClock(); });
  $("#timerStart").addEventListener("click", () => {
    const t = state.timer;
    if (!t) {
      if (patchPending && preset && preset < goalMin()) preset = goalMin();
      state.timer = { running: true, startedAt: Date.now(), acc: 0, target: preset, bookId: $("#timerBook").value, patchFor: patchPending || null };
      patchPending = null;
    }
    else if (t.running) { t.acc += Date.now() - t.startedAt; t.running = false; }
    else { t.startedAt = Date.now(); t.running = true; }
    save(); updateClock(); startTick();
  });
  $("#timerStop").addEventListener("click", () => finishTimer(false));

  let pendingSession = null;
  function finishTimer(auto) {
    const tm = state.timer; if (!tm) return;
    const ms = tm.target && auto ? tm.target * 60000 : elapsedMs();
    state.timer = null; save(); clearInterval(tickHandle); updateClock();
    if (ms < 30000) { toast(t("Unter 30 Sekunden – das zählt noch nicht.") + " 😉"); return; }
    if (auto) chime();
    const minutes = Math.max(1, Math.round(ms / 60000));
    const canPatchNow = tm.patchFor && patchableDays().includes(tm.patchFor);
    const patchOk = canPatchNow && !goalIsPages() && minutes >= goalMin();
    pendingSession = patchOk ? { bookId: tm.bookId, minutes, date: tm.patchFor, patched: true } : { bookId: tm.bookId, minutes, patchCandidate: canPatchNow && goalIsPages() ? tm.patchFor : null };
    const b = bookById(tm.bookId);
    const len = tn(minutes, "{n} Minute", "{n} Minuten");
    $("#finishText").textContent = (b ? t("Du hast {len} in „{book}“ gelesen.", { len, book: b.title }) : t("Du hast {len} gelesen.", { len }))
      + (patchOk ? " " + t("Damit flickst du {day}.", { day: longDay(tm.patchFor) }) : pendingSession.patchCandidate ? " " + t("Mit mindestens {len} flickst du {day}.", { len: goalLen(goalPg()), day: longDay(tm.patchFor) }) : tm.patchFor ? " " + t("Zum Flicken fehlten {len}, das zählt für heute.", { len: goalLen(goalMin() - minutes) }) : "");
    $("#finishStampMin").textContent = t("{n} Min.", { n: minutes });
    $("#finishNote").value = ""; $("#finishWord").value = "";
    finishBook = b;
    finishPair.refresh();
    $("#finishDialog").showModal();
    setTimeout(() => finishPair.focus(), 50);
  }
  let finishBook = null;
  const finishPair = pagePair("finish", () => finishBook);
  function submitFinish() {
    if (pendingSession) {
      const pv = finishPair.value();
      // Seitenziel + Flicken per Timer: erst jetzt steht fest, ob genug Seiten gelesen wurden
      const pc = pendingSession.patchCandidate; delete pendingSession.patchCandidate;
      if (pc && finishPair.readCount() >= goalPg()) Object.assign(pendingSession, { date: pc, patched: true });
      const extra = { note: $("#finishNote").value, word: $("#finishWord").value };
      logSession({ ...pendingSession, ...extra, ...pv });
    }
    pendingSession = null; $("#finishDialog").close();
  }
  $("#finishForm").addEventListener("submit", (e) => { e.preventDefault(); submitFinish(); });
  // Esc übernimmt die Eingaben, statt sie zu verwerfen
  $("#finishDialog").addEventListener("cancel", (e) => { e.preventDefault(); submitFinish(); });

  function logSession({ bookId, minutes, toPage, pagesRead, note = "", word = "", date = dateKey(), patched = false }) {
    const b = bookById(bookId);
    let pages = Number.isFinite(pagesRead) && !(b && Number.isFinite(toPage)) ? Math.max(0, Math.min(2000, pagesRead)) : 0;
    if (b && pages) { shiftBook(b.id, pages); if (!b.startDate) b.startDate = date; }
    const beforeMin = minutesByDay()[date] || 0, beforePg = pagesByDay()[date] || 0, wasRead = readSet().has(date);
    if (b && Number.isFinite(toPage)) {
      const np = Math.max(0, b.pages ? Math.min(toPage, b.pages) : toPage);
      pages = Math.max(0, np - (b.currentPage || 0));
      b.currentPage = np; b.updated = Date.now();
      if (!b.startDate) b.startDate = date;
    }
    note = note.trim().slice(0, 200); word = word.trim().slice(0, 40);
    if (word && !addWord(word, bookId, date)) word = "";
    let estMin = false;
    if (!minutes && pages > 0 && autoMinOn()) { minutes = Math.max(1, Math.round(pages * minPerPage())); estMin = true; }
    const entry = { id: uid(), bookId: bookId || null, date, minutes, pages, note, word, hour: date === dateKey() ? new Date().getHours() : null, ts: Date.now() };
    if (estMin) entry.estMin = true;
    if (patched) { entry.patched = true; entry.readOn = dateKey(); entry.hour = null; }
    state.sessions.push(entry);
    let finished = false;
    if (b && b.pages && b.currentPage >= b.pages && b.status !== "gelesen") { b.status = "gelesen"; b.endDate = date; finished = true; }
    save();
    const isToday = date === dateKey();
    const wasDone = goalDone(beforeMin, beforePg), nowDone = goalDone(beforeMin + minutes, beforePg + pages);
    const stLen = tn(streak(), "{n} Tag", "{n} Tage");
    if (patched) { confetti(); toast("🪡 " + (streak() > 1 ? t("Geflickt! Dein Faden ist wieder verbunden – {len} lang.", { len: stLen }) : t("Geflickt! Dein Faden ist wieder verbunden."))); if (finished) setTimeout(() => celebrateFinish(b), 3400); }
    else if (finished) celebrateFinish(b);
    else if (isToday && !wasDone && nowDone) { celebrateQ({ type: "day", date }); }
    else if (isToday && !wasRead && (minutes || pages)) toast("🧵 " + t("Neuer Knoten! Dein Lesefaden ist jetzt {len} lang.", { len: stLen }));
    else toast("✓ " + (pages && minutes ? t("{n} Min. und {p} Seiten eingetragen.", { n: minutes, p: pages }) : pages ? t("{len} eingetragen.", { len: tn(pages, "{n} Seite", "{n} Seiten") }) : t("{n} Min. eingetragen.", { n: minutes })));
    checkBadges(); render();
  }
  $("#manualForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const minutes = Math.max(0, parseInt($("#manualMin").value) || 0), pv = manualPair.value();
    if (!minutes && !hasPages(pv)) { toast(t("Bitte Seiten oder Minuten eintragen.")); return; }
    const date = $("#manualDate").value || dateKey();
    if (date > dateKey()) { toast(t("Das Datum liegt in der Zukunft.")); return; }
    logSession({ bookId: $("#manualBook").value, minutes, note: $("#manualNote").value, date, ...pv });
    $("#manualMin").value = ""; $("#manualNote").value = ""; manualPair.refresh();
  });

  const manualPair = pagePair("manual", () => bookById($("#manualBook").value));
  $("#manualBook").addEventListener("change", () => manualPair.refresh());

  // Schnell eintragen direkt bei „Gerade lese ich“
  let quickBookId = null;
  const quickPair = pagePair("quick", () => bookById(quickBookId));
  function openQuickPages(id) {
    const b = bookById(id); if (!b) return;
    quickBookId = id;
    $("#pageBookTitle").textContent = b.title;
    $("#quickMin").value = "";
    quickPair.refresh();
    $("#pageDialog").showModal();
    setTimeout(() => quickPair.focus(), 50);
  }
  $("#pageCancel").addEventListener("click", () => $("#pageDialog").close());
  $("#pageForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const pv = quickPair.value(), minutes = Math.max(0, parseInt($("#quickMin").value) || 0);
    if (!minutes && !hasPages(pv)) { toast(t("Bitte Seiten oder Minuten eintragen.")); return; }
    $("#pageDialog").close();
    logSession({ bookId: quickBookId, minutes, ...pv });
  });
  document.addEventListener("click", (e) => { const q = e.target.closest("[data-pages]"); if (q) openQuickPages(q.dataset.pages); });

  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = "sine";
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.6);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.7);
      });
    } catch { /* Audio nicht verfügbar */ }
  }

  // ---------- Profil ----------
  const profileDialog = $("#profileDialog");
  function profileTexts() {
    const p = state.profile;
    $("#profileTitle").textContent = t(p ? "Dein Profil" : "Willkommen bei Lesezeit");
    $("#profileIntro").textContent = t(p ? "Name, Sprache, Altersgruppe und Tagesziele ändern." : "Ein paar Minuten am Tag machen den Unterschied. Richte kurz dein Profil ein:");
  }
  function openProfile() {
    const p = state.profile;
    profileTexts();
    $("#pName").value = p?.name || "";
    $$("#pGroup input").forEach((r) => (r.checked = r.value === (p?.group || "erwachsene")));
    $$("#pGoalType input").forEach((r) => (r.checked = r.value === (p?.goalType === "minutes" ? "minutes" : "pages")));
    $("#pAutoMin").checked = p?.autoMin !== false;
    const pi = paceInfo();
    $("#pPace").textContent = pi.own ? t("Ca. {n} Min. pro Seite – berechnet aus deinen eigenen Lesezeiten.", { n: fmtPace(pi.mpp) })
      : t("Ca. {n} Min. pro Seite – Startwert für deine Altersgruppe. Mit dem Timer lernt die App dein eigenes Tempo.", { n: fmtPace(pi.mpp) });
    setGoalSlider(p?.goalType === "minutes" ? p?.goal || 20 : p?.goalPages || PAGE_DEFAULT[p?.group || "erwachsene"]);
    $("#resetAll").hidden = !p;
    $("#demoData").hidden = state.books.length > 0;
    profileDialog.showModal();
  }
  $("#profileBtn").addEventListener("click", openProfile);
  const pGoalType = () => $("#pGoalType input:checked")?.value || "pages";
  function setGoalSlider(v) {
    const pages = pGoalType() === "pages", sl = $("#pGoal");
    sl.max = pages ? 100 : 90; sl.value = v;
    $("#pGoalOut").textContent = sl.value;
    $("#pGoalUnit").textContent = t(pages ? "Seiten" : "Minuten");
  }
  $("#pGoal").addEventListener("input", (e) => ($("#pGoalOut").textContent = e.target.value));
  $("#pGoalType").addEventListener("change", () => {
    const p = state.profile, g = $("#pGroup input:checked")?.value || "erwachsene";
    setGoalSlider(pGoalType() === "pages" ? p?.goalPages || PAGE_DEFAULT[g] : p?.goal || { kinder: 15, jugend: 20, erwachsene: 20 }[g]);
  });
  $("#pGroup").addEventListener("change", (e) => {
    const g = { kinder: 15, jugend: 20, erwachsene: 20 }[e.target.value];
    if (!state.profile) {
      setGoalSlider(pGoalType() === "pages" ? PAGE_DEFAULT[e.target.value] : g);
    }
  });
  function readProfile() {
    return { name: $("#pName").value.trim(), group: $("#pGroup input:checked")?.value || "erwachsene", goalType: pGoalType(), autoMin: $("#pAutoMin").checked,
      goal: pGoalType() === "minutes" ? +$("#pGoal").value : state.profile?.goal || 20,
      goalPages: pGoalType() === "pages" ? +$("#pGoal").value : state.profile?.goalPages || PAGE_DEFAULT[$("#pGroup input:checked")?.value || "erwachsene"] };
  }
  $("#profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const first = !state.profile;
    state.profile = readProfile(); chartMode = wkMode = null; save();
    profileDialog.close(); render();
    if (first) { confetti(); toast(t("Alles bereit, {name}. Viel Freude beim Lesen!", { name: state.profile.name })); }
  });
  profileDialog.addEventListener("cancel", (e) => { if (!state.profile) e.preventDefault(); });
  $("#resetAll").addEventListener("click", async () => {
    if (!(await askConfirm(t("Wirklich alle Bücher, Lesezeiten und Erfolge löschen?")))) return;
    state = { ...defaultState(), lang }; save(); profileDialog.close(); render(); openProfile();
  });
  $("#demoData").addEventListener("click", () => {
    if (!$("#pName").value.trim()) $("#pName").value = "Lea";
    state.profile = readProfile(); chartMode = wkMode = null;
    loadDemo(); profileDialog.close(); render(); fillBookSelects();
    toast(t("Beispieldaten geladen. Schau dich um!"));
  });

  function loadDemo() {
    const today = new Date();
    const k = (n) => dateKey(addDays(today, -n));
    const g = state.profile.group;
    const recos = D.recommendations[g];
    quietBadges = true;
    const b1 = addBook({ ...recos[0], status: "lesen", currentPage: Math.round(recos[0].pages * 0.55), startDate: k(9) });
    const b2 = addBook({ ...recos[1], status: "lesen", currentPage: Math.round(recos[1].pages * 0.2), startDate: k(2) });
    const b3 = addBook({ ...recos[2], status: "gelesen", currentPage: recos[2].pages, startDate: k(24), endDate: k(11), rating: 5, notes: t("Hat mich total gepackt!") });
    addBook({ ...recos[3], status: "wunsch", startDate: null });
    const plan = [[0, 15, b1, 12], [1, 25, b1, 18], [2, 20, b2, 14], [3, 30, b1, 20], [4, 10, b1, 8], [6, 22, b1, 15], [7, 35, b1, 25], [11, 40, b3, 40], [12, 25, b3, 20], [13, 30, b3, 28]];
    const notes = { 0: t("Heute wurde endlich klar, worum es eigentlich geht."), 3: t("Das Kapitel war spannend, ich wollte nicht aufhören."), 7: t("Eine Stelle habe ich zweimal gelesen, so schön war sie.") };
    for (const [d, minutes, b, pages] of plan) state.sessions.push({ id: uid(), bookId: b.id, date: k(d), minutes, pages, note: notes[d] || "", word: "", hour: d % 3 === 0 ? 21 : 18, ts: Date.now() - d * 86400000 });
    ["Sehnsucht", "beiläufig", "Fernweh", "verblüfft", "Abenteuer", "flüstern"].forEach((w, i) => state.words.push({ id: uid(), w, bookId: b1.id, date: k(i), ts: Date.now() - i * 86400000 }));
    state.seenBadges = BADGES.filter((b) => b.test()).map((b) => b.id);
    state.rewards = null; checkRewards(false);
    quietBadges = false;
    save();
  }

  // ---------- Effekte ----------
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200);
  }
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = $("#confetti"), ctx = cv.getContext("2d");
    cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const cols = ["#2c7a55", "#4f9e77", "#9fcfb1", "#b48c25", "#f4f2e9"];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4, r: Math.random() * 6 + 4,
      c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, leaf: Math.random() < 0.6
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        if (p.leaf) { ctx.beginPath(); ctx.ellipse(0, 0, p.r * 0.9, p.r * 0.42, 0, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66); }
        ctx.restore();
      }
      if (t - t0 < 3200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }
  function runIntro() {
    const intro = $("#intro");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!intro || reduce) { intro?.remove(); document.body.classList.remove("intro-on"); return Promise.resolve(); }
    const q = quoteOfDay();
    const p = state.profile;
    const rsI = readSet(), readDays = rsI.size;
    $("#coverOwner").textContent = p?.name ? t("von {name}", { name: p.name }) : t("Jeden Tag ein paar Seiten");
    $("#coverNo").textContent = t("Lesetag Nr. {n}", { n: String(readDays + (rsI.has(dateKey()) ? 0 : 1)).padStart(3, "0") });
    $("#fpDate").textContent = fd(new Date(), { weekday: "long", day: "numeric", month: "long" });
    $("#fpQuote").textContent = `„${q.text}“`;
    $("#fpBy").textContent = "— " + t(q.by);
    const qTr = t(q.text);
    $("#fpTr").hidden = qTr === q.text;
    $("#fpTr").textContent = qTr === q.text ? "" : quoted(qTr);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        intro.classList.add("out");
        document.body.classList.remove("intro-on");
        render();
        setTimeout(() => { intro.remove(); resolve(); }, 800);
      };
      intro.addEventListener("click", finish);
      setTimeout(finish, 9800); // genug Zeit, um Datum und Zitat in Ruhe zu lesen
    });
  }

  // ---------- Belohnungen ----------
  // Tagesziel → Knoten-Feier · 7 Lesetage in Folge → Lesezeichen · 20 Lesetage im Monat → Strickstück des Monats fertig (Lesegarderobe)
  const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000];
  const BM_COLORS = ["#2c7a55", "#e07b2c", "#3a6ea5", "#b5487a", "#7a5cc2", "#b48c25", "#2f8a8a", "#a8483b"];
  const PATCH_MIN = 20;
  const PRAISE = [
    "Stark! Heute hast du dein Ziel geschafft.",
    "Dein Faden hält – Knoten für Knoten.",
    "Jede Seite zählt, und heute waren es genug.",
    "Bravo! Lesen wird zu deiner Gewohnheit.",
    "Geschafft! Dein Buch freut sich schon auf morgen.",
    "Ein guter Tag für einen neuen Knoten.",
    "Du bleibst dran – das ist das Wichtigste.",
    "Heute hast du dir Zeit für dich genommen."
  ];
  const ymKey = (k) => k.slice(0, 7);
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m: 1–12
  function monthLabel(m) {
    const [y, mo] = m.split("-").map(Number), name = fd(new Date(y, mo - 1, 1), { month: "long" });
    return name.charAt(0).toLocaleUpperCase(LOC()) + name.slice(1) + " " + y;
  }
  function ensureRewards() {
    if (!state.rewards || typeof state.rewards !== "object") state.rewards = { bookmarks: [], patches: {}, milestones: [] };
    const r = state.rewards; r.bookmarks ||= []; r.patches ||= {}; r.milestones ||= [];
    return r;
  }
  function sumKeys(keys) {
    const m = minutesByDay(), p = pagesByDay();
    return { minutes: keys.reduce((a, k) => a + (m[k] || 0), 0), pages: keys.reduce((a, k) => a + (p[k] || 0), 0) };
  }
  function checkRewards(celebrate = true) {
    const r = ensureRewards(), days = [...readSet()].sort(), fresh = [];
    // Lesezeichen: jede volle 7er-Strecke innerhalb einer lückenlosen Serie
    const runs = [];
    for (const k of days) {
      const last = runs[runs.length - 1];
      if (last && daysBetween(parseKey(last[last.length - 1]), parseKey(k)) === 1) last.push(k); else runs.push([k]);
    }
    for (const run of runs) for (let j = 7; j <= run.length; j += 7) {
      const block = run.slice(j - 7, j), key = block[6];
      if (!r.bookmarks.some((b) => b.key === key)) {
        const b = { key, start: block[0], idx: r.bookmarks.length, ...sumKeys(block) };
        r.bookmarks.push(b); fresh.push({ type: "week", b });
      }
    }
    // Monatsquadrate
    const byMonth = {};
    for (const k of days) (byMonth[ymKey(k)] ||= []).push(k);
    for (const [m, ks] of Object.entries(byMonth)) {
      if (ks.length < PATCH_MIN) continue;
      const [y, mo] = m.split("-").map(Number), n = daysInMonth(y, mo);
      const complete = `${m}-${pad(n)}` <= dateKey() && ks.length === n;
      if (!r.patches[m]) { r.patches[m] = { perfect: complete }; fresh.push({ type: "month", m, perfect: complete }); }
      else if (complete && !r.patches[m].perfect) { r.patches[m].perfect = true; fresh.push({ type: "month", m, perfect: true }); }
    }
    // Seiten-Meilensteine
    const total = totals().pages, newMs = MILESTONES.filter((x) => total >= x && !r.milestones.includes(x));
    if (newMs.length) { r.milestones.push(...newMs); fresh.push({ type: "milestone", n: newMs[newMs.length - 1] }); }
    save();
    if (celebrate) fresh.slice(-3).forEach(celebrateQ);
  }

  // Grafiken
  function bookmarkSVG(b) {
    const c = BM_COLORS[b.idx % BM_COLORS.length], pat = b.idx % 4, id = "bmc" + b.key.replace(/-/g, "");
    const deco = pat === 0 ? Array.from({ length: 9 }, (_, i) => `<path d="M0 ${i * 18 - 10} L60 ${i * 18 + 20}"/>`).join("")
      : pat === 1 ? Array.from({ length: 24 }, (_, i) => `<circle cx="${12 + (i % 3) * 18 + (Math.floor(i / 3) % 2) * 9}" cy="${10 + Math.floor(i / 3) * 18}" r="2.2"/>`).join("")
      : pat === 2 ? `<path d="M${[...Array(16)].map((_, i) => `${i % 2 ? 60 : 0} ${i * 10}`).join(" L")}"/>` : "";
    return `<svg class="bm" viewBox="0 0 60 160" aria-hidden="true"><defs><clipPath id="${id}"><path d="M6 2 H54 V152 L30 134 L6 152 Z"/></clipPath></defs>
      <path d="M6 2 H54 V152 L30 134 L6 152 Z" fill="${c}"/>
      <g class="bm-deco" clip-path="url(#${id})">${deco}</g>
      <path class="bm-stitch" d="M11 7 H49 V140 L30 125 L11 140 Z"/>
      <path class="bm-thread" d="M30 20 V116"/>
      ${Array.from({ length: 7 }, (_, i) => `<circle class="bm-knot" cx="30" cy="${20 + i * 16}" r="4.4" style="animation-delay:${0.25 + i * 0.08}s"/>`).join("")}</svg>`;
  }
  let patchUid = 0;
  function patchSVG(m, perfect, anim = false) {
    const [y, mo] = m.split("-").map(Number), mins = minutesByDay(), pgs = pagesByDay();
    const cells = monthCells(y, mo - 1, mins, pgs), today = dateKey(), tv = goalVal(mins[today] || 0, pgs[today] || 0);
    return `<svg class="knit patch-svg ${perfect ? "perfect" : ""} ${anim ? "anim" : "still"}" viewBox="0 0 140 104" aria-hidden="true">${garmentSvg(garmentFor(mo - 1), "p" + ++patchUid, cells, Math.min(1, tv / goalTarget()), !anim)}</svg>`;
  }
  function dayArt() {
    const sparks = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<circle class="cd-spark" cx="${(Math.cos(a) * 30).toFixed(1)}" cy="${(Math.sin(a) * 30).toFixed(1)}" r="2.2" style="--dx:${(Math.cos(a) * 14).toFixed(1)}px;--dy:${(Math.sin(a) * 14).toFixed(1)}px"/>`; }).join("");
    return `<svg class="faden cel-day" viewBox="-90 -48 180 96" aria-hidden="true">
      <path class="cd-thread" pathLength="1" d="M-88 0 H88"/>
      <circle class="cd-burst" r="16"/><circle class="cd-burst b2" r="16"/>
      ${knot(0, 0, true, 0.55)}${sparks}
      <g class="cd-needle"><path class="needle-body" d="M0 -3.4 L62 -1.7 Q70 0 62 1.7 L0 3.4 Q-4 0 0 -3.4Z"/><ellipse class="needle-eye" cx="3" cy="0" rx="4.4" ry="1.4"/></g></svg>`;
  }
  function monthStats(m) {
    const [y, mo] = m.split("-").map(Number), n = daysInMonth(y, mo), todayK = dateKey();
    const keys = Array.from({ length: n }, (_, i) => `${m}-${pad(i + 1)}`).filter((k) => k <= todayK);
    const rs = readSet(), mins = minutesByDay(), pgs = pagesByDay();
    return {
      n, read: keys.filter((k) => rs.has(k)).length, goals: keys.filter((k) => goalDone(mins[k] || 0, pgs[k] || 0)).length, ...sumKeys(keys),
      words: state.words.filter((w) => w.date.startsWith(m)).length, lines: state.lines.filter((l) => l.date.startsWith(m)).length,
      books: state.books.filter((b) => b.endDate && b.endDate.startsWith(m)).length
    };
  }

  // Feier-Dialog mit Warteschlange
  const celQueue = []; let celBusy = false;
  function celebrateQ(item) { celQueue.push(item); if (!celBusy) setTimeout(nextCelebration, 250); celBusy = true; }
  function nextCelebration() {
    const it = celQueue.shift(); const d = $("#celDialog");
    if (!it) { celBusy = false; return; }
    celBusy = true;
    const list = $("#celList"); list.innerHTML = ""; $("#celStats").textContent = "";
    d.dataset.type = it.type;
    if (it.type === "day") {
      const mn = minutesByDay()[it.date] || 0, pg = pagesByDay()[it.date] || 0;
      $("#celArt").innerHTML = dayArt();
      $("#celKicker").textContent = t("Tagesziel");
      $("#celTitle").textContent = t("Knoten geknüpft!");
      $("#celText").textContent = t(PRAISE[dayOfYear() % PRAISE.length]);
      $("#celStats").textContent = `${tn(pg, "{n} Seite", "{n} Seiten")} · ${tn(mn, "{n} Minute", "{n} Minuten")}`;
    } else if (it.type === "week") {
      const b = it.b;
      $("#celArt").innerHTML = bookmarkSVG(b);
      $("#celKicker").textContent = t("7 Tage ohne Lücke");
      $("#celTitle").textContent = t("Ein Lesezeichen für dich!");
      $("#celText").textContent = t("Aus sieben Knoten wurde ein Lesezeichen. Es liegt jetzt in deiner Sammlung.");
      $("#celStats").textContent = `${fd(parseKey(b.start), { day: "numeric", month: "short" })} – ${fd(parseKey(b.key), { day: "numeric", month: "short" })} · ${tn(b.pages, "{n} Seite", "{n} Seiten")} · ${tn(b.minutes, "{n} Minute", "{n} Minuten")}`;
    } else if (it.type === "month" || it.type === "view") {
      const st = monthStats(it.m), perfect = it.type === "view" ? !!state.rewards?.patches?.[it.m]?.perfect : it.perfect;
      $("#celArt").innerHTML = patchSVG(it.m, perfect, true);
      $("#celKicker").textContent = monthLabel(it.m);
      const gm = garmentFor(+it.m.split("-")[1] - 1);
      $("#celKicker").textContent = `${monthLabel(it.m)} · ${t(gm.name)}`;
      $("#celTitle").textContent = it.type === "view" ? t("Monatsbilanz") : perfect ? t("Perfekter Monat!") : t(gm.done);
      $("#celText").textContent = it.type === "view" ? "" : perfect ? t("Jeden Tag gelesen – dein Stück bekommt einen goldenen Rand.") : t("{n} Lesetage in diesem Monat. Es hängt jetzt in deiner Lesegarderobe.", { n: st.read });
      list.innerHTML = [[t("Lesetage"), `${st.read}/${st.n}`], [t("Ziel erreicht"), `${st.goals}×`], [t("Seiten"), st.pages], [t("Minuten"), st.minutes],
        [t("Neue Wörter"), st.words], [t("Sätze & Zitate"), st.lines], [t("Bücher beendet"), st.books]]
        .map(([a, v]) => `<div><dt>${esc(a)}</dt><dd>${esc(String(typeof v === "number" ? v.toLocaleString(NUMLOC()) : v))}</dd></div>`).join("");
    } else if (it.type === "milestone") {
      $("#celArt").innerHTML = `<div class="cel-num"><span>${it.n.toLocaleString(NUMLOC())}</span></div>`;
      $("#celKicker").textContent = t("Meilenstein");
      $("#celTitle").textContent = t("{n} Seiten!", { n: it.n.toLocaleString(NUMLOC()) });
      $("#celText").textContent = t("So viele Seiten hast du seit deinem Start gelesen. Weiter so!");
    }
    if (!d.open) d.showModal();
    if (it.type !== "view") { confetti(); if (it.type !== "day") chime(); }
  }
  function closeCelebration() { $("#celDialog").close(); setTimeout(nextCelebration, 300); }
  $("#celOk").addEventListener("click", closeCelebration);
  $("#celDialog").addEventListener("cancel", (e) => { e.preventDefault(); closeCelebration(); });
  $("#celDialog").addEventListener("click", (e) => { if (e.target === $("#celDialog")) closeCelebration(); });

  // Sammlung im Bereich „Erfolge“
  function renderCollections() {
    const r = ensureRewards(), bms = [...r.bookmarks].sort((a, b) => (a.key < b.key ? 1 : -1));
    $("#bmCount").textContent = bms.length ? tn(bms.length, "{n} Lesezeichen", "{n} Lesezeichen") : "";
    const st = streak(), left = 7 - (st % 7);
    $("#bmShelf").innerHTML = (bms.length ? bms.map((b, i) => `<figure class="bm-item" style="animation-delay:${Math.min(i, 10) * 0.05}s">${bookmarkSVG(b)}
        <figcaption>${fd(parseKey(b.start), { day: "numeric", month: "short" })} – ${fd(parseKey(b.key), { day: "numeric", month: "short" })}<br>${tn(b.pages, "{n} Seite", "{n} Seiten")}</figcaption></figure>`).join("")
      : `<p class="collect-empty">${t("Noch kein Lesezeichen.")}</p>`)
      + `<p class="collect-next">${t("Noch {len} bis zum nächsten Lesezeichen.", { len: tn(left, "{n} Lesetag", "{n} Lesetage") })}</p>`;
    const y = new Date().getFullYear(), curM = ymKey(dateKey()), rs = readSet();
    $("#quiltTitle").textContent = t("Lesegarderobe {y}", { y });
    const earned = Object.keys(r.patches).filter((m) => m.startsWith(y + "-")).length;
    $("#quiltCount").textContent = t("{n} von 12 Stücken", { n: earned });
    $("#quilt").innerHTML = Array.from({ length: 12 }, (_, i) => {
      const m = `${y}-${pad(i + 1)}`, p = r.patches[m], lbl = fd(new Date(y, i, 1), { month: "short" }).replace(/\.$/, "");
      if (p) return `<button type="button" class="q-cell earned" data-qm="${m}" aria-label="${esc(monthLabel(m))}">${patchSVG(m, p.perfect)}</button>`;
      const cnt = [...rs].filter((k) => k.startsWith(m)).length;
      return `<button type="button" class="q-cell ${m > curM ? "future" : ""}" data-qm="${m}" ${m > curM ? "disabled" : ""} aria-label="${esc(monthLabel(m))}"><span>${esc(lbl)}</span><em>${esc(t(garmentFor(i).name))}</em>${m === curM || (m < curM && cnt) ? `<small>${cnt}/${PATCH_MIN}</small>` : ""}</button>`;
    }).join("");
  }
  $("#quilt").addEventListener("click", (e) => { const b = e.target.closest("[data-qm]"); if (b && !b.disabled) celebrateQ({ type: "view", m: b.dataset.qm }); });

  // ---------- Als App installieren (Android: Chrome, Samsung Internet) ----------
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("#installBtn").hidden = false; });
  window.addEventListener("appinstalled", () => { installEvt = null; $("#installBtn").hidden = true; toast(t("Lesezeit ist jetzt auf deinem Startbildschirm.")); });
  $("#installBtn").addEventListener("click", async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch { /* abgebrochen */ }
    installEvt = null; $("#installBtn").hidden = true;
  });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch { /* z. B. in eingebetteten Ansichten nicht erlaubt */ }
  }

  // ---------- Sprachwechsel ----------
  function setLang(l) {
    if (!LOCALES[l] || l === lang) return;
    lang = l; state.lang = l; save();
    applyStatic(); fillBookSelects(); updateClock(); renderStars();
    if (profileDialog.open) { profileTexts(); $("#pGoalUnit").textContent = t(pGoalType() === "pages" ? "Seiten" : "Minuten"); }
    render();
  }
  $("#langSel").addEventListener("change", (e) => setLang(e.target.value));
  $("#pLang").addEventListener("change", (e) => setLang(e.target.value));

  // ---------- Start ----------
  applyStatic();
  $("#nextTip").addEventListener("click", () => showTip(true));
  window.addEventListener("hashchange", () => go(location.hash.slice(1)));
  fillBookSelects();
  go(location.hash.slice(1) || "uebersicht");
  if (!state.rewards) checkRewards(false); // bestehende Erfolge still übernehmen, ohne Feier-Flut
  runIntro().then(() => {
    booting = false;
    if (state.timer) { startTick(); updateClock(); }
    if (!state.profile) openProfile();
  });
  // Datum wechselt um Mitternacht → Übersicht aktualisieren
  setInterval(() => { if ($("#view-uebersicht").classList.contains("active") && !document.querySelector("dialog[open]")) renderDashboard(); }, 5 * 60000);
})();
