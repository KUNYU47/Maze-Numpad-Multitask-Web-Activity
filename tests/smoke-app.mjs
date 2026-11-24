// Smoke test for a packaged app: launch it, check the game page loads and starts.
// Usage: node tests/smoke-app.mjs "<path to the app executable>"
import { spawn } from "node:child_process";
const [,, exe] = process.argv;
const app = spawn(exe, ["--remote-debugging-port=9335"], { stdio: "ignore" });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let t;
for (let i = 0; i < 120; i++) { try { t = (await (await fetch("http://127.0.0.1:9335/json")).json()).find(x => x.type === "page"); if (t) break; } catch {} await sleep(500); }
if (!t) { console.log("FAIL: no window/page"); app.kill(); process.exit(1); }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener("open", r));
let id = 0; const pend = new Map(); ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await sleep(1500);
const r = await send("Runtime.evaluate", { expression: `JSON.stringify({ title: document.title, url: location.protocol, settings: !!window.GR_SETTINGS, maze: !!window.GR_MAZE, cfgRounds: window.GETAWAY_CONFIG.rounds, canvas: document.getElementById("maze").width, gear: !!document.getElementById("btn-setup") })`, returnByValue: true });
const info = JSON.parse(r.result.result.value);
console.log(JSON.stringify(info));
await send("Runtime.evaluate", { expression: `document.getElementById("btn-begin").click()` });
await sleep(500);
const r2 = await send("Runtime.evaluate", { expression: `document.getElementById("crt-status").textContent`, returnByValue: true });
const status = r2.result.result.value;
console.log("status after start:", status);
ws.close(); app.kill();
const ok = info.settings && info.maze && info.gear && info.canvas > 0 && /PRACTICE|TRACKING/.test(status);
console.log(ok ? "SMOKE OK" : "SMOKE FAILED");
process.exit(ok ? 0 : 1);
