/*
 * THE GETAWAY ROUTE — facilitator settings (defaults)
 * Edit the values below, save, and reload the page. Facilitators can also change
 * every setting in the app with the gear button (password protected); those
 * changes are saved on that computer and override the values here.
 */
window.GETAWAY_CONFIG = {
  // ---- Mission structure ----
  // The mission is played in rounds. Each round is a fresh maze.
  // In each round the player earns one digit per correct audit, then finds a
  // mark (symbol) at the exit that decodes to one more digit.
  // Final code = [round 1 audit digits][round 1 mark][round 2 audit digits][round 2 mark] ...
  rounds: 3,
  auditsPerRound: 4,

  // Fixed code instead of a random one (digits only, length must equal
  // rounds * (auditsPerRound + 1), e.g. "4719238065"). null = new random code every run.
  fixedCode: null,

  // ---- Maze ----
  // Cells across and down. Bigger = longer. The exit is placed at the cell
  // farthest from the start, so the solution route is as long as possible.
  mazeWidth: 31,
  mazeHeight: 25,
  // 0..1. Higher = more branches and dead ends (harder). 0 = long winding corridors.
  mazeBranching: 0.8,
  // Each later leg's maze is this much bigger in both directions (0.15 = 15% per leg).
  // With 31 x 25: leg 1 = 31 x 25, leg 2 = 36 x 29, leg 3 = 41 x 33. 0 = same size.
  mazeGrowthPerLeg: 0.15,

  // ---- Audit popups ----
  // Seconds of maze time before each popup, drawn at random from this range
  // every time, so popups are unpredictable but evenly spread across the run.
  auditGapSeconds: [8, 16],
  // Once the player reaches the exit before the leg's audits are done, the remaining
  // audits come back to back: this is the short pause between them.
  rushGapSeconds: [0.3, 0.3],

  // ---- Audit difficulty ----
  // Exhibit digits shown in each audit on leg 1 (3 to 9).
  auditExhibits: 5,
  // Extra exhibits on each later leg (1 = leg 1: 5, leg 2: 6, leg 3: 7). Capped at 9.
  // With an even number of exhibits the "middle value" rule is skipped.
  exhibitsPerLeg: 1,

  // ---- Route penalties ----
  // Hitting a wall (one per key press) or turning back along your route (once per
  // retreat) is a route error. At the limit the current maze re-randomizes
  // (audit digits already earned are kept). 0 = no route penalties.
  routeErrorLimit: 10,
  penalizeWallHits: true,
  penalizeBacktracking: true,

  // ---- Audit clock ----
  // Seconds to answer each audit. Running out counts as a strike. 0 = no clock.
  auditTimeLimitSeconds: 6,

  // ---- Practice ----
  // Practice audits (with explanations, no strikes) before the official start.
  // 0 = no practice. Facilitators can also skip it with index.html?skippractice
  practiceAudits: 3,

  // ---- Stakes ----
  // Strikes (wrong answers or running out of time) allowed per leg. Reaching this
  // many restarts the current leg (new maze, its digits cleared); earlier legs are kept.
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
    "Three strikes on this leg. Evidence Records has pulled the trace and this leg starts over on a new route. Earlier legs are kept.",

  sound: true
};
