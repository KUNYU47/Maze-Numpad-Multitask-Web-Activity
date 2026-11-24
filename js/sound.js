/* Tiny synthesized sound effects (Web Audio, no files needed). */
window.GR_SOUND = (function () {
  let ctx = null;
  let enabled = true;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function tone(freq, start, dur, type, vol) {
    if (!enabled || !ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    unlock,
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },
    alarm() { tone(880, 0, 0.12, "square"); tone(660, 0.14, 0.12, "square"); tone(880, 0.28, 0.14, "square"); },
    correct() { tone(660, 0, 0.08, "triangle", 0.1); tone(990, 0.08, 0.14, "triangle", 0.1); },
    wrong() { tone(140, 0, 0.32, "sawtooth", 0.09); },
    key() { tone(1200, 0, 0.03, "square", 0.03); },
    penalty() { tone(300, 0, 0.08, "sawtooth", 0.06); tone(200, 0.09, 0.12, "sawtooth", 0.06); },
    bump() { tone(90, 0, 0.06, "square", 0.04); },
    sealed() { tone(220, 0, 0.15, "square", 0.07); tone(180, 0.16, 0.2, "square", 0.07); },
    found() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.16, "triangle", 0.09)); },
    win() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.25, "triangle", 0.1)); }
  };
})();
