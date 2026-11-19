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
  const STATUS_LABEL = { lesen: "Lese ich", gelesen: "Gelesen ✓", wunsch: "Wunsch" };

  // ---------- Zustand ----------
  const defaultState = () => ({ profile: null, books: [], sessions: [], timer: null, seenBadges: [], tipIndex: 0 });
  let state;
  try { state = Object.assign(defaultState(), JSON.parse(localStorage.getItem(STORE_KEY)) || {}); }
  catch { state = defaultState(); }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* Speicher nicht verfügbar */ } };

  const bookById = (id) => state.books.find((b) => b.id === id);
  const group = () => state.profile?.group || "erwachsene";

  // ---------- Kennzahlen ----------
  function minutesByDay() {
    const m = {};
    for (const s of state.sessions) m[s.date] = (m[s.date] || 0) + s.minutes;
    return m;
  }
  function streak() {
    const m = minutesByDay();
    let d = new Date();
    if (!m[dateKey(d)]) d = addDays(d, -1); // heute noch offen → Strähne zählt ab gestern
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
    { id: "goal", ico: "🎯", name: "Ziel erreicht", desc: "Tagesziel einmal geschafft", test: () => Object.values(minutesByDay()).some((m) => m >= (state.profile?.goal || 20)) },
    { id: "streak3", ico: "🔥", name: "Drei am Stück", desc: "3 Tage in Folge gelesen", test: () => bestStreak() >= 3 },
    { id: "streak7", ico: "🌟", name: "Wochen-Held", desc: "7 Tage in Folge gelesen", test: () => bestStreak() >= 7 },
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
    $("#greeting").textContent = p?.name ? `${hello}, ${p.name}!` : `${hello}!`;
    $("#todayLabel").textContent = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    $("#motto").textContent = D.mottos[new Date().getDate() % D.mottos.length];

    // Tagesziel
    const goal = p?.goal || 20;
    const today = minutesByDay()[dateKey()] || 0;
    const ratio = Math.min(1, today / goal);
    const ring = $("#goalRing");
    ring.style.strokeDashoffset = 326.7;
    requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.strokeDashoffset = 326.7 * (1 - ratio); }));
    ring.classList.toggle("done", ratio >= 1);
    countUp($("#goalMinutes"), today);
    $("#goalOf").textContent = `von ${goal} Min.`;
    $("#goalHint").textContent = ratio >= 1 ? "Geschafft! Du bist großartig. 🎉" : today ? `Nur noch ${goal - today} Minuten!` : "Noch nicht gelesen – starte mit 10 Minuten.";

    // Strähne
    const st = streak();
    $("#streakDays").textContent = st;
    $("#streakWord").textContent = st === 1 ? "Tag" : "Tage";
    $("#flame").classList.toggle("off", st === 0);
    const m = minutesByDay();
    $("#weekDots").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(new Date(), i - 6);
      const on = !!m[dateKey(d)];
      return `<div><i class="${on ? "on" : ""}" style="animation-delay:${i * 0.07}s">${on ? "✓" : ""}</i>${WD[d.getDay()]}</div>`;
    }).join("");

    // Zahlen
    const t = totals();
    countUp($("#statBooks"), t.finished);
    countUp($("#statPages"), t.pages);
    $("#statHours").textContent = t.minutes < 60 ? `${t.minutes} Min.` : `${(t.minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std.`;
    countUp($("#statSessions"), t.sessions);

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
      : `<div class="empty"><span class="em">📖</span>Du liest gerade kein Buch.<br><button class="link" data-nav="entdecken">Lass dich inspirieren →</button></div>`;
    animateProgress($("#currentList"));

    // Woche
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    const vals = days.map((d) => m[dateKey(d)] || 0);
    const max = Math.max(goal, ...vals);
    $("#weekChart").innerHTML = days.map((d, i) => `
      <div class="bar ${i === 6 ? "today" : ""}" title="${vals[i]} Minuten">
        <div class="col" data-h="${(vals[i] / max) * 100}">${vals[i] ? `<b>${vals[i]}</b>` : ""}</div>
        <span>${i === 6 ? "Heute" : WD[d.getDay()]}</span>
      </div>`).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => $$("#weekChart .col").forEach((c) => (c.style.height = c.dataset.h + "%"))));

    showTip(false);
  }

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
        <p class="eyebrow">Stufe ${idx + 1} von ${D.levels.length}</p>
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
      return `<article class="card badge ${ok ? "unlocked" : "locked"}" style="animation-delay:${i * 0.04}s">
        <div class="medal">${ok ? b.ico : "🔒"}</div><h3>${b.name}</h3><p>${b.desc}</p></article>`;
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
    $("#fStars").innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${n === rating}" aria-label="${n} Sterne" class="${n <= rating ? "on" : ""}" data-star="${n}">⭐</button>`).join("");
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
  let preset = 20, tickHandle = null;
  const CIRC = 603.2;
  function fillBookSelects() {
    const reading = state.books.filter((b) => b.status === "lesen");
    const opts = reading.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("") + `<option value="">Ohne bestimmtes Buch</option>`;
    for (const sel of [$("#timerBook"), $("#manualBook")]) {
      const v = sel.value; sel.innerHTML = opts;
      if (v && [...sel.options].some((o) => o.value === v)) sel.value = v;
    }
    if (state.timer?.bookId != null) $("#timerBook").value = state.timer.bookId;
  }
  const elapsedMs = () => { const t = state.timer; return t ? t.acc + (t.running ? Date.now() - t.startedAt : 0) : 0; };

  function renderTimerView() {
    fillBookSelects();
    $("#manualDate").value ||= dateKey();
    $("#manualDate").max = dateKey();
    const recent = [...state.sessions].sort((a, b) => b.ts - a.ts).slice(0, 6);
    $("#sessionLog").innerHTML = recent.length
      ? recent.map((s) => `<li><span>${esc(bookById(s.bookId)?.title || "Freies Lesen")}${s.pages ? ` · ${s.pages} S.` : ""}</span><span>${s.minutes} Min. · ${fmtDate(s.date)}</span></li>`).join("")
      : `<li><span class="muted">Noch keine Einträge – leg los!</span></li>`;
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
    $("#timerStart").textContent = running ? "❚❚ Pause" : t ? "▶ Weiter" : "▶ Start";
    $("#timerStop").disabled = !t;
    $$("#timerPresets .chip").forEach((c) => { c.disabled = !!t; c.classList.toggle("active", +c.dataset.min === (t ? t.target : preset)); });
    $("#timerBook").disabled = !!t;
    if (target && t && el >= target) finishTimer(true);
  }
  function startTick() { clearInterval(tickHandle); tickHandle = setInterval(updateClock, 500); }
  $("#timerPresets").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c || state.timer) return; preset = +c.dataset.min; updateClock(); });
  $("#timerStart").addEventListener("click", () => {
    const t = state.timer;
    if (!t) state.timer = { running: true, startedAt: Date.now(), acc: 0, target: preset, bookId: $("#timerBook").value };
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
    pendingSession = { bookId: t.bookId, minutes };
    const b = bookById(t.bookId);
    $("#finishText").textContent = `Du hast ${plural(minutes, "Minute", "Minuten")} gelesen${b ? ` in „${b.title}“` : ""}.`;
    $("#finishPage").closest(".field").hidden = !b;
    $("#finishPage").value = b?.currentPage || "";
    if (b?.pages) $("#finishPage").max = b.pages;
    $("#finishDialog").showModal();
  }
  $("#finishForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (pendingSession) logSession({ ...pendingSession, toPage: parseInt($("#finishPage").value) });
    pendingSession = null; $("#finishDialog").close();
  });
  $("#finishDialog").addEventListener("cancel", () => { if (pendingSession) logSession(pendingSession); pendingSession = null; });

  function logSession({ bookId, minutes, toPage, date = dateKey() }) {
    const b = bookById(bookId);
    let pages = 0;
    const before = minutesByDay()[date] || 0;
    if (b && Number.isFinite(toPage)) {
      const np = Math.max(0, b.pages ? Math.min(toPage, b.pages) : toPage);
      pages = Math.max(0, np - (b.currentPage || 0));
      b.currentPage = np; b.updated = Date.now();
      if (!b.startDate) b.startDate = date;
    }
    state.sessions.push({ id: uid(), bookId: bookId || null, date, minutes, pages, hour: date === dateKey() ? new Date().getHours() : null, ts: Date.now() });
    let finished = false;
    if (b && b.pages && b.currentPage >= b.pages && b.status !== "gelesen") { b.status = "gelesen"; b.endDate = date; finished = true; }
    save();
    const goal = state.profile?.goal || 20;
    if (finished) celebrateFinish(b);
    else if (date === dateKey() && before < goal && before + minutes >= goal) { confetti(); toast("🎯 Tagesziel erreicht! Weiter so!"); }
    else toast(`✓ ${minutes} Min.${pages ? ` und ${pages} Seiten` : ""} eingetragen.`);
    checkBadges(); render();
  }
  $("#manualForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const minutes = parseInt($("#manualMin").value);
    if (!minutes || minutes < 1) return;
    const date = $("#manualDate").value || dateKey();
    if (date > dateKey()) { toast("Das Datum liegt in der Zukunft."); return; }
    logSession({ bookId: $("#manualBook").value, minutes, toPage: parseInt($("#manualPage").value), date });
    $("#manualPage").value = "";
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
    $("#profileTitle").textContent = p ? "Profil & Einstellungen" : "Willkommen bei Lesezeit!";
    $("#profileIntro").textContent = p ? "Hier kannst du Name, Altersgruppe und Tagesziel ändern." : "Ein paar Minuten am Tag machen den Unterschied. Lass uns kurz einrichten:";
    $("#pName").value = p?.name || "";
    $$("#pGroup input").forEach((r) => (r.checked = r.value === (p?.group || "erwachsene")));
    $("#pGoal").value = p?.goal || 20; $("#pGoalOut").textContent = $("#pGoal").value;
    $("#resetAll").hidden = !p;
    $("#demoData").hidden = state.books.length > 0;
    profileDialog.showModal();
  }
  $("#profileBtn").addEventListener("click", openProfile);
  $("#pGoal").addEventListener("input", (e) => ($("#pGoalOut").textContent = e.target.value));
  $("#pGroup").addEventListener("change", (e) => {
    const g = { kinder: 15, jugend: 20, erwachsene: 20 }[e.target.value];
    if (!state.profile) { $("#pGoal").value = g; $("#pGoalOut").textContent = g; }
  });
  function readProfile() {
    return { name: $("#pName").value.trim(), group: $("#pGroup input:checked")?.value || "erwachsene", goal: +$("#pGoal").value };
  }
  $("#profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const first = !state.profile;
    state.profile = readProfile(); save();
    profileDialog.close(); render();
    if (first) { confetti(); toast(`Schön, dass du da bist, ${state.profile.name}! 📚`); }
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
    toast("Beispieldaten geladen – schau dich um! 👀");
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
    for (const [d, minutes, b, pages] of plan) state.sessions.push({ id: uid(), bookId: b.id, date: k(d), minutes, pages, hour: d % 3 === 0 ? 21 : 18, ts: Date.now() - d * 86400000 });
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
    const cols = ["#2d6a4f", "#52b788", "#c9a227", "#95d5b2", "#1b4332"];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4, r: Math.random() * 6 + 4,
      c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      }
      if (t - t0 < 3200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }
  function buildSky() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const glyphs = ["A", "ä", "ß", "Ö", "g", "&", "Q", "ü", "„", "R", "e", "§"];
    $(".sky").innerHTML = Array.from({ length: 14 }, (_, i) =>
      `<span style="left:${(i * 7.3 + Math.random() * 5) % 100}%;--s:${24 + Math.random() * 40}px;--d:${22 + Math.random() * 18}s;--delay:${-Math.random() * 30}s">${glyphs[i % glyphs.length]}</span>`).join("");
  }

  function runIntro() {
    const intro = $("#intro");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!intro || reduce) { intro?.remove(); document.body.classList.remove("intro-on"); return Promise.resolve(); }
    $("#introWord").innerHTML = [..."Lesezeit"].map((c, i) => `<span style="animation-delay:${0.9 + i * 0.07}s">${c}</span>`).join("");
    const g = ["L", "e", "s", "a", "ß", "ö", "Z", "t", "&", "„", "i", "W"];
    $("#introGlyphs").innerHTML = Array.from({ length: 18 }, (_, i) =>
      `<span style="--x:${Math.random() * 95}%;--y:${Math.random() * 90}%;--s:${30 + Math.random() * 70}px;--r:${(Math.random() - 0.5) * 30}deg;--dl:${Math.random() * 0.8}s">${g[i % g.length]}</span>`).join("");
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        intro.classList.add("out");
        document.body.classList.remove("intro-on");
        render();
        setTimeout(() => { intro.remove(); resolve(); }, 1000);
      };
      intro.addEventListener("click", finish);
      setTimeout(finish, 2900);
    });
  }

  // ---------- Start ----------
  $("#nextTip").addEventListener("click", () => showTip(true));
  window.addEventListener("hashchange", () => go(location.hash.slice(1)));
  buildSky();
  fillBookSelects();
  go(location.hash.slice(1) || "uebersicht");
  if (state.timer) startTick();
  runIntro().then(() => { if (!state.profile) openProfile(); });
  // Datum wechselt um Mitternacht → Übersicht aktualisieren
  setInterval(() => { if ($("#view-uebersicht").classList.contains("active") && !document.querySelector("dialog[open]")) renderDashboard(); }, 5 * 60000);
})();
