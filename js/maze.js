/* Maze generation (growing tree) and canvas rendering.
 * Works in the browser (window.GR_MAZE) and in Node (module.exports) for tests. */
(function (root) {
const api = (function () {
  // Wall bits
  const N = 1, E = 2, S = 4, W = 8;
  const DIRS = [
    { bit: N, dx: 0, dy: -1, opp: S },
    { bit: E, dx: 1, dy: 0, opp: W },
    { bit: S, dx: 0, dy: 1, opp: N },
    { bit: W, dx: -1, dy: 0, opp: E }
  ];

  const key = (x, y) => y * 100000 + x;

  // Breadth-first search over open passages. Returns distance and parent maps.
  function bfs(cells, w, h, from) {
    const dist = cells.map((r) => r.map(() => -1));
    const parent = new Map();
    dist[from.y][from.x] = 0;
    const q = [[from.x, from.y]];
    for (let qi = 0; qi < q.length; qi++) {
      const [x, y] = q[qi];
      for (const d of DIRS) {
        if (cells[y][x] & d.bit) continue;
        const nx = x + d.dx, ny = y + d.dy;
        if (dist[ny][nx] !== -1) continue;
        dist[ny][nx] = dist[y][x] + 1;
        parent.set(key(nx, ny), { x, y });
        q.push([nx, ny]);
      }
    }
    return { dist, parent };
  }

  // Cells from `root` to (x, y) using a BFS parent map (root first).
  function pathTo(parent, root, x, y) {
    const out = [{ x, y }];
    while (x !== root.x || y !== root.y) {
      const p = parent.get(key(x, y));
      x = p.x; y = p.y;
      out.push({ x, y });
    }
    return out.reverse();
  }

  // Random start on one edge, exit on the opposite edge.
  function pickEnds(cells, w, h, rnd) {
    const horizontal = rnd() < 0.5; // left<->right, otherwise top<->bottom
    const flip = rnd() < 0.5;
    const edge = (side) => {
      const out = [];
      if (horizontal) for (let y = 0; y < h; y++) out.push({ x: side ? w - 1 : 0, y });
      else for (let x = 0; x < w; x++) out.push({ x, y: side ? h - 1 : 0 });
      return out;
    };
    const startEdge = edge(flip ? 1 : 0), exitEdge = edge(flip ? 0 : 1);
    const start = startEdge[Math.floor(rnd() * startEdge.length)];
    // Exit: a random pick among the quarter of opposite-edge cells farthest from
    // the start, so the route stays long however the ends land.
    const { dist } = bfs(cells, w, h, start);
    const ranked = exitEdge.slice().sort((a, b) => dist[b.y][b.x] - dist[a.y][a.x]);
    const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 4)));
    const exit = top[Math.floor(rnd() * top.length)];
    return { start, exit, side: horizontal ? (flip ? "right-left" : "left-right") : (flip ? "bottom-top" : "top-bottom") };
  }

  // Open exactly one extra wall so there are exactly two routes from start to exit.
  // The second route is chosen to be about as long as the first (never much shorter)
  // and to share as little of it as possible, so the maze stays just as hard.
  function addSecondRoute(cells, w, h, start, exit, rnd) {
    const fromS = bfs(cells, w, h, start), fromE = bfs(cells, w, h, exit);
    const main = pathTo(fromS.parent, start, exit.x, exit.y);
    const L = main.length - 1;
    const onMain = new Set(main.map((c) => key(c.x, c.y)));
    const cands = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      for (const d of [DIRS[1], DIRS[2]]) { // E and S: each interior wall once
        const nx = x + d.dx, ny = y + d.dy;
        if (nx >= w || ny >= h || !(cells[y][x] & d.bit)) continue;
        for (const [a, b] of [[{ x, y }, { x: nx, y: ny }], [{ x: nx, y: ny }, { x, y }]]) {
          const L2 = fromS.dist[a.y][a.x] + 1 + fromE.dist[b.y][b.x];
          if (L2 < 0.9 * L || L2 > 1.3 * L) continue;
          const first = pathTo(fromS.parent, start, a.x, a.y);
          const second = pathTo(fromE.parent, exit, b.x, b.y);
          const firstSet = new Set(first.map((c) => key(c.x, c.y)));
          if (second.some((c) => firstSet.has(key(c.x, c.y)))) continue; // not a simple route
          const route = first.concat(second.reverse());
          const shared = route.filter((c) => onMain.has(key(c.x, c.y))).length;
          cands.push({ a, b, d, route, L2, score: shared / main.length + Math.abs(L2 / L - 1) });
        }
      }
    }
    if (!cands.length) return { routes: [main] };
    cands.sort((p, q) => p.score - q.score);
    const pick = cands[Math.floor(rnd() * Math.min(5, cands.length))];
    // Open the wall between a and b.
    const dir = DIRS.find((k) => k.dx === pick.b.x - pick.a.x && k.dy === pick.b.y - pick.a.y);
    cells[pick.a.y][pick.a.x] &= ~dir.bit;
    cells[pick.b.y][pick.b.x] &= ~dir.opp;
    return { routes: [main, pick.route] };
  }

  // Growing-tree generator. branching 0 = recursive backtracker (long corridors),
  // higher = more junctions and dead ends.
  function generate(w, h, branching, rng) {
    const rnd = rng || Math.random;
    const cells = [];
    for (let y = 0; y < h; y++) {
      cells.push([]);
      for (let x = 0; x < w; x++) cells[y].push(N | E | S | W);
    }
    const seen = cells.map((r) => r.map(() => false));
    const sx = Math.floor(rnd() * w), sy = Math.floor(rnd() * h);
    const active = [[sx, sy]];
    seen[sy][sx] = true;
    while (active.length) {
      const idx = rnd() < branching ? Math.floor(rnd() * active.length) : active.length - 1;
      const [x, y] = active[idx];
      const options = DIRS.filter((d) => {
        const nx = x + d.dx, ny = y + d.dy;
        return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny][nx];
      });
      if (!options.length) { active.splice(idx, 1); continue; }
      const d = options[Math.floor(rnd() * options.length)];
      const nx = x + d.dx, ny = y + d.dy;
      cells[y][x] &= ~d.bit;
      cells[ny][nx] &= ~d.opp;
      seen[ny][nx] = true;
      active.push([nx, ny]);
    }
    const { start, exit, side } = pickEnds(cells, w, h, rnd);
    const { routes } = addSecondRoute(cells, w, h, start, exit, rnd);
    const lengths = routes.map((r) => r.length - 1);
    return { w, h, cells, start, exit, side, routes, pathLength: Math.min(...lengths) };
  }

  function canMove(maze, x, y, dx, dy) {
    const d = DIRS.find((k) => k.dx === dx && k.dy === dy);
    return !(maze.cells[y][x] & d.bit);
  }

  function draw(canvas, maze, state, t) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W_ = canvas.width, H_ = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W_, H_);
    const pad = 14 * dpr;
    const cs = Math.floor(Math.min((W_ - pad * 2) / maze.w, (H_ - pad * 2) / maze.h));
    const ox = Math.floor((W_ - cs * maze.w) / 2);
    const oy = Math.floor((H_ - cs * maze.h) / 2);
    const frozen = state.frozen;
    const green = frozen ? "rgba(120,200,150,0.35)" : "#7dffa0";

    // faint grid
    ctx.strokeStyle = "rgba(125,255,160,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= maze.w; i++) {
      ctx.beginPath(); ctx.moveTo(ox + i * cs, oy); ctx.lineTo(ox + i * cs, oy + cs * maze.h); ctx.stroke();
    }
    for (let i = 0; i <= maze.h; i++) {
      ctx.beginPath(); ctx.moveTo(ox, oy + i * cs); ctx.lineTo(ox + cs * maze.w, oy + i * cs); ctx.stroke();
    }

    // exit cell
    const ex = ox + maze.exit.x * cs, ey = oy + maze.exit.y * cs;
    const sealed = state.exitSealed;
    const pulse = 0.5 + 0.5 * Math.sin(t / 250);
    ctx.fillStyle = sealed ? "rgba(255,70,50," + (0.18 + 0.2 * pulse) + ")" : "rgba(125,255,160," + (0.2 + 0.25 * pulse) + ")";
    ctx.fillRect(ex + 2, ey + 2, cs - 4, cs - 4);
    ctx.fillStyle = sealed ? "#ff6a50" : "#c8ffd8";
    ctx.font = "bold " + Math.floor(cs * 0.3) + "px Consolas, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sealed ? "LOCK" : "EXIT", ex + cs / 2, ey + cs / 2);

    // start cell label
    ctx.fillStyle = "rgba(125,255,160,0.35)";
    ctx.fillText("IN", ox + maze.start.x * cs + cs / 2, oy + maze.start.y * cs + cs / 2);

    // trail
    if (state.trail.length > 1) {
      ctx.strokeStyle = frozen ? "rgba(255,180,80,0.25)" : "rgba(255,180,80,0.55)";
      ctx.lineWidth = Math.max(2, cs * 0.12);
      ctx.setLineDash([cs * 0.18, cs * 0.18]);
      ctx.lineCap = "round";
      ctx.beginPath();
      state.trail.forEach((p, i) => {
        const px = ox + p.x * cs + cs / 2, py = oy + p.y * cs + cs / 2;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // walls
    ctx.strokeStyle = green;
    ctx.lineWidth = Math.max(2, Math.round(cs * 0.09));
    ctx.lineCap = "square";
    ctx.shadowColor = frozen ? "transparent" : "rgba(125,255,160,0.8)";
    ctx.shadowBlur = 8 * dpr;
    ctx.beginPath();
    for (let y = 0; y < maze.h; y++) {
      for (let x = 0; x < maze.w; x++) {
        const c = maze.cells[y][x];
        const x0 = ox + x * cs, y0 = oy + y * cs, x1 = x0 + cs, y1 = y0 + cs;
        if (c & N) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
        if (c & W) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
        if (y === maze.h - 1 && c & S) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
        if (x === maze.w - 1 && c & E) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // player blip
    const px = ox + state.pos.x * cs + cs / 2, py = oy + state.pos.y * cs + cs / 2;
    const r = cs * 0.28;
    ctx.fillStyle = frozen ? "rgba(255,180,80,0.5)" : "#ffb450";
    ctx.shadowColor = "rgba(255,180,80,0.9)";
    ctx.shadowBlur = frozen ? 0 : 14 * dpr;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (!frozen) {
      ctx.strokeStyle = "rgba(255,180,80," + (0.6 * (1 - (t % 1200) / 1200)) + ")";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(px, py, r + cs * 0.5 * ((t % 1200) / 1200), 0, Math.PI * 2); ctx.stroke();
    }
  }

  return { generate, canMove, draw, bfs, N, E, S, W, DIRS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.GR_MAZE = api;
})(typeof window !== "undefined" ? window : globalThis);
