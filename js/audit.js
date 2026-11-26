/* Evidence-ID audit generator.
 * Each audit shows N digits (exhibits) and a rule. The correct answer is a digit value.
 * When a target digit is given, the audit is built so its answer equals that target.
 * Works in the browser (window.GR_AUDIT) and in Node (module.exports) for tests.
 */
(function (root) {
  const even = (n) => n % 2 === 0;
  const odd = (n) => n % 2 === 1;
  const distinct = (d) => new Set(d).size === d.length;

  const CRITERIA = [
    { id: "highest", text: "THE HIGHEST DIGIT", solve: (d) => (distinct(d) ? Math.max(...d) : null) },
    { id: "lowest", text: "THE LOWEST DIGIT", solve: (d) => (distinct(d) ? Math.min(...d) : null) },
    {
      id: "middle", text: "THE MIDDLE VALUE",
      note: (n) => "by size, not position: " + (n - 1) / 2 + " digit" + ((n - 1) / 2 === 1 ? " is" : "s are") + " higher and " + (n - 1) / 2 + " lower",
      solve: (d) => (distinct(d) && d.length % 2 === 1 ? [...d].sort((a, b) => a - b)[(d.length - 1) / 2] : null)
    },
    { id: "lme", text: "THE LEFT-MOST EVEN DIGIT", note: "0 counts as even", solve: (d) => (distinct(d) && d.some(even) ? d.find(even) : null) },
    { id: "rme", text: "THE RIGHT-MOST EVEN DIGIT", note: "0 counts as even", solve: (d) => (distinct(d) && d.some(even) ? [...d].reverse().find(even) : null) },
    { id: "lmo", text: "THE LEFT-MOST ODD DIGIT", solve: (d) => (distinct(d) && d.some(odd) ? d.find(odd) : null) },
    { id: "rmo", text: "THE RIGHT-MOST ODD DIGIT", solve: (d) => (distinct(d) && d.some(odd) ? [...d].reverse().find(odd) : null) },
    {
      id: "twice", text: "THE DIGIT THAT APPEARS TWICE",
      // exactly one digit appears twice, every other digit appears once
      solve: (d) => {
        const counts = {};
        d.forEach((x) => (counts[x] = (counts[x] || 0) + 1));
        const pairs = Object.keys(counts).filter((k) => counts[k] === 2);
        const valid = pairs.length === 1 && Object.values(counts).every((c) => c <= 2);
        return valid ? Number(pairs[0]) : null;
      }
    }
  ];

  function noteFor(c, n) {
    if (!c.note) return "";
    return typeof c.note === "function" ? c.note(n) : c.note;
  }

  // Every digit combination that gives a clear answer, per rule / size / answer (cached).
  const tupleCache = {};
  function validTuples(c, n, target) {
    const key = c.id + "|" + n + "|" + target;
    if (tupleCache[key]) return tupleCache[key];
    const out = [];
    const total = Math.pow(10, n);
    for (let v = 0; v < total; v++) {
      const d = String(v).padStart(n, "0").split("").map(Number);
      const ans = c.solve(d);
      if (ans !== null && (target === "any" || ans === target)) out.push(d);
    }
    return (tupleCache[key] = out);
  }

  // Rule deck: every rule is dealt once before any rule repeats. When the deck is
  // empty it is refilled with all rules (never starting with the rule just used).
  function create(rng) {
    rng = rng || Math.random;
    let deck = [];
    let lastId = null;

    const shuffle = (arr) => arr.map((x) => [rng(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const refill = () => { deck = CRITERIA.map((c) => c.id); };

    function randDigits(n) {
      return Array.from({ length: n }, () => Math.floor(rng() * 10));
    }

    function tryRule(c, target, n) {
      const hasTarget = target !== null && target !== undefined;
      const build = (d) => ({ digits: d, criterion: c, answer: c.solve(d), note: noteFor(c, n) });
      // Fast path: random sampling.
      for (let i = 0; i < 2000; i++) {
        const d = randDigits(n);
        const ans = c.solve(d);
        if (ans === null) continue;
        if (hasTarget && ans !== target) continue;
        return build(d);
      }
      // Rare combinations (e.g. "highest is 4" with 5 different digits): pick
      // uniformly from every valid set of digits, or report that none exists.
      if (n > 6) return null; // too many combinations to list: leave this rule for a later audit
      const pool = validTuples(c, n, hasTarget ? target : "any");
      return pool.length ? build(pool[Math.floor(rng() * pool.length)]) : null;
    }

    // Try the rules left in the deck (random order, the last-used rule last).
    function dealFrom(ids, target, n) {
      const order = shuffle(ids).sort((a, b) => (a === lastId) - (b === lastId));
      for (const id of order) {
        const a = tryRule(CRITERIA.find((c) => c.id === id), target, n);
        if (a) return a;
      }
      return null;
    }

    // target: the digit the answer must equal, or null for any answer.
    // n = number of exhibits (odd numbers work best: 3 or 5).
    function make(target, n) {
      n = n || 3;
      if (!deck.length) refill();
      // With a fixed target some rules can't produce that digit (e.g. "highest" can't
      // be 1 with 5 different digits); those stay in the deck for a later audit.
      let a = dealFrom(deck, target, n);
      if (!a) {
        refill();
        a = dealFrom(deck, target, n);
      }
      if (!a) throw new Error("Could not build an audit for target " + target + " with " + n + " exhibits");
      deck.splice(deck.indexOf(a.criterion.id), 1);
      lastId = a.criterion.id;
      return a;
    }

    return { make, deckLeft: () => deck.slice() };
  }

  // Plain-language explanation of an audit's answer (used in the practice round).
  function explain(a) {
    const d = a.digits, ans = a.answer;
    const ex = (i) => "Exhibit " + String.fromCharCode(65 + i);
    const at = ex(d.indexOf(ans));
    switch (a.criterion.id) {
      case "highest": return "The biggest of " + d.join(" ") + " is " + ans + " (" + at + ").";
      case "lowest": return "The smallest of " + d.join(" ") + " is " + ans + " (" + at + ").";
      case "middle": return "Sorted by size: " + [...d].sort((p, q) => p - q).join(" ") + ". The one in the middle is " + ans + " (" + at + "), wherever it sits on screen.";
      case "lme": return "Reading from Exhibit A to the right, the first even digit is " + ans + " (" + at + ").";
      case "rme": return "Reading from the last exhibit to the left, the first even digit is " + ans + " (" + at + ").";
      case "lmo": return "Reading from Exhibit A to the right, the first odd digit is " + ans + " (" + at + ").";
      case "rmo": return "Reading from the last exhibit to the left, the first odd digit is " + ans + " (" + at + ").";
      case "twice": {
        const idx = d.map((x, i) => (x === ans ? i : -1)).filter((i) => i >= 0);
        return ans + " appears in " + ex(idx[0]) + " and " + ex(idx[1]) + "; every other digit appears once.";
      }
    }
    return "The answer is " + ans + ".";
  }

  const api = { CRITERIA, create, explain, make: create().make };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GR_AUDIT = api;
})(typeof window !== "undefined" ? window : globalThis);
