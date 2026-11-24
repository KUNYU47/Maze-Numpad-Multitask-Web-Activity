/* Route-error tracker for the maze.
 * - Wall hit: each deliberate bump into a wall (held-key repeats are ignored) is 1 error.
 * - Backtrack: turning back along your own route is 1 error. Retreating several
 *   steps in a row (e.g. out of a dead end) still counts once, until you move forward again.
 * When errors reach the limit, the tracker reports `exceeded` and the maze is re-randomized.
 * Works in the browser (window.GR_ROUTE) and in Node (module.exports) for tests.
 */
(function (root) {
  function createTracker(opts) {
    const o = Object.assign({ limit: 12, wallHits: true, backtracks: true }, opts || {});
    let errors = 0;
    let retreating = false;

    function result(kind) {
      if (kind) errors++;
      return { kind, errors, limit: o.limit, exceeded: o.limit > 0 && errors >= o.limit };
    }

    return {
      // A blocked move. `repeat` = the key is being held down (auto-repeat).
      bump(repeat) {
        if (!o.wallHits || repeat) return result(null);
        return result("wall");
      },
      // A successful move. `isBacktrack` = it went back onto the previous cell of the route.
      step(isBacktrack) {
        if (!isBacktrack) { retreating = false; return result(null); }
        if (retreating || !o.backtracks) { retreating = true; return result(null); }
        retreating = true;
        return result("backtrack");
      },
      reset() { errors = 0; retreating = false; },
      get errors() { return errors; },
      get limit() { return o.limit; }
    };
  }

  const api = { createTracker };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GR_ROUTE = api;
})(typeof window !== "undefined" ? window : globalThis);
