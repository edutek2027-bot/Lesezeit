/* Lesezeit – App-Logik (Vanilla JS, Daten im localStorage) */
(() => {
  "use strict";

  const D = window.LZ_DATA;
  const STORE_KEY = "lesezeit.v1";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------- Hilfsfunktionen ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((parseKey(dateKey(b)) - parseKey(dateKey(a))) / 86400000);
  const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const fmtDate = (k) => parseKey(k).toLocaleDateString("de-DE", { day: "numeric", month: "short" });

  const COVER_COLORS = ["#2d6a4f", "#40916c", "#1b4332", "#52796f", "#3a5a40", "#588157", "#2f5d62", "#5f7a3a", "#a1862f", "#35614f"];
  const coverColor = (t) => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COVER_COLORS[h % COVER_COLORS.length]; };
  const GENRE_EMOJI = { Roman: "📘", Abenteuer: "🗺️", Fantasy: "🐉", Krimi: "🔎", Sachbuch: "🔬", Comic: "💥", Klassiker: "🎩", Jugendbuch: "🎒", Kinderbuch: "🧸", Biografie: "👤", Lyrik: "🪶", Sonstiges: "📗" };
  const STATUS_LABEL = { lesen: "Lese ich", gelesen: "Gelesen", wunsch: "Wunsch" };

  // ---------- Zustand ----------
  const defaultState = () => ({ profile: null, books: [], sessions: [], words: [], lines: [], timer: null, seenBadges: [], tipIndex: 0 });
  let state;
  try { state = Object.assign(defaultState(), JSON.parse(localStorage.getItem(STORE_KEY)) || {}); }
  catch { state = defaultState(); }
  if (!Array.isArray(state.words)) state.words = [];
  if (!Array.isArray(state.lines)) state.lines = [];
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
  const goalDone = (min, pg) => min >= goalMin() && pg >= goalPg();
  function streak() {
    const m = minutesByDay();
    let d = new Date();
    if (!m[dateKey(d)]) d = addDays(d, -1); // heute noch offen → Serie zählt ab gestern
    let n = 0;
    while (m[dateKey(d)]) { n++; d = addDays(d, -1); }
    return n;
  }
  function bestStreak() {
    const days = Object.keys(minutesByDay()).sort();
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
  const fmtDuration = (min) => (min < 60 ? `${min} Min.` : `${Math.floor(min / 60)} Std.${min % 60 ? " " + (min % 60) + " Min." : ""}`);

  function sinceText(b) {
    if (b.status === "wunsch") return "auf der Wunschliste";
    if (!b.startDate) return "";
    const start = parseKey(b.startDate);
    if (b.status === "gelesen" && b.endDate) {
      const n = Math.max(1, daysBetween(start, parseKey(b.endDate)) + 1);
      return `in ${plural(n, "Tag", "Tagen")} gelesen`;
    }
    const n = daysBetween(start, new Date());
    if (n <= 0) return "seit heute";
    if (n === 1) return "seit gestern";
    if (n < 14) return `seit ${n} Tagen`;
    if (n < 60) return `seit ${Math.round(n / 7)} Wochen`;
    return `seit ${Math.round(n / 30)} Monaten`;
  }
  const pct = (b) => (b.pages ? Math.min(100, Math.round(((b.status === "gelesen" ? b.pages : b.currentPage || 0) / b.pages) * 100)) : b.status === "gelesen" ? 100 : 0);
  const bookMinutes = (id) => state.sessions.filter((s) => s.bookId === id).reduce((a, s) => a + s.minutes, 0);

  // ---------- Erfolge ----------
  const BADGES = [
    { id: "first-book", ico: "📗", name: "Regal eröffnet", desc: "Erstes Buch hinzugefügt", test: () => state.books.length >= 1 },
    { id: "first-session", ico: "⏱️", name: "Los geht's", desc: "Erste Lese-Einheit", test: () => state.sessions.length >= 1 },
    { id: "goal", ico: "🎯", name: "Ziel erreicht", desc: "Minuten- und Seitenziel an einem Tag geschafft", test: () => { const pm = pagesByDay(); return Object.entries(minutesByDay()).some(([k, m]) => goalDone(m, pm[k] || 0)); } },
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
    const fresh = BADGES.filter((b) => b.test() && !state.seenBadges.includes(b.id));
    if (!fresh.length) return;
    state.seenBadges.push(...fresh.map((b) => b.id));
    save();
    setTimeout(() => { toast(`${fresh[0].ico} Neuer Erfolg: ${fresh[0].name}!`); confetti(); }, 400);
  }

  // ---------- Navigation ----------
  function go(view) {
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

  function renderDashboard() {
    const p = state.profile;
    const h = new Date().getHours();
    const hello = h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
    $("#greeting").textContent = p?.name ? `${hello}, ${p.name}.` : `${hello}.`;
    $("#todayLabel").textContent = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }).replace(",", " ·");
    const q = quoteOfDay();
    $("#quoteText").textContent = `„${q.text}“`;
    $("#quoteBy").textContent = "— " + q.by;

    // Tagesziel als zwei Lineale: Minuten und Seiten
    const goal = goalMin(), gp = goalPg();
    const today = minutesByDay()[dateKey()] || 0;
    const todayPg = pagesByDay()[dateKey()] || 0;
    const rMin = Math.min(1, today / goal), rPg = Math.min(1, todayPg / gp);
    const fillMin = $("#rulerMin > i"), fillPg = $("#rulerPg > i");
    fillMin.style.width = "0"; fillPg.style.width = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => { fillMin.style.width = rMin * 100 + "%"; fillPg.style.width = rPg * 100 + "%"; }));
    countUp($("#goalMinutes"), today);
    countUp($("#goalPages"), todayPg);
    $("#goalOf").textContent = goal;
    $("#goalPagesOf").textContent = gp;
    $("#goalMinutes").parentElement.classList.toggle("ok", rMin >= 1);
    $("#goalPages").parentElement.classList.toggle("ok", rPg >= 1);
    const both = rMin >= 1 && rPg >= 1;
    $("#goalPct").textContent = both ? "geschafft" : `${Math.round(((rMin + rPg) / 2) * 100)} %`;
    $("#goalStamp").hidden = !both;
    const left = [];
    if (rMin < 1) left.push(`${goal - today} Minuten`);
    if (rPg < 1) left.push(`${gp - todayPg} Seiten`);
    $("#goalHint").textContent = both ? "Heute ist dein Stempel sicher." : !today && !todayPg ? "Noch nicht gelesen. Zehn Minuten reichen für den Anfang." : `Noch ${left.join(" und ")}.`;

    // Lesebaum
    const st = streak();
    $("#streakDays").textContent = st;
    $("#streakWord").textContent = st === 1 ? "Tag in Folge" : "Tage in Folge";
    renderTree(st);
    const m = minutesByDay();

    // Zahlen
    const t = totals();
    countUp($("#statBooks"), t.finished);
    countUp($("#statPages"), t.pages);
    $("#statHours").textContent = t.minutes < 60 ? `${t.minutes} Min.` : `${(t.minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std.`;
    countUp($("#statWords"), state.words.length);
    countUp($("#statSessions"), t.sessions);
    $("#statBest").textContent = `${bestStreak()} T.`;

    renderThread();
    renderWords();

    // Aktuelle Bücher
    const cur = state.books.filter((b) => b.status === "lesen");
    $("#currentList").innerHTML = cur.length
      ? cur.map((b) => `
        <button class="current" data-edit="${b.id}">
          <div class="mini-cover" style="--c:${coverColor(b.title)}">${b.emoji || GENRE_EMOJI[b.genre] || "📘"}</div>
          <div>
            <h3>${esc(b.title)}</h3>
            <p>${esc(b.author || "Unbekannt")} · ${b.pages ? `Seite ${b.currentPage || 0} von ${b.pages}` : "Seitenzahl offen"} · ${fmtDuration(bookMinutes(b.id))} gelesen</p>
            <div class="progress"><i data-w="${pct(b)}"></i></div>
          </div>
          <span class="since">${sinceText(b)}</span>
        </button>`).join("")
      : `<div class="empty"><span class="em">Gerade kein Buch auf dem Nachttisch.</span><button class="link" data-nav="entdecken">Empfehlungen ansehen →</button></div>`;
    animateProgress($("#currentList"));

    // Woche
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    const pgMode = chartMode === "pg";
    const src = pgMode ? pagesByDay() : m;
    const vals = days.map((d) => src[dateKey(d)] || 0);
    const max = Math.max(pgMode ? gp : goal, ...vals);
    $("#weekChart").classList.toggle("pg", pgMode);
    $("#weekChart").innerHTML = days.map((d, i) => `
      <div class="bar ${i === 6 ? "today" : ""}" title="${vals[i]} ${pgMode ? "Seiten" : "Minuten"}">
        <div class="col" data-h="${(vals[i] / max) * 100}">${vals[i] ? `<b>${vals[i]}</b>` : ""}</div>
        <span>${i === 6 ? "Heute" : WD[d.getDay()]}</span>
      </div>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => $$("#weekChart .col").forEach((c) => (c.style.height = c.dataset.h + "%"))));

    showTip(false);
  }

  // Der Baum wächst mit jedem Lesetag in Folge: Keimling → junger Baum → blühender Baum
  const LEAVES = [[63,55,-35],[77,55,35],[70,40,0],[58,46,-30],[82,46,30],[50,56,-50],[90,56,50],[64,32,-15],[76,32,15],
    [44,64,-60],[96,62,60],[58,60,-20],[82,61,20],[70,25,0],[52,40,-35],[88,40,35],[66,48,-10],[75,49,10]];
  const LEAF_FILLS = ["var(--green)", "var(--green-2)", "var(--mint)"];
  function treeStage(n) {
    if (n === 0) return "Samen";
    if (n < 3) return "Keimling";
    if (n < 7) return "Junger Baum";
    if (n < 14) return "Kräftiger Baum";
    if (n < 30) return "Stattlicher Baum";
    return "Blühender Baum";
  }
  function renderTree(n) {
    $("#treeStage").textContent = treeStage(n);
    const ground = `<ellipse class="ground" cx="70" cy="101" rx="46" ry="5"/>`;
    if (n === 0) {
      $("#tree").innerHTML = ground + `<ellipse class="seed" cx="70" cy="97" rx="5" ry="3.5"/><path class="sprout" d="M70 95 C70 90 71 87 73 84"/>`;
      return;
    }
    const scale = (0.5 + 0.5 * Math.min(1, (n - 1) / 13)).toFixed(3);
    const leaves = LEAVES.slice(0, Math.min(LEAVES.length, n + 1)).map(([x, y, r], i) =>
      `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse class="leaf" rx="8" ry="4.6" fill="${LEAF_FILLS[i % 3]}" style="animation-delay:${0.5 + i * 0.06}s"/></g>`).join("");
    const blooms = n >= 21 ? [[60,38],[80,37],[70,30],[52,52],[88,50],[66,58]].slice(0, Math.min(6, Math.floor((n - 18) / 2)))
      .map(([x, y], i) => `<circle class="bloom" cx="${x}" cy="${y}" r="2.6" style="animation-delay:${1.6 + i * 0.1}s"/>`).join("") : "";
    const branches = n >= 3 ? `
        <path class="bark" stroke-width="2.5" d="M70 78 C63 72 56 68 50 60" style="animation-delay:.25s"/>
        <path class="bark" stroke-width="2.5" d="M70 72 C77 66 85 62 90 56" style="animation-delay:.35s"/>
        <path class="bark" stroke-width="2" d="M70 62 C66 55 62 50 58 44" style="animation-delay:.45s"/>
        <path class="bark" stroke-width="2" d="M70 60 C74 53 78 48 82 44" style="animation-delay:.5s"/>` : "";
    $("#tree").innerHTML = ground + `
      <g class="grow" style="transform:scale(${scale})"><g class="sway">
        <path class="bark" stroke-width="5" d="M70 100 C70 86 69 72 70 52"/>${branches}
        ${leaves}${blooms}
      </g></g>`;
  }

  // Lesefaden: die letzten 4 Wochen als Schlangenlinie. Jeder Lesetag ist ein Kreuzstich,
  // aufeinanderfolgende Lesetage werden mit Faden verbunden, eine Lücke lässt ihn reißen.
  const F_DAYS = 28, F_COLS = 7, F_COLW = 100, F_ROWH = 84;
  function fPos(i) {
    const rows = F_DAYS / F_COLS, r = Math.floor(i / F_COLS), c = i % F_COLS;
    const ltr = (rows - 1 - r) % 2 === 0; // letzte Zeile (mit „heute“) läuft von links nach rechts
    return [50 + (ltr ? c : F_COLS - 1 - c) * F_COLW, 42 + r * F_ROWH];
  }
  function fSeg(i) {
    const [x1, y1] = fPos(i), [x2, y2] = fPos(i + 1);
    if (y1 === y2) return `M${x1} ${y1} L${x2} ${y2}`;
    const dir = x1 > 350 ? 1 : -1; // Wende am Zeilenende als Bogen nach außen
    return `M${x1} ${y1} C${x1 + dir * 72} ${y1} ${x2 + dir * 72} ${y2} ${x2} ${y2}`;
  }
  // Französischer Knoten: kleine goldene Kugel mit umwickeltem Faden
  function frenchKnot(x, y, dl) {
    return `<g class="fknot" style="animation-delay:${dl}s"><circle class="fknot-ball" cx="${x}" cy="${y}" r="7"/>
      <path class="fknot-wrap" d="M${x - 3.6} ${y + .6}a3.7 3.7 0 1 1 3.9 3.3a2 2 0 1 1 -1.3 -3.6"/>
      <circle class="fknot-shine" cx="${x - 2.4}" cy="${y - 2.6}" r="1.5"/></g>`;
  }
  function renderThread() {
    const mins = minutesByDay(), pgs = pagesByDay(), now = new Date();
    const days = Array.from({ length: F_DAYS }, (_, i) => dateKey(addDays(now, i - (F_DAYS - 1))));
    const read = days.map((k) => (mins[k] || 0) > 0);
    const full = days.map((k) => goalDone(mins[k] || 0, pgs[k] || 0));
    const patchedSet = new Set(state.sessions.filter((x) => x.patched).map((x) => x.date));
    const canPatch = new Set(patchableDays());
    const T = F_DAYS - 1, delay = (i) => 0.35 + i * 0.075;
    let guide = "", threads = "", marks = "", labels = "", extra = "";
    for (let i = 0; i < T; i++) guide += fSeg(i) + " ";
    for (let i = 0; i < F_DAYS; i++) {
      const [x, y] = fPos(i), d = parseKey(days[i]);
      // Faden zum nächsten Tag
      if (i < T && read[i] && read[i + 1]) {
        threads += `<path class="thread" pathLength="1" d="${fSeg(i)}" style="animation-delay:${delay(i) + 0.12}s"/><path class="twist" d="${fSeg(i)}" style="animation-delay:${delay(i) + 0.45}s"/>`;
      }
      // Gerissener Faden nach dem letzten Tag einer Kette
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
        const s = 12, dl = delay(i);
        marks += `<path class="x ${full[i] ? "full" : ""}" pathLength="1" d="M${x - s} ${y - s} L${x + s} ${y + s}" style="animation-delay:${dl}s"/>
          <path class="x ${full[i] ? "full" : ""}" pathLength="1" d="M${x + s} ${y - s} L${x - s} ${y + s}" style="animation-delay:${dl + 0.1}s"/>
          ${full[i] ? frenchKnot(x, y, dl + 0.3) : ""}`;
      } else {
        marks += canPatch.has(days[i])
          ? `<g class="patchable" data-patch="${days[i]}" role="button" tabindex="0" aria-label="${d.toLocaleDateString("de-DE", { day: "numeric", month: "long" })} flicken">
               <circle class="ph-ring" cx="${x}" cy="${y}" r="15"/><path class="ph-plus" d="M${x - 6} ${y}H${x + 6}M${x} ${y - 6}V${y + 6}"/></g>`
          : `<circle class="hole" cx="${x}" cy="${y}" r="5.5"/>`;
      }
      const first = i === 0 || d.getDate() === 1;
      labels += `<text class="lbl ${i === T ? "today" : ""}" x="${x}" y="${y + 36}">${i === T ? "Heute" : first ? `${d.getDate()}.${d.getMonth() + 1}.` : d.getDate()}</text>`;
    }
    // Nadel: nach dem heutigen Stich – oder wartend über dem heutigen Loch
    const [tx, ty] = fPos(T), endDelay = delay(T) + 0.4;
    const needle = (x, y) => `<g class="needle" transform="translate(${x} ${y}) rotate(-45)" style="animation-delay:${endDelay}s"><g class="needle-move">
        <path class="needle-body" d="M0 -3.2 L58 -1.6 Q66 0 58 1.6 L0 3.2 Q-4 0 0 -3.2Z" transform="translate(-6 0)"/>
        <ellipse class="needle-eye" cx="1" cy="0" rx="4" ry="1.3"/></g></g>`;
    if (read[T]) {
      extra += `<path class="needle-thread" d="M${tx} ${ty} q14 -2 18 -18" style="opacity:0;animation:fadeIn .4s ease ${endDelay}s forwards"/>` + needle(tx + 18, ty - 18);
    } else {
      extra += `<circle class="today-ring" cx="${tx}" cy="${ty}" r="14"/>`;
      if (read[T - 1]) extra += `<path class="pending" d="${fSeg(T - 1)}"/>`;
      extra += needle(tx + 8, ty - 8);
    }
    // Unsichtbare Klickflächen für den Tagesblick (flickbare Löcher öffnen direkt das Flicken)
    let hits = "";
    for (let i = 0; i < F_DAYS; i++) {
      if (canPatch.has(days[i])) continue;
      const [x, y] = fPos(i);
      hits += `<circle class="hit" cx="${x}" cy="${y + 8}" r="34" data-day="${days[i]}" role="button" tabindex="0" aria-label="${parseKey(days[i]).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })} ansehen"/>`;
    }
    $("#faden").innerHTML = `<path class="guide" d="${guide}"/>${threads}${extra}${marks}${labels}${hits}`;

    const st = streak(), best = bestStreak();
    $("#fadenStat").textContent = `Faden ${st} T. · Rekord ${best} T.`;
    $("#fadenSub").textContent = read[T]
      ? `Heutiger Stich gesetzt. Dein Faden ist ${plural(st, "Tag", "Tage")} lang.`
      : st > 0 ? `Heute fehlt noch ein Stich, sonst reißt dein Faden von ${plural(st, "Tag", "Tagen")}.`
      : "Jeder Lesetag ist ein Stich. Lies heute und fang einen neuen Faden an.";
    const gaps = patchableDays();
    $("#patchNote").hidden = !gaps.length;
    if (gaps.length) {
      const last = parseKey(gaps[gaps.length - 1]).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
      $("#patchNoteText").textContent = gaps.length === 1
        ? `Am ${last} ist der Faden gerissen. Lies ${goalMin()} Minuten nach, dann flickst du ihn.`
        : `${gaps.length} Tage lassen sich noch flicken. Pro Tag liest du ${goalMin()} Minuten nach.`;
    }
  }

  // ---------- Faden flicken ----------
  // Verpasste Tage der letzten 7 Tage (nach dem ersten Lesetag) lassen sich nachholen:
  // einmal das Tagesziel in Minuten nachlesen, dann zählt der Tag wieder als Lesetag.
  const PATCH_WINDOW = 7;
  function patchableDays() {
    const mins = minutesByDay(), keys = Object.keys(mins).sort();
    if (!keys.length) return [];
    const first = keys[0], out = [];
    for (let i = PATCH_WINDOW; i >= 1; i--) {
      const k = dateKey(addDays(new Date(), -i));
      if (k > first && !mins[k]) out.push(k);
    }
    return out;
  }
  let patchPick = null, patchPending = null; // patchPending: Tag, für den der nächste Timer flickt
  const longDay = (k) => parseKey(k).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  function openPatch(day) {
    const gaps = patchableDays();
    if (!gaps.length) { toast("Gerade gibt es nichts zu flicken."); return; }
    patchPick = gaps.includes(day) ? day : gaps[gaps.length - 1];
    $("#patchManualBox").hidden = true;
    $("#patchManual").hidden = false;
    $("#patchGo").textContent = "Mit Timer nachlesen";
    renderPatchDialog();
    $("#patchDialog").showModal();
  }
  function renderPatchDialog() {
    $("#patchDays").innerHTML = patchableDays().map((k) => `<button type="button" class="chip ${k === patchPick ? "active" : ""}" data-pday="${k}">${parseKey(k).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}</button>`).join("");
    $("#patchRule").textContent = `Lies einmal ${goalMin()} Minuten am Stück nach. Die Zeit zählt dann für ${longDay(patchPick)}, nicht für heute.`;
  }
  $("#patchDays").addEventListener("click", (e) => { const c = e.target.closest("[data-pday]"); if (c) { patchPick = c.dataset.pday; renderPatchDialog(); } });
  $("#patchCancel").addEventListener("click", () => $("#patchDialog").close());
  $("#patchOpen").addEventListener("click", () => openPatch());
  const fadenAct = (el) => { const g = el.closest("[data-patch]"); if (g) return openPatch(g.dataset.patch); const h = el.closest("[data-day]"); if (h) openDay(h.dataset.day, "day"); };
  $("#faden").addEventListener("click", (e) => fadenAct(e.target));
  $("#faden").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-patch],[data-day]")) { e.preventDefault(); fadenAct(e.target); } });
  $("#weekOpen").addEventListener("click", () => openDay(dateKey(), "week"));

  // ---------- Tages- und Wochenblick ----------
  let dvDay = dateKey(), dvMode = "day";
  const sessionsOn = (k) => state.sessions.filter((x) => x.date === k);
  const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7); };
  const mondayOf = (k) => { const d = parseKey(k); return addDays(d, -((d.getDay() + 6) % 7)); };
  function openDay(k, mode = "day") {
    dvDay = k > dateKey() ? dateKey() : k; dvMode = mode;
    renderDayView();
    if (!$("#dayDialog").open) $("#dayDialog").showModal();
  }
  function renderDayView() {
    $$("#dayMode button").forEach((b) => b.classList.toggle("active", b.dataset.dmode === dvMode));
    if (dvMode === "day") renderDayBody(); else renderWeekBody();
  }
  function renderDayBody() {
    const k = dvDay, d = parseKey(k), ss = sessionsOn(k);
    const m = ss.reduce((a, x) => a + x.minutes, 0), pg = ss.reduce((a, x) => a + (x.pages || 0), 0);
    const isToday = k === dateKey(), done = goalDone(m, pg), patched = ss.some((x) => x.patched);
    $("#dayKicker").textContent = isToday ? "Heute" : `KW ${isoWeek(d)}`;
    $("#dayTitle").textContent = d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    $("#dayNext").disabled = isToday;
    const words = state.words.filter((w) => w.date === k), lines = state.lines.filter((l) => l.date === k);
    const status = !m ? `<span class="day-status">${isToday ? "Noch kein Stich" : "Nicht gelesen"}</span>`
      : done ? `<span class="day-status gold">● Ziel erreicht${patched ? " · geflickt" : ""}</span>`
      : `<span class="day-status ok">✕ Gelesen${patched ? " · geflickt" : ""}</span>`;
    const canP = patchableDays().includes(k);
    $("#dayBody").innerHTML = `${status}
      ${m ? `<div>
        <div class="ruler-block"><div class="ruler-head"><span>Minuten</span><strong class="${m >= goalMin() ? "ok" : ""}">${m} / ${goalMin()}</strong></div><div class="ruler"><i style="width:${Math.min(100, (m / goalMin()) * 100)}%"></i></div></div>
        <div class="ruler-block"><div class="ruler-head"><span>Seiten</span><strong class="${pg >= goalPg() ? "ok" : ""}">${pg} / ${goalPg()}</strong></div><div class="ruler pg"><i style="width:${Math.min(100, (pg / goalPg()) * 100)}%"></i></div></div>
      </div>
      <ul class="day-sessions">${ss.map((x) => `<li><strong>${esc(bookById(x.bookId)?.title || "Freies Lesen")}</strong> <span class="muted">· ${x.minutes} Min.${x.pages ? ` · ${x.pages} S.` : ""}${x.patched ? ` · nachgelesen am ${fmtDate(x.readOn)}` : ""}</span>${x.note ? `<p class="entry-note">„${esc(x.note)}“</p>` : ""}</li>`).join("")}</ul>`
      : `<p class="day-empty">${isToday ? "Heute fehlt noch ein Stich." : canP ? "An diesem Tag ist der Faden gerissen. Du kannst ihn noch flicken." : "An diesem Tag wurde nicht gelesen."}</p>`}
      ${words.length ? `<div><p class="kicker" style="margin-bottom:.4rem">Neue Wörter</p><div class="words">${words.map((w) => `<span class="word">${esc(w.w)}</span>`).join("")}</div></div>` : ""}
      ${lines.length ? `<div class="lines">${lines.map((l) => `<figure class="line"><blockquote>„${esc(l.text)}“</blockquote><figcaption>${esc(bookById(l.bookId)?.title || "")}${l.page ? ` · S. ${l.page}` : ""}</figcaption></figure>`).join("")}</div>` : ""}
      ${isToday && !done ? `<div class="day-actions"><button class="btn primary" type="button" data-dv="read">Jetzt lesen</button></div>` : ""}
      ${canP ? `<div class="day-actions"><button class="btn primary" type="button" data-dv="patch">Faden flicken</button></div>` : ""}`;
  }
  function renderWeekBody() {
    const mon = mondayOf(dvDay), todayK = dateKey();
    const days = Array.from({ length: 7 }, (_, i) => dateKey(addDays(mon, i)));
    const mins = minutesByDay(), pgs = pagesByDay();
    const past = days.filter((k) => k <= todayK), n = past.length || 1;
    const sumM = past.reduce((a, k) => a + (mins[k] || 0), 0), sumP = past.reduce((a, k) => a + (pgs[k] || 0), 0);
    const readDays = past.filter((k) => mins[k]).length, goals = past.filter((k) => goalDone(mins[k] || 0, pgs[k] || 0)).length;
    const prev = Array.from({ length: 7 }, (_, i) => dateKey(addDays(mon, i - 7))).reduce((a, k) => a + (mins[k] || 0), 0);
    const prevAvg = prev / 7, avg = sumM / n;
    const best = past.reduce((b, k) => ((mins[k] || 0) > (mins[b] || 0) ? k : b), past[0]);
    const sun = addDays(mon, 6);
    $("#dayKicker").textContent = `KW ${isoWeek(mon)}`;
    $("#dayTitle").textContent = `${mon.getDate()}.${mon.getMonth() !== sun.getMonth() ? ` ${mon.toLocaleDateString("de-DE", { month: "short" })}` : ""} – ${sun.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}`;
    $("#dayNext").disabled = days.includes(todayK);
    const fmt1 = (v) => v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
    const max = Math.max(goalMin(), ...days.map((k) => mins[k] || 0));
    const trend = prev ? Math.round(((avg - prevAvg) / prevAvg) * 100) : null;
    const notes = [];
    if (readDays) notes.push(`Stärkster Tag: ${parseKey(best).toLocaleDateString("de-DE", { weekday: "long" })} mit ${mins[best]} Minuten.`);
    if (trend !== null) notes.push(trend >= 0 ? `Ø ${trend} % mehr Lesezeit pro Tag als in der Vorwoche.` : `Ø ${-trend} % weniger Lesezeit pro Tag als in der Vorwoche.`);
    else if (readDays) notes.push("In der Vorwoche gab es noch keine Lesezeit zum Vergleichen.");
    if (past.length < 7) notes.push(`Die Woche läuft noch: Durchschnitt über ${plural(past.length, "Tag", "Tage")}.`);
    if (!readDays) notes.push("In dieser Woche wurde noch nicht gelesen.");
    $("#dayBody").innerHTML = `
      <dl class="wk-tiles">
        <div class="wk-tile"><dt>Ø Minuten/Tag</dt><dd>${fmt1(avg)}</dd></div>
        <div class="wk-tile"><dt>Ø Seiten/Tag</dt><dd>${fmt1(sumP / n)}</dd></div>
        <div class="wk-tile"><dt>Lesetage</dt><dd>${readDays}/${past.length}</dd></div>
        <div class="wk-tile"><dt>Ziel erreicht</dt><dd>${goals}×</dd></div>
      </dl>
      <div class="wk-chart">
        <div class="wk-goal" data-ratio="${goalMin() / max}"><span>Ziel ${goalMin()}′</span></div>
        ${days.map((k, i) => { const v = mins[k] || 0, fut = k > todayK; return `<button type="button" class="wk-bar ${k === dvDay ? "sel" : ""} ${fut ? "future" : ""}" data-wday="${k}" ${fut ? "disabled" : ""} aria-label="${parseKey(k).toLocaleDateString("de-DE", { weekday: "long" })}: ${v} Minuten">
          <div class="col" data-h="${fut ? 100 : (v / max) * 100}">${v ? `<b>${v}</b>` : ""}</div>
          <span>${goalDone(v, pgs[k] || 0) ? `<i class="kn"></i>` : ""}${WD[parseKey(k).getDay()]}</span></button>`; }).join("")}
      </div>
      <ul class="wk-notes">${notes.map((t) => `<li>${t}</li>`).join("")}</ul>
      <p class="muted" style="margin:0;font-size:.82rem">Gesamt diese Woche: ${sumM} Minuten · ${sumP} Seiten. Tippe auf einen Balken für den Tag.</p>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$("#dayBody .wk-bar .col").forEach((c) => (c.style.height = c.dataset.h + "%"));
      // Ziel-Linie genau auf Höhe der Balkenskala setzen
      const chart = $("#dayBody .wk-chart"), bar = chart.querySelector(".wk-bar"), lbl = bar.querySelector("span");
      const labelH = bar.getBoundingClientRect().bottom - lbl.getBoundingClientRect().top + 4;
      const area = bar.clientHeight - labelH;
      const g = chart.querySelector(".wk-goal"); g.style.bottom = `${labelH + area * +g.dataset.ratio}px`;
    }));
  }
  $("#dayMode").addEventListener("click", (e) => { const b = e.target.closest("[data-dmode]"); if (b) { dvMode = b.dataset.dmode; renderDayView(); } });
  $("#dayPrev").addEventListener("click", () => { dvDay = dateKey(addDays(parseKey(dvDay), dvMode === "day" ? -1 : -7)); renderDayView(); });
  $("#dayNext").addEventListener("click", () => { const n = dateKey(addDays(parseKey(dvDay), dvMode === "day" ? 1 : 7)); dvDay = n > dateKey() ? dateKey() : n; renderDayView(); });
  $("#dayClose").addEventListener("click", () => $("#dayDialog").close());
  $("#dayBody").addEventListener("click", (e) => {
    const w = e.target.closest("[data-wday]"); if (w) { dvDay = w.dataset.wday; dvMode = "day"; renderDayView(); return; }
    const a = e.target.closest("[data-dv]"); if (!a) return;
    $("#dayDialog").close();
    if (a.dataset.dv === "read") go("timer"); else openPatch(dvDay);
  });
  $("#patchManual").addEventListener("click", () => {
    $("#patchManualBox").hidden = false; $("#patchManual").hidden = true;
    $("#patchMin").value = goalMin(); $("#patchMin").min = goalMin();
    $("#patchBook").innerHTML = state.books.filter((b) => b.status === "lesen").map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("") + `<option value="">Ohne bestimmtes Buch</option>`;
    $("#patchGo").textContent = "Flicken";
  });
  $("#patchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!patchPick) return;
    if (!$("#patchManualBox").hidden) {
      const m = parseInt($("#patchMin").value) || 0;
      if (m < goalMin()) { toast(`Zum Flicken brauchst du mindestens ${goalMin()} Minuten.`); return; }
      $("#patchDialog").close();
      logSession({ bookId: $("#patchBook").value, minutes: m, date: patchPick, patched: true });
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
    sel.innerHTML = `<option value="">Buch wählen …</option>` + books.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("");
    if (v && books.some((b) => b.id === v)) sel.value = v; else if (books.find((b) => b.status === "lesen")) sel.value = books.find((b) => b.status === "lesen").id;
    const list = [...state.lines].sort((a, b) => b.ts - a.ts);
    $("#lines").innerHTML = list.length
      ? list.slice(0, 6).map((l, i) => `<figure class="line" style="animation-delay:${i * 0.04}s"><blockquote>„${esc(l.text)}“</blockquote>
          <figcaption>${esc(bookById(l.bookId)?.title || "ohne Buch")}${l.page ? ` · S. ${l.page}` : ""} · ${fmtDate(l.date)}</figcaption>
          <button type="button" data-delline="${l.id}" aria-label="Satz entfernen">×</button></figure>`).join("")
      : `<p class="words-empty">Halte Sätze fest, die dich berühren, überraschen oder zum Nachdenken bringen. Mit Seitenzahl findest du sie wieder.</p>`;
  }
  function renderCollectCount() {
    const w = state.words.length, l = state.lines.length;
    $("#wordCount").textContent = [w ? `${w} ${w === 1 ? "Wort" : "Wörter"}` : "", l ? `${l} ${l === 1 ? "Satz" : "Sätze"}` : ""].filter(Boolean).join(" · ");
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
    renderLines(); renderCollectCount(); checkBadges(); toast("📜 Satz gespeichert.");
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
      ? list.slice(0, 18).map((w, i) => `<span class="word" style="animation-delay:${i * 0.03}s" title="${esc(fmtDate(w.date))}${bookById(w.bookId) ? " · " + esc(bookById(w.bookId).title) : ""}">${esc(w.w)}<button type="button" data-delword="${w.id}" aria-label="${esc(w.w)} entfernen">×</button></span>`).join("")
      : `<p class="words-empty">Sammle Wörter, die neu, schön oder schwierig sind. Wer sie aufschreibt, behält sie.</p>`;
  }
  function addWord(word, bookId = null, date = dateKey()) {
    const w = word.trim().replace(/\s+/g, " ");
    if (!w) return false;
    if (state.words.some((x) => x.w.toLowerCase() === w.toLowerCase())) { toast(`„${w}“ steht schon in deinem Wortschatz.`); return false; }
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

  let chartMode = "min";
  $("#chartMode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    chartMode = b.dataset.mode;
    $$("#chartMode button").forEach((x) => x.classList.toggle("active", x === b));
    renderDashboard();
  });

  function allTips() { return [...D.tips[group()], ...D.tips.alle]; }
  function showTip(next) {
    const tips = allTips();
    if (next) { state.tipIndex = (state.tipIndex + 1) % tips.length; save(); }
    const t = tips[(state.tipIndex + new Date().getDate()) % tips.length];
    const el = $("#tipOfDay");
    el.innerHTML = `<span class="tip-ico">${t.ico}</span><p><strong>${esc(t.title)}</strong>${esc(t.text)}</p>`;
    el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap");
  }

  let shelfFilter = "alle";
  function renderShelf() {
    const list = state.books.filter((b) => shelfFilter === "alle" || b.status === shelfFilter);
    const order = { lesen: 0, wunsch: 1, gelesen: 2 };
    list.sort((a, b) => order[a.status] - order[b.status] || (b.updated || 0) - (a.updated || 0));
    $("#shelf").innerHTML = list.map((b, i) => `
      <button class="book" data-edit="${b.id}" style="animation-delay:${i * 0.04}s" aria-label="${esc(b.title)} bearbeiten">
        <div class="book-inner" style="--c:${coverColor(b.title)}">
          <span class="badge-status">${STATUS_LABEL[b.status]}</span>
          <span class="book-emoji">${b.emoji || GENRE_EMOJI[b.genre] || "📘"}</span>
          <div class="book-title">${esc(b.title)}</div>
          <div class="book-author">${esc(b.author)}</div>
          <div class="book-foot">
            ${b.rating ? "★".repeat(b.rating) + "<br>" : ""}
            ${b.status !== "wunsch" && b.pages ? `${pct(b)} % · ${b.status === "gelesen" ? b.pages : b.currentPage || 0}/${b.pages} S.` : ""}
            ${b.status !== "wunsch" ? `<div class="progress"><i data-w="${pct(b)}"></i></div>` : ""}
          </div>
        </div>
        <div class="book-meta"><span>${sinceText(b)}</span><span>${bookMinutes(b.id) ? fmtDuration(bookMinutes(b.id)) : ""}</span></div>
      </button>`).join("") + `
      <button class="book add" id="shelfAdd"><div class="book-inner"><span class="book-emoji">＋</span><div class="book-title">Neues Buch</div></div></button>`;
    animateProgress($("#shelf"));
  }
  $("#shelfFilters").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    shelfFilter = c.dataset.filter;
    $$("#shelfFilters .chip").forEach((x) => x.classList.toggle("active", x === c));
    renderShelf();
  });

  function renderDiscover(g = group()) {
    $$("#recoFilters .chip").forEach((c) => c.classList.toggle("active", c.dataset.group === g));
    const have = new Set(state.books.map((b) => b.title.toLowerCase()));
    $("#recoGrid").innerHTML = D.recommendations[g].map((r, i) => `
      <article class="card reco" style="animation-delay:${i * 0.06}s">
        <div class="mini-cover" style="--c:${coverColor(r.title)}">${r.emoji}</div>
        <div>
          <h3>${esc(r.title)}</h3>
          <p class="by">${esc(r.author)}</p>
          <div class="tags"><span class="tag">${esc(r.genre)}</span><span class="tag">ca. ${r.pages} Seiten</span></div>
          <p>${esc(r.text)}</p>
          ${have.has(r.title.toLowerCase())
            ? `<button class="btn" disabled>✓ Im Regal</button>`
            : `<button class="btn" data-wish="${g}|${i}">＋ Wunschliste</button> <button class="btn primary" data-start="${g}|${i}">Jetzt lesen</button>`}
        </div>
      </article>`).join("");
    $("#tipsGrid").innerHTML = [...D.tips[g], ...D.tips.alle].map((t, i) => `
      <article class="card" style="animation-delay:${i * 0.05}s"><span class="tip-ico">${t.ico}</span><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p></article>`).join("");
  }
  $("#recoFilters").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) renderDiscover(c.dataset.group); });
  $("#recoGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-wish],[data-start]"); if (!b) return;
    const [g, i] = (b.dataset.wish || b.dataset.start).split("|");
    const r = D.recommendations[g][+i];
    const status = b.dataset.start ? "lesen" : "wunsch";
    addBook({ title: r.title, author: r.author, pages: r.pages, genre: r.genre, emoji: r.emoji, status, startDate: status === "lesen" ? dateKey() : null });
    toast(status === "lesen" ? `📖 Viel Spaß mit „${r.title}“!` : `⭐ „${r.title}“ steht auf deiner Wunschliste.`);
    renderDiscover(g);
  });

  function renderBadges() {
    const t = totals();
    const pts = t.minutes + t.pages + t.finished * 50;
    const lv = [...D.levels].reverse().find((l) => pts >= l.min);
    const idx = D.levels.indexOf(lv);
    const next = D.levels[idx + 1];
    const prog = next ? Math.round(((pts - lv.min) / (next.min - lv.min)) * 100) : 100;
    $("#levelCard").innerHTML = `
      <span class="lv-ico">${lv.ico}</span>
      <div>
        <p class="kicker">Stufe ${idx + 1} von ${D.levels.length}</p>
        <h2>${lv.name}</h2>
        <p class="muted" style="margin:.2rem 0 .4rem">${pts} Lesepunkte${next ? ` · noch ${next.min - pts} bis „${next.name}“` : " · Höchste Stufe erreicht!"}</p>
        <div class="progress"><i data-w="${prog}"></i></div>
        <p class="muted" style="font-size:.78rem;margin:.4rem 0 0">1 Punkt pro Minute und pro Seite, 50 Bonuspunkte pro beendetem Buch.</p>
      </div>`;
    animateProgress($("#levelCard"));
    const un = BADGES.filter((b) => b.test());
    $("#badgeCount").textContent = `${un.length} von ${BADGES.length} freigeschaltet`;
    $("#badges").innerHTML = BADGES.map((b, i) => {
      const ok = b.test();
      return `<article class="card badge ${ok ? "unlocked" : "locked"}" style="animation-delay:${i * 0.04}s;--r:${rot(b.id)}deg">
        <div class="medal">${ok ? b.ico : "offen"}</div><h3>${b.name}</h3><p>${b.desc}</p></article>`;
    }).join("");
  }

  function animateProgress(root) {
    requestAnimationFrame(() => requestAnimationFrame(() => $$(".progress > i[data-w]", root).forEach((i) => (i.style.width = i.dataset.w + "%"))));
  }
  function countUp(el, to) {
    const from = 0, dur = 900, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString("de-DE");
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Bücher ----------
  function addBook(data) {
    const b = {
      id: uid(), title: data.title.trim(), author: (data.author || "").trim(), pages: data.pages || null,
      currentPage: data.currentPage || 0, status: data.status || "lesen", genre: data.genre || "Roman",
      startDate: data.startDate ?? (data.status === "wunsch" ? null : dateKey()), endDate: data.endDate || null,
      rating: data.rating || 0, notes: data.notes || "", emoji: data.emoji || null, color: coverColor(data.title), updated: Date.now()
    };
    state.books.push(b); save(); checkBadges(); return b;
  }

  const bookDialog = $("#bookDialog");
  let editingId = null, rating = 0;
  function renderStars() {
    $("#fStars").innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${n === rating}" aria-label="${n} Sterne" class="${n <= rating ? "on" : ""}" data-star="${n}">★</button>`).join("");
  }
  $("#fStars").addEventListener("click", (e) => { const s = e.target.closest("[data-star]"); if (!s) return; rating = +s.dataset.star === rating ? 0 : +s.dataset.star; renderStars(); });

  function openBook(id = null) {
    editingId = id;
    const b = id ? bookById(id) : null;
    $("#bookDialogTitle").textContent = b ? "Buch bearbeiten" : "Buch hinzufügen";
    $("#fTitle").value = b?.title || "";
    $("#fAuthor").value = b?.author || "";
    $("#fPages").value = b?.pages || "";
    $("#fCurrent").value = b?.currentPage || 0;
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
    if (!b || !(await askConfirm(`„${b.title}“ wirklich löschen? Die Lesezeiten bleiben in deiner Statistik.`))) return;
    state.books = state.books.filter((x) => x.id !== editingId); save();
    bookDialog.close(); toast("Buch gelöscht."); render();
  });
  $("#bookForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const pages = parseInt($("#fPages").value) || null;
    let current = Math.max(0, parseInt($("#fCurrent").value) || 0);
    if (pages) current = Math.min(current, pages);
    const status = $("#fStatus").value;
    const data = {
      title: $("#fTitle").value.trim(), author: $("#fAuthor").value.trim(), pages, currentPage: current, status,
      genre: $("#fGenre").value, startDate: $("#fStart").value || (status === "wunsch" ? null : dateKey()),
      rating, notes: $("#fNotes").value.trim()
    };
    if (!data.title) return;
    if (editingId) {
      const b = bookById(editingId);
      const wasDone = b.status === "gelesen";
      Object.assign(b, data, { updated: Date.now() });
      if (status === "gelesen" && !wasDone) { b.endDate = dateKey(); if (b.pages) b.currentPage = b.pages; celebrateFinish(b); }
      if (status !== "gelesen") b.endDate = null;
      save(); checkBadges(); toast("Gespeichert ✓");
    } else {
      const b = addBook({ ...data, endDate: status === "gelesen" ? dateKey() : null });
      if (status === "gelesen") celebrateFinish(b); else toast(`📚 „${b.title}“ steht jetzt in deinem Regal.`);
    }
    bookDialog.close(); render(); fillBookSelects();
  });
  function celebrateFinish(b) { confetti(); toast(`🎉 „${b.title}“ ausgelesen – Glückwunsch!`); }

  // ---------- Timer ----------
  let preset = 20, tickHandle = null, booting = true; // während des Intros keine Dialoge öffnen
  const CIRC = 578;
  function fillBookSelects() {
    const reading = state.books.filter((b) => b.status === "lesen");
    const opts = reading.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("") + `<option value="">Ohne bestimmtes Buch</option>`;
    for (const sel of [$("#timerBook"), $("#manualBook")]) {
      const v = sel.value; sel.innerHTML = opts;
      if (v && [...sel.options].some((o) => o.value === v)) sel.value = v;
    }
    if (state.timer?.bookId != null) $("#timerBook").value = state.timer.bookId;
    $("#manualBook").dispatchEvent(new Event("change"));
  }
  const elapsedMs = () => { const t = state.timer; return t ? t.acc + (t.running ? Date.now() - t.startedAt : 0) : 0; };

  function renderTimerView() {
    fillBookSelects();
    $("#manualDate").value ||= dateKey();
    $("#manualDate").max = dateKey();
    const recent = [...state.sessions].sort((a, b) => b.ts - a.ts).slice(0, 8);
    $("#sessionLog").innerHTML = recent.length
      ? recent.map((s, i) => `<li style="animation-delay:${i * 0.04}s"><time>${fmtDate(s.date)}</time><div>
          <strong>${esc(bookById(s.bookId)?.title || "Freies Lesen")}</strong> <span class="entry-meta">· ${s.minutes} Min.${s.pages ? ` · ${s.pages} S.` : ""}${s.patched ? ` · nachgelesen am ${fmtDate(s.readOn)}` : ""}</span>
          ${s.note ? `<p class="entry-note">„${esc(s.note)}“</p>` : ""}
          ${s.word ? `<span class="word">${esc(s.word)}</span>` : ""}</div></li>`).join("")
      : `<li><time>—</time><span class="muted">Noch keine Einträge. Nach jeder Lesezeit kannst du hier einen Satz notieren.</span></li>`;
    updateClock();
  }
  function updateClock() {
    const t = state.timer;
    const target = (t ? t.target : preset) * 60000;
    const el = elapsedMs();
    let shown, ratio;
    if (target) { shown = Math.max(0, target - el); ratio = el / target; }
    else { shown = el; ratio = (el % 3600000) / 3600000; }
    const s = Math.round(shown / 1000);
    $("#clockTime").textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    $("#clockMode").textContent = target ? (t ? "noch" : "Countdown") : "Freies Lesen";
    $("#clockRing").style.strokeDashoffset = target ? CIRC * Math.min(1, ratio) : CIRC * (1 - ratio);
    const running = !!t?.running;
    $(".timer-card").classList.toggle("running", running);
    $("#timerStart").textContent = running ? "Pause" : t ? "Weiter" : "Start";
    $("#timerStop").disabled = !t;
    $$("#timerPresets .chip").forEach((c) => { c.disabled = !!t; c.classList.toggle("active", +c.dataset.min === (t ? t.target : preset)); });
    $("#timerBook").disabled = !!t;
    const pf = t ? t.patchFor : patchPending;
    $("#patchBanner").hidden = !pf;
    if (pf) $("#patchBannerText").textContent = `🪡 Flicken für ${longDay(pf)} · ${goalMin()} Min. am Stück`;
    $("#patchBannerCancel").hidden = !!t;
    if (!booting && target && t && el >= target) finishTimer(true);
  }
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
    const t = state.timer; if (!t) return;
    const ms = t.target && auto ? t.target * 60000 : elapsedMs();
    state.timer = null; save(); clearInterval(tickHandle); updateClock();
    if (ms < 30000) { toast("Unter 30 Sekunden – das zählt noch nicht. 😉"); return; }
    if (auto) chime();
    const minutes = Math.max(1, Math.round(ms / 60000));
    const patchOk = t.patchFor && minutes >= goalMin() && patchableDays().includes(t.patchFor);
    pendingSession = patchOk ? { bookId: t.bookId, minutes, date: t.patchFor, patched: true } : { bookId: t.bookId, minutes };
    const b = bookById(t.bookId);
    $("#finishText").textContent = `Du hast ${plural(minutes, "Minute", "Minuten")} gelesen${b ? ` in „${b.title}“` : ""}.`
      + (patchOk ? ` Damit flickst du ${longDay(t.patchFor)}.` : t.patchFor ? ` Zum Flicken fehlten ${goalMin() - minutes} Minuten, die Zeit zählt für heute.` : "");
    $("#finishStampMin").textContent = `${minutes}′`;
    $("#finishNote").value = ""; $("#finishWord").value = "";
    $("#finishPageLbl").textContent = b ? "Auf welcher Seite bist du jetzt?" : "Wie viele Seiten hast du gelesen?";
    $("#finishPage").value = b ? b.currentPage || "" : "";
    if (b?.pages) $("#finishPage").max = b.pages; else $("#finishPage").removeAttribute("max");
    $("#finishDialog").showModal();
  }
  $("#finishForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (pendingSession) {
      const v = parseInt($("#finishPage").value);
      const extra = { note: $("#finishNote").value, word: $("#finishWord").value };
      logSession(bookById(pendingSession.bookId) ? { ...pendingSession, ...extra, toPage: v } : { ...pendingSession, ...extra, pagesRead: v });
    }
    pendingSession = null; $("#finishDialog").close();
  });
  $("#finishDialog").addEventListener("cancel", () => { if (pendingSession) logSession(pendingSession); pendingSession = null; });

  function logSession({ bookId, minutes, toPage, pagesRead, note = "", word = "", date = dateKey(), patched = false }) {
    const b = bookById(bookId);
    let pages = !b && Number.isFinite(pagesRead) ? Math.max(0, Math.min(2000, pagesRead)) : 0;
    const beforeMin = minutesByDay()[date] || 0, beforePg = pagesByDay()[date] || 0;
    if (b && Number.isFinite(toPage)) {
      const np = Math.max(0, b.pages ? Math.min(toPage, b.pages) : toPage);
      pages = Math.max(0, np - (b.currentPage || 0));
      b.currentPage = np; b.updated = Date.now();
      if (!b.startDate) b.startDate = date;
    }
    note = note.trim().slice(0, 200); word = word.trim().slice(0, 40);
    if (word && !addWord(word, bookId, date)) word = "";
    const entry = { id: uid(), bookId: bookId || null, date, minutes, pages, note, word, hour: date === dateKey() ? new Date().getHours() : null, ts: Date.now() };
    if (patched) { entry.patched = true; entry.readOn = dateKey(); entry.hour = null; }
    state.sessions.push(entry);
    let finished = false;
    if (b && b.pages && b.currentPage >= b.pages && b.status !== "gelesen") { b.status = "gelesen"; b.endDate = date; finished = true; }
    save();
    const isToday = date === dateKey();
    const wasDone = goalDone(beforeMin, beforePg), nowDone = goalDone(beforeMin + minutes, beforePg + pages);
    const minHit = beforeMin < goalMin() && beforeMin + minutes >= goalMin();
    const pgHit = beforePg < goalPg() && beforePg + pages >= goalPg();
    if (patched) { confetti(); toast(`🪡 Geflickt! Dein Faden ist wieder verbunden${streak() > 1 ? ` – ${streak()} Tage lang` : ""}.`); if (finished) setTimeout(() => celebrateFinish(b), 3400); }
    else if (finished) celebrateFinish(b);
    else if (isToday && !wasDone && nowDone) { confetti(); toast("🎯 Tagesziel erreicht – Minuten und Seiten geschafft!"); }
    else if (isToday && beforeMin === 0) toast(`🧵 Neuer Stich! Dein Lesefaden ist jetzt ${plural(streak(), "Tag", "Tage")} lang.`);
    else if (isToday && minHit) toast(`⏱️ Minutenziel geschafft! Noch ${goalPg() - beforePg - pages} Seiten.`);
    else if (isToday && pgHit) toast(`📄 Seitenziel geschafft! Noch ${goalMin() - beforeMin - minutes} Minuten.`);
    else toast(`✓ ${minutes} Min.${pages ? ` und ${pages} Seiten` : ""} eingetragen.`);
    checkBadges(); render();
  }
  $("#manualForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const minutes = parseInt($("#manualMin").value);
    if (!minutes || minutes < 1) return;
    const date = $("#manualDate").value || dateKey();
    if (date > dateKey()) { toast("Das Datum liegt in der Zukunft."); return; }
    const bookId = $("#manualBook").value, v = parseInt($("#manualPage").value);
    const note = $("#manualNote").value;
    logSession(bookById(bookId) ? { bookId, minutes, toPage: v, note, date } : { bookId, minutes, pagesRead: v, note, date });
    $("#manualPage").value = ""; $("#manualNote").value = "";
  });

  $("#manualBook").addEventListener("change", () => {
    const b = bookById($("#manualBook").value);
    $("#manualPageLbl").textContent = b ? "Bis Seite" : "Gelesene Seiten";
    $("#manualPage").placeholder = b ? `jetzt S. ${b.currentPage || 0}` : "z. B. 12";
  });

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
  function openProfile() {
    const p = state.profile;
    $("#profileTitle").textContent = p ? "Dein Lesepass" : "Willkommen bei Lesezeit";
    $("#profileIntro").textContent = p ? "Name, Altersgruppe und Tagesziele ändern." : "Ein paar Minuten am Tag machen den Unterschied. Richte kurz deinen Lesepass ein:";
    $("#pName").value = p?.name || "";
    $$("#pGroup input").forEach((r) => (r.checked = r.value === (p?.group || "erwachsene")));
    $("#pGoal").value = p?.goal || 20; $("#pGoalOut").textContent = $("#pGoal").value;
    $("#pGoalPages").value = p?.goalPages || PAGE_DEFAULT[p?.group || "erwachsene"]; $("#pGoalPagesOut").textContent = $("#pGoalPages").value;
    $("#resetAll").hidden = !p;
    $("#demoData").hidden = state.books.length > 0;
    profileDialog.showModal();
  }
  $("#profileBtn").addEventListener("click", openProfile);
  $("#pGoal").addEventListener("input", (e) => ($("#pGoalOut").textContent = e.target.value));
  $("#pGoalPages").addEventListener("input", (e) => ($("#pGoalPagesOut").textContent = e.target.value));
  $("#pGroup").addEventListener("change", (e) => {
    const g = { kinder: 15, jugend: 20, erwachsene: 20 }[e.target.value];
    if (!state.profile) {
      $("#pGoal").value = g; $("#pGoalOut").textContent = g;
      $("#pGoalPages").value = PAGE_DEFAULT[e.target.value]; $("#pGoalPagesOut").textContent = PAGE_DEFAULT[e.target.value];
    }
  });
  function readProfile() {
    return { name: $("#pName").value.trim(), group: $("#pGroup input:checked")?.value || "erwachsene", goal: +$("#pGoal").value, goalPages: +$("#pGoalPages").value };
  }
  $("#profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const first = !state.profile;
    state.profile = readProfile(); save();
    profileDialog.close(); render();
    if (first) { confetti(); toast(`Dein Lesepass ist bereit, ${state.profile.name}.`); }
  });
  profileDialog.addEventListener("cancel", (e) => { if (!state.profile) e.preventDefault(); });
  $("#resetAll").addEventListener("click", async () => {
    if (!(await askConfirm("Wirklich alle Bücher, Lesezeiten und Erfolge löschen?"))) return;
    state = defaultState(); save(); profileDialog.close(); render(); openProfile();
  });
  $("#demoData").addEventListener("click", () => {
    if (!$("#pName").value.trim()) $("#pName").value = "Lea";
    state.profile = readProfile();
    loadDemo(); profileDialog.close(); render(); fillBookSelects();
    toast("Beispieldaten geladen. Schau dich um!");
  });

  function loadDemo() {
    const today = new Date();
    const k = (n) => dateKey(addDays(today, -n));
    const g = state.profile.group;
    const recos = D.recommendations[g];
    quietBadges = true;
    const b1 = addBook({ ...recos[0], status: "lesen", currentPage: Math.round(recos[0].pages * 0.55), startDate: k(9) });
    const b2 = addBook({ ...recos[1], status: "lesen", currentPage: Math.round(recos[1].pages * 0.2), startDate: k(2) });
    const b3 = addBook({ ...recos[2], status: "gelesen", currentPage: recos[2].pages, startDate: k(24), endDate: k(11), rating: 5, notes: "Hat mich total gepackt!" });
    addBook({ ...recos[3], status: "wunsch", startDate: null });
    const plan = [[0, 15, b1, 12], [1, 25, b1, 18], [2, 20, b2, 14], [3, 30, b1, 20], [4, 10, b1, 8], [6, 22, b1, 15], [7, 35, b1, 25], [11, 40, b3, 40], [12, 25, b3, 20], [13, 30, b3, 28]];
    const notes = { 0: "Endlich wird klar, warum die beiden losfahren.", 3: "Das Kapitel war spannend, ich wollte nicht aufhören.", 7: "Eine Stelle habe ich zweimal gelesen, so schön war sie." };
    for (const [d, minutes, b, pages] of plan) state.sessions.push({ id: uid(), bookId: b.id, date: k(d), minutes, pages, note: notes[d] || "", word: "", hour: d % 3 === 0 ? 21 : 18, ts: Date.now() - d * 86400000 });
    ["Sehnsucht", "beiläufig", "Fernweh", "verblüfft", "Abenteuer", "flüstern"].forEach((w, i) => state.words.push({ id: uid(), w, bookId: b1.id, date: k(i), ts: Date.now() - i * 86400000 }));
    state.seenBadges = BADGES.filter((b) => b.test()).map((b) => b.id);
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
    const readDays = Object.keys(minutesByDay()).length;
    $("#coverOwner").textContent = p?.name ? `von ${p.name}` : "Jeden Tag ein paar Seiten";
    $("#coverNo").textContent = `Lesetag Nr. ${String(readDays + (minutesByDay()[dateKey()] ? 0 : 1)).padStart(3, "0")}`;
    $("#fpDate").textContent = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    $("#fpQuote").textContent = `„${q.text}“`;
    $("#fpBy").textContent = "— " + q.by;
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
      setTimeout(finish, 9100); // genug Zeit, um Datum und Zitat in Ruhe zu lesen
    });
  }

  // ---------- Start ----------
  $("#nextTip").addEventListener("click", () => showTip(true));
  window.addEventListener("hashchange", () => go(location.hash.slice(1)));
  fillBookSelects();
  go(location.hash.slice(1) || "uebersicht");
  runIntro().then(() => {
    booting = false;
    if (state.timer) { startTick(); updateClock(); }
    if (!state.profile) openProfile();
  });
  // Datum wechselt um Mitternacht → Übersicht aktualisieren
  setInterval(() => { if ($("#view-uebersicht").classList.contains("active") && !document.querySelector("dialog[open]")) renderDashboard(); }, 5 * 60000);
})();
