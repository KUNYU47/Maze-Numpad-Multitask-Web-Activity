// End-to-end test: plays the real page in headless Edge/Chrome with real key presses.
// Run with:  node tests/e2e.mjs        (Windows; set BROWSER=path\to\chrome.exe to override)
// Run only some sections:  node tests/e2e.mjs 1 3
//
// Audits are answered by reading the exhibits and the rule text off the screen and
// solving them independently, so a mismatch between what is shown and what the game
// accepts is caught. Answers are entered three ways: top-row digits, the numpad with
// NumLock ON, the numpad with NumLock OFF, and clicking the on-screen keypad.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageUrl = pathToFileURL(join(root, "index.html")).href + "?demo&skippractice";
const practiceUrl = pathToFileURL(join(root, "index.html")).href + "?demo";
const candidates = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/opt/pw-browsers/chromium"
].filter(Boolean);
const browserPath = candidates.find((p) => existsSync(p));
if (!browserPath) { console.error("No Edge/Chrome found. Set BROWSER=path"); process.exit(2); }

const PORT = 9300 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), "gr-e2e-"));
const browser = spawn(browserPath, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--window-size=1366,768",
  `--user-data-dir=${profile}`, "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--allow-file-access-from-files", "about:blank"
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.slice(2).map(Number).filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const watchdog = setTimeout(() => {
  console.log("TIMEOUT: test run took longer than 5 minutes");
  browser.kill();
  process.exit(1);
}, 5 * 60 * 1000);

let failures = 0, passes = 0;
function check(cond, msg) {
  if (cond) { passes++; } else { failures++; console.log("  FAIL: " + msg); }
}

// ---- CDP plumbing ----
let targets = [];
for (let i = 0; i < 60 && !targets.find((t) => t.type === "page"); i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(250); }
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 0;
const pending = new Map();
const pageErrors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const id = ++nextId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error("page error: " + JSON.stringify(r.result.exceptionDetails.exception?.description));
  return r.result?.result?.value;
};

const NUMLOCK_OFF = { 0: ["Insert", 45], 1: ["End", 35], 2: ["ArrowDown", 40], 3: ["PageDown", 34], 4: ["ArrowLeft", 37],
  5: ["Clear", 12], 6: ["ArrowRight", 39], 7: ["Home", 36], 8: ["ArrowUp", 38], 9: ["PageUp", 33] };
const ARROWS = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };

async function press(key, code, vk, text) {
  await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, text });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
}
async function enterDigit(d, method) {
  d = Number(d);
  if (method === "row") return press(String(d), "Digit" + d, 48 + d, String(d));
  if (method === "numpad") return press(String(d), "Numpad" + d, 96 + d, String(d));
  if (method === "numlock-off") return press(NUMLOCK_OFF[d][0], "Numpad" + d, NUMLOCK_OFF[d][1]);
  if (method === "click") return js(`document.querySelector('#audit-pad [data-key="${d}"]').click()`);
}
const arrow = (k) => press(k, k, ARROWS[k]);

// ---- Independent solver, working only from what is on screen ----
function solveFromScreen(rule, digits) {
  const distinct = new Set(digits).size === digits.length;
  const even = (x) => x % 2 === 0;
  switch (rule) {
    case "THE HIGHEST DIGIT": return distinct ? Math.max(...digits) : "ambiguous";
    case "THE LOWEST DIGIT": return distinct ? Math.min(...digits) : "ambiguous";
    case "THE MIDDLE VALUE": return distinct ? [...digits].sort((a, b) => a - b)[(digits.length - 1) / 2] : "ambiguous";
    case "THE LEFT-MOST EVEN DIGIT": return digits.find(even) ?? "none";
    case "THE RIGHT-MOST EVEN DIGIT": return [...digits].reverse().find(even) ?? "none";
    case "THE LEFT-MOST ODD DIGIT": return digits.find((x) => !even(x)) ?? "none";
    case "THE RIGHT-MOST ODD DIGIT": return [...digits].reverse().find((x) => !even(x)) ?? "none";
    case "THE DIGIT THAT APPEARS TWICE": {
      const twice = [...new Set(digits)].filter((x) => digits.filter((y) => y === x).length === 2);
      return twice.length === 1 && new Set(digits).size === digits.length - 1 ? twice[0] : "ambiguous";
    }
  }
  return "unknown rule: " + rule;
}

const screen = () => js(`({
  mode: window.__GR().mode,
  rule: document.getElementById("audit-rule").textContent,
  digits: [...document.querySelectorAll("#exhibits .digit")].map(e => Number(e.textContent)),
  register: window.__GR().earned.map(r => r.join("")),
  strikes: window.__GR().strikes,
  routeErrors: window.__GR().route.errors,
  feedback: document.getElementById("audit-feedback").textContent
})`);

const methods = ["row", "numpad", "numlock-off", "click"];
let methodIx = 0;
const ruleCounts = {};
const ruleSequence = [];

async function waitMode(modes, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const m = await js("window.__GR().mode");
    if (modes.includes(m)) return m;
    await sleep(60);
  }
  return null;
}

// New exhibits ignore input for a moment (so keys meant for old exhibits don't count).
async function waitReady() {
  for (let k = 0; k < 100 && !(await js("performance.now() >= (window.__GR().inputReadyAt || 0)")); k++) await sleep(25);
}

// Answer the audit that is on screen correctly, via the next input method.
async function answerCorrectly() {
  await waitReady();
  const s = await screen();
  const ans = solveFromScreen(s.rule, s.digits);
  ruleCounts[s.rule] = (ruleCounts[s.rule] || 0) + 1;
  ruleSequence.push(s.rule);
  check(typeof ans === "number", `rule "${s.rule}" on [${s.digits}] has a single answer (got ${ans})`);
  check(s.digits.length === 5, `audit shows 5 exhibits (got ${s.digits.length})`);
  const method = methods[methodIx++ % methods.length];
  const before = await js(`(() => { const S = window.__GR(); return { slot: S.auditSlot, row: S.earned[S.round].slice(), answered: S.answered[S.round] }; })()`);
  check(before.slot === before.answered % 4, `audit targets slot A0${before.answered % 4 + 1} (oldest first)`);
  await enterDigit(ans, method);
  await sleep(150);
  const after = await screen();
  const row = await js(`window.__GR().earned[window.__GR().round].slice()`);
  const expected = before.row.slice(); expected[before.slot] = ans;
  const ok = JSON.stringify(row) === JSON.stringify(expected) && after.strikes === s.strikes;
  check(ok, `answer ${ans} for "${s.rule}" [${s.digits}] via ${method} was accepted into A0${before.slot + 1} (row ${JSON.stringify(row)}, feedback: ${after.feedback})`);
  await waitMode(["maze", "exit"], 3000);
}

// Walk the shortest route to the exit, answering audits as they appear.
async function playLeg() {
  for (let guard = 0; guard < 2000; guard++) {
    const mode = await js("window.__GR().mode");
    if (mode === "exit" || mode === "failed" || mode === "closed") return mode;
    if (mode === "audit") {
      if (await js("window.__GR().auditLocked")) { await sleep(100); continue; }
      await answerCorrectly();
      continue;
    }
    if (mode !== "maze") { await sleep(100); continue; }
    const step = await js(`(() => { const S = window.__GR(), m = S.maze;
      if (S.pos.x === m.exit.x && S.pos.y === m.exit.y) return null;
      const dirs = [[0,-1,1,"ArrowUp"],[1,0,2,"ArrowRight"],[0,1,4,"ArrowDown"],[-1,0,8,"ArrowLeft"]];
      const prev = {}; const q = [[m.exit.x, m.exit.y]]; prev[m.exit.x+","+m.exit.y] = true;
      while (q.length) { const [x,y] = q.shift();
        for (const [dx,dy,b] of dirs) { if (m.cells[y][x] & b) continue; const k=(x+dx)+","+(y+dy); if (prev[k]) continue; prev[k]=[x,y]; q.push([x+dx,y+dy]); } }
      const nxt = prev[S.pos.x+","+S.pos.y];
      const d = dirs.find(([dx,dy]) => S.pos.x+dx === nxt[0] && S.pos.y+dy === nxt[1]);
      return d[3]; })()`);
    if (step) await arrow(step);
    await sleep(step ? 40 : 150);
  }
  return "timeout";
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: pageUrl });
  await sleep(1200);

  // A fresh case on the test page (no practice), whatever the previous section left open.
  const fresh = async () => {
    if (!(await js("location.search.includes('skippractice')"))) { await send("Page.navigate", { url: pageUrl }); await sleep(1000); }
    await js(`window.confirm = () => true; document.getElementById("btn-reset").click(); document.getElementById("btn-begin").click()`);
  };

  if (want(1)) {
  console.log("1. Full mission with every input method");
  await fresh();
  const legs = await js("window.GETAWAY_CONFIG.rounds");
  for (let r = 0; r < legs; r++) {
    const res = await playLeg();
    check(res === "exit", `leg ${r + 1} reaches the exit (got ${res})`);
    if (r < legs - 1) {
      await press("Enter", "Enter", 13, "\r");
      await sleep(300);
      check((await js("window.__GR().round")) === r + 1, `Enter starts leg ${r + 2}`);
    }
  }
  const code = await js(`window.__GR().code.join("")`);
  const shown = await js(`window.__GR().earned.map(r => r.join(""))`);
  check(shown.every((row, r) => row === code.slice(r * 5, r * 5 + 4)), "register digits match the code");
  const boxes = await js(`document.querySelectorAll("#code-display .cd-box").length`);
  check(boxes === code.length, `final screen shows ${code.length} boxes (got ${boxes})`);
  // wrong code first, then the right one via the numpad with NumLock off
  for (const ch of "0".repeat(code.length)) await enterDigit(ch, "row");
  await press("Enter", "Enter", 13, "\r");
  await sleep(700);
  check((await js("window.__GR().mode")) === "exit", "wrong final code is rejected");
  for (const ch of code) await enterDigit(ch, "numlock-off");
  await press("Enter", "NumpadEnter", 13, "\r");
  await sleep(500);
  check((await js("window.__GR().mode")) === "closed", "correct final code closes the case");
  const charts = await js(`({ legs: document.querySelectorAll("#chart-legs .ch-dot").length, audits: document.querySelectorAll("#chart-audits .ch-audit").length, logged: window.__GR().auditLog.length, count: document.getElementById("chart-audit-count").textContent })`);
  check(charts.legs === legs, `Case Closed shows one point per leg (${charts.legs})`);
  check(charts.audits === charts.logged && charts.audits > 0 && charts.count.includes(charts.logged + " PLAYED"), `Case Closed shows every audit played: ${JSON.stringify(charts)}`);
  }

  if (want(2)) {
  console.log("2. Three strikes restart only the current leg");
  await fresh();
  check((await playLeg()) === "exit", "leg 1 completed");
  const leg1 = await js(`window.__GR().earned[0].join("")`);
  await press("Enter", "Enter", 13, "\r");
  await sleep(300);
  for (let k = 1; k <= 3; k++) {
    check((await waitMode(["audit"])) === "audit", "audit appears");
    while (await js("window.__GR().auditLocked")) await sleep(80);
    const s = await screen();
    const wrong = (solveFromScreen(s.rule, s.digits) + 1) % 10;
    await waitReady();
    await enterDigit(wrong, methods[k % methods.length]);
    await sleep(150);
    check((await js("window.__GR().strikes")) === k, `strike ${k} recorded`);
    check((await js("window.__GR().earned[1].length")) === 0, "no digit for a wrong answer");
  }
  check((await waitMode(["failed"], 3000)) === "failed", "3 strikes stop the leg");
  const mazeBefore = await js(`JSON.stringify(window.__GR().maze.cells)`);
  await press("Enter", "Enter", 13, "\r");
  await sleep(300);
  const after = await js(`(() => { const S = window.__GR(); return { mode: S.mode, round: S.round, strikes: S.strikes, leg1: S.earned[0].join(""), leg2: S.earned[1].length, mark1: S.revealed[0], maze: JSON.stringify(S.maze.cells), pos: S.pos, start: S.maze.start }; })()`);
  check(after.mode === "maze" && after.round === 1, "restart stays on leg 2 (not the whole mission)");
  check(after.leg1 === leg1 && after.mark1, "leg 1 digits and mark are kept");
  check(after.leg2 === 0 && after.strikes === 0, "leg 2 register and strikes are cleared");
  check(after.maze !== mazeBefore && after.pos.x === after.start.x && after.pos.y === after.start.y, "leg 2 gets a new maze from its start");
  }

  if (want(3)) {
  console.log("3. Route errors: wall hits, doubling back, and the maze rescramble");
  await fresh();
  await sleep(300);
  await js(`window.__GR().sinceAudit = -1e9`); // keep audits away during this test
  const wallDir = await js(`(() => { const S = window.__GR(); const c = S.maze.cells[S.pos.y][S.pos.x];
    return [[1,"ArrowUp"],[2,"ArrowRight"],[4,"ArrowDown"],[8,"ArrowLeft"]].find(([b]) => c & b)[1]; })()`);
  await arrow(wallDir);
  await sleep(50);
  check((await js("window.__GR().route.errors")) === 1, "a wall hit is a route error");
  const fx = await js(`({ glitch: document.getElementById("crt").classList.contains("glitch"), shake: document.querySelector(".crt-housing").classList.contains("shake-hard"), red: window.__GR().alertUntil > performance.now() })`);
  check(fx.glitch && fx.shake && fx.red, "a route error glitches the screen, shakes the console and turns the walls red: " + JSON.stringify(fx));
  await sleep(1100);
  check(!(await js(`document.getElementById("crt").classList.contains("glitch")`)) && !(await js("window.__GR().alertUntil > performance.now()")), "the alarm effects clear after about a second");
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: wallDir, code: wallDir, windowsVirtualKeyCode: ARROWS[wallDir], autoRepeat: true });
  await sleep(50);
  check((await js("window.__GR().route.errors")) === 1, "holding a key against a wall is not counted again");
  const openDir = await js(`(() => { const S = window.__GR(); const c = S.maze.cells[S.pos.y][S.pos.x];
    const back = { ArrowUp: "ArrowDown", ArrowDown: "ArrowUp", ArrowLeft: "ArrowRight", ArrowRight: "ArrowLeft" };
    const go = [[1,"ArrowUp"],[2,"ArrowRight"],[4,"ArrowDown"],[8,"ArrowLeft"]].find(([b]) => !(c & b))[1];
    return [go, back[go]]; })()`);
  await arrow(openDir[0]); await sleep(50);
  await arrow(openDir[1]); await sleep(50);
  check((await js("window.__GR().route.errors")) === 2, "doubling back is a route error");
  const mazeBefore = await js(`JSON.stringify(window.__GR().maze.cells)`);
  const limit = await js("window.__GR().route.limit");
  for (let i = (await js("window.__GR().route.errors")); i < limit; i++) { await arrow(wallDir); await sleep(30); }
  check((await js("window.__GR().mode")) === "scramble", "hitting the limit scrambles the maze");
  await waitMode(["maze"], 4000);
  check((await js(`JSON.stringify(window.__GR().maze.cells)`)) !== mazeBefore, "a new maze is generated");
  check((await js("window.__GR().route.errors")) === 0, "route errors reset after the rescramble");
  }

  if (want(4)) {
  console.log("4. Stress: 64 more audits answered from the screen, rules dealt like a deck");
  await fresh();
  ruleSequence.length = 0;
  for (let n = 0; n < 64; n++) {
    await js(`(() => { const S = window.__GR(); S.sinceAudit = 1e9; })()`);
    if ((await waitMode(["audit"], 3000)) !== "audit") { check(false, "stress audit " + n + " appeared"); break; }
    while (await js("window.__GR().auditLocked")) await sleep(50);
    await answerCorrectly();
  }

  // The deck may be part-way through a cycle when this section starts, so find the
  // offset where cycles begin; every full cycle after it must use all 8 rules once.
  const aligned = [0, 1, 2, 3, 4, 5, 6, 7].find((o) => {
    for (let k = o; k + 8 <= ruleSequence.length; k += 8) if (new Set(ruleSequence.slice(k, k + 8)).size !== 8) return false;
    return new Set(ruleSequence.slice(0, o)).size === o; // the partial cycle before it has no repeats either
  });
  check(aligned !== undefined, "rules are dealt in full cycles with no repeats: " + ruleSequence.join(", "));
  }

  if (want(5)) {
  console.log("5. Popup pacing: gaps stay inside the configured range");
  await fresh();
  const range = [1.5, 3]; // demo-mode range set in js/app.js
  for (let k = 0; k < 4; k++) { // 4 audits per leg
    const t0 = Date.now();
    if ((await waitMode(["audit"], 6000)) !== "audit") { check(false, "audit appeared: " + JSON.stringify(await js(`(() => { const S = window.__GR(); return { mode: S.mode, since: S.sinceAudit, next: S.nextAuditIn, earned: S.earned, round: S.round }; })()`))); break; }
    const gap = (Date.now() - t0) / 1000;
    check(gap >= range[0] - 0.15 && gap <= range[1] + 0.4, `gap ${gap.toFixed(2)} s is within ${range[0]}-${range[1]} s`);
    while (await js("window.__GR().auditLocked")) await sleep(50);
    await answerCorrectly();
    if ((await js("window.__GR().mode")) !== "maze") break;
  }
  }

  if (want(6)) {
  console.log("6. Audit clock: running out of time is a strike");
  await fresh();
  check((await waitMode(["audit"])) === "audit", "audit appears");
  const limit = await js("window.GETAWAY_CONFIG.auditTimeLimitSeconds");
  const shownBar = await js(`!document.getElementById("audit-timer").classList.contains("hidden")`);
  check(shownBar, "the countdown bar is visible");
  await sleep(limit * 1000 - 1200);
  check((await js("window.__GR().strikes")) === 0, "no strike before the time is up");
  await sleep(1600);
  check((await js("window.__GR().strikes")) === 1, "a strike when the time runs out");
  check(/TIME'S UP/.test(await js(`document.getElementById("audit-feedback").textContent`)), "feedback says TIME'S UP");
  }

  if (want(7)) {
  console.log("7. Practice: three explained audits, then the official start");
  await send("Page.navigate", { url: practiceUrl });
  await sleep(1200);
  await js(`document.getElementById("btn-begin").click()`);
  const n = await js("window.GETAWAY_CONFIG.practiceAudits");
  for (let k = 0; k < n; k++) {
    check((await js("window.__GR().mode")) === "practice", `practice audit ${k + 1} is shown`);
    const s = await screen();
    const ans = solveFromScreen(s.rule, s.digits);
    const timed = await js(`!document.getElementById("audit-timer").classList.contains("hidden")`);
    check(timed === (k === n - 1), `only the last practice audit is timed (audit ${k + 1}: ${timed})`);
    // first one wrong (to see the explanation), the rest right
    await enterDigit(k === 0 ? (ans + 1) % 10 : ans, "row");
    await sleep(150);
    const fb = await js(`document.getElementById("audit-feedback").textContent`);
    check(k === 0 ? /NOT QUITE: the answer is \d/.test(fb) : /CORRECT/.test(fb), `practice feedback ${k + 1}: ${fb.slice(0, 60)}`);
    check(/Exhibit [A-E]/.test(fb), "the explanation names the exhibit");
    check((await js("window.__GR().strikes")) === 0, "practice gives no strikes");
    await press("Enter", "Enter", 13, "\r");
    await sleep(200);
  }
  check((await js("window.__GR().mode")) === "ready", "practice ends on the READY screen");
  check((await js("window.__GR().startedAt")) === null, "the case timer has not started during practice");
  await press("Enter", "Enter", 13, "\r");
  await sleep(200);
  check((await js("window.__GR().mode")) === "maze", "Enter begins the official trace");
  }

  if (want(9)) {
  console.log("9. Answer timing: a key meant for the old exhibits never counts against the new ones");
  // Real bug: after a wrong answer the old exhibits stayed on screen until the new
  // audit swapped in. A player who then typed the right answer for what they could
  // see was judged against the NEW exhibits they hadn't seen yet: a false strike.
  await fresh();
  let tried = 0;
  for (let round = 0; round < 6 && tried < 3; round++) {
    if ((await waitMode(["audit"], 8000)) !== "audit") break;
    while (await js("window.__GR().auditLocked")) await sleep(30);
    const s = await screen();
    const oldAns = solveFromScreen(s.rule, s.digits);
    const strikes0 = await js("window.__GR().strikes");
    if (strikes0 >= 2) break;
    await waitReady();
    await enterDigit((oldAns + 1) % 10, "row"); // wrong on purpose
    await sleep(120);
    const marked = await js(`({ closed: document.getElementById("exhibits").classList.contains("resolved"), answer: [...document.querySelectorAll("#exhibits .exhibit.answer .digit")].map(e => e.textContent), why: document.getElementById("audit-feedback").textContent })`);
    check(marked.closed && marked.answer.length >= 1 && marked.answer.every((d) => Number(d) === oldAns), `after a miss the old exhibits are closed and the right one (${oldAns}) is highlighted: ${JSON.stringify(marked.answer)}`);
    check(new RegExp("ANSWER: " + oldAns).test(marked.why), "the feedback states the right answer and why");
    // wait for the new exhibits, then immediately type the OLD answer, like a player reacting to the stale screen
    const oldDigits = JSON.stringify(s.digits);
    for (let k = 0; k < 400 && (await js("JSON.stringify(window.__GR().audit.digits)")) === oldDigits; k++) await sleep(10);
    const newAns = await js("window.__GR().audit.answer");
    if (newAns === oldAns) { await waitReady(); await enterDigit(newAns, "row"); await sleep(800); continue; }
    await enterDigit(oldAns, "numpad");
    await sleep(60);
    tried++;
    check((await js("window.__GR().strikes")) === strikes0 + 1, `a key pressed right as new exhibits appear is not judged against them (strikes ${await js("window.__GR().strikes")}, expected ${strikes0 + 1})`);
    // and the new audit still accepts its correct answer afterwards
    await sleep(500);
    await enterDigit(newAns, "click");
    await sleep(150);
    check((await js("window.__GR().strikes")) === strikes0 + 1 && (await js("window.__GR().auditLocked")), "the correct answer for the new exhibits is accepted");
    await waitMode(["maze"], 3000);
  }
  check(tried > 0, "the timing case was exercised");
  }

  if (want(10)) {
  console.log("10. Reaching the exit early: the remaining audits come back to back");
  await fresh();
  await js("window.__GR().nextAuditIn = 1e12"); // no audits on the way to the exit
  // walk the shortest route to the exit without answering anything
  for (let guard = 0; guard < 500; guard++) {
    const st = await js(`(() => { const S = window.__GR(), m = S.maze;
      if (S.pos.x === m.exit.x && S.pos.y === m.exit.y) return "here";
      const dirs = [[0,-1,1,"ArrowUp"],[1,0,2,"ArrowRight"],[0,1,4,"ArrowDown"],[-1,0,8,"ArrowLeft"]];
      const prev = {}; const q = [[m.exit.x, m.exit.y]]; prev[m.exit.x+","+m.exit.y] = true;
      while (q.length) { const [x,y] = q.shift();
        for (const [dx,dy,b] of dirs) { if (m.cells[y][x] & b) continue; const k=(x+dx)+","+(y+dy); if (prev[k]) continue; prev[k]=[x,y]; q.push([x+dx,y+dy]); } }
      const nxt = prev[S.pos.x+","+S.pos.y];
      return dirs.find(([dx,dy]) => S.pos.x+dx === nxt[0] && S.pos.y+dy === nxt[1])[3]; })()`);
    if (st === "here") break;
    await arrow(st);
    await sleep(30);
  }
  check((await js("window.__GR().earned[0].length")) < 4 && (await js("window.__GR().rush")), "reached the sealed exit with audits still to do");
  const rushGap = await js("window.GETAWAY_CONFIG.rushGapSeconds[1]");
  let gaps = [];
  for (let k = 0; k < 4 && (await js("window.__GR().mode")) !== "exit"; k++) {
    const t0 = Date.now();
    if ((await waitMode(["audit", "exit"], 5000)) !== "audit") break;
    gaps.push((Date.now() - t0) / 1000);
    await answerCorrectly();
  }
  check(gaps.length >= 3, "the remaining audits all appeared (" + gaps.length + ")");
  // each gap = the short pause after the "verified" message closes; allow for test overhead
  check(gaps.every((g) => g <= rushGap + 0.6), "audits come back to back: gaps " + gaps.map((g) => g.toFixed(2)).join(", ") + " s");
  check((await waitMode(["exit"], 3000)) === "exit", "the exit opens once the last audit is answered");
  }

  // The access code is not stored in this public repo: set GR_SETUP_CODE to run section 8.
  const setupCode = process.env.GR_SETUP_CODE;
  if (want(8) && !setupCode) console.log("8. Facilitator setup: SKIPPED (set GR_SETUP_CODE to the access code to run it)");
  if (want(8) && setupCode) {
  console.log("8. Facilitator setup: password, pause, save and reset");
  await send("Page.navigate", { url: pageUrl });
  await sleep(1000);
  await fresh();
  const defaults = await js("({ rounds: window.GETAWAY_CONFIG.rounds, clock: window.GETAWAY_CONFIG.auditTimeLimitSeconds })");
  await js(`document.getElementById("btn-setup").click()`);
  await sleep(100);
  const since0 = await js("window.__GR().sinceAudit");
  await sleep(600);
  check((await js("window.__GR().sinceAudit")) === since0, "the game is paused while setup is open");
  await js(`document.getElementById("set-pass").value = "wrong"; document.getElementById("set-unlock").click()`);
  check(/ACCESS DENIED/.test(await js(`document.getElementById("set-lock-msg").textContent`)), "a wrong password is refused");
  check(await js(`document.getElementById("set-body").classList.contains("hidden")`), "settings stay hidden");
  await js(`document.getElementById("set-pass").value = ${JSON.stringify(setupCode)}; document.getElementById("set-unlock").click()`);
  check(!(await js(`document.getElementById("set-body").classList.contains("hidden")`)), "the right password opens the settings");
  const fields = await js(`document.querySelectorAll("#set-fields .set-row").length`);
  check(fields >= 20, `every setting has a field (${fields})`);
  await js(`document.getElementById("set-mazeWidth").value = "200"; document.getElementById("set-save").click()`);
  check(/from 5 to 60/.test(await js(`document.getElementById("set-msg").textContent`)), "an out-of-range value is rejected");
  await js(`document.getElementById("set-mazeWidth").value = "12"; document.getElementById("set-rounds").value = "2"; document.getElementById("set-auditTimeLimitSeconds").value = "0"; document.getElementById("set-save").click()`);
  await sleep(1500);
  const after = await js("({ rounds: window.GETAWAY_CONFIG.rounds, clock: window.GETAWAY_CONFIG.auditTimeLimitSeconds, w: window.GETAWAY_CONFIG.mazeWidth })");
  check(after.rounds === 2 && after.clock === 0 && after.w === 12, "saved settings apply after the restart: " + JSON.stringify(after));
  check((await js(`document.getElementById("intro-rounds").textContent`)) === "2", "the briefing shows the new leg count");
  await js(`window.confirm = () => true; document.getElementById("btn-setup").click(); document.getElementById("set-pass").value = ${JSON.stringify(setupCode)}; document.getElementById("set-unlock").click(); document.getElementById("set-reset").click()`);
  await sleep(1500);
  const reset = await js("({ rounds: window.GETAWAY_CONFIG.rounds, clock: window.GETAWAY_CONFIG.auditTimeLimitSeconds })");
  check(JSON.stringify(reset) === JSON.stringify(defaults), "reset restores the defaults");
  }

  check(pageErrors.length === 0, "no errors in the page (sound, input, drawing): " + pageErrors.slice(0, 3).join(" | "));
  console.log("\nRules seen: " + JSON.stringify(ruleCounts));
} catch (err) {
  failures++;
  console.log("  ERROR: " + err.message);
} finally {
  ws.close();
  browser.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(`\n${passes} checks passed, ${failures} failed`);
clearTimeout(watchdog);
process.exit(failures ? 1 : 0);
