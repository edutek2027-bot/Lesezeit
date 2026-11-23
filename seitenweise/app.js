/* Seitenweise – die einfache Lese-App für die Mittelschule (10–14 Jahre).
   Drei Bereiche: Lesen · Mein Buch · Sammlung. Alles bleibt auf dem Gerät (localStorage). */
(() => {
  "use strict";
  const KEY = "seitenweise.v1";
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const uid = () => Math.random().toString(36).slice(2, 10);

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || null; } catch { state = null; }
  state ||= { profile: null, books: [], finished: [], sessions: [], seen: [] };
  // früher gab es nur ein Buch → in die Liste übernehmen
  state.books ||= [];
  const hadOld = "book" in state;
  if (state.book) { state.books.push(state.book); state.curId = state.book.id; }
  delete state.book;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  // ---------- Ziel & Zahlen ----------
  const isPages = () => state.profile?.goalType !== "minutes";
  const unit = (n) => (isPages() ? (n === 1 ? "Seite" : "Seiten") : n === 1 ? "Minute" : "Minuten");
  const goal = () => state.profile?.goal || (isPages() ? 10 : 15);
  const dayTotals = (k) => state.sessions.filter((s) => s.date === k).reduce((a, s) => ({ pages: a.pages + (s.pages || 0), minutes: a.minutes + (s.minutes || 0) }), { pages: 0, minutes: 0 });
  const dayValue = (k) => { const t = dayTotals(k); return isPages() ? t.pages : t.minutes; };
  const dayRead = (k) => { const t = dayTotals(k); return t.pages > 0 || t.minutes > 0; };
  const totalPages = () => state.sessions.reduce((a, s) => a + (s.pages || 0), 0);
  const goalDays = () => new Set(state.sessions.map((s) => s.date)).size && [...new Set(state.sessions.map((s) => s.date))].filter((k) => dayValue(k) >= goal()).length;
  function streak() { // Tage in Folge (heute zählt, sobald gelesen; sonst ab gestern)
    let d = new Date(); if (!dayRead(dateKey(d))) d = addDays(d, -1);
    let n = 0; while (dayRead(dateKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }

  const bookById = (id) => state.books.find((b) => b.id === id) || null;
  const cur = () => bookById(state.curId) || state.books[0] || null;
  const pctOf = (b) => (b.pages ? Math.max(0, Math.min(100, Math.round(((b.page - (b.start || 0)) / Math.max(1, b.pages - (b.start || 0))) * 100))) : 0);

  // ---------- Kleine Helfer ----------
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }
  function confetti() {
    const cols = ["#2c7a55", "#e07b2c", "#b48c25", "#4f9e77", "#9fcfb1"];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement("i"); c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[i % cols.length];
      c.style.animationDelay = Math.random() * 0.5 + "s"; c.style.animationDuration = 1.2 + Math.random() * 0.9 + "s";
      document.body.appendChild(c); setTimeout(() => c.remove(), 2800);
    }
  }
  // Feier-Grafik: ein Faden läuft durch, in der Mitte wird ein Knoten geknüpft
  function knotArt() {
    // Fäden schießen sternförmig aus dem Knoten, ein gestickter Kreis schließt sich darum
    const cols = ["var(--green)", "var(--orange)", "var(--gold)", "var(--green-2)"];
    const rays = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2, r1 = 22, r2 = 40 + (i % 2) * 8;
      const x1 = 80 + Math.cos(a) * r1, y1 = 60 + Math.sin(a) * r1, x2 = 80 + Math.cos(a) * r2, y2 = 60 + Math.sin(a) * r2;
      const cx = 80 + Math.cos(a + .35) * (r1 + r2) / 2, cy = 60 + Math.sin(a + .35) * (r1 + r2) / 2;
      return `<path class="ka-ray" style="stroke:${cols[i % 4]};animation-delay:${(.75 + i * .03).toFixed(2)}s" d="M${x1.toFixed(1)} ${y1.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"/><circle class="ka-dot" style="fill:${cols[i % 4]};animation-delay:${(1.05 + i * .03).toFixed(2)}s" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="2.6"/>`;
    }).join("");
    return `<svg class="knot-art" viewBox="0 0 160 120" aria-hidden="true">
      <circle class="ka-ring" cx="80" cy="60" r="56"/>
      <path class="ka-thread" d="M4 60C36 40 52 80 80 60S124 40 156 60"/>${rays}
      <g class="ka-knot"><circle cx="80" cy="60" r="17"/><path d="M69 55.5q11-6.5 22 0M67.5 62.5q12.5-7 25 0"/></g></svg>`;
  }
  const celQueue = [];
  function celebrate(ico, title, text) { celQueue.push({ ico, title, text }); if (!$("#celDlg").open) nextCel(); }
  function nextCel() {
    const c = celQueue.shift(); if (!c) return;
    if (c.ico === "knot") $("#celIco").innerHTML = knotArt(); else if (c.ico.startsWith("<svg")) $("#celIco").innerHTML = c.ico; else $("#celIco").textContent = c.ico;
    $("#celTitle").textContent = c.title; $("#celText").textContent = c.text;
    $("#celDlg").showModal(); if (c.ico !== "knot") confetti();
  }
  $("#celOk").addEventListener("click", () => { $("#celDlg").close(); setTimeout(nextCel, 250); });

  // ---------- Navigation ----------
  let tab = "lesen";
  function show(t) {
    tab = t;
    $$(".view").forEach((v) => (v.hidden = v.id !== "v-" + t));
    $$(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    render(); window.scrollTo(0, 0);
  }
  $$(".nav button").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

  // ---------- 1 · Lesen ----------
  const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  function renderLesen() {
    const now = new Date(), k = dateKey(now), v = dayValue(k), g = goal(), r = Math.min(1, v / g), done = v >= g;
    $("#date").textContent = now.toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });
    $("#hello").textContent = `Hi ${state.profile?.name || ""} 👋`;
    $("#ringVal").textContent = v;
    $("#ringOf").textContent = `von ${g} ${unit(g)}`;
    $(".ring-card").classList.toggle("done", done);
    $("#ringFg").classList.toggle("zero", v === 0); $("#ringHl").classList.toggle("zero", v === 0);
    $("#ringNeedle").classList.toggle("zero", v === 0 || done);
    $("#ringKnot").classList.toggle("on", done);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const len = `${(r * 301.6).toFixed(1)} 302`;
      $("#ringFg").style.strokeDasharray = len; $("#ringHl").style.strokeDasharray = len;
      $("#ringNeedle").style.transform = `rotate(${(r * 360).toFixed(1)}deg)`;
    }));
    $("#readBtn").classList.toggle("nudge", !dayRead(k));
    const mon = addDays(now, -((now.getDay() + 6) % 7)); // Montag dieser Woche
    const wk = Array.from({ length: 7 }, (_, i) => { const d = addDays(mon, i), dk = dateKey(d); return { d, isT: dk === k, fut: dk > k, cls: dk > k ? "" : dayValue(dk) >= g ? "g" : dayRead(dk) ? "o" : "" }; });
    const X = (i) => 25 + i * 50;
    let thread = `<path class="w-guide" d="M${X(0)} 22H${X(6)}"/>`;
    wk.forEach((w, i) => { if (i && w.cls && wk[i - 1].cls) thread += `<path class="w-thread" style="animation-delay:${(.15 + i * .08).toFixed(2)}s" d="M${X(i - 1)} 22H${X(i)}"/>`; });
    const knots = wk.map((w, i) => {
      const x = X(i), dv = dayValue(dateKey(w.d));
      const lbl = `<text x="${x}" y="54">${DAYS[w.d.getDay()]}</text>${dv ? `<text class="w-num ${w.cls}" x="${x}" y="72">${dv}</text>` : ""}${w.fut ? "" : `<circle class="w-hit" cx="${x}" cy="38" r="24" data-day="${dateKey(w.d)}"/>`}`;
      if (!w.cls) return `<g class="w-day${w.isT ? " today" : ""}${w.fut ? " fut" : ""}"><circle class="w-hole" cx="${x}" cy="22" r="${w.isT ? 12 : 4}"/>${w.isT ? `<text class="w-q" x="${x}" y="26.5">?</text>` : ""}${lbl}</g>`;
      return `<g class="w-day${w.isT ? " today" : ""}"><g class="w-knot ${w.cls}" style="animation-delay:${(.1 + i * .08).toFixed(2)}s"><circle cx="${x}" cy="22" r="12"/><path d="M${x - 7.5} 19.5q7.5-4.6 15 0M${x - 8.5} 24q8.5-5 17 0"/></g>${lbl}</g>`;
    }).join("");
    $("#week").innerHTML = thread + knots;
    $("#week").setAttribute("aria-label", `Die letzten 7 Tage, Zahlen = ${isPages() ? "Seiten" : "Minuten"}`);
    const left = g - v;
    $("#todayHint").innerHTML = done ? "Heute ist grün. Stark! 💪" : v ? `Noch <b>${left} ${unit(left)}</b> – dann ist heute grün.` : `Heute: <b>${g} ${unit(g)}</b>. Du schaffst das!`;
    $("#undoBtn").hidden = !state.sessions.some((s) => s.date === k);
  }
  // Tag antippen (Woche oder Jahreskalender) → Seiten und Minuten dieses Tages
  function dayInfo(k) {
    const t = dayTotals(k), d = new Date(k + "T12:00");
    const name = k === dateKey() ? "Heute" : d.toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });
    toast(t.pages || t.minutes ? `${name}: ${[t.pages ? `${t.pages} ${t.pages === 1 ? "Seite" : "Seiten"}` : "", t.minutes ? `${t.minutes} Min.` : ""].filter(Boolean).join(" · ")}${dayValue(k) >= goal() ? " · Ziel ✓" : ""}` : `${name}: nicht gelesen`);
  }
  document.addEventListener("click", (e) => { const h = e.target.closest("[data-day]"); if (h) dayInfo(h.dataset.day); });

  $("#undoBtn").addEventListener("click", () => {
    const k = dateKey(), last = [...state.sessions].reverse().find((s) => s.date === k);
    if (!last || !confirm("Den letzten Eintrag von heute löschen?")) return;
    state.sessions = state.sessions.filter((s) => s !== last);
    const lb = bookById(last.bookId); if (lb && last.pages) lb.page = Math.max(lb.start || 0, lb.page - last.pages);
    save(); render(); toast("Eintrag gelöscht.");
  });

  // ---------- Eintragen ----------
  const PAGE_CHIPS = [5, 10, 15, 20], MIN_CHIPS = [10, 15, 20, 30];
  let stepV = 0, optV = 0, logBookId = null, fromTimer = 0;
  function openLog(pre = {}) {
    if (!state.books.length && isPages()) { toast("Leg zuerst dein Buch an. 📖"); openBook(); return; }
    stepV = 0; optV = 0; fromTimer = pre.minutes || 0;
    if (fromTimer) { if (isPages()) optV = fromTimer; else stepV = fromTimer; }
    logBookId = (pre.bookId && bookById(pre.bookId) ? pre.bookId : cur()?.id) || null;
    logHead();
    $("#logQ").textContent = isPages() ? "Wie viele Seiten hast du gelesen?" : "Wie lange hast du gelesen?";
    const b = bookById(logBookId);
    $("#optLbl").innerHTML = isPages() ? "Wie lange? <span>(nicht nötig)</span>" : b ? "Wie viele Seiten? <span>(nicht nötig)</span>" : "";
    $("#optLbl").hidden = !isPages() && !b;
    renderLog(); $("#logDlg").showModal();
  }
  function logHead() {
    const b = bookById(logBookId);
    $("#logBooks").innerHTML = state.books.length > 1 ? state.books.map((x) => `<button type="button" class="bchip ${x.id === logBookId ? "on" : ""}" data-logbook="${x.id}">${esc(x.title)}</button>`).join("") : "";
    $("#logBook").textContent = (b ? `${b.title} · zuletzt Seite ${b.page}` : "Ohne bestimmtes Buch") + (fromTimer ? ` · ⏱ ${fromTimer} Min. gelesen` : "");
  }
  function renderLog() {
    const b = bookById(logBookId), main = isPages() ? PAGE_CHIPS : MIN_CHIPS, opt = isPages() ? MIN_CHIPS : PAGE_CHIPS;
    const sv = $("#stepIn");
    if (document.activeElement !== sv && sv.value !== String(stepV)) { sv.value = stepV; sv.classList.remove("bump"); void sv.offsetWidth; sv.classList.add("bump"); }
    $("#stepUnit").textContent = unit(stepV);
    $("#mainChips").innerHTML = main.map((n) => `<button type="button" class="chip ${n === stepV ? "on" : ""}" data-main="${n}">${n}${isPages() ? "" : " Min"}</button>`).join("");
    $("#optChips").hidden = !isPages() && !b;
    const optList = optV && !opt.includes(optV) ? [...opt.slice(0, 3), optV] : opt;
    $("#optChips").innerHTML = optList.map((n) => `<button type="button" class="chip ${n === optV ? "on" : ""}" data-opt="${n}">${n}${isPages() ? " Min" : ""}</button>`).join("");
    const pages = isPages() ? stepV : optV, k = dateKey(), after = dayValue(k) + stepV;
    let note = "";
    if (b && pages) {
      const to = b.pages ? Math.min(b.pages, b.page + pages) : b.page + pages;
      note = b.pages && to >= b.pages ? `Du bist auf der <b>letzten Seite</b> – Buch fertig! 🏁` : `Du bist jetzt auf <b>Seite ${to}</b>.`;
    }
    if (stepV && after >= goal() && dayValue(k) < goal()) note += (note ? " " : "") + "Heute grün! 🎉";
    $("#logCalc").innerHTML = note;
  }
  $("#logForm").addEventListener("click", (e) => {
    const s = e.target.closest("[data-step]"), m = e.target.closest("[data-main]"), o = e.target.closest("[data-opt]");
    if (s) stepV = Math.max(0, Math.min(999, stepV + +s.dataset.step));
    if (m) stepV = +m.dataset.main;
    if (o) optV = optV === +o.dataset.opt ? 0 : +o.dataset.opt;
    const lbk = e.target.closest("[data-logbook]");
    if (lbk) { logBookId = lbk.dataset.logbook; logHead(); }
    if (s || m || o || lbk) renderLog();
  });
  // langes Drücken auf +/− zählt schneller
  let holdT;
  $$("[data-step]").forEach((b) => {
    const go = () => { stepV = Math.max(0, Math.min(999, stepV + +b.dataset.step)); renderLog(); holdT = setTimeout(go, 90); };
    b.addEventListener("pointerdown", () => { holdT = setTimeout(go, 450); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => clearTimeout(holdT)));
  });
  // Zahl direkt eintippen (z. B. 37 Seiten, wenn man mehr als das Ziel gelesen hat)
  $("#stepIn").addEventListener("input", (e) => { stepV = Math.max(0, Math.min(999, parseInt(e.target.value) || 0)); renderLog(); });
  $("#stepIn").addEventListener("focus", (e) => { if (e.target.value === "0") e.target.value = ""; else e.target.select(); });
  $("#stepIn").addEventListener("blur", (e) => { e.target.value = stepV; });
  $("#stepIn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
  $("#logCancel").addEventListener("click", () => $("#logDlg").close());
  $("#logForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!stepV) { toast(isPages() ? "Wie viele Seiten? Tippe auf eine Zahl." : "Wie lange? Tippe auf eine Zahl."); return; }
    const pagesIn = isPages() ? stepV : optV, minutes = isPages() ? optV : stepV, k = dateKey(), before = dayValue(k), wasRead = dayRead(k);
    const b = bookById(logBookId);
    if (b) state.curId = b.id; // zuletzt gelesenes Buch merken
    let pages = pagesIn, finished = false;
    if (b && pages) {
      const to = b.pages ? Math.min(b.pages, b.page + pages) : b.page + pages;
      pages = to - b.page; b.page = to;
      finished = !!b.pages && to >= b.pages;
    }
    if (isPages() && !pages && pagesIn) pages = pagesIn;
    state.sessions.push({ id: uid(), date: k, pages, minutes, bookId: b?.id || null, hour: new Date().getHours(), ts: Date.now() });
    save(); $("#logDlg").close();
    const after = dayValue(k);
    if (before < goal() && after >= goal()) celebrate("knot", "Knoten geknüpft!", `${after} ${unit(after)} heute – dein Tagesziel ist geschafft. Der Knoten für heute ist grün.`);
    else if (!wasRead) toast(`✓ Eingetragen. ${streak() > 1 ? `${streak()} Tage in Folge! 🔥` : "Guter Start!"}`);
    else toast("✓ Eingetragen.");
    if (finished) finishBook(true, b.id);
    checkStickers(); render();
  });

  // ---------- 2 · Mein Buch ----------
  function renderBuch() {
    const b = cur(), area = $("#bookArea");
    if (!b) {
      area.innerHTML = `<section class="card empty-book"><div class="ico">📚</div><p class="quote">Welches Buch liest du gerade?</p><button class="big" id="newBookBtn">Buch eintragen</button></section>`;
      return;
    }
    const pct = pctOf(b);
    const shelf = `<div class="my-books">${state.books.map((x) => `<button class="mb ${x.id === b.id ? "on" : ""}" data-pick="${x.id}"><span class="mb-cover">${esc(x.title.trim()[0]?.toUpperCase() || "📖")}</span><span class="mb-t">${esc(x.title)}</span><span class="mb-bar"><i style="width:${pctOf(x)}%"></i></span></button>`).join("")}<button class="mb add" id="newBookBtn"><span class="mb-cover">＋</span><span class="mb-t">Buch dazu</span></button></div>`;
    area.innerHTML = `${shelf}
      <section class="card book"><div class="cover">${esc(b.title.trim()[0]?.toUpperCase() || "📖")}</div>
        <div><h2>${esc(b.title)}</h2><p class="small">${b.pages ? `Seite ${b.page} von ${b.pages}` : `Seite ${b.page}`}</p>
        ${b.pages ? `<div class="bar"><i style="width:${pct}%"></i></div><p class="small">${pct} % gelesen</p>` : ""}</div></section>
      <div class="book-actions"><button class="btn" id="editBookBtn">✎ Bearbeiten</button><button class="btn" id="doneBtn">🏁 Fertig</button><button class="btn danger" id="delBookBtn">🗑 Entfernen</button></div>
      <section class="card"><p class="small" style="margin-bottom:6px">Mein Lieblingssatz</p>
        <p class="quote ${b.quote ? "" : "empty"}" id="quoteText">${b.quote ? `„${esc(b.quote)}“` : "Noch keiner. Welcher Satz ist dir hängen geblieben?"}</p>
        <div class="add-row"><input id="quoteIn" maxlength="200" placeholder="Satz aus dem Buch …"><button id="quoteSave" type="button">${b.quote ? "Ändern" : "＋"}</button></div></section>
      <section class="card"><p class="small" style="margin-bottom:8px">Neue Wörter (${(b.words || []).length})</p>
        <div class="words">${(b.words || []).map((w, i) => `<button class="word" data-delw="${i}" aria-label="${esc(w)} löschen">${esc(w)}<b>×</b></button>`).join("") || `<span class="small">Ein Wort, das du nicht kanntest? Schreib es auf.</span>`}</div>
        <div class="add-row"><input id="wordIn" maxlength="30" placeholder="neues Wort" autocomplete="off"><button id="wordAdd" type="button">＋</button></div></section>`;
  }
  $("#bookArea").addEventListener("click", (e) => {
    const b = cur();
    const pk = e.target.closest("[data-pick]");
    if (pk) { state.curId = pk.dataset.pick; save(); render(); return; }
    if (e.target.closest("#newBookBtn")) openBook();
    if (e.target.closest("#editBookBtn")) openBook(true);
    if (e.target.closest("#doneBtn") && confirm(`„${b.title}“ wirklich fertig gelesen?`)) finishBook(false, b.id);
    if (e.target.closest("#delBookBtn") && confirm(`„${b.title}“ aus deiner Liste entfernen? Deine gelesenen Seiten bleiben in der Statistik.`)) {
      state.books = state.books.filter((x) => x.id !== b.id); state.curId = state.books[0]?.id || null; save(); render(); toast("Buch entfernt.");
    }
    if (e.target.closest("#quoteSave")) { const v = $("#quoteIn").value.trim(); if (v) { b.quote = v.replace(/^[„"“]|[“"”]$/g, ""); save(); checkStickers(); render(); toast("Lieblingssatz gespeichert 💬"); } }
    if (e.target.closest("#wordAdd")) addWord();
    const dw = e.target.closest("[data-delw]");
    if (dw) { b.words.splice(+dw.dataset.delw, 1); save(); render(); }
  });
  $("#bookArea").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target.id === "wordIn") { e.preventDefault(); addWord(); }
    if (e.target.id === "quoteIn") { e.preventDefault(); $("#quoteSave").click(); }
  });
  function addWord() {
    const v = $("#wordIn").value.trim(); if (!v) return;
    const b = cur(); b.words ||= [];
    if (b.words.some((w) => w.toLowerCase() === v.toLowerCase())) { toast("Das Wort hast du schon."); return; }
    b.words.push(v); save(); checkStickers(); render(); $("#wordIn")?.focus(); toast("Wort gespeichert 🔤");
  }
  let editingBook = false;
  function openBook(edit = false) {
    editingBook = edit && !!cur();
    const b = editingBook ? cur() : null;
    $("#bookDlgTitle").textContent = b ? "Buch ändern" : "Welches Buch liest du?";
    $("#bTitle").value = b?.title || ""; $("#bPages").value = b?.pages || ""; $("#bPage").value = b ? b.page : "";
    $("#bookDlg").showModal();
  }
  $("#bookCancel").addEventListener("click", () => $("#bookDlg").close());
  $("#bookForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("#bTitle").value.trim(); if (!title) return;
    const pages = parseInt($("#bPages").value) || null;
    let page = Math.max(0, parseInt($("#bPage").value) || 0); if (pages) page = Math.min(page, pages);
    if (editingBook) Object.assign(cur(), { title, pages, page }); // Korrektur, zählt nicht als gelesen
    else { const nb = { id: uid(), title, pages, page, start: page, began: dateKey(), words: [], quote: "" }; state.books.push(nb); state.curId = nb.id; }
    save(); $("#bookDlg").close(); render();
    toast(editingBook ? "Gespeichert ✓" : state.books.length > 1 ? `📖 „${title}“ liest du jetzt auch.` : `📖 „${title}“ ist dein Buch.`);
  });
  function finishBook(auto, id) {
    const b = bookById(id) || cur(); if (!b) return;
    state.finished.push({ title: b.title, pages: b.pages, end: dateKey(), began: b.began, words: (b.words || []).length, quote: b.quote || "" });
    state.books = state.books.filter((x) => x.id !== b.id); state.curId = state.books[0]?.id || null; save();
    celebrate("🏁", "Buch fertig!", `„${b.title}“ steht jetzt in deinem Regal.${state.books.length ? "" : " Welches Buch kommt als Nächstes?"}`);
    checkStickers(); render();
    if (!auto) show("sammlung");
  }

  // ---------- 3 · Sammlung ----------
  const LEVELS = [[0, "Erster Faden", "#9fcfb1"], [50, "Knotenknüpfer", "#4f9e77"], [150, "Maschenzähler", "#e07b2c"], [400, "Strickprofi", "#2c7a55"], [800, "Fadenmeister", "#b48c25"], [1500, "Leselegende", "#1f5d40"]];
  const STICKERS = [
    ["first", "📖", "Erster Eintrag", () => state.sessions.length >= 1],
    ["goal", "🎯", "Ziel geschafft", () => goalDays() >= 1],
    ["s3", "🔥", "3 Tage in Folge", () => streak() >= 3],
    ["s7", "⭐", "7 Tage in Folge", () => streak() >= 7],
    ["p100", "💯", "100 Seiten", () => totalPages() >= 100],
    ["p500", "📚", "500 Seiten", () => totalPages() >= 500],
    ["book1", "📗", "Erstes Buch fertig", () => state.finished.length >= 1],
    ["book3", "🏆", "3 Bücher fertig", () => state.finished.length >= 3],
    ["words5", "🔤", "5 neue Wörter", () => allWords() >= 5],
    ["quote", "💬", "Lieblingssatz", () => state.books.some((b) => b.quote) || state.finished.some((f) => f.quote)],
    ["night", "🌙", "Nachteule", () => state.sessions.some((s) => s.hour >= 20)],
    ["early", "🌅", "Frühaufsteher", () => state.sessions.some((s) => s.hour != null && s.hour < 8)],
  ];
  const allWords = () => state.books.reduce((a, b) => a + (b.words || []).length, 0) + state.finished.reduce((a, f) => a + (f.words || 0), 0);
  function checkStickers() {
    checkPieces();
    state.seen ||= [];
    const fresh = STICKERS.filter(([id, , , test]) => test() && !state.seen.includes(id));
    if (!fresh.length) return;
    fresh.forEach(([id]) => state.seen.push(id)); save();
    const [, ico, name] = fresh[fresh.length - 1];
    state.fresh = fresh.map(([id]) => id);
    setTimeout(() => celebrate(ico, "Neuer Aufnäher!", `„${name}“ ist jetzt in deine Sammlung genäht.`), 300);
  }
  // Mein Lesejahr: Seiten pro Monat als Diagramm, darunter jeder Tag als kleines Kästchen
  let yearShown = new Date().getFullYear();
  const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  // Statistik: Woche · Monat · Jahr, mit ‹ › blättern; Durchschnittswerte
  let statMode = "week", statOff = 0;
  const DAY2 = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const fromKey = (k) => new Date(k + "T12:00");
  function period(mode = statMode, off = statOff) {
    const now = new Date();
    if (mode === "week") { const s0 = addDays(now, -((now.getDay() + 6) % 7) + off * 7); return { start: s0, end: addDays(s0, 6) }; }
    if (mode === "month") { const s0 = new Date(now.getFullYear(), now.getMonth() + off, 1); return { start: s0, end: new Date(s0.getFullYear(), s0.getMonth() + 1, 0) }; }
    const y = now.getFullYear() + off; return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
  }
  const uVal = (x) => (isPages() ? x.pages || 0 : x.minutes || 0);
  const uShort = () => (isPages() ? "S." : "Min.");
  const fmt1 = (v) => v.toLocaleString("de-AT", { maximumFractionDigits: 1 });
  function renderYear() {
    const { start, end } = period(), today = dateKey(), sk = dateKey(start), ek = dateKey(end);
    yearShown = end.getFullYear();
    $$("#statTabs button").forEach((b) => b.classList.toggle("on", b.dataset.mode === statMode));
    const first = state.sessions.reduce((a, x) => (x.date < a ? x.date : a), today);
    $("#yPrev").disabled = sk <= first; $("#yNext").disabled = statOff >= 0;
    // Titel
    const df = (d, o) => d.toLocaleDateString("de-AT", o);
    $("#yTitle").textContent = statMode === "week" ? (statOff === 0 ? "Diese Woche" : statOff === -1 ? "Letzte Woche" : `${df(start, { day: "numeric", month: "short" })} – ${df(end, { day: "numeric", month: "short" })}`)
      : statMode === "month" ? df(start, { month: "long", year: "numeric" }) : `Mein Lesejahr ${yearShown}`;
    // Zahlen im Zeitraum
    const inP = state.sessions.filter((x) => x.date >= sk && x.date <= ek);
    const days = [...new Set(inP.map((x) => x.date))], total = inP.reduce((a, x) => a + uVal(x), 0);
    const goals = days.filter((k) => dayValue(k) >= goal()).length;
    const lastK = ek < today ? ek : today, elapsed = lastK < sk ? 0 : Math.round((fromKey(lastK) - fromKey(sk)) / 864e5) + 1;
    const perRead = days.length ? total / days.length : 0, perDay = elapsed ? total / elapsed : 0;
    const months = statMode === "year" ? (yearShown === new Date().getFullYear() ? new Date().getMonth() + 1 : 12) : 0;
    const tiles = [["Gesamt", `${total}`, uShort()], ["Ø pro Lesetag", fmt1(perRead), uShort()],
      statMode === "year" ? ["Ø pro Monat", fmt1(months ? total / months : 0), uShort()] : ["Ø pro Tag", fmt1(perDay), uShort()]];
    $("#yAvg").innerHTML = tiles.map(([l, v, u]) => `<div><b>${v}<small> ${u}</small></b><span>${l}</span></div>`).join("");
    $("#ySum").textContent = `${days.length} ${days.length === 1 ? "Lesetag" : "Lesetage"} · ${goals}× Ziel${isPages() && inP.some((x) => x.minutes) ? ` · ${inP.reduce((a, x) => a + (x.minutes || 0), 0)} Min.` : ""}`;
    // Diagramm
    let buckets = [];
    if (statMode === "year") buckets = MONTHS.map((mn, m) => { const v = inP.filter((x) => +x.date.slice(5, 7) === m + 1).reduce((a, x) => a + uVal(x), 0); return { v, lbl: mn.slice(0, 1), fut: `${yearShown}-${pad(m + 1)}-01` > today, cls: "", tip: `${mn}: ${v} ${uShort()}` }; });
    else for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const k = dateKey(d), v = dayValue(k), i = buckets.length;
      buckets.push({ v, k, fut: k > today, cls: v >= goal() ? "g" : v ? "o" : "", lbl: statMode === "week" ? DAY2[i] : (d.getDate() === 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : ""), today: k === today });
    }
    const n = buckets.length, W = 330 / n, bw = Math.min(26, W * .68), max = Math.max(1, goal() * (statMode === "year" ? 0 : 1), ...buckets.map((b) => b.v));
    const H = 82, base = 100;
    let svg = buckets.map((b, i) => {
      const x = 6 + i * W + (W - bw) / 2, h = b.v ? Math.max(3, (b.v / max) * H) : 0;
      const showV = b.v && (n <= 12 || bw >= 9);
      return `${h ? `<rect class="yb ${b.cls}${b.today ? " cur" : ""}" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 3).toFixed(1)}" style="animation-delay:${(i * (n > 12 ? .015 : .04)).toFixed(3)}s"/>` : ""}`
        + (showV && n <= 12 ? `<text class="yv" x="${(x + bw / 2).toFixed(1)}" y="${(base - h - 5).toFixed(1)}">${b.v}</text>` : "")
        + `<text class="ym${b.fut ? " fut" : ""}${b.today ? " now" : ""}" x="${(x + bw / 2).toFixed(1)}" y="${base + 16}">${b.lbl}</text>`
        + (b.k && !b.fut ? `<rect class="yhit" x="${(6 + i * W).toFixed(1)}" y="10" width="${W.toFixed(1)}" height="${base + 10}" data-day="${b.k}"/>` : b.tip ? `<rect class="yhit" x="${(6 + i * W).toFixed(1)}" y="10" width="${W.toFixed(1)}" height="${base + 10}" data-tip="${esc(b.tip)}"/>` : "");
    }).join("");
    if (statMode !== "year") { const gy = base - (goal() / max) * H; svg += `<path class="ygoal" d="M4 ${gy.toFixed(1)}H336"/>`; }
    if (perRead && statMode !== "year") { const ay = base - (perRead / max) * H; svg += `<path class="yavg" d="M4 ${ay.toFixed(1)}H336"/>`; }
    $("#yChart").innerHTML = svg + `<path class="ybase" d="M4 ${base + .5}H336"/>`;
    $("#yChartLeg").innerHTML = statMode === "year" ? "" : `<span><i class="lg-goal"></i>Ziel ${goal()} ${uShort()}</span>${perRead ? `<span><i class="lg-avg"></i>Ø ${fmt1(perRead)} ${uShort()} pro Lesetag</span>` : ""}`;
    $("#yChartLbl").textContent = `${isPages() ? "Seiten" : "Minuten"} pro ${statMode === "year" ? "Monat" : "Tag"}`;
    // Kalender: Jahr = 12 Monate, Monat = dieser Monat groß, Woche = keiner
    const calMonths = statMode === "year" ? MONTHS.map((_, m) => m) : statMode === "month" ? [start.getMonth()] : [];
    $("#yCal").hidden = $("#yCalLbl").hidden = !calMonths.length;
    $("#yCal").classList.toggle("single", statMode === "month");
    $(".ylegend").hidden = !calMonths.length;
    const curM = yearShown === new Date().getFullYear() ? new Date().getMonth() : 11, y = yearShown;
    $("#yCal").innerHTML = calMonths.map((m) => {
      const nd = new Date(y, m + 1, 0).getDate(), lead = (new Date(y, m, 1).getDay() + 6) % 7;
      let cells = statMode === "month" ? DAY2.map((d) => `<i class="hd">${d}</i>`).join("") : "";
      cells += "<i class=\"pad\"></i>".repeat(lead);
      for (let d = 1; d <= nd; d++) {
        const k = `${y}-${pad(m + 1)}-${pad(d)}`, cls = k > today ? "f" : dayValue(k) >= goal() ? "g" : dayRead(k) ? "o" : "e";
        cells += `<i class="${cls}${k === today ? " t" : ""}"${cls !== "f" ? ` data-day="${k}"` : ""}>${d}</i>`;
      }
      const pg = state.sessions.filter((x) => x.date.startsWith(`${y}-${pad(m + 1)}-`)).reduce((a, x) => a + (x.pages || 0), 0);
      return `<div class="ymon${m > curM && y >= new Date().getFullYear() ? " fut" : ""}"><b>${MONTHS[m]}${pg ? `<em>${pg} S.</em>` : ""}</b><div class="ygrid">${cells}</div></div>`;
    }).join("");
  }
  $("#statTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (!b) return; statMode = b.dataset.mode; statOff = 0; renderYear(); renderPieces(); });
  $("#yPrev").addEventListener("click", () => { statOff--; renderYear(); renderPieces(); });
  $("#yNext").addEventListener("click", () => { statOff = Math.min(0, statOff + 1); renderYear(); renderPieces(); });
  document.addEventListener("click", (e) => { const t = e.target.closest("[data-tip]"); if (t) toast(t.dataset.tip); });

  // ---------- Strickstücke: jeden Monat eins ----------
  const PIECE_MIN = 15;
  const GARMENTS = [
    { name: "Mütze", done: "Deine Mütze ist fertig!", d: ["M38 82Q36 34 70 30Q104 34 102 82Z", "M33 78h74a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H33a3 3 0 0 1-3-3V81a3 3 0 0 1 3-3Z", "M70 12a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z"] },
    { name: "Fäustlinge", done: "Deine Fäustlinge sind fertig!", d: ["M58 96V46Q58 20 79 20Q100 20 100 46V96Z", "M58 58Q42 56 41 44Q41 34 49 33Q57 33 58 44Z"] },
    { name: "Schal", done: "Dein Schal ist fertig!", d: ["M56 8h30v80h-30Z", "M56 8h30l4 14H52Z"] },
    { name: "Socken", done: "Deine Socken sind fertig!", d: ["M54 8H82V58L100 72Q110 82 103 92Q97 99 86 97L60 92Q50 89 52 78Z"] },
    { name: "Pullover", done: "Dein Pullover ist fertig!", d: ["M52 14L61 9H79L88 14L108 28L102 52L92 46V96H48V46L38 52L32 28Z"] },
    { name: "Teppich", done: "Dein Teppich ist fertig!", d: ["M32 26h76v62H32Z"] },
  ];
  const garmentFor = (m) => GARMENTS[m % GARMENTS.length];
  let svgUid = 0;
  function garmentSvg(g, cells, todayR, anim) {
    const key = "g" + ++svgUid, n = cells.length, top = 8, bot = 97, h = (bot - top) / n;
    let rows = "";
    cells.forEach((c, i) => {
      if (c === "f") return;
      const y = bot - (i + 1) * h, w = c === "t" ? Math.max(.08, todayR) * 140 : 140;
      const cls = c === "t" ? (todayR >= 1 ? "g" : todayR > 0 ? "o" : "e") : c;
      if (c === "t" && !todayR) return;
      rows += `<rect class="k-${cls}" x="0" y="${y.toFixed(2)}" width="${w.toFixed(1)}" height="${(h + .25).toFixed(2)}"${anim ? ` style="animation-delay:${(.05 + i * .025).toFixed(2)}s"` : ""}/>`;
    });
    const shapes = g.d.map((d) => `<path d="${d}"/>`).join(""), outline = g.d.map((d) => `<path class="k-line" d="${d}"/>`).join("");
    const fringe = g.name === "Teppich" ? [32, 108].map((x) => [0, 1, 2, 3, 4, 5, 6].map((j) => `<path class="k-fringe" d="M${x} ${30 + j * 9}h${x < 70 ? -6 : 6}"/>`).join("")).join("")
      : g.name === "Schal" ? [0, 1, 2, 3, 4].map((j) => `<path class="k-fringe" d="M${59 + j * 6} 88v8"/>`).join("") : "";
    return `<svg class="knit${anim ? " anim" : ""}" viewBox="0 0 140 104" aria-hidden="true"><defs><clipPath id="c-${key}">${shapes}</clipPath><pattern id="p-${key}" width="6" height="5" patternUnits="userSpaceOnUse"><path d="M0 0l3 4l3-4" class="k-tex"/></pattern></defs>
      <g clip-path="url(#c-${key})"><rect class="k-base" x="0" y="0" width="140" height="104"/>${rows}<rect x="0" y="0" width="140" height="104" fill="url(#p-${key})"/></g>${outline}${fringe}</svg>`;
  }
  function monthCells(y, m) {
    const today = dateKey(), n = new Date(y, m + 1, 0).getDate(), out = [];
    for (let d = 1; d <= n; d++) { const k = `${y}-${pad(m + 1)}-${pad(d)}`; out.push(k === today ? "t" : k > today ? "f" : dayValue(k) >= goal() ? "g" : dayRead(k) ? "o" : "e"); }
    return out;
  }
  const monthReadDays = (y, m) => [...new Set(state.sessions.filter((x) => x.date.startsWith(`${y}-${pad(m + 1)}-`)).map((x) => x.date))].length;
  function renderPieces() {
    const y = yearShown, now = new Date(), curM = y === now.getFullYear() ? now.getMonth() : 11, k = dateKey();
    const r = Math.min(1, dayValue(k) / goal());
    let done = 0;
    $("#pcGrid").innerHTML = Array.from({ length: 12 }, (_, m) => {
      const g = garmentFor(m), nd = monthReadDays(y, m), fin = nd >= PIECE_MIN, fut = m > curM;
      if (fin) done++;
      return `<figure class="pc${fin ? " fin" : ""}${m === curM && !fut ? " cur" : ""}${fut ? " fut" : ""}" ${fut ? "" : `data-piece="${m}"`}>${garmentSvg(g, monthCells(y, m), m === curM ? r : 0, m === curM)}
        <figcaption><b>${MONTHS[m]}</b>${fin ? "fertig ✓" : fut ? g.name : `${nd}/${PIECE_MIN}`}</figcaption></figure>`;
    }).join("");
    $("#pcTitle").textContent = `Meine Strickstücke ${y}`;
    $("#pcCount").textContent = `${done} fertig`;
  }
  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-piece]"); if (!f) return;
    const m = +f.dataset.piece, g = garmentFor(m), nd = monthReadDays(yearShown, m);
    toast(nd >= PIECE_MIN ? `${MONTHS[m]}: ${g.name} fertig – ${nd} Lesetage 🧶` : `${MONTHS[m]}: ${g.name} · noch ${PIECE_MIN - nd} Lesetage bis fertig`);
  });
  // fertiges Monatsstück feiern
  function checkPieces() {
    state.pieces ||= [];
    const now = new Date(), y = now.getFullYear(), m = now.getMonth(), id = `${y}-${pad(m + 1)}`;
    if (monthReadDays(y, m) >= PIECE_MIN && !state.pieces.includes(id)) {
      state.pieces.push(id); save();
      const g = garmentFor(m);
      setTimeout(() => celebrate(garmentSvg(g, monthCells(y, m), 1, true).replace('class="knit anim"', 'class="knit anim cel-piece"'), g.done, `${PIECE_MIN} Lesetage im ${MONTHS_LONG[m]} – das Stück des Monats ist fertig gestrickt.`), 500);
    }
  }
  const MONTHS_LONG = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  function renderSammlung() {
    renderYear();
    const p = totalPages(); let li = 0; LEVELS.forEach((l, i) => { if (p >= l[0]) li = i; });
    const [from, name, col] = LEVELS[li], next = LEVELS[li + 1], frac = next ? (p - from) / (next[0] - from) : 1;
    $("#lvlNo").textContent = `Level ${li + 1} von ${LEVELS.length} · ${p} Seiten`; $("#lvlName").textContent = name;
    $("#lvlBar").style.width = `${frac * 100}%`;
    $("#lvlNext").textContent = next ? `Noch ${next[0] - p} Seiten bis „${next[1]}“` : "Höchstes Level erreicht!";
    // Wollknäuel: wird mit jedem Level größer, die Wicklungen wachsen mit den Seiten
    const R = 14 + li * 4 + frac * 4, cx = 50, cy = 86 - R, wraps = 3 + li + Math.round(frac * 3);
    let yarn = `<ellipse class="y-shadow" cx="${cx}" cy="87" rx="${R * .9}" ry="3"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="${col}"/>`;
    for (let i = 0; i < wraps; i++) yarn += `<ellipse class="y-wrap" cx="${cx}" cy="${cy}" rx="${(R * .96).toFixed(1)}" ry="${(R * .36).toFixed(1)}" transform="rotate(${Math.round((i * 180) / wraps + 25)} ${cx} ${cy})" style="animation-delay:${(i * .07).toFixed(2)}s"/>`;
    yarn += `<path class="y-end" d="M${cx + R * .75} ${cy + R * .6}C${cx + R + 14} ${cy + R} ${cx + R + 18} 88 108 86" stroke="${col}"/>`;
    $("#yarn").innerHTML = yarn;
    const fresh = state.fresh || []; state.fresh = [];
    $("#stCount").textContent = `${STICKERS.filter(([, , , t]) => t()).length} von ${STICKERS.length}`;
    renderPieces();
    $("#stickers").innerHTML = STICKERS.map(([id, si, sn, test], i) => `<div class="st ${test() ? "" : "lock"} ${fresh.includes(id) ? "new" : ""}" style="animation-delay:${(i * .04).toFixed(2)}s"><div><span>${si}</span>${sn}</div></div>`).join("");
    const cols = ["#2c7a55", "#e07b2c", "#b48c25", "#4f9e77", "#c9653a", "#6f8fbf"];
    $("#shelfTitle").textContent = `Mein Regal · ${state.finished.length} ${state.finished.length === 1 ? "Buch" : "Bücher"} fertig`;
    $("#shelf").innerHTML = state.finished.map((f, i) => `<i title="${esc(f.title)}" style="height:${46 + ((f.pages || 120) % 5) * 7}px;background:${cols[i % cols.length]}"></i>`).join("") + `<i class="slot"></i>`;
    $("#doneList").innerHTML = [...state.finished].reverse().map((f) => `<li><b>${esc(f.title)}</b> · fertig am ${new Date(f.end).toLocaleDateString("de-AT", { day: "numeric", month: "short" })}${f.pages ? ` · ${f.pages} Seiten` : ""}</li>`).join("");
  }

  // ---------- Start & Einstellungen ----------
  let setupGoal = 10;
  const goalOptions = (type) => (type === "pages" ? [5, 10, 15, 20, 25, 30, 40, 50] : [10, 15, 20, 30]);
  function renderGoalChips() {
    const type = $("#setupForm input[name=gtype]:checked").value, opts = goalOptions(type);
    if (!opts.includes(setupGoal)) setupGoal = type === "pages" ? 10 : 15;
    $("#goalLbl").textContent = type === "pages" ? "Wie viele Seiten am Tag?" : "Wie viele Minuten am Tag?";
    $("#goalChips").innerHTML = opts.map((n) => `<button type="button" class="chip ${n === setupGoal ? "on" : ""}" data-goal="${n}">${n}${type === "pages" ? "" : " Min"}</button>`).join("");
  }
  $("#goalChips").addEventListener("click", (e) => { const c = e.target.closest("[data-goal]"); if (c) { setupGoal = +c.dataset.goal; renderGoalChips(); } });
  $$("#setupForm input[name=gtype]").forEach((r) => r.addEventListener("change", renderGoalChips));
  function openSetup() {
    const p = state.profile;
    $("#setupTitle").textContent = p ? "Einstellungen" : "Willkommen bei Seitenweise";
    $("#setupIntro").textContent = p ? "Name und Tagesziel ändern." : "Seite für Seite zum Lesen. Zwei kurze Fragen:";
    $("#setupCancel").hidden = !p;
    $("#sName").value = p?.name || "";
    $$("#setupForm input[name=gtype]").forEach((r) => (r.checked = r.value === (p?.goalType || "pages")));
    setupGoal = p?.goal || 10; renderGoalChips();
    $("#setupDlg").showModal();
  }
  $("#settingsBtn").addEventListener("click", openSetup);
  $("#setupCancel").addEventListener("click", () => $("#setupDlg").close());
  $("#setupDlg").addEventListener("cancel", (e) => { if (!state.profile) e.preventDefault(); });
  $("#setupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#sName").value.trim(); if (!name) return;
    const first = !state.profile;
    state.profile = { name, goalType: $("#setupForm input[name=gtype]:checked").value, goal: setupGoal };
    save(); $("#setupDlg").close(); render();
    if (first) { toast(`Hi ${name}! Jetzt noch dein Buch.`); setTimeout(() => openBook(), 400); }
    else toast("Gespeichert ✓");
  });

  $("#readBtn").addEventListener("click", openLog);
  // ---------- Lese-Timer (Startseite) ----------
  // Läuft weiter, auch wenn die App kurz geschlossen wird. Faden und Nadel wandern mit, bei der Hälfte gibt es einen Knoten.
  const TM_CHIPS = [10, 15, 20, 30, 0]; // 0 = frei (ohne Ende)
  let tmTick = null, tmPick = null;
  const tmElapsed = () => { const t = state.timer; return t ? t.acc + (t.running ? Date.now() - t.startedAt : 0) : 0; };
  const mmss = (ms) => { const s0 = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s0 / 60)}:${pad(s0 % 60)}`; };
  const TM_MSG = [[0, "Los geht’s – viel Spaß beim Lesen! 📖"], [.25, "Gut drin! Seite für Seite …"], [.5, "Halbzeit – ein Knoten ist schon geknüpft! 🧵"], [.75, "Endspurt! Gleich geschafft. 💪"], [.92, "Nur noch ein paar Zeilen …"]];
  function renderTimer() {
    const t = state.timer, b = bookById(t?.bookId) || cur();
    $("#tmBook").textContent = b ? `📖 ${b.title}${state.books.length > 1 && !t ? " ⇄" : ""}` : "";
    $("#tmBook").disabled = !!t || state.books.length < 2;
    $("#tmIdle").hidden = !!t; $("#tmRun").hidden = !t;
    $("#timerCard").classList.toggle("running", !!t?.running);
    if (!t) {
      tmPick ??= isPages() ? 20 : goal();
      $("#tmChips").innerHTML = TM_CHIPS.map((n) => `<button type="button" class="chip ${n === tmPick ? "on" : ""}" data-tm="${n}">${n ? n + " Min" : "frei"}</button>`).join("");
      return;
    }
    const el = tmElapsed(), tgt = t.target * 60000, frac = tgt ? Math.min(1, el / tgt) : (el % 600000) / 600000;
    $("#tmTime").textContent = tgt ? mmss(tgt - el) : mmss(el);
    $("#tmTime").classList.toggle("up", !tgt);
    $("#tmPause").textContent = t.running ? "⏸ Pause" : "▶ Weiter";
    const line = $("#tmLine"), L = line.getTotalLength();
    line.style.strokeDasharray = `${(L * frac).toFixed(1)} ${L}`;
    const pt = line.getPointAtLength(L * frac), pt2 = line.getPointAtLength(Math.min(L, L * frac + 1));
    const ang = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180 / Math.PI;
    $("#tmNeedle").setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${ang.toFixed(0)})`);
    const hp = line.getPointAtLength(L * .5);
    $("#tmHalf").setAttribute("transform", `translate(${hp.x.toFixed(1)} ${hp.y.toFixed(1)})`);
    $("#tmHalf").classList.toggle("on", tgt && frac >= .5);
    const msg = !t.running ? "Pause – tippe auf „Weiter“, wenn du weiterliest." : tgt ? TM_MSG.filter(([f]) => frac >= f).pop()[1] : `Freies Lesen – schon ${Math.floor(el / 60000)} Min. 📖`;
    if ($("#tmMsg").textContent !== msg) { $("#tmMsg").textContent = msg; $("#tmMsg").classList.remove("pop"); void $("#tmMsg").offsetWidth; $("#tmMsg").classList.add("pop"); }
    if (tgt && el >= tgt && t.running) tmFinish(true);
  }
  function tmLoop() { clearInterval(tmTick); if (state.timer?.running) tmTick = setInterval(() => { if (tab === "lesen") renderTimer(); else if (tmElapsed() >= (state.timer?.target || 1e9) * 60000) renderTimer(); }, 500); }
  $("#tmChips").addEventListener("click", (e) => { const c = e.target.closest("[data-tm]"); if (c) { tmPick = +c.dataset.tm; renderTimer(); } });
  $("#tmBook").addEventListener("click", () => {
    if (state.timer || state.books.length < 2) return;
    const i = state.books.findIndex((b) => b.id === cur()?.id); state.curId = state.books[(i + 1) % state.books.length].id; save(); renderTimer();
  });
  $("#tmStart").addEventListener("click", () => {
    if (!state.books.length && isPages()) { toast("Leg zuerst dein Buch an. 📖"); openBook(); return; }
    state.timer = { startedAt: Date.now(), acc: 0, running: true, target: tmPick ?? 20, bookId: cur()?.id || null };
    save(); renderTimer(); tmLoop(); try { navigator.vibrate?.(30); } catch {}
  });
  $("#tmPause").addEventListener("click", () => {
    const t = state.timer; if (!t) return;
    if (t.running) { t.acc += Date.now() - t.startedAt; t.running = false; } else { t.startedAt = Date.now(); t.running = true; }
    save(); renderTimer(); tmLoop();
  });
  $("#tmStop").addEventListener("click", () => tmFinish(false));
  function chime() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(), now = ac.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = "sine"; g.gain.setValueAtTime(0, now + i * .18); g.gain.linearRampToValueAtTime(.18, now + i * .18 + .02); g.gain.exponentialRampToValueAtTime(.001, now + i * .18 + .9); o.connect(g).connect(ac.destination); o.start(now + i * .18); o.stop(now + i * .18 + 1); });
    } catch {}
    try { navigator.vibrate?.([120, 80, 120]); } catch {}
  }
  function tmFinish(auto) {
    const t = state.timer; if (!t) return;
    const ms = auto ? t.target * 60000 : tmElapsed(), minutes = Math.round(ms / 60000);
    state.timer = null; save(); clearInterval(tmTick); renderTimer();
    if (ms < 60000) { toast("Unter einer Minute – das zählt noch nicht. 😉"); return; }
    if (auto) { chime(); toast(`⏱ ${minutes} Min. geschafft! Wie viele Seiten waren es?`); }
    openLog({ minutes, bookId: t.bookId });
  }

  function render() {
    if (tab === "lesen") { renderLesen(); renderTimer(); }
    if (tab === "buch") renderBuch();
    if (tab === "sammlung") renderSammlung();
  }
  if (hadOld) save();
  render(); tmLoop();
  if (!state.profile) openSetup();
})();
