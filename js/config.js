/*
 * THE GETAWAY ROUTE — facilitator settings
 * Edit the values below, save, and reload the page.
 */
window.GETAWAY_CONFIG = {
  // The full case code the player must enter at the end.
  // Every digit except the last is earned from one correct audit answer
  // (audit questions are generated so their correct answer is that digit).
  // The LAST digit comes from decoding the exit symbol with the Old Case Key.
  // Set to null to make a brand-new random code every run.
  finalCode: "47192",

  // Only used when finalCode is null: how many audit digits to collect.
  randomAuditCount: 4,

  // Maze grid size (cells per side). 11 = quick, 15 = normal, 21 = long.
  mazeSize: 15,

  // Random gap (seconds of active maze time) before each audit popup.
  auditGapSeconds: [6, 18],

  // Gap used when the player reaches the exit before all audits are done.
  rushGapSeconds: [1.5, 3],

  // Old Case Key: symbol -> digit. Shown on screen in this order.
  // Every digit 0-9 should appear exactly once.
  caseKey: {
    eye: 3,
    triangle: 7,
    hexagon: 0,
    crescent: 5,
    diamond: 2,
    star: 8,
    cross: 1,
    hourglass: 6,
    target: 9,
    boxx: 4
  },

  // true = shuffle the Old Case Key every run (only sensible with finalCode: null).
  shuffleCaseKey: false,

  // Shown on the "Case Closed" screen after the correct code is entered.
  successMessage:
    "Route confirmed. The suspect fled through the east service tunnel. Report to the next station for your next lead.",

  // Sound effects on by default.
  sound: true
};
