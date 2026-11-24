/* THE GETAWAY ROUTE — game controller */
(function () {
  const CFG = Object.assign({}, window.GETAWAY_CONFIG);
  // Rehearsal mode: open index.html?demo for a tiny maze and quick audits.
  if (/[?&]demo\b/.test(location.search)) {
    CFG.mazeSize = 6;
    CFG.auditGapSeconds = [2, 4];
    CFG.rushGapSeconds = [0.8, 1.5];
  }
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- DOM ----------
  const canvas = $("maze");
  const crt = $("crt");
  const el = {
    intro: $("intro"), audit: $("audit"), exitpanel: $("exitpanel"), closed: $("closed"),
    freeze: $("freeze-stamp"), toast: $("crt-toast"), status: $("crt-status"),
    timer: $("timer"), register: $("register"), regHint: $("register-hint"), casekey: $("casekey"),
    lampTrack: $("lamp-track"), lampAudit: $("lamp-audit"), lampExit: $("lamp-exit"),
    auditNum: $("audit-num"), auditRule: $("audit-rule"), auditNote: $("audit-note"),
    auditPad: $("audit-pad"), auditFeedback: $("audit-feedback"),
    exitSymbol: $("exit-symbol"), codeDisplay: $("code-display"), finalPad: $("final-pad"),
    finalFeedback: $("final-feedback"), successMsg: $("success-msg")
  };

  // ---------- STATE ----------
  let S = null;

  function buildCode() {
    if (CFG.finalCode && /^\d{2,}$/.test(String(CFG.finalCode))) {
      return String(CFG.finalCode).split("").map(Number);
    }
    const n = Math.max(1, CFG.randomAuditCount | 0) + 1;
    return Array.from({ length: n }, () => Math.floor(Math.random() * 10));
  }

  function buildCaseKey() {
    let names = Object.keys(CFG.caseKey || {}).filter((k) => window.GR_SYMBOLS.names.includes(k));
    let key = {};
    names.forEach((n) => (key[n] = CFG.caseKey[n]));
    const digits = new Set(Object.values(key));
    if (names.length !== 10 || digits.size !== 10) {
      // invalid config: fall back to a generated key
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
    const symbolDigit = code[code.length - 1];
    const exitSymbol = Object.keys(caseKey).find((k) => caseKey[k] === symbolDigit);
    const maze = window.GR_MAZE.generate(Math.max(5, CFG.mazeSize | 0));
    S = {
      mode: "intro",
      code, caseKey, exitSymbol,
      auditTargets: code.slice(0, -1),
      earned: [],
      maze,
      pos: { ...maze.start },
      trail: [{ ...maze.start }],
      mazeTime: 0,
      nextAuditAt: rand(...CFG.auditGapSeconds) * 1000,
      rush: false,
      startedAt: null, endedAt: null,
      audit: null, auditShownAt: 0, auditLocked: false,
      stats: { errors: 0, rts: [], attempts: 0 },
      entry: [],
      toastTimer: null
    };
    renderRegister();
    renderCaseKey();
    showOnly("intro");
    setLamps();
    el.status.textContent = "STANDBY";
    el.timer.textContent = "00:00";
    el.freeze.classList.add("hidden");
  }

  // ---------- RENDER HELPERS ----------
  function showOnly(name) {
    ["intro", "audit", "exitpanel", "closed"].forEach((k) => el[k].classList.toggle("hidden", k !== name));
  }

  function renderRegister() {
    const n = S.code.length;
    el.register.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const slot = document.createElement("div");
      const isMark = i === n - 1;
      slot.className = "reg-slot" + (isMark ? " mark" : "");
      const val = isMark ? "" : S.earned[i] !== undefined ? S.earned[i] : "";
      slot.innerHTML =
        '<div class="reg-digit">' + (val === "" ? (isMark ? "?" : "&ndash;") : val) + "</div>" +
        '<div class="reg-cap">' + (isMark ? "MARK" : "A" + String(i + 1).padStart(2, "0")) + "</div>";
      if (val !== "") slot.classList.add("filled");
      el.register.appendChild(slot);
    }
    const left = S.auditTargets.length - S.earned.length;
    el.regHint.textContent = left > 0 ? left + " AUDIT DIGIT" + (left === 1 ? "" : "S") + " OUTSTANDING" : "REGISTER COMPLETE · EXIT UNSEALED";
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

  function setLamps() {
    const m = S.mode;
    el.lampTrack.classList.toggle("on", m === "maze");
    el.lampAudit.classList.toggle("on", m === "audit");
    el.lampAudit.classList.toggle("blink", m === "audit");
    el.lampExit.classList.toggle("on", S.earned.length >= S.auditTargets.length);
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
  }

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
    S.mode = "maze";
    S.startedAt = performance.now();
    showOnly(null);
    el.status.textContent = "TRACKING";
    setLamps();
    toast("TRACE ACTIVE · FOLLOW THE ROUTE", 1800);
  }

  function scheduleNextAudit() {
    const gap = S.rush ? CFG.rushGapSeconds : CFG.auditGapSeconds;
    S.nextAuditAt = S.mazeTime + rand(gap[0], gap[1]) * 1000;
  }

  function openAudit() {
    S.mode = "audit";
    const target = S.auditTargets[S.earned.length];
    S.audit = window.GR_AUDIT.make(target);
    S.auditShownAt = performance.now();
    S.auditLocked = false;
    el.auditNum.textContent = "#" + String(S.earned.length + 1).padStart(2, "0") + " / " + String(S.auditTargets.length).padStart(2, "0");
    S.audit.digits.forEach((d, i) => ($("ex-" + i).textContent = d));
    el.auditRule.textContent = S.audit.criterion.text;
    el.auditNote.textContent = S.audit.criterion.note ? "(" + S.audit.criterion.note + ")" : "";
    el.auditFeedback.textContent = "AWAITING INPUT_";
    el.auditFeedback.className = "audit-feedback";
    el.freeze.classList.remove("hidden");
    el.status.textContent = "FROZEN";
    showOnly("audit");
    el.audit.classList.remove("pop");
    void el.audit.offsetWidth;
    el.audit.classList.add("pop");
    setLamps();
    window.GR_SOUND.alarm();
  }

  function answerAudit(k) {
    if (S.mode !== "audit" || S.auditLocked) return;
    const v = Number(k);
    flashKey(el.auditPad, k);
    if (v === S.audit.answer) {
      S.auditLocked = true;
      S.stats.rts.push(performance.now() - S.auditShownAt);
      S.earned.push(v);
      el.auditFeedback.textContent = "VERIFIED · DIGIT " + v + " LOGGED";
      el.auditFeedback.className = "audit-feedback ok";
      window.GR_SOUND.correct();
      renderRegister();
      const slot = el.register.children[S.earned.length - 1];
      if (slot) slot.classList.add("printed");
      setTimeout(closeAudit, 650);
    } else {
      S.auditLocked = true;
      S.stats.errors++;
      el.auditFeedback.textContent = "MISMATCH · NEW EXHIBITS INBOUND";
      el.auditFeedback.className = "audit-feedback bad";
      el.audit.querySelector(".audit-device").classList.add("shake");
      window.GR_SOUND.wrong();
      setTimeout(() => {
        el.audit.querySelector(".audit-device").classList.remove("shake");
        openAudit();
      }, 900);
    }
  }

  function closeAudit() {
    S.mode = "maze";
    showOnly(null);
    el.freeze.classList.add("hidden");
    el.status.textContent = "TRACKING";
    scheduleNextAudit();
    setLamps();
    if (S.earned.length >= S.auditTargets.length) {
      toast("REGISTER COMPLETE · EXIT UNSEALED", 2400);
      if (atExit()) openExit();
    }
  }

  function atExit() {
    return S.pos.x === S.maze.exit.x && S.pos.y === S.maze.exit.y;
  }

  function move(dx, dy) {
    if (S.mode !== "maze") return;
    const { x, y } = S.pos;
    if (!window.GR_MAZE.canMove(S.maze, x, y, dx, dy)) { window.GR_SOUND.bump(); return; }
    S.pos = { x: x + dx, y: y + dy };
    // trail: backtracking erases the last step
    const prev = S.trail[S.trail.length - 2];
    if (prev && prev.x === S.pos.x && prev.y === S.pos.y) S.trail.pop();
    else S.trail.push({ ...S.pos });
    if (atExit()) {
      if (S.earned.length < S.auditTargets.length) {
        const left = S.auditTargets.length - S.earned.length;
        toast("EXIT SEALED · " + left + " AUDIT" + (left === 1 ? "" : "S") + " OUTSTANDING", 2600);
        window.GR_SOUND.sealed();
        if (!S.rush) {
          S.rush = true;
          S.nextAuditAt = Math.min(S.nextAuditAt, S.mazeTime + rand(...CFG.rushGapSeconds) * 1000);
        }
      } else {
        openExit();
      }
    }
  }

  function openExit() {
    S.mode = "exit";
    S.entry = [];
    el.exitSymbol.innerHTML = window.GR_SYMBOLS.svg(S.exitSymbol, "big");
    el.finalFeedback.textContent = " ";
    el.finalFeedback.className = "final-feedback";
    renderEntry();
    showOnly("exitpanel");
    el.status.textContent = "EXIT REACHED";
    setLamps();
    window.GR_SOUND.found();
  }

  function renderEntry() {
    el.codeDisplay.innerHTML = "";
    for (let i = 0; i < S.code.length; i++) {
      const b = document.createElement("div");
      b.className = "cd-box" + (i === S.entry.length ? " cursor" : "");
      b.textContent = S.entry[i] !== undefined ? S.entry[i] : "";
      el.codeDisplay.appendChild(b);
    }
  }

  function pressFinal(k) {
    if (S.mode !== "exit") return;
    flashKey(el.finalPad, k);
    window.GR_SOUND.key();
    if (k === "CLR") { S.entry = []; }
    else if (k === "DEL") { S.entry.pop(); }
    else if (k === "ENT") { submitFinal(); return; }
    else if (S.entry.length < S.code.length) { S.entry.push(Number(k)); }
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
    if (S.entry.join("") === S.code.join("")) {
      closeCase();
    } else {
      el.finalFeedback.textContent = "ACCESS DENIED · CHECK THE REGISTER AND THE CASE KEY";
      el.finalFeedback.className = "final-feedback bad";
      el.codeDisplay.classList.add("shake");
      setTimeout(() => el.codeDisplay.classList.remove("shake"), 500);
      window.GR_SOUND.wrong();
      S.entry = [];
      setTimeout(renderEntry, 500);
    }
  }

  function closeCase() {
    S.mode = "closed";
    S.endedAt = performance.now();
    const rts = S.stats.rts;
    $("st-time").textContent = fmtTime(S.endedAt - S.startedAt);
    $("st-audits").textContent = S.earned.length;
    $("st-errors").textContent = S.stats.errors;
    $("st-rt").textContent = rts.length ? (rts.reduce((a, b) => a + b, 0) / rts.length / 1000).toFixed(2) + " s" : "--";
    $("st-attempts").textContent = S.stats.attempts;
    el.successMsg.textContent = CFG.successMessage || "";
    showOnly("closed");
    el.status.textContent = "CASE CLOSED";
    setLamps();
    window.GR_SOUND.win();
    console.log("[GetawayRoute] case closed", {
      timeMs: Math.round(S.endedAt - S.startedAt), auditRTsMs: rts.map(Math.round), errors: S.stats.errors, attempts: S.stats.attempts
    });
  }

  // ---------- INPUT ----------
  const MOVES = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
  };

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "N" || e.key === "n")) { e.preventDefault(); newCase(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (S.mode === "maze" && MOVES[e.key]) {
      e.preventDefault();
      move(MOVES[e.key][0], MOVES[e.key][1]);
    } else if (S.mode === "audit" && /^[0-9]$/.test(e.key)) {
      e.preventDefault();
      answerAudit(e.key);
    } else if (S.mode === "exit") {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pressFinal(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); pressFinal("DEL"); }
      else if (e.key === "Delete" || e.key === "Escape") { e.preventDefault(); pressFinal("CLR"); }
      else if (e.key === "Enter") { e.preventDefault(); pressFinal("ENT"); }
    } else if (S.mode === "intro" && e.key === "Enter") {
      e.preventDefault(); begin();
    } else if (e.key.startsWith("Arrow") || e.key === " ") {
      e.preventDefault();
    }
  });

  $("btn-begin").addEventListener("click", begin);
  $("btn-again").addEventListener("click", newCase);
  $("btn-reset").addEventListener("click", (e) => {
    e.currentTarget.blur();
    if (S.mode === "intro" || S.mode === "closed" || confirm("Abandon this case and open a new one?")) newCase();
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
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1000, now - last);
    last = now;
    if (S.mode === "maze") {
      S.mazeTime += dt;
      if (S.earned.length < S.auditTargets.length && S.mazeTime >= S.nextAuditAt) openAudit();
    }
    if (S.startedAt && S.mode !== "closed") el.timer.textContent = fmtTime(now - S.startedAt);
    window.GR_MAZE.draw(canvas, S.maze, {
      pos: S.pos, trail: S.trail,
      frozen: S.mode !== "maze",
      exitSealed: S.earned.length < S.auditTargets.length
    }, now);
    requestAnimationFrame(frame);
  }

  if (/[?&]demo\b/.test(location.search)) window.__GR = () => S; // rehearsal/debug only
  newCase();
  resize();
  requestAnimationFrame(frame);
})();
