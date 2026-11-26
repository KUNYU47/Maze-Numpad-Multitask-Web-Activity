/* Small SVG bar charts for the Case Closed screen (no libraries, works offline).
 * Works in the browser (window.GR_CHARTS) and in Node (module.exports) for tests.
 */
(function (root) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmtSec = (ms) => (ms / 1000 < 60 ? (ms / 1000).toFixed(1) + " s" : Math.floor(ms / 60000) + ":" + String(Math.round((ms % 60000) / 1000)).padStart(2, "0"));
  const fmtClock = (ms) => Math.floor(ms / 60000) + ":" + String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");

  // "Nice" axis maximum and 3-4 tick values.
  function ticks(max) {
    const raw = Math.max(max, 1) / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const top = Math.ceil(max / step) * step || step;
    const out = [];
    for (let v = 0; v <= top + 1e-9; v += step) out.push(v);
    return { top, values: out };
  }

  // Rounded-top bar anchored to the baseline (4 px data end, square at the base).
  function bar(x, y, w, h, cls, title) {
    if (h <= 0) h = 1;
    const r = Math.min(4, w / 2, h);
    const d = "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
      "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
    return '<path class="' + cls + '" d="' + d + '"><title>' + esc(title) + "</title></path>";
  }

  function frame(W, H, pad, t, unitFmt) {
    let g = "";
    t.values.forEach((v) => {
      const y = pad.t + (H - pad.t - pad.b) * (1 - v / t.top);
      g += '<line class="ch-grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="ch-axis" x="' + (pad.l - 6) + '" y="' + (y + 3.5) + '" text-anchor="end">' + unitFmt(v) + "</text>";
    });
    return g;
  }

  // Chart 1: time to solve each leg (ms), as a line. restarts[i] = how often leg i was restarted.
  function legChart(legMs, restarts, opts) {
    const o = Object.assign({ width: 300, height: 150 }, opts || {});
    const W = o.width, H = o.height, pad = { t: 20, r: 18, b: 22, l: 40 };
    const t = ticks(Math.max(...legMs, 1) / 1000);
    const n = Math.max(legMs.length, 1);
    const xOf = (i) => (n === 1 ? (pad.l + W - pad.r) / 2 : pad.l + 14 + ((W - pad.l - pad.r - 28) * i) / (n - 1));
    const yOf = (ms) => pad.t + (H - pad.t - pad.b) * (1 - ms / 1000 / t.top);
    let svg = frame(W, H, pad, t, (v) => fmtClock(v * 1000));
    svg += '<line class="ch-base" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + (H - pad.b) + '" y2="' + (H - pad.b) + '"/>';
    const pts = legMs.map((ms, i) => [xOf(i), yOf(ms)]);
    if (pts.length > 1) svg += '<polyline class="ch-line" points="' + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") + '"/>';
    legMs.forEach((ms, i) => {
      const [x, y] = pts[i];
      const rs = (restarts && restarts[i]) || 0;
      const title = "Leg " + (i + 1) + ": " + fmtClock(ms) + (rs ? " (" + rs + " restart" + (rs > 1 ? "s" : "") + ")" : "");
      svg += '<g class="ch-pt"><circle class="ch-hit" cx="' + x + '" cy="' + y + '" r="12"/><circle class="ch-dot" cx="' + x + '" cy="' + y + '" r="4.5"/><title>' + esc(title) + "</title></g>";
      svg += '<text class="ch-val" x="' + x + '" y="' + (y - 9) + '" text-anchor="middle">' + fmtClock(ms) + (rs ? " ↻" + rs : "") + "</text>";
      svg += '<text class="ch-axis" x="' + x + '" y="' + (H - 7) + '" text-anchor="middle">L' + (i + 1) + "</text>";
    });
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Solve time per leg">' + svg + "</svg>";
  }

  // Chart 2: time for each audit in order. audits = [{ leg, ms, verdict: correct|wrong|timeout }].
  function auditChart(audits, opts) {
    const o = Object.assign({ width: 300, height: 150, limitSec: 0 }, opts || {});
    const W = o.width, H = o.height, pad = { t: 14, r: 8, b: 22, l: 40 };
    const maxSec = Math.max(o.limitSec || 0, ...audits.map((a) => a.ms / 1000), 1);
    const t = ticks(maxSec);
    const n = Math.max(audits.length, 1);
    const slot = (W - pad.l - pad.r) / n;
    const gap = slot > 6 ? 2 : 1;
    const bw = Math.max(1.5, slot - gap);
    const yOf = (sec) => pad.t + (H - pad.t - pad.b) * (1 - sec / t.top);
    let svg = frame(W, H, pad, t, (v) => v + " s");
    // leg separators
    audits.forEach((a, i) => {
      if (i === 0 || a.leg !== audits[i - 1].leg) {
        const x = pad.l + slot * i;
        if (i > 0) svg += '<line class="ch-sep" x1="' + x + '" x2="' + x + '" y1="' + pad.t + '" y2="' + (H - pad.b) + '"/>';
        svg += '<text class="ch-axis" x="' + (x + 2) + '" y="' + (H - 7) + '">L' + a.leg + "</text>";
      }
    });
    const mark = { wrong: "✕", timeout: "◷" };
    audits.forEach((a, i) => {
      const sec = Math.min(a.ms / 1000, t.top);
      const y = yOf(sec), h = H - pad.b - y;
      const x = pad.l + slot * i + gap / 2;
      svg += bar(x, y, bw, h, "ch-audit " + a.verdict, "Audit " + (i + 1) + " · leg " + a.leg + " · " + fmtSec(a.ms) + " · " + a.verdict);
      if (mark[a.verdict]) svg += '<text class="ch-mark ' + a.verdict + '" x="' + (x + bw / 2) + '" y="' + (y - 3) + '" text-anchor="middle">' + mark[a.verdict] + "</text>";
    });
    if (o.limitSec) {
      const y = yOf(o.limitSec);
      svg += '<line class="ch-limit" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="ch-axis" x="' + (W - pad.r) + '" y="' + (y - 3) + '" text-anchor="end">' + o.limitSec + " s limit</text>";
    }
    svg += '<line class="ch-base" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + (H - pad.b) + '" y2="' + (H - pad.b) + '"/>';
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Time for each audit">' + svg + "</svg>";
  }

  function auditSummary(audits) {
    const c = (v) => audits.filter((a) => a.verdict === v).length;
    const ok = audits.filter((a) => a.verdict === "correct");
    const mean = ok.length ? ok.reduce((s, a) => s + a.ms, 0) / ok.length : 0;
    return { total: audits.length, correct: c("correct"), wrong: c("wrong"), timeout: c("timeout"), meanCorrectMs: mean };
  }

  const api = { legChart, auditChart, auditSummary, fmtClock, fmtSec };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GR_CHARTS = api;
})(typeof window !== "undefined" ? window : globalThis);
