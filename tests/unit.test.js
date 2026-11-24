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
function bfs(m) {
  const dist = m.cells.map((r) => r.map(() => -1));
  dist[0][0] = 0;
  const q = [[0, 0]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const d of MAZE.DIRS) {
      if (!MAZE.canMove(m, x, y, d.dx, d.dy)) continue;
      const nx = x + d.dx, ny = y + d.dy;
      if (dist[ny][nx] === -1) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); }
    }
  }
  return dist;
}

test("mazes are perfect (every cell reachable, exactly one route between cells)", () => {
  for (const [w, h, b] of [[31, 19, 0.3], [9, 6, 0], [15, 15, 1], [40, 25, 0.5]]) {
    for (let i = 0; i < 20; i++) {
      const m = MAZE.generate(w, h, b);
      let openings = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        for (const d of MAZE.DIRS) {
          const nx = x + d.dx, ny = y + d.dy;
          const inside = nx >= 0 && ny >= 0 && nx < w && ny < h;
          const open = !(m.cells[y][x] & d.bit);
          if (!inside) { assert.ok(!open, "outer wall missing"); continue; }
          assert.equal(open, !(m.cells[ny][nx] & d.opp), "walls must match on both sides");
          if (open) openings++;
        }
      }
      assert.equal(openings / 2, w * h - 1, "a perfect maze has w*h-1 passages");
      const dist = bfs(m);
      assert.ok(dist.every((r) => r.every((v) => v >= 0)), "every cell reachable");
      const max = Math.max(...dist.flat());
      assert.equal(dist[m.exit.y][m.exit.x], max, "exit is the farthest cell");
      assert.equal(m.pathLength, max);
    }
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
