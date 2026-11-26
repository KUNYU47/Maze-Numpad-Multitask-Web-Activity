// Unit tests. Run with:  node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const AUDIT = require("../js/audit.js");
const MAZE = require("../js/maze.js");
const ROUTE = require("../js/route.js");

// ---------------------------------------------------------------------------
// Independent reference answers, written separately from js/audit.js on purpose.
// Returns null when the rule has no single clear answer for these digits.
// ---------------------------------------------------------------------------
function reference(id, d) {
  const allDistinct = new Set(d).size === d.length;
  if (id === "twice") {
    const seen = {};
    for (const x of d) seen[x] = (seen[x] || 0) + 1;
    let pair = null, pairs = 0;
    for (const k in seen) {
      if (seen[k] > 2) return null;
      if (seen[k] === 2) { pairs++; pair = Number(k); }
    }
    return pairs === 1 ? pair : null;
  }
  if (!allDistinct) return null;
  if (id === "highest") { let m = -1; for (const x of d) if (x > m) m = x; return m; }
  if (id === "lowest") { let m = 10; for (const x of d) if (x < m) m = x; return m; }
  if (id === "middle") {
    if (d.length % 2 === 0) return null;
    for (const x of d) {
      let above = 0, below = 0;
      for (const y of d) { if (y > x) above++; if (y < x) below++; }
      if (above === below) return x;
    }
    return null;
  }
  const isEven = (x) => x % 2 === 0;
  const wantEven = id === "lme" || id === "rme";
  const fromLeft = id === "lme" || id === "lmo";
  const idxs = fromLeft ? [...d.keys()] : [...d.keys()].reverse();
  for (const i of idxs) if (isEven(d[i]) === wantEven) return d[i];
  return null;
}

function allTuples(n) {
  const out = [];
  const total = 10 ** n;
  for (let v = 0; v < total; v++) out.push(String(v).padStart(n, "0").split("").map(Number));
  return out;
}

// Small seeded RNG so failures are reproducible.
function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

test("every audit rule matches the reference answer for every 3-digit combination", () => {
  for (const c of AUDIT.CRITERIA) {
    for (const d of allTuples(3)) {
      assert.equal(c.solve(d), reference(c.id, d), `${c.id} on [${d}]`);
    }
  }
});

test("every audit rule matches the reference answer for every 5-digit combination", () => {
  const tuples = allTuples(5);
  for (const c of AUDIT.CRITERIA) {
    for (const d of tuples) {
      const got = c.solve(d), want = reference(c.id, d);
      if (got !== want) assert.fail(`${c.id} on [${d}]: got ${got}, expected ${want}`);
    }
  }
});

test("middle value is by size, not by position", () => {
  const middle = AUDIT.CRITERIA.find((c) => c.id === "middle");
  assert.equal(middle.solve([9, 1, 5]), 5);       // middle exhibit is 1, but middle value is 5
  assert.equal(middle.solve([2, 8, 0, 6, 4]), 4);  // sorted: 0 2 4 6 8
  assert.equal(middle.solve([7, 7, 3]), null);     // duplicates are never shown for this rule
});

test("lowest digit handles zero and position", () => {
  const lowest = AUDIT.CRITERIA.find((c) => c.id === "lowest");
  assert.equal(lowest.solve([0, 5, 9]), 0);
  assert.equal(lowest.solve([5, 9, 0]), 0);
  assert.equal(lowest.solve([6, 3, 8, 4, 7]), 3);
});

for (const n of [3, 5]) {
  test(`generated ${n}-exhibit audits always have the requested answer`, () => {
    const gen = AUDIT.create(seeded(42 + n));
    let lastId = null;
    for (let target = 0; target <= 9; target++) {
      for (let i = 0; i < 300; i++) {
        const a = gen.make(target, n);
        assert.equal(a.digits.length, n);
        assert.ok(a.digits.every((x) => Number.isInteger(x) && x >= 0 && x <= 9));
        assert.equal(a.answer, target, `answer for target ${target}`);
        assert.equal(reference(a.criterion.id, a.digits), target, `${a.criterion.id} on [${a.digits}] should be ${target}`);
        assert.notEqual(a.criterion.id, lastId, "same rule twice in a row");
        lastId = a.criterion.id;
      }
    }
  });

  test(`all rules get used with ${n} exhibits`, () => {
    const gen = AUDIT.create(seeded(7 + n));
    const used = new Set();
    for (let i = 0; i < 2000; i++) used.add(gen.make(i % 10, n).criterion.id);
    assert.deepEqual([...used].sort(), AUDIT.CRITERIA.map((c) => c.id).sort());
  });
}

test("random (no target) audits are still valid", () => {
  const gen = AUDIT.create(seeded(99));
  for (let i = 0; i < 500; i++) {
    const a = gen.make(null, 5);
    assert.equal(reference(a.criterion.id, a.digits), a.answer);
  }
});

// ---------------------------------------------------------------------------
// Maze
// ---------------------------------------------------------------------------
// All simple routes from start to exit (fine here: the maze has at most one loop).
function simpleRoutes(m) {
  const routes = [];
  const seen = new Set([m.start.x + "," + m.start.y]);
  (function walk(x, y, path) {
    if (x === m.exit.x && y === m.exit.y) { routes.push(path.slice()); return; }
    for (const d of MAZE.DIRS) {
      if (!MAZE.canMove(m, x, y, d.dx, d.dy)) continue;
      const nx = x + d.dx, ny = y + d.dy, k = nx + "," + ny;
      if (seen.has(k)) continue;
      seen.add(k); path.push(k);
      walk(nx, ny, path);
      seen.delete(k); path.pop();
    }
  })(m.start.x, m.start.y, [m.start.x + "," + m.start.y]);
  return routes;
}

test("start and exit are on opposite boundary edges, and the ends vary", () => {
  const sides = new Set(), starts = new Set();
  for (let i = 0; i < 60; i++) {
    const m = MAZE.generate(31, 19, 0.6);
    const { start: s, exit: e, w, h } = m;
    const opposite =
      (s.x === 0 && e.x === w - 1) || (s.x === w - 1 && e.x === 0) ||
      (s.y === 0 && e.y === h - 1) || (s.y === h - 1 && e.y === 0);
    assert.ok(opposite, `start ${JSON.stringify(s)} and exit ${JSON.stringify(e)} must be on opposite edges`);
    sides.add(m.side); starts.add(s.x + "," + s.y);
  }
  assert.equal(sides.size, 4, "all four directions occur");
  assert.ok(starts.size > 20, "start positions vary");
});

test("every maze has exactly two routes of similar length, sharing as little as possible", () => {
  for (const [w, h, b] of [[31, 19, 0.6], [31, 19, 0.3], [9, 6, 0.3], [21, 21, 0]]) {
    for (let i = 0; i < 25; i++) {
      const m = MAZE.generate(w, h, b);
      let openings = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (const d of MAZE.DIRS) {
        const nx = x + d.dx, ny = y + d.dy;
        const inside = nx >= 0 && ny >= 0 && nx < w && ny < h;
        const open = !(m.cells[y][x] & d.bit);
        if (!inside) { assert.ok(!open, "outer wall missing"); continue; }
        assert.equal(open, !(m.cells[ny][nx] & d.opp), "walls must match on both sides");
        if (open) openings++;
      }
      assert.equal(openings / 2, w * h, "a tree plus exactly one extra passage");
      const dist = MAZE.bfs(m.cells, w, h, m.start).dist;
      assert.ok(dist.every((r) => r.every((v) => v >= 0)), "every cell reachable");
      const routes = simpleRoutes(m);
      assert.equal(routes.length, 2, `${w}x${h}: exactly two solutions`);
      const found = routes.map((r) => r.length - 1).sort((p, q) => p - q);
      const reported = m.routes.map((r) => r.length - 1).sort((p, q) => p - q);
      assert.deepEqual(found, reported, "the two routes are the ones the generator reports");
      const [main, alt] = m.routes.map((r) => r.length - 1);
      assert.ok(alt >= 0.9 * main && alt <= 1.3 * main, `second route ${alt} vs original ${main}: between 90% and 130%`);
      assert.equal(m.pathLength, found[0], "pathLength is the shorter route");
    }
  }
});

test("the second route keeps the maze as hard as before (shortest route not shortened)", () => {
  // Compare the shortest route against the route the same maze had before the
  // extra passage was opened: the generator reports both.
  for (let i = 0; i < 40; i++) {
    const m = MAZE.generate(31, 19, 0.6);
    const [main, alt] = m.routes.map((r) => r.length - 1);
    assert.ok(alt >= 0.9 * main, `second route ${alt} is not much shorter than the original ${main}`);
    const shared = m.routes[1].filter((c) => m.routes[0].some((d) => d.x === c.x && d.y === c.y)).length;
    // They always share the start and end stretches; the middle must split off.
    assert.ok(shared / m.routes[0].length < 0.9, "the two routes are genuinely different");
  }
});

// ---------------------------------------------------------------------------
// Route errors
// ---------------------------------------------------------------------------
test("wall hits count once per key press, not while a key is held", () => {
  const t = ROUTE.createTracker({ limit: 5 });
  assert.equal(t.bump(false).kind, "wall");
  assert.equal(t.bump(true).kind, null);
  assert.equal(t.bump(true).kind, null);
  assert.equal(t.errors, 1);
});

test("turning back counts once per retreat", () => {
  const t = ROUTE.createTracker({ limit: 5 });
  t.step(false); t.step(false);
  assert.equal(t.step(true).kind, "backtrack"); // turned around
  assert.equal(t.step(true).kind, null);        // still retreating out of the dead end
  assert.equal(t.step(true).kind, null);
  t.step(false);                                // new direction
  assert.equal(t.step(true).kind, "backtrack"); // turned around again
  assert.equal(t.errors, 2);
});

test("reaching the limit reports exceeded, and reset clears it", () => {
  const t = ROUTE.createTracker({ limit: 3 });
  t.bump(false); t.bump(false);
  assert.equal(t.bump(false).exceeded, true);
  t.reset();
  assert.equal(t.errors, 0);
  assert.equal(t.step(true).exceeded, false);
});

test("penalties can be switched off", () => {
  const t = ROUTE.createTracker({ limit: 3, wallHits: false, backtracks: false });
  t.bump(false); t.step(false); t.step(true);
  assert.equal(t.errors, 0);
});

// ---------------------------------------------------------------------------
// Rule deck: every rule is used once before any rule repeats
// ---------------------------------------------------------------------------
const RULE_IDS = AUDIT.CRITERIA.map((c) => c.id).sort();

for (const n of [3, 5]) {
  test(`with a free answer, every ${RULE_IDS.length} audits use each rule exactly once (${n} exhibits)`, () => {
    const gen = AUDIT.create(seeded(1000 + n));
    for (let cycle = 0; cycle < 100; cycle++) {
      const ids = [];
      for (let k = 0; k < RULE_IDS.length; k++) ids.push(gen.make(null, n).criterion.id);
      assert.deepEqual([...ids].sort(), RULE_IDS, `cycle ${cycle}: ${ids}`);
    }
  });
}

test("with any target, a rule is only reused after the deck is refilled", () => {
  const gen = AUDIT.create(seeded(5));
  let last = null;
  for (let i = 0; i < 3000; i++) {
    const before = gen.deckLeft();
    const target = Math.floor(i * 7.3) % 10;
    const a = gen.make(target, 5);
    const id = a.criterion.id;
    if (before.includes(id)) {
      assert.deepEqual(gen.deckLeft().sort(), before.filter((x) => x !== id).sort(), "used rule leaves the deck");
    } else {
      // only allowed when the deck was empty or nothing left in it could make this digit
      const refilled = gen.deckLeft().sort();
      assert.deepEqual(refilled, RULE_IDS.filter((x) => x !== id), "deck refilled with all rules except the one just used");
    }
    assert.notEqual(id, last, "same rule twice in a row");
    last = id;
  }
});

test("practice explanations name the right answer and exhibit for every rule", () => {
  const gen = AUDIT.create(seeded(314));
  for (let i = 0; i < 400; i++) {
    const a = gen.make(null, 5);
    const text = AUDIT.explain(a);
    assert.ok(text.includes(String(a.answer)), `${a.criterion.id}: mentions ${a.answer}: ${text}`);
    const letter = String.fromCharCode(65 + a.digits.indexOf(a.answer));
    assert.ok(text.includes("Exhibit " + letter), `${a.criterion.id}: names Exhibit ${letter}: ${text}`);
  }
});

// ---------------------------------------------------------------------------
// Case Closed charts
// ---------------------------------------------------------------------------
const CHARTS = require("../js/charts.js");

test("leg chart draws one bar per leg with its time", () => {
  const svg = CHARTS.legChart([95000, 62000, 130500], [0, 1, 0]);
  assert.equal((svg.match(/class="ch-leg"/g) || []).length, 3);
  for (const t of ["1:35", "1:02", "2:10"]) assert.ok(svg.includes(t), "shows " + t);
  assert.ok(svg.includes("1 restart"), "notes leg restarts");
});

test("audit chart draws every audit, marks misses and timeouts, and counts them", () => {
  const audits = [
    { leg: 1, ms: 2300, verdict: "correct" }, { leg: 1, ms: 4100, verdict: "wrong" },
    { leg: 1, ms: 6000, verdict: "timeout" }, { leg: 2, ms: 1800, verdict: "correct" }
  ];
  const svg = CHARTS.auditChart(audits, { limitSec: 6 });
  assert.equal((svg.match(/class="ch-audit /g) || []).length, 4);
  assert.equal((svg.match(/ch-audit correct/g) || []).length, 2);
  assert.ok(svg.includes("ch-mark wrong") && svg.includes("ch-mark timeout"), "wrong and timed-out audits get a symbol, not only a colour");
  assert.ok(svg.includes("6 s limit"), "shows the time limit");
  assert.ok(svg.includes(">L2<"), "marks where leg 2 starts");
  const sum = CHARTS.auditSummary(audits);
  assert.deepEqual([sum.total, sum.correct, sum.wrong, sum.timeout], [4, 2, 1, 1]);
  assert.equal(Math.round(sum.meanCorrectMs), 2050);
});

test("charts cope with no data", () => {
  assert.ok(CHARTS.auditChart([], { limitSec: 0 }).startsWith("<svg"));
  assert.ok(CHARTS.legChart([0], [0]).startsWith("<svg"));
});
