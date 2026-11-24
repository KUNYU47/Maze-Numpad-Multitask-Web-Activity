// End-to-end test: plays the real page in headless Edge/Chrome with real key presses.
// Run with:  node tests/e2e.mjs        (Windows; set BROWSER=path\to\chrome.exe to override)
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
const pageUrl = pathToFileURL(join(root, "index.html")).href + "?demo";
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
  `--user-data-dir=${profile}`, "--no-first-run", "--allow-file-access-from-files", "about:blank"
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
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

async function waitMode(modes, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const m = await js("window.__GR().mode");
    if (modes.includes(m)) return m;
    await sleep(60);
  }
  return null;
}

// Answer the audit that is on screen correctly, via the next input method.
async function answerCorrectly() {
  const s = await screen();
  const ans = solveFromScreen(s.rule, s.digits);
  ruleCounts[s.rule] = (ruleCounts[s.rule] || 0) + 1;
  check(typeof ans === "number", `rule "${s.rule}" on [${s.digits}] has a single answer (got ${ans})`);
  check(s.digits.length === 5, `audit shows 5 exhibits (got ${s.digits.length})`);
  const method = methods[methodIx++ % methods.length];
  const before = s.register.join("").length;
  await enterDigit(ans, method);
  await sleep(150);
  const after = await screen();
  const ok = after.register.join("").length === before + 1 && after.strikes === s.strikes;
  check(ok, `answer ${ans} for "${s.rule}" [${s.digits}] via ${method} was accepted (feedback: ${after.feedback})`);
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
  await send("Page.navigate", { url: pageUrl });
  await sleep(1200);

  console.log("1. Full mission with every input method");
  await js(`document.getElementById("btn-begin").click()`);
  const leg1 = await playLeg();
  check(leg1 === "exit", "leg 1 reaches the exit (got " + leg1 + ")");
  await press("Enter", "Enter", 13, "\r");
  await sleep(300);
  check((await js("window.__GR().round")) === 1, "Enter starts leg 2");
  const leg2 = await playLeg();
  check(leg2 === "exit", "leg 2 reaches the exit (got " + leg2 + ")");
  const code = await js(`window.__GR().code.join("")`);
  const shown = await js(`window.__GR().earned.map(r => r.join(""))`);
  check(shown[0] === code.slice(0, 4) && shown[1] === code.slice(5, 9), "register digits match the code");
  // wrong code first, then the right one via the numpad with NumLock off
  for (const ch of "0000000000") await enterDigit(ch, "row");
  await press("Enter", "Enter", 13, "\r");
  await sleep(700);
  check((await js("window.__GR().mode")) === "exit", "wrong final code is rejected");
  for (const ch of code) await enterDigit(ch, "numlock-off");
  await press("Enter", "NumpadEnter", 13, "\r");
  await sleep(500);
  check((await js("window.__GR().mode")) === "closed", "correct final code closes the case");

  console.log("2. Wrong audit answers give strikes; three strikes fail the mission");
  await js(`document.getElementById("btn-again").click(); document.getElementById("btn-begin").click()`);
  for (let k = 1; k <= 3; k++) {
    check((await waitMode(["audit"])) === "audit", "audit appears");
    while (await js("window.__GR().auditLocked")) await sleep(80);
    const s = await screen();
    const wrong = (solveFromScreen(s.rule, s.digits) + 1) % 10;
    await enterDigit(wrong, methods[k % methods.length]);
    await sleep(150);
    check((await js("window.__GR().strikes")) === k, `strike ${k} recorded`);
    check((await js("window.__GR().earned[0].length")) === 0, "no digit for a wrong answer");
  }
  check((await waitMode(["failed"], 3000)) === "failed", "mission fails after 3 strikes");

  console.log("3. Route errors: wall hits, doubling back, and the maze rescramble");
  await press("Enter", "Enter", 13, "\r"); // restart from the failure screen
  await sleep(300);
  await js(`window.__GR().sinceAudit = -1e9`); // keep audits away during this test
  const wallDir = await js(`(() => { const S = window.__GR(); const c = S.maze.cells[S.pos.y][S.pos.x];
    return (c & 1) ? "ArrowUp" : (c & 8) ? "ArrowLeft" : null; })()`);
  await arrow(wallDir);
  await sleep(50);
  check((await js("window.__GR().route.errors")) === 1, "a wall hit is a route error");
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: wallDir, code: wallDir, windowsVirtualKeyCode: ARROWS[wallDir], autoRepeat: true });
  await sleep(50);
  check((await js("window.__GR().route.errors")) === 1, "holding a key against a wall is not counted again");
  const openDir = await js(`(() => { const S = window.__GR(); const c = S.maze.cells[S.pos.y][S.pos.x];
    return !(c & 2) ? ["ArrowRight","ArrowLeft"] : ["ArrowDown","ArrowUp"]; })()`);
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

  console.log("4. Stress: 60 more audits answered from the screen");
  await js(`window.confirm = () => true; document.getElementById("btn-reset").click(); document.getElementById("btn-begin").click()`);
  for (let n = 0; n < 60; n++) {
    await js(`(() => { const S = window.__GR(); S.earned[S.round].length = 0; S.sinceAudit = 1e9; })()`);
    if ((await waitMode(["audit"], 3000)) !== "audit") { check(false, "stress audit " + n + " appeared"); break; }
    while (await js("window.__GR().auditLocked")) await sleep(50);
    await answerCorrectly();
  }

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
