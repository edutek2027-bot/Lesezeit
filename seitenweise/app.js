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
  state ||= { profile: null, book: null, finished: [], sessions: [], seen: [] };
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
    const sparks = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<circle class="ka-spark" cx="${(60 + Math.cos(a) * 30).toFixed(1)}" cy="${(40 + Math.sin(a) * 30).toFixed(1)}" r="2.4" style="--dx:${(Math.cos(a) * 12).toFixed(1)}px;--dy:${(Math.sin(a) * 12).toFixed(1)}px"/>`; }).join("");
    return `<svg class="knot-art" viewBox="0 0 120 80" aria-hidden="true"><path class="ka-thread" d="M2 40C30 24 44 56 60 40S92 24 118 40"/>
      <g class="ka-knot"><circle cx="60" cy="40" r="15"/><path d="M50 36q10-6 20 0M48.5 42q11.5-6.5 23 0"/></g>${sparks}</svg>`;
  }
  const celQueue = [];
  function celebrate(ico, title, text) { celQueue.push({ ico, title, text }); if (!$("#celDlg").open) nextCel(); }
  function nextCel() {
    const c = celQueue.shift(); if (!c) return;
    if (c.ico === "knot") $("#celIco").innerHTML = knotArt(); else $("#celIco").textContent = c.ico;
    $("#celTitle").textContent = c.title; $("#celText").textContent = c.text;
    $("#celDlg").showModal(); confetti();
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
    const wk = Array.from({ length: 7 }, (_, i) => { const d = addDays(now, i - 6), dk = dateKey(d); return { d, isT: i === 6, cls: dayValue(dk) >= g ? "g" : dayRead(dk) ? "o" : "" }; });
    const X = (i) => 25 + i * 50;
    let thread = `<path class="w-guide" d="M${X(0)} 22H${X(6)}"/>`;
    wk.forEach((w, i) => { if (i && w.cls && wk[i - 1].cls) thread += `<path class="w-thread" style="animation-delay:${(.15 + i * .08).toFixed(2)}s" d="M${X(i - 1)} 22H${X(i)}"/>`; });
    const knots = wk.map((w, i) => {
      const x = X(i), lbl = `<text x="${x}" y="56">${w.isT ? "Heute" : DAYS[w.d.getDay()]}</text>`;
      if (!w.cls) return `<g class="w-day${w.isT ? " today" : ""}"><circle class="w-hole" cx="${x}" cy="22" r="${w.isT ? 12 : 4}"/>${w.isT ? `<text class="w-q" x="${x}" y="26.5">?</text>` : ""}${lbl}</g>`;
      return `<g class="w-day${w.isT ? " today" : ""}"><g class="w-knot ${w.cls}" style="animation-delay:${(.1 + i * .08).toFixed(2)}s"><circle cx="${x}" cy="22" r="12"/><path d="M${x - 7.5} 19.5q7.5-4.6 15 0M${x - 8.5} 24q8.5-5 17 0"/></g>${lbl}</g>`;
    }).join("");
    $("#week").innerHTML = thread + knots;
    const left = g - v;
    $("#todayHint").innerHTML = done ? "Heute ist grün. Stark! 💪" : v ? `Noch <b>${left} ${unit(left)}</b> – dann ist heute grün.` : `Heute: <b>${g} ${unit(g)}</b>. Du schaffst das!`;
    $("#undoBtn").hidden = !state.sessions.some((s) => s.date === k);
  }
  $("#undoBtn").addEventListener("click", () => {
    const k = dateKey(), last = [...state.sessions].reverse().find((s) => s.date === k);
    if (!last || !confirm("Den letzten Eintrag von heute löschen?")) return;
    state.sessions = state.sessions.filter((s) => s !== last);
    if (state.book && last.bookId === state.book.id && last.pages) state.book.page = Math.max(state.book.start || 0, state.book.page - last.pages);
    save(); render(); toast("Eintrag gelöscht.");
  });

  // ---------- Eintragen ----------
  const PAGE_CHIPS = [5, 10, 15, 20], MIN_CHIPS = [10, 15, 20, 30];
  let stepV = 0, optV = 0;
  function openLog() {
    if (!state.book && isPages()) { toast("Leg zuerst dein Buch an. 📖"); openBook(); return; }
    stepV = 0; optV = 0;
    const b = state.book;
    $("#logBook").textContent = b ? `${b.title} · zuletzt Seite ${b.page}` : "Ohne bestimmtes Buch";
    $("#logQ").textContent = isPages() ? "Wie viele Seiten hast du gelesen?" : "Wie lange hast du gelesen?";
    $("#optLbl").innerHTML = isPages() ? "Wie lange? <span>(nicht nötig)</span>" : b ? "Wie viele Seiten? <span>(nicht nötig)</span>" : "";
    $("#optLbl").hidden = !isPages() && !b;
    renderLog(); $("#logDlg").showModal();
  }
  function renderLog() {
    const b = state.book, main = isPages() ? PAGE_CHIPS : MIN_CHIPS, opt = isPages() ? MIN_CHIPS : PAGE_CHIPS;
    const sv = $("#stepVal"); if (sv.textContent !== String(stepV)) { sv.textContent = stepV; sv.classList.remove("bump"); void sv.offsetWidth; sv.classList.add("bump"); }
    $("#stepUnit").textContent = unit(stepV);
    $("#mainChips").innerHTML = main.map((n) => `<button type="button" class="chip ${n === stepV ? "on" : ""}" data-main="${n}">${n}${isPages() ? "" : " Min"}</button>`).join("");
    $("#optChips").hidden = !isPages() && !b;
    $("#optChips").innerHTML = opt.map((n) => `<button type="button" class="chip ${n === optV ? "on" : ""}" data-opt="${n}">${n}${isPages() ? " Min" : ""}</button>`).join("");
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
    if (s || m || o) renderLog();
  });
  // langes Drücken auf +/− zählt schneller
  let holdT;
  $$("[data-step]").forEach((b) => {
    const go = () => { stepV = Math.max(0, Math.min(999, stepV + +b.dataset.step)); renderLog(); holdT = setTimeout(go, 90); };
    b.addEventListener("pointerdown", () => { holdT = setTimeout(go, 450); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => clearTimeout(holdT)));
  });
  $("#logCancel").addEventListener("click", () => $("#logDlg").close());
  $("#logForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!stepV) { toast(isPages() ? "Wie viele Seiten? Tippe auf eine Zahl." : "Wie lange? Tippe auf eine Zahl."); return; }
    const pagesIn = isPages() ? stepV : optV, minutes = isPages() ? optV : stepV, k = dateKey(), before = dayValue(k), wasRead = dayRead(k);
    const b = state.book;
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
    if (finished) finishBook(true);
    checkStickers(); render();
  });

  // ---------- 2 · Mein Buch ----------
  function renderBuch() {
    const b = state.book, area = $("#bookArea");
    if (!b) {
      area.innerHTML = `<section class="card empty-book"><div class="ico">📚</div><p class="quote">Welches Buch liest du gerade?</p><button class="big" id="newBookBtn">Buch eintragen</button></section>`;
      return;
    }
    const pct = b.pages ? Math.round(((b.page - (b.start || 0)) / Math.max(1, b.pages - (b.start || 0))) * 100) : 0;
    area.innerHTML = `
      <section class="card book"><div class="cover">${esc(b.title.trim()[0]?.toUpperCase() || "📖")}</div>
        <div><h2>${esc(b.title)}</h2><p class="small">${b.pages ? `Seite ${b.page} von ${b.pages}` : `Seite ${b.page}`}</p>
        ${b.pages ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><p class="small">${pct} % gelesen</p>` : ""}</div></section>
      <section class="card"><p class="small" style="margin-bottom:6px">Mein Lieblingssatz</p>
        <p class="quote ${b.quote ? "" : "empty"}" id="quoteText">${b.quote ? `„${esc(b.quote)}“` : "Noch keiner. Welcher Satz ist dir hängen geblieben?"}</p>
        <div class="add-row"><input id="quoteIn" maxlength="200" placeholder="Satz aus dem Buch …"><button id="quoteSave" type="button">${b.quote ? "Ändern" : "＋"}</button></div></section>
      <section class="card"><p class="small" style="margin-bottom:8px">Neue Wörter (${(b.words || []).length})</p>
        <div class="words">${(b.words || []).map((w, i) => `<button class="word" data-delw="${i}" aria-label="${esc(w)} löschen">${esc(w)}<b>×</b></button>`).join("") || `<span class="small">Ein Wort, das du nicht kanntest? Schreib es auf.</span>`}</div>
        <div class="add-row"><input id="wordIn" maxlength="30" placeholder="neues Wort" autocomplete="off"><button id="wordAdd" type="button">＋</button></div></section>
      <button class="card card-row" id="doneBtn"><span>Buch fertig gelesen?</span><span style="font-size:24px">🏁</span></button>
      <button class="link" id="editBookBtn">Buch ändern (Titel, Seiten)</button>`;
  }
  $("#bookArea").addEventListener("click", (e) => {
    const b = state.book;
    if (e.target.closest("#newBookBtn")) openBook();
    if (e.target.closest("#editBookBtn")) openBook(true);
    if (e.target.closest("#doneBtn") && confirm(`„${b.title}“ wirklich fertig gelesen?`)) finishBook(false);
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
    const b = state.book; b.words ||= [];
    if (b.words.some((w) => w.toLowerCase() === v.toLowerCase())) { toast("Das Wort hast du schon."); return; }
    b.words.push(v); save(); checkStickers(); render(); $("#wordIn")?.focus(); toast("Wort gespeichert 🔤");
  }
  let editingBook = false;
  function openBook(edit = false) {
    editingBook = edit && !!state.book;
    const b = editingBook ? state.book : null;
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
    if (editingBook) Object.assign(state.book, { title, pages, page }); // Korrektur, zählt nicht als gelesen
    else state.book = { id: uid(), title, pages, page, start: page, began: dateKey(), words: [], quote: "" };
    save(); $("#bookDlg").close(); render();
    toast(editingBook ? "Gespeichert ✓" : `📖 „${title}“ ist dein Buch.`);
  });
  function finishBook(auto) {
    const b = state.book; if (!b) return;
    state.finished.push({ title: b.title, pages: b.pages, end: dateKey(), began: b.began, words: (b.words || []).length, quote: b.quote || "" });
    state.book = null; save();
    celebrate("🏁", "Buch fertig!", `„${b.title}“ steht jetzt in deinem Regal. Welches Buch kommt als Nächstes?`);
    checkStickers(); render();
    if (!auto) show("sammlung");
  }

  // ---------- 3 · Sammlung ----------
  const LEVELS = [[0, "Leseanfänger", "🌱"], [50, "Seitenentdecker", "🔍"], [150, "Seitenflitzer", "🚀"], [400, "Bücherwurm", "🐛"], [800, "Lesechampion", "🏆"], [1500, "Leselegende", "👑"]];
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
    ["quote", "💬", "Lieblingssatz", () => !!state.book?.quote || state.finished.some((f) => f.quote)],
    ["night", "🌙", "Nachteule", () => state.sessions.some((s) => s.hour >= 20)],
    ["early", "🌅", "Frühaufsteher", () => state.sessions.some((s) => s.hour != null && s.hour < 8)],
  ];
  const allWords = () => (state.book?.words || []).length + state.finished.reduce((a, f) => a + (f.words || 0), 0);
  function checkStickers() {
    state.seen ||= [];
    const fresh = STICKERS.filter(([id, , , test]) => test() && !state.seen.includes(id));
    if (!fresh.length) return;
    fresh.forEach(([id]) => state.seen.push(id)); save();
    const [, ico, name] = fresh[fresh.length - 1];
    state.fresh = fresh.map(([id]) => id);
    setTimeout(() => celebrate(ico, "Neuer Aufnäher!", `„${name}“ ist jetzt in deine Sammlung genäht.`), 300);
  }
  function renderSammlung() {
    const p = totalPages(); let li = 0; LEVELS.forEach((l, i) => { if (p >= l[0]) li = i; });
    const [from, name, ico] = LEVELS[li], next = LEVELS[li + 1];
    $("#lvlNo").textContent = `Level ${li + 1} · ${p} Seiten`; $("#lvlName").textContent = name; $("#lvlIco").textContent = ico;
    $("#lvlBar").style.width = next ? `${((p - from) / (next[0] - from)) * 100}%` : "100%";
    $("#lvlNext").textContent = next ? `Noch ${next[0] - p} Seiten bis „${next[1]}“ ${next[2]}` : "Höchstes Level erreicht!";
    const fresh = state.fresh || []; state.fresh = [];
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
  function render() {
    if (tab === "lesen") renderLesen();
    if (tab === "buch") renderBuch();
    if (tab === "sammlung") renderSammlung();
  }
  render();
  if (!state.profile) openSetup();
})();
