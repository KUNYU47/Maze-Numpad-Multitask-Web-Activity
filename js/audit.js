/* Evidence-ID audit generator.
 * Each audit shows three digits and a rule. The correct answer is a digit value.
 * When a target digit is given, the audit is built so its answer equals that target.
 */
window.GR_AUDIT = (function () {
  const even = (n) => n % 2 === 0;
  const odd = (n) => n % 2 === 1;
  const distinct = (d) => new Set(d).size === d.length;

  const CRITERIA = [
    { id: "highest", text: "THE HIGHEST DIGIT", solve: (d) => (distinct(d) ? Math.max(...d) : null) },
    { id: "lowest", text: "THE LOWEST DIGIT", solve: (d) => (distinct(d) ? Math.min(...d) : null) },
    { id: "middle", text: "THE MIDDLE VALUE", note: "neither the highest nor the lowest", solve: (d) => (distinct(d) ? [...d].sort((a, b) => a - b)[1] : null) },
    { id: "lme", text: "THE LEFT-MOST EVEN DIGIT", note: "0 counts as even", solve: (d) => (distinct(d) && d.some(even) ? d.find(even) : null) },
    { id: "rme", text: "THE RIGHT-MOST EVEN DIGIT", note: "0 counts as even", solve: (d) => (distinct(d) && d.some(even) ? [...d].reverse().find(even) : null) },
    { id: "lmo", text: "THE LEFT-MOST ODD DIGIT", solve: (d) => (distinct(d) && d.some(odd) ? d.find(odd) : null) },
    { id: "rmo", text: "THE RIGHT-MOST ODD DIGIT", solve: (d) => (distinct(d) && d.some(odd) ? [...d].reverse().find(odd) : null) },
    {
      id: "twice", text: "THE DIGIT THAT APPEARS TWICE",
      solve: (d) => (new Set(d).size === 2 ? (d[0] === d[1] || d[0] === d[2] ? d[0] : d[1]) : null)
    }
  ];

  let lastId = null;

  function randDigits() {
    return [0, 1, 2].map(() => Math.floor(Math.random() * 10));
  }


  function make(target) {
    const order = CRITERIA.filter((c) => c.id !== lastId).sort(() => Math.random() - 0.5);
    for (const c of order) {
      for (let i = 0; i < 800; i++) {
        const d = randDigits();
        const ans = c.solve(d);
        if (ans === null) continue;
        if (target !== null && target !== undefined && ans !== target) continue;
        lastId = c.id;
        return { digits: d, criterion: c, answer: ans };
      }
    }
    // Fallback (should never happen): plain "highest" with target guaranteed.
    const t = target == null ? 9 : target;
    return { digits: [t, t, t], criterion: CRITERIA[0], answer: t };
  }

  return { make, CRITERIA };
})();
