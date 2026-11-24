/* THE GETAWAY ROUTE — game controller */
(function () {
  const CFG = Object.assign({}, window.GETAWAY_CONFIG);
  const DEMO = /[?&]demo\b/.test(location.search);
  // Rehearsal mode: open index.html?demo for small mazes and quick audits.
  if (DEMO) {
    CFG.mazeWidth = 9;
    CFG.mazeHeight = 6;
    CFG.auditGapSeconds = [1.5, 3];
    CFG.rushGapSeconds = [0.5, 1];
  }
  const ROUNDS = Math.max(1, CFG.rounds | 0);
  const PER = Math.max(1, CFG.auditsPerRound | 0);
  const MAX_STRIKES = Math.max(1, CFG.maxStrikes | 0);
  const EXHIBITS = Math.max(3, (CFG.auditExhibits | 0) || 3);
  const ROUTE_LIMIT = Math.max(0, CFG.routeErrorLimit | 0);

  const $ = (id) => document.getElementById(id);

  // ---------- DOM ----------
  const canvas = $("maze");
  const crt = $("crt");
  const el = {
    intro: $("intro"), audit: $("audit"), exitpanel: $("exitpanel"), closed: $("closed"), failed: $("failed"),
    freeze: $("freeze-stamp"), toast: $("crt-toast"), status: $("crt-status"),
    timer: $("timer"), roundLcd: $("round-lcd"), strikes: $("strikes"), auditStrikes: $("audit-strikes"),
    register: $("register"), regHint: $("register-hint"), casekey: $("casekey"),
    lampTrack: $("lamp-track"), lampAudit: $("lamp-audit"), lampExit: $("lamp-exit"),
    auditNum: $("audit-num"), auditRule: $("audit-rule"), auditNote: $("audit-note"),
    auditPad: $("audit-pad"), auditFeedback: $("audit-feedback"),
    exitHead: $("exit-head"), markLabel: $("mark-label"), exitSymbol: $("exit-symbol"),
    roundEnd: $("round-end"), roundEndText: $("round-end-text"), codeEntry: $("code-entry"),
    codeDisplay: $("code-display"), finalPad: $("final-pad"), finalFeedback: $("final-feedback"),
    successMsg: $("success-msg"), failMsg: $("fail-msg"),
    exhibits: $("exhibits"), routeMeter: $("route-meter"), routePanel: $("route-panel")
  };
  // Exhibit cards (A, B, C, ...)
  el.exhibits.style.gridTemplateColumns = "repeat(" + EXHIBITS + ", 1fr)";
  el.exhibits.classList.toggle("many", EXHIBITS > 3);
  el.exhibits.innerHTML = Array.from({ length: EXHIBITS }, (_, i) =>
    '<div class="exhibit"><div class="tag">EXHIBIT ' + String.fromCharCode(65 + i) + '</div><div class="digit" id="ex-' + i + '">0</div></div>'
  ).join("");
  el.routePanel.classList.toggle("hidden", ROUTE_LIMIT === 0);
  $("intro-rounds").textContent = ROUNDS;

  // ---------- STATE ----------
  let S = null;
  const markIndex = (r) => r * (PER + 1) + PER;
  const auditIndex = (r, i) => r * (PER + 1) + i;

  function isFixedCode() {
    const fixed = CFG.fixedCode == null ? "" : String(CFG.fixedCode);
    return /^\d+$/.test(fixed) && fixed.length === ROUNDS * (PER + 1);
  }

  function buildCode() {
    const len = ROUNDS * (PER + 1);
    const fixed = CFG.fixedCode == null ? "" : String(CFG.fixedCode);
    if (/^\d+$/.test(fixed) && fixed.length === len) return fixed.split("").map(Number);
    if (fixed) console.warn("[GetawayRoute] fixedCode must be " + len + " digits; using a random code.");
    return Array.from({ length: len }, () => Math.floor(Math.random() * 10));
  }

  function buildCaseKey() {
    let names = Object.keys(CFG.caseKey || {}).filter((k) => window.GR_SYMBOLS.names.includes(k));
    let key = {};
    names.forEach((n) => (key[n] = CFG.caseKey[n]));
    if (names.length !== 10 || new Set(Object.values(key)).size !== 10) {
      names = window.GR_SYMBOLS.names.slice();
      key = {};
      names.forEach((n, i) => (key[n] = i));
    }
    if (CFG.shuffleCaseKey) {
      const vals = Object.values(key).sort(() => Math.random() - 0.5);
      names.forEach((n, i) => (key[n] = vals[i]));
    }
    return key;
  }

  function newCase() {
    const code = buildCode();
    const caseKey = buildCaseKey();
    const symbolFor = (digit) => Object.keys(caseKey).find((k) => caseKey[k] === digit);
    S = {
      mode: "intro",
      code, caseKey, fixed: isFixedCode(),
      marks: Array.from({ length: ROUNDS }, (_, r) => symbolFor(code[markIndex(r)])),
      revealed: Array(ROUNDS).fill(false),
      earned: Array.from({ length: ROUNDS }, () => []),
      round: 0,
      maze: null, pos: null, trail: null,
      sinceAudit: 0, rush: false,
      strikes: 0,
      startedAt: null, endedAt: null,
      audit: null, auditShownAt: 0, auditLocked: false, auditCount: 0,
      stats: { rts: [], attempts: 0, wallHits: 0, backtracks: 0, rescrambles: 0 },
      route: window.GR_ROUTE.createTracker({
        limit: ROUTE_LIMIT, wallHits: CFG.penalizeWallHits !== false, backtracks: CFG.penalizeBacktracking !== false
      }),
      entry: [],
      toastTimer: null
    };
    startRoundMaze();
    renderRegister();
    renderCaseKey();
    renderStrikes();
    showOnly("intro");
    setLamps();
    el.status.textContent = "STANDBY";
    el.timer.textContent = "00:00";
    el.freeze.classList.add("hidden");
    el.freeze.textContent = "TRACE FROZEN";
    crt.classList.remove("static");
  }

  function startRoundMaze() {
    S.maze = window.GR_MAZE.generate(Math.max(4, CFG.mazeWidth | 0), Math.max(4, CFG.mazeHeight | 0), Math.min(1, Math.max(0, +CFG.mazeBranching || 0)));
    S.pos = { ...S.maze.start };
    S.trail = [{ ...S.maze.start }];
    S.sinceAudit = 0;
    S.nextAuditIn = null;
    S.rush = false;
    S.route.reset();
    renderRouteMeter();
    el.roundLcd.textContent = S.round + 1 + "/" + ROUNDS;
  }

  const roundDone = () => S.earned[S.round].length >= PER;

  // ---------- RENDER HELPERS ----------
  function showOnly(name) {
    ["intro", "audit", "exitpanel", "closed", "failed"].forEach((k) => el[k].classList.toggle("hidden", k !== name));
    if (name && name !== "audit") el.toast.classList.add("hidden");
  }

  function renderRegister(printed) {
    el.register.innerHTML = "";
    for (let r = 0; r < ROUNDS; r++) {
      const row = document.createElement("div");
      row.className = "reg-row" + (r <= S.round ? " current" : "");
      row.innerHTML = '<div class="reg-leg">L' + (r + 1) + "</div>";
      for (let i = 0; i < PER; i++) {
        const v = S.earned[r][i];
        const slot = document.createElement("div");
        slot.className = "reg-slot" + (v !== undefined ? " filled" : "");
        if (printed && printed[0] === r && printed[1] === i) slot.classList.add("printed");
        slot.innerHTML = '<div class="reg-digit">' + (v !== undefined ? v : "&ndash;") + "</div>";
        row.appendChild(slot);
      }
      const mark = document.createElement("div");
      mark.className = "reg-slot mark" + (S.revealed[r] ? " filled" : "");
      mark.innerHTML = '<div class="reg-digit">' + (S.revealed[r] ? window.GR_SYMBOLS.svg(S.marks[r]) : "?") + "</div>";
      row.appendChild(mark);
      el.register.appendChild(row);
    }
    const left = PER - S.earned[S.round].length;
    el.regHint.textContent =
      left > 0 ? "LEG " + (S.round + 1) + ": " + left + " AUDIT DIGIT" + (left === 1 ? "" : "S") + " OUTSTANDING"
               : "LEG " + (S.round + 1) + " REGISTER COMPLETE · EXIT UNSEALED";
  }

  function renderCaseKey() {
    el.casekey.innerHTML = "";
    Object.keys(S.caseKey).forEach((name) => {
      const cell = document.createElement("div");
      cell.className = "ck-cell";
      cell.innerHTML = window.GR_SYMBOLS.svg(name) + '<span class="ck-eq">=</span><span class="ck-num">' + S.caseKey[name] + "</span>";
      el.casekey.appendChild(cell);
    });
  }

  function renderStrikes() {
    let html = "";
    for (let i = 0; i < MAX_STRIKES; i++) html += '<span class="strike' + (i < S.strikes ? " hit" : "") + '">&times;</span>';
    el.strikes.innerHTML = html;
    el.auditStrikes.innerHTML = "STRIKES " + html;
  }

  function renderRouteMeter(flash) {
    if (!ROUTE_LIMIT) return;
    let html = "";
    for (let i = 0; i < ROUTE_LIMIT; i++) {
      const hit = i < S.route.errors;
      const danger = hit && S.route.errors >= ROUTE_LIMIT - 2;
      html += '<span class="seg' + (hit ? " hit" : "") + (danger ? " danger" : "") + '"></span>';
    }
    el.routeMeter.innerHTML = html;
    if (flash) {
      el.routePanel.classList.remove("flash");
      void el.routePanel.offsetWidth;
      el.routePanel.classList.add("flash");
    }
  }

  function setLamps() {
    const m = S.mode;
    el.lampTrack.classList.toggle("on", m === "maze");
    el.lampAudit.classList.toggle("on", m === "audit" || m === "failed");
    el.lampAudit.classList.toggle("blink", m === "audit");
    el.lampExit.classList.toggle("on", roundDone());
  }

  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms || 2200);
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function buildPad(container, layout, onPress) {
    container.innerHTML = "";
    layout.forEach((k) => {
      if (k === null) { container.appendChild(document.createElement("span")); return; }
      const b = document.createElement("button");
      b.className = "key pad-key" + (k === "ENT" ? " orange" : k === "CLR" ? " mustard" : "");
      b.textContent = k;
      b.dataset.key = k;
      b.addEventListener("click", () => { onPress(k); b.blur(); });
      container.appendChild(b);
    });
  }

  function flashKey(container, k) {
    const b = container.querySelector('[data-key="' + k + '"]');
    if (!b) return;
    b.classList.add("pressed");
    setTimeout(() => b.classList.remove("pressed"), 120);
    window.GR_SOUND.click();
  }

  // Console buttons (everything except keypad keys, which click via flashKey).
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest(".key");
    if (!b || b.classList.contains("pad-key")) return;
    if (["btn-begin", "btn-next-round", "btn-retry"].includes(b.id)) return; // these play the PLAY-key sound
    window.GR_SOUND.unlock();
    window.GR_SOUND.press();
  });

  // ---------- SIZING ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(crt.clientWidth * dpr);
    canvas.height = Math.round(crt.clientHeight * dpr);
  }
  new ResizeObserver(resize).observe(crt);

  // ---------- FLOW ----------
  function begin() {
    window.GR_SOUND.unlock();
    window.GR_SOUND.play();
    S.mode = "maze";
    S.startedAt = performance.now();
    showOnly(null);
    el.status.textContent = "TRACKING";
    setLamps();
    renderRegister();
    toast("LEG 1 · TRACE ACTIVE · FOLLOW THE ROUTE", 2000);
  }

  // Even, unpredictable pacing: each gap is drawn at random from a range
  // (e.g. 8-16 s), so audits are spread across the whole run with no slow start.
  function nextGap() {
    const g = S.rush ? CFG.rushGapSeconds : CFG.auditGapSeconds;
    return (g[0] + Math.random() * (g[1] - g[0])) * 1000;
  }

  function auditTick(dt) {
    if (roundDone()) return;
    if (S.nextAuditIn == null) S.nextAuditIn = nextGap();
    S.sinceAudit += dt;
    if (S.sinceAudit >= S.nextAuditIn) openAudit();
  }

  function openAudit(retry) {
    S.mode = "audit";
    const i = S.earned[S.round].length;
    const idx = auditIndex(S.round, i);
    // With a random code, each audit is built first and its answer becomes that code
    // digit, so every rule is always available. With a fixed code, the audit must hit it.
    S.audit = window.GR_AUDIT.make(S.fixed ? S.code[idx] : null, EXHIBITS);
    S.code[idx] = S.audit.answer;
    S.auditShownAt = performance.now();
    S.auditLocked = false;
    S.auditCount++;
    el.auditNum.textContent = "L" + (S.round + 1) + " · " + (i + 1) + "/" + PER;
    S.audit.digits.forEach((d, k) => ($("ex-" + k).textContent = d));
    el.auditRule.textContent = S.audit.criterion.text;
    el.auditNote.textContent = S.audit.note ? "(" + S.audit.note + ")" : "";
    el.auditFeedback.textContent = "AWAITING INPUT_";
    el.auditFeedback.className = "audit-feedback";
    el.freeze.classList.remove("hidden");
    el.status.textContent = "FROZEN";
    showOnly("audit");
    el.audit.classList.remove("pop");
    void el.audit.offsetWidth;
    el.audit.classList.add("pop");
    setLamps();
    if (retry) window.GR_SOUND.reissue();
    else window.GR_SOUND.interrupt();
  }

  function answerAudit(k) {
    if (S.mode !== "audit" || S.auditLocked) return;
    const v = Number(k);
    flashKey(el.auditPad, k);
    S.auditLocked = true;
    if (v === S.audit.answer) {
      S.stats.rts.push(performance.now() - S.auditShownAt);
      S.earned[S.round].push(v);
      el.auditFeedback.textContent = "VERIFIED · DIGIT " + v + " LOGGED";
      el.auditFeedback.className = "audit-feedback ok";
      window.GR_SOUND.correct();
      renderRegister([S.round, S.earned[S.round].length - 1]);
      setTimeout(closeAudit, 650);
    } else {
      S.strikes++;
      renderStrikes();
      const device = el.audit.querySelector(".audit-device");
      device.classList.add("shake");
      window.GR_SOUND.wrong();
      if (S.strikes >= MAX_STRIKES) {
        el.auditFeedback.textContent = "STRIKE " + S.strikes + " · CLEARANCE REVOKED";
        el.auditFeedback.className = "audit-feedback bad";
        setTimeout(() => { device.classList.remove("shake"); failMission(); }, 1100);
        return;
      }
      const left = MAX_STRIKES - S.strikes;
      el.auditFeedback.textContent = "MISMATCH · STRIKE " + S.strikes + " · " + left + " LEFT";
      el.auditFeedback.className = "audit-feedback bad";
      setTimeout(() => { device.classList.remove("shake"); openAudit(true); }, 1100);
    }
  }

  function closeAudit() {
    S.mode = "maze";
    S.sinceAudit = 0;
    S.nextAuditIn = null;
    showOnly(null);
    el.freeze.classList.add("hidden");
    el.status.textContent = "TRACKING";
    setLamps();
    if (roundDone()) {
      toast("LEG " + (S.round + 1) + " REGISTER COMPLETE · EXIT UNSEALED", 2400);
      if (atExit()) reachExit();
    }
  }

  function failMission() {
    S.mode = "failed";
    S.endedAt = performance.now();
    el.failMsg.textContent = CFG.failMessage || "";
    el.freeze.classList.add("hidden");
    showOnly("failed");
    el.status.textContent = "SCRUBBED";
    setLamps();
    window.GR_SOUND.sealed();
    console.log("[GetawayRoute] mission failed", { timeMs: Math.round(S.endedAt - S.startedAt), auditRTsMs: S.stats.rts.map(Math.round) });
  }

  const atExit = () => S.pos.x === S.maze.exit.x && S.pos.y === S.maze.exit.y;

  // Route penalties: wall hits and turning back add route errors. Too many and
  // the suspect's trail is lost: the current leg's maze is re-randomized.
  function routePenalty(res) {
    if (!res.kind) return false;
    if (res.kind === "wall") S.stats.wallHits++;
    else S.stats.backtracks++;
    renderRouteMeter(true);
    window.GR_SOUND.penalty();
    if (res.exceeded) { rescramble(); return true; }
    const left = res.limit - res.errors;
    toast("ROUTE ERROR \u00b7 " + (res.kind === "wall" ? "WALL CONTACT" : "DOUBLED BACK") + " \u00b7 " + left + " LEFT", 1400);
    return false;
  }

  function rescramble() {
    S.mode = "scramble";
    S.stats.rescrambles++;
    el.freeze.textContent = "SIGNAL LOST \u00b7 RE-ACQUIRING";
    el.freeze.classList.remove("hidden");
    el.status.textContent = "SIGNAL LOST";
    crt.classList.add("static");
    toast("TOO MANY ROUTE ERRORS \u00b7 TRAIL SCRAMBLED", 2400);
    window.GR_SOUND.sealed();
    setLamps();
    setTimeout(() => {
      if (S.mode !== "scramble") return;
      crt.classList.remove("static");
      el.freeze.classList.add("hidden");
      el.freeze.textContent = "TRACE FROZEN";
      startRoundMaze();
      S.mode = "maze";
      el.status.textContent = "TRACKING";
      setLamps();
      toast("NEW ROUTE ACQUIRED \u00b7 AUDIT DIGITS KEPT", 2000);
    }, 1600);
  }

  function move(dx, dy, repeat) {
    if (S.mode !== "maze") return;
    const { x, y } = S.pos;
    if (!window.GR_MAZE.canMove(S.maze, x, y, dx, dy)) {
      if (!repeat) window.GR_SOUND.bump();
      routePenalty(S.route.bump(!!repeat));
      return;
    }
    S.pos = { x: x + dx, y: y + dy };
    const prev = S.trail[S.trail.length - 2];
    const backtrack = !!(prev && prev.x === S.pos.x && prev.y === S.pos.y);
    if (backtrack) { S.trail.pop(); window.GR_SOUND.stepBack(); }
    else { S.trail.push({ ...S.pos }); window.GR_SOUND.step(); }
    if (routePenalty(S.route.step(backtrack))) return;
    if (atExit()) {
      if (!roundDone()) {
        const left = PER - S.earned[S.round].length;
        toast("EXIT SEALED · " + left + " AUDIT" + (left === 1 ? "" : "S") + " OUTSTANDING", 2600);
        window.GR_SOUND.sealed();
        if (!S.rush) {
          S.rush = true;
          const quick = nextGap();
          if (S.nextAuditIn == null || S.nextAuditIn - S.sinceAudit > quick) S.nextAuditIn = S.sinceAudit + quick;
        }
      } else {
        reachExit();
      }
    }
  }

  function reachExit() {
    S.mode = "exit";
    S.revealed[S.round] = true;
    renderRegister();
    const last = S.round === ROUNDS - 1;
    el.exitHead.textContent = "> LEG " + (S.round + 1) + " OF " + ROUNDS + " · SUSPECT EXIT LOCATED";
    el.markLabel.textContent = "MARK LEFT AT SCENE · L" + (S.round + 1);
    el.exitSymbol.innerHTML = window.GR_SYMBOLS.svg(S.marks[S.round], "big");
    el.roundEnd.classList.toggle("hidden", last);
    el.codeEntry.classList.toggle("hidden", !last);
    if (last) {
      S.entry = [];
      el.finalFeedback.textContent = " ";
      el.finalFeedback.className = "final-feedback";
      renderEntry();
    } else {
      el.roundEndText.textContent = "The suspect switched vehicles. Leg " + (S.round + 2) + " of " + ROUNDS + " is coming in.";
    }
    showOnly("exitpanel");
    el.status.textContent = "EXIT REACHED";
    setLamps();
    window.GR_SOUND.found();
  }

  function nextRound() {
    if (S.mode !== "exit" || S.round >= ROUNDS - 1) return;
    S.round++;
    window.GR_SOUND.play();
    startRoundMaze();
    S.mode = "maze";
    showOnly(null);
    renderRegister();
    el.status.textContent = "TRACKING";
    setLamps();
    toast("LEG " + (S.round + 1) + " · NEW ROUTE ACQUIRED", 2200);
  }

  function renderEntry() {
    el.codeDisplay.innerHTML = "";
    for (let i = 0; i < S.code.length; i++) {
      const b = document.createElement("div");
      const isMark = i % (PER + 1) === PER;
      b.className = "cd-box" + (isMark ? " mark" : "") + (i === S.entry.length ? " cursor" : "");
      b.textContent = S.entry[i] !== undefined ? S.entry[i] : "";
      el.codeDisplay.appendChild(b);
    }
  }

  function pressFinal(k) {
    if (S.mode !== "exit" || S.round !== ROUNDS - 1) return;
    flashKey(el.finalPad, k);
    if (k === "CLR") S.entry = [];
    else if (k === "DEL") S.entry.pop();
    else if (k === "ENT") return submitFinal();
    else if (S.entry.length < S.code.length) S.entry.push(Number(k));
    el.finalFeedback.textContent = " ";
    el.finalFeedback.className = "final-feedback";
    renderEntry();
  }

  function submitFinal() {
    if (S.entry.length < S.code.length) {
      el.finalFeedback.textContent = "CODE INCOMPLETE · " + S.code.length + " DIGITS REQUIRED";
      el.finalFeedback.className = "final-feedback bad";
      window.GR_SOUND.wrong();
      return;
    }
    S.stats.attempts++;
    if (S.entry.join("") === S.code.join("")) return closeCase();
    el.finalFeedback.textContent = "ACCESS DENIED · CHECK THE REGISTER AND THE CASE KEY";
    el.finalFeedback.className = "final-feedback bad";
    el.codeDisplay.classList.add("shake");
    setTimeout(() => el.codeDisplay.classList.remove("shake"), 500);
    window.GR_SOUND.wrong();
    S.entry = [];
    setTimeout(renderEntry, 500);
  }

  function closeCase() {
    S.mode = "closed";
    S.endedAt = performance.now();
    const rts = S.stats.rts;
    $("st-time").textContent = fmtTime(S.endedAt - S.startedAt);
    $("st-audits").textContent = rts.length;
    $("st-errors").textContent = S.strikes + " / " + MAX_STRIKES;
    $("st-rt").textContent = rts.length ? (rts.reduce((a, b) => a + b, 0) / rts.length / 1000).toFixed(2) + " s" : "--";
    $("st-attempts").textContent = S.stats.attempts;
    $("st-route").textContent = S.stats.wallHits + " wall \u00b7 " + S.stats.backtracks + " back \u00b7 " + S.stats.rescrambles + " scrambles";
    el.successMsg.textContent = CFG.successMessage || "";
    renderRegister();
    showOnly("closed");
    el.status.textContent = "CASE CLOSED";
    setLamps();
    window.GR_SOUND.win();
    console.log("[GetawayRoute] case closed", {
      timeMs: Math.round(S.endedAt - S.startedAt), code: S.code.join(""), auditRTsMs: rts.map(Math.round),
      strikes: S.strikes, attempts: S.stats.attempts,
      wallHits: S.stats.wallHits, backtracks: S.stats.backtracks, rescrambles: S.stats.rescrambles
    });
  }

  // ---------- INPUT ----------
  const MOVES = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
  };

  // Digit from either the top row or the numpad. Uses e.code so the numpad works
  // even when NumLock is off (then e.key is "End", "ArrowDown", "PageDown", ...).
  function digitFrom(e) {
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || "");
    if (m) return m[1];
    return /^[0-9]$/.test(e.key) ? e.key : null;
  }

  document.addEventListener("keydown", (e) => {
    const digit = digitFrom(e);
    if (e.ctrlKey && e.shiftKey && (e.key === "N" || e.key === "n")) { e.preventDefault(); newCase(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (S.mode === "maze" && MOVES[e.key] && !/^Numpad/.test(e.code || "")) {
      e.preventDefault();
      move(MOVES[e.key][0], MOVES[e.key][1], e.repeat);
    } else if (S.mode === "audit" && digit !== null) {
      e.preventDefault();
      if (!e.repeat) answerAudit(digit);
    } else if (S.mode === "exit" && S.round < ROUNDS - 1) {
      if (e.key === "Enter") { e.preventDefault(); nextRound(); }
    } else if (S.mode === "exit") {
      if (digit !== null) { e.preventDefault(); if (!e.repeat) pressFinal(digit); }
      else if (e.key === "Backspace") { e.preventDefault(); pressFinal("DEL"); }
      else if (e.key === "Delete" || e.key === "Escape") { e.preventDefault(); pressFinal("CLR"); }
      else if (e.key === "Enter") { e.preventDefault(); pressFinal("ENT"); }
    } else if (S.mode === "intro" && e.key === "Enter") {
      e.preventDefault(); begin();
    } else if (S.mode === "failed" && e.key === "Enter") {
      e.preventDefault(); restart();
    } else if (e.key.startsWith("Arrow") || e.key === " ") {
      e.preventDefault();
    }
  });

  function restart() { newCase(); begin(); }

  $("btn-begin").addEventListener("click", begin);
  $("btn-again").addEventListener("click", newCase);
  $("btn-retry").addEventListener("click", restart);
  $("btn-next-round").addEventListener("click", (e) => { e.currentTarget.blur(); nextRound(); });
  $("btn-reset").addEventListener("click", (e) => {
    e.currentTarget.blur();
    if (["intro", "closed", "failed"].includes(S.mode) || confirm("Abandon this case and open a new one?")) newCase();
  });
  const soundBtn = $("btn-sound");
  function setSound(on) {
    window.GR_SOUND.setEnabled(on);
    soundBtn.textContent = "SOUND: " + (on ? "ON" : "OFF");
  }
  soundBtn.addEventListener("click", () => { setSound(!window.GR_SOUND.isEnabled()); soundBtn.blur(); });
  setSound(CFG.sound !== false);

  buildPad(el.auditPad, ["7", "8", "9", "4", "5", "6", "1", "2", "3", null, "0", null], answerAudit);
  buildPad(el.finalPad, ["7", "8", "9", "4", "5", "6", "1", "2", "3", "CLR", "0", "ENT"], pressFinal);

  // ---------- LOOP ----------
  // Game clock runs on a timer (not animation frames) so audit timing stays
  // accurate even if the browser slows down drawing.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(1000, now - last);
    last = now;
    if (S.mode === "maze") auditTick(dt);
  }, 50);

  function frame(now) {
    if (S.startedAt && S.mode !== "closed" && S.mode !== "failed") el.timer.textContent = fmtTime(now - S.startedAt);
    window.GR_MAZE.draw(canvas, S.maze, {
      pos: S.pos, trail: S.trail,
      frozen: S.mode !== "maze",
      exitSealed: !roundDone()
    }, now);
    requestAnimationFrame(frame);
  }

  if (DEMO) window.__GR = () => S; // rehearsal/debug only
  newCase();
  resize();
  requestAnimationFrame(frame);
})();
