/* Facilitator settings panel (gear button, password protected).
 * Saved settings are stored on this computer (localStorage) and override js/config.js.
 * The password only keeps players out of the panel; it is not real security.
 */
(function () {
  const STORE = "gr-config-overrides";
  const DEFAULTS = JSON.parse(JSON.stringify(window.GETAWAY_CONFIG));

  // ---- apply saved overrides before the game reads the config ----
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { saved = {}; }
  Object.assign(window.GETAWAY_CONFIG, saved);

  // FNV-1a hash, so the password isn't sitting in the page as plain text.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }
  const PASS_HASH = "be3380fd";

  // ---- the settings, grouped like js/config.js ----
  const FIELDS = [
    { group: "Mission" },
    { key: "rounds", label: "Legs (mazes) per mission", type: "int", min: 1, max: 6 },
    { key: "auditsPerRound", label: "Audit digits per leg", type: "int", min: 1, max: 8 },
    { key: "fixedCode", label: "Fixed case code (blank = random every run)", type: "code" },
    { key: "maxStrikes", label: "Strikes per leg before the leg restarts", type: "int", min: 1, max: 10 },
    { group: "Maze" },
    { key: "mazeWidth", label: "Maze width (cells)", type: "int", min: 5, max: 60 },
    { key: "mazeHeight", label: "Maze height (cells)", type: "int", min: 5, max: 40 },
    { key: "mazeBranching", label: "Branching (0 = long corridors, 1 = many dead ends)", type: "num", min: 0, max: 1, step: 0.05 },
    { key: "routeErrorLimit", label: "Route errors before the maze scrambles (0 = off)", type: "int", min: 0, max: 50 },
    { key: "penalizeWallHits", label: "Wall hits count as route errors", type: "bool" },
    { key: "penalizeBacktracking", label: "Doubling back counts as a route error", type: "bool" },
    { group: "Audits" },
    { key: "auditGapSeconds", label: "Seconds between popups (min / max)", type: "range", min: 1, max: 120, step: 0.5 },
    { key: "rushGapSeconds", label: "Pause between back-to-back audits at a sealed exit (min / max)", type: "range", min: 0, max: 30, step: 0.1 },
    { key: "auditTimeLimitSeconds", label: "Seconds to answer each audit (0 = no clock)", type: "num", min: 0, max: 60, step: 0.5 },
    { key: "auditExhibits", label: "Exhibit digits per audit", type: "select", options: [3, 5, 7] },
    { key: "practiceAudits", label: "Practice audits before the start (0 = none)", type: "int", min: 0, max: 10 },
    { group: "Old Case Key" },
    { key: "caseKey", label: "Symbol numbers (each digit 0-9 once)", type: "casekey" },
    { key: "shuffleCaseKey", label: "Shuffle the key every run", type: "bool" },
    { group: "Text and sound" },
    { key: "successMessage", label: "Case Closed message (clue for the next puzzle)", type: "text" },
    { key: "failMessage", label: "Leg Scrubbed message", type: "text" },
    { key: "sound", label: "Sound on at start", type: "bool" }
  ];

  // ---- DOM ----
  const root = document.createElement("div");
  root.id = "settings";
  root.className = "settings-overlay hidden";
  root.innerHTML =
    '<div class="settings-device">' +
    '  <div class="settings-head"><span class="lamp amber on"></span><span>FACILITATOR SETUP</span>' +
    '    <button class="key small" id="set-close" title="Close">CLOSE</button></div>' +
    '  <form id="set-lock" class="set-lock" autocomplete="off">' +
    '    <p>Restricted to the case facilitator. Enter the access code.</p>' +
    '    <input type="password" id="set-pass" class="set-input" placeholder="ACCESS CODE" aria-label="Access code">' +
    '    <button type="submit" class="key orange" id="set-unlock">UNLOCK</button>' +
    '    <div id="set-lock-msg" class="set-msg">&nbsp;</div>' +
    "  </form>" +
    '  <div id="set-body" class="set-body hidden">' +
    '    <div id="set-fields" class="set-fields"></div>' +
    '    <div id="set-msg" class="set-msg">&nbsp;</div>' +
    '    <div class="set-actions">' +
    '      <button class="key" id="set-reset">RESET TO DEFAULTS</button>' +
    '      <button class="key orange" id="set-save">SAVE &amp; START NEW CASE</button>' +
    "    </div>" +
    '    <p class="set-foot">Settings are saved on this computer and start a fresh case. Defaults come from js/config.js.</p>' +
    "  </div>" +
    "</div>";
  document.getElementById("console").appendChild(root);
  const $ = (id) => document.getElementById(id);

  const current = () => window.GETAWAY_CONFIG;

  function fieldHtml(f) {
    const v = current()[f.key];
    const id = "set-" + f.key;
    const attrs = (x) => ' min="' + x.min + '" max="' + x.max + '" step="' + (x.step || 1) + '"';
    let input = "";
    if (f.type === "int" || f.type === "num") input = '<input class="set-input num" type="number" id="' + id + '"' + attrs(f) + ' value="' + v + '">';
    else if (f.type === "bool") input = '<label class="set-switch"><input type="checkbox" id="' + id + '"' + (v ? " checked" : "") + "><span></span></label>";
    else if (f.type === "code") input = '<input class="set-input" type="text" inputmode="numeric" id="' + id + '" value="' + (v == null ? "" : v) + '" placeholder="random">';
    else if (f.type === "text") input = '<textarea class="set-input" id="' + id + '" rows="2">' + String(v || "").replace(/</g, "&lt;") + "</textarea>";
    else if (f.type === "select") input = '<select class="set-input num" id="' + id + '">' + f.options.map((o) => "<option" + (o === v ? " selected" : "") + ">" + o + "</option>").join("") + "</select>";
    else if (f.type === "range") input =
      '<span class="set-pair"><input class="set-input num" type="number" id="' + id + '-a"' + attrs(f) + ' value="' + v[0] + '"> / ' +
      '<input class="set-input num" type="number" id="' + id + '-b"' + attrs(f) + ' value="' + v[1] + '"></span>';
    else if (f.type === "casekey") input = '<span class="set-key">' + Object.keys(v).map((name) =>
      '<span class="set-key-cell">' + window.GR_SYMBOLS.svg(name) + '<input class="set-input num" type="number" min="0" max="9" id="' + id + "-" + name + '" value="' + v[name] + '"></span>').join("") + "</span>";
    const wide = f.type === "text" || f.type === "casekey" ? " wide" : "";
    return '<div class="set-row' + wide + '"><label for="' + id + '">' + f.label + "</label>" + input + "</div>";
  }

  function render() {
    $("set-fields").innerHTML = FIELDS.map((f) => (f.group ? '<div class="set-group">' + f.group.toUpperCase() + "</div>" : fieldHtml(f))).join("");
  }

  // Read the form; returns { values } or { error }.
  function read() {
    const out = {};
    for (const f of FIELDS) {
      if (f.group) continue;
      const id = "set-" + f.key;
      if (f.type === "int" || f.type === "num") {
        const n = Number($(id).value);
        if (!Number.isFinite(n) || n < f.min || n > f.max || (f.type === "int" && !Number.isInteger(n)))
          return { error: f.label + ": enter " + (f.type === "int" ? "a whole number" : "a number") + " from " + f.min + " to " + f.max + "." };
        out[f.key] = n;
      } else if (f.type === "bool") out[f.key] = $(id).checked;
      else if (f.type === "select") out[f.key] = Number($(id).value);
      else if (f.type === "text") out[f.key] = $(id).value.trim();
      else if (f.type === "code") out[f.key] = $(id).value.trim() || null;
      else if (f.type === "range") {
        const a = Number($(id + "-a").value), b = Number($(id + "-b").value);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a < f.min || b > f.max || a > b)
          return { error: f.label + ": min must be at most max, between " + f.min + " and " + f.max + "." };
        out[f.key] = [a, b];
      } else if (f.type === "casekey") {
        const key = {};
        for (const name of Object.keys(current().caseKey)) key[name] = Number($(id + "-" + name).value);
        const vals = Object.values(key);
        if (vals.some((x) => !Number.isInteger(x) || x < 0 || x > 9) || new Set(vals).size !== 10)
          return { error: "Old Case Key: use each digit 0-9 exactly once." };
        out[f.key] = key;
      }
    }
    if (out.fixedCode !== null) {
      const len = out.rounds * (out.auditsPerRound + 1);
      if (!/^\d+$/.test(out.fixedCode) || out.fixedCode.length !== len)
        return { error: "Fixed case code: digits only, exactly " + len + " long for these legs (or leave it blank)." };
    }
    return { values: out };
  }

  function msg(el, text, bad) {
    el.textContent = text || " ";
    el.className = "set-msg" + (bad ? " bad" : " ok");
  }

  function open() {
    root.classList.remove("hidden");
    $("set-lock").classList.remove("hidden");
    $("set-body").classList.add("hidden");
    $("set-pass").value = "";
    msg($("set-lock-msg"), "");
    document.dispatchEvent(new CustomEvent("gr-settings", { detail: { open: true } }));
    setTimeout(() => $("set-pass").focus(), 30);
  }
  function close() {
    root.classList.add("hidden");
    document.dispatchEvent(new CustomEvent("gr-settings", { detail: { open: false } }));
  }
  function restart() {
    // A fresh page load re-reads every setting (maze size, legs, ...).
    location.reload();
  }

  $("set-lock").addEventListener("submit", (e) => {
    e.preventDefault();
    if (hash($("set-pass").value.trim().toLowerCase()) === PASS_HASH) {
      $("set-lock").classList.add("hidden");
      $("set-body").classList.remove("hidden");
      render();
      msg($("set-msg"), "");
    } else {
      msg($("set-lock-msg"), "ACCESS DENIED", true);
      window.GR_SOUND && window.GR_SOUND.wrong();
      $("set-pass").select();
    }
  });
  $("set-save").addEventListener("click", () => {
    const r = read();
    if (r.error) return msg($("set-msg"), r.error, true);
    // store only what differs from js/config.js
    const diff = {};
    for (const k of Object.keys(r.values)) if (JSON.stringify(r.values[k]) !== JSON.stringify(DEFAULTS[k])) diff[k] = r.values[k];
    localStorage.setItem(STORE, JSON.stringify(diff));
    restart();
  });
  $("set-reset").addEventListener("click", () => {
    if (!confirm("Reset every setting to the defaults in js/config.js?")) return;
    localStorage.removeItem(STORE);
    restart();
  });
  $("set-close").addEventListener("click", close);
  root.addEventListener("keydown", (e) => {
    e.stopPropagation(); // typing here never moves the maze or answers audits
    if (e.key === "Escape") close();
  });

  window.GR_SETTINGS = { open, close, isOpen: () => !root.classList.contains("hidden"), hash, saved: () => Object.assign({}, saved) };
})();
