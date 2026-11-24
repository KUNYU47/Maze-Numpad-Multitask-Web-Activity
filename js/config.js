/*
 * THE GETAWAY ROUTE — facilitator settings
 * Edit the values below, save, and reload the page.
 */
window.GETAWAY_CONFIG = {
  // ---- Mission structure ----
  // The mission is played in rounds. Each round is a fresh maze.
  // In each round the player earns one digit per correct audit, then finds a
  // mark (symbol) at the exit that decodes to one more digit.
  // Final code = [round 1 audit digits][round 1 mark][round 2 audit digits][round 2 mark] ...
  rounds: 2,
  auditsPerRound: 4,

  // Fixed code instead of a random one (digits only, length must equal
  // rounds * (auditsPerRound + 1), e.g. "4719238065"). null = new random code every run.
  fixedCode: null,

  // ---- Maze ----
  // Cells across and down. Bigger = longer. The exit is placed at the cell
  // farthest from the start, so the solution route is as long as possible.
  mazeWidth: 31,
  mazeHeight: 19,
  // 0..1. Higher = more branches and dead ends (harder). 0 = long winding corridors.
  mazeBranching: 0.3,

  // ---- Audit popups ----
  // Seconds of maze time before each popup, drawn at random from this range
  // every time, so popups are unpredictable but evenly spread across the run.
  auditGapSeconds: [8, 16],
  // Gap used once the player reaches the exit before the leg's audits are done.
  rushGapSeconds: [1, 2.5],

  // ---- Audit difficulty ----
  // Number of exhibit digits shown in each audit (3 or 5 recommended; odd numbers
  // keep the "middle value" rule possible).
  auditExhibits: 5,

  // ---- Route penalties ----
  // Hitting a wall (one per key press) or turning back along your route (once per
  // retreat) is a route error. At the limit the current maze re-randomizes
  // (audit digits already earned are kept). 0 = no route penalties.
  routeErrorLimit: 12,
  penalizeWallHits: true,
  penalizeBacktracking: true,

  // ---- Stakes ----
  // Wrong audit answers allowed. Reaching this many fails the mission.
  maxStrikes: 3,

  // ---- Old Case Key ----
  // Symbol -> digit. Each digit 0-9 exactly once.
  caseKey: {
    eye: 3, triangle: 7, hexagon: 0, crescent: 5, diamond: 2,
    star: 8, cross: 1, hourglass: 6, target: 9, boxx: 4
  },
  // true = shuffle the key every run.
  shuffleCaseKey: true,

  // ---- Text ----
  successMessage:
    "Route confirmed. The suspect doubled back to the precinct and stashed something before fleeing. Search the EVIDENCE DESK for your next lead.",
  failMessage:
    "Three audit errors. Evidence Records has pulled your clearance and the suspect slipped away. Reset and try again.",

  sound: true
};
