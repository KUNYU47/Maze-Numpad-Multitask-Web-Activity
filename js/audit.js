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

  function create(rng) {
    rng = rng || Math.random;
    let lastId = null;

    function randDigits(n) {
      return Array.from({ length: n }, () => Math.floor(rng() * 10));
    }

    // n = number of exhibits (odd numbers work best: 3 or 5).
    function make(target, n) {
      n = n || 3;
      const hasTarget = target !== null && target !== undefined;
      const order = CRITERIA.filter((c) => c.id !== lastId)
        .map((c) => [rng(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      for (const c of order) {
        for (let i = 0; i < 3000; i++) {
          const d = randDigits(n);
          const ans = c.solve(d);
          if (ans === null) continue;
          if (hasTarget && ans !== target) continue;
          lastId = c.id;
          return { digits: d, criterion: c, answer: ans, note: noteFor(c, n) };
        }
      }
      throw new Error("Could not build an audit for target " + target + " with " + n + " exhibits");
    }

    return { make };
  }

  const api = { CRITERIA, create, make: create().make };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GR_AUDIT = api;
})(typeof window !== "undefined" ? window : globalThis);
