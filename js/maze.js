/* Maze generation (recursive backtracker) and canvas rendering. */
window.GR_MAZE = (function () {
  // Wall bits
  const N = 1, E = 2, S = 4, W = 8;
  const DIRS = [
    { bit: N, dx: 0, dy: -1, opp: S },
    { bit: E, dx: 1, dy: 0, opp: W },
    { bit: S, dx: 0, dy: 1, opp: N },
    { bit: W, dx: -1, dy: 0, opp: E }
  ];

  function generate(size) {
    const cells = [];
    for (let y = 0; y < size; y++) {
      cells.push([]);
      for (let x = 0; x < size; x++) cells[y].push(N | E | S | W);
    }
    const seen = cells.map((r) => r.map(() => false));
    const stack = [[0, 0]];
    seen[0][0] = true;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const options = DIRS.filter((d) => {
        const nx = x + d.dx, ny = y + d.dy;
        return nx >= 0 && ny >= 0 && nx < size && ny < size && !seen[ny][nx];
      });
      if (!options.length) { stack.pop(); continue; }
      const d = options[Math.floor(Math.random() * options.length)];
      const nx = x + d.dx, ny = y + d.dy;
      cells[y][x] &= ~d.bit;
      cells[ny][nx] &= ~d.opp;
      seen[ny][nx] = true;
      stack.push([nx, ny]);
    }
    return { size, cells, start: { x: 0, y: 0 }, exit: { x: size - 1, y: size - 1 } };
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
    const cs = Math.floor((Math.min(W_, H_) - pad * 2) / maze.size);
    const ox = Math.floor((W_ - cs * maze.size) / 2);
    const oy = Math.floor((H_ - cs * maze.size) / 2);
    const frozen = state.frozen;
    const green = frozen ? "rgba(120,200,150,0.35)" : "#7dffa0";

    // faint grid
    ctx.strokeStyle = "rgba(125,255,160,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= maze.size; i++) {
      ctx.beginPath(); ctx.moveTo(ox + i * cs, oy); ctx.lineTo(ox + i * cs, oy + cs * maze.size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + i * cs); ctx.lineTo(ox + cs * maze.size, oy + i * cs); ctx.stroke();
    }

    // exit cell
    const ex = ox + maze.exit.x * cs, ey = oy + maze.exit.y * cs;
    const sealed = state.exitSealed;
    const pulse = 0.5 + 0.5 * Math.sin(t / 250);
    ctx.fillStyle = sealed ? "rgba(255,70,50," + (0.18 + 0.2 * pulse) + ")" : "rgba(125,255,160," + (0.2 + 0.25 * pulse) + ")";
    ctx.fillRect(ex + 2, ey + 2, cs - 4, cs - 4);
    ctx.fillStyle = sealed ? "#ff6a50" : "#c8ffd8";
    ctx.font = "bold " + Math.floor(cs * 0.36) + "px Consolas, monospace";
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
    for (let y = 0; y < maze.size; y++) {
      for (let x = 0; x < maze.size; x++) {
        const c = maze.cells[y][x];
        const x0 = ox + x * cs, y0 = oy + y * cs, x1 = x0 + cs, y1 = y0 + cs;
        if (c & N) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
        if (c & W) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
        if (y === maze.size - 1 && c & S) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
        if (x === maze.size - 1 && c & E) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
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

  return { generate, canMove, draw };
})();
