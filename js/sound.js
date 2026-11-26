/* Synthesized sound effects (Web Audio, no audio files needed). */
window.GR_SOUND = (function () {
  let ctx = null;
  let enabled = true;
  let master = null;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  const ready = () => enabled && ctx;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- building blocks ----------
  let noiseBuf = null;
  function getNoise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Filtered noise burst. type: bandpass/lowpass/highpass; q: resonance (high q = "ring").
  function noise(start, dur, freq, vol, type, q) {
    if (!ready()) return;
    const t0 = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    src.playbackRate.value = rnd(0.9, 1.1);
    const filter = ctx.createBiquadFilter();
    filter.type = type || "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q == null ? 1.2 : q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0, Math.random() * 0.3);
    src.stop(t0 + dur + 0.02);
  }

  function tone(freq, start, dur, type, vol, endFreq) {
    if (!ready()) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // ---------- tape-deck mechanics ----------
  // A cassette deck "piano key": the plastic key snaps (bright tick), the metal
  // latch lands (low, dull thunk) a few ms later, and the spring rings briefly.
  function tapeKey(weight) {
    const w = weight || 1;
    const lag = rnd(0.018, 0.03) * w;
    noise(0, 0.012, rnd(3800, 4600), 0.5 * w, "highpass", 0.7);       // plastic snap
    noise(lag, 0.06 * w, rnd(380, 520), 0.9 * w, "bandpass", 1.6);     // latch thunk (body)
    tone(rnd(70, 85), lag, 0.07 * w, "sine", 0.22 * w, 45);            // chassis thump
    noise(lag + 0.004, 0.09, rnd(2300, 2700), 0.06 * w, "bandpass", 18); // spring ring
  }
  // Key coming back up: lighter, higher clack.
  function tapeRelease(weight) {
    const w = weight || 1;
    noise(0, 0.02, rnd(1800, 2300), 0.28 * w, "bandpass", 2.5);
    noise(0.006, 0.01, 5000, 0.12 * w, "highpass", 0.7);
  }
  // Capstan motor spinning up behind a PLAY press.
  function motorSpin(start, dur) {
    if (!ready()) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(35, t0);
    osc.frequency.exponentialRampToValueAtTime(110, t0 + dur * 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.05, t0 + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(lp).connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Capstan motor winding down (the tape stops: the maze freezes).
  function motorStop(start, dur) {
    if (!ready()) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t0);
    osc.frequency.exponentialRampToValueAtTime(25, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 450;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(lp).connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    unlock,
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },

    // Buttons
    click() { tapeKey(0.7); setTimeout(() => tapeRelease(0.6), 90); },          // keypad keys
    press() { tapeKey(1); setTimeout(() => tapeRelease(0.9), 140); },           // console buttons
    play() { tapeKey(1.15); motorSpin(0.03, 0.6); },                            // BEGIN / next leg

    // Maze movement: soft tick, like a tape counter wheel advancing one notch.
    step() {
      noise(0, 0.018, rnd(1300, 1700), 0.09, "bandpass", 4);
      tone(rnd(190, 230), 0, 0.025, "triangle", 0.025);
    },
    // Backing up: same tick, lower (like rewinding the counter).
    stepBack() {
      noise(0, 0.018, rnd(800, 1000), 0.09, "bandpass", 4);
      tone(rnd(140, 160), 0, 0.025, "triangle", 0.025);
    },
    bump() { noise(0, 0.05, 220, 0.35, "lowpass", 1); tone(60, 0, 0.06, "sine", 0.12, 40); },

    // Events
    // Audit popup: STOP key clunk + motor winding down, then a warbling alert bell.
    interrupt() {
      tapeKey(1.25);
      motorStop(0.02, 0.45);
      for (let i = 0; i < 6; i++) tone(i % 2 ? 1050 : 1400, 0.16 + i * 0.055, 0.05, "square", 0.07);
      tone(1400, 0.5, 0.18, "triangle", 0.06, 1100);
    },
    // New exhibits after a wrong answer: short double chirp.
    reissue() { tone(1400, 0, 0.05, "square", 0.06); tone(1050, 0.07, 0.07, "square", 0.06); },
    correct() { tone(660, 0, 0.08, "triangle", 0.1); tone(990, 0.08, 0.14, "triangle", 0.1); },
    wrong() { tone(140, 0, 0.32, "sawtooth", 0.09); },
    // Route error (wall hit / doubling back): loud static burst, a dropping buzz,
    // and a two-tone warning, like a tracer losing its signal.
    penalty() {
      noise(0, 0.28, 2200, 1.2, "bandpass", 0.6);
      noise(0, 0.12, 180, 1.4, "lowpass", 1);
      tone(150, 0, 0.35, "sawtooth", 0.28, 55);
      tone(880, 0.02, 0.09, "square", 0.16);
      tone(587, 0.13, 0.13, "square", 0.16);
    },
    sealed() { tone(220, 0, 0.15, "square", 0.07); tone(180, 0.16, 0.2, "square", 0.07); },
    found() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.16, "triangle", 0.09)); },
    win() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.25, "triangle", 0.1)); }
  };
})();
