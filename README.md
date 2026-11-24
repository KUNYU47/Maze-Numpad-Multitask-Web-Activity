# The Getaway Route

A PSY475 escape-room puzzle built on the **task-switching paradigm**. Players track a fleeing suspect through a maze on a retro "route tracer" console, and are repeatedly interrupted, at unpredictable moments, by an **Evidence-ID Audit**. The maze freezes during every audit. Each correct answer prints one digit of the case code. At the exit the suspect leaves a symbol, which players decode with the on-screen **Old Case Key** to get the final digit and close the case.

Styled in **Cassette Futurism**: beige plastic housings, a green-phosphor CRT, chunky keys, indicator lamps, and amber readouts, with a detective/case-file theme.

## Running it (Windows)

Nothing to install. Double-click **`Start Getaway Route.bat`**. It opens `index.html` in your default browser (Chrome or Edge recommended). Press **F11** for full screen.

You can also just double-click `index.html`.

> macOS support is planned for a later version. The app is plain HTML/CSS/JavaScript, so it should already open in a Mac browser, but only Windows has been tested so far.

## How to play

1. Read the case briefing and press **BEGIN TRACE** (or Enter).
2. Move the amber blip with the **arrow keys** or **WASD** from `IN` (top left) to the exit (bottom right).
3. An **Evidence-ID Audit** pops up after a random 6 to 18 seconds of tracing. The maze freezes. Three exhibit digits are shown with a rule, for example *the highest digit*, *the right-most odd digit*, or *the digit that appears twice*. Type the answer on the keyboard or click the on-screen numpad.
   - **Correct:** the digit is printed into the **Code Register** and the maze unfreezes.
   - **Wrong:** no digit, a buzz, and a new audit appears. The maze stays frozen until an audit is answered correctly.
4. The exit stays **sealed (LOCK)** until every audit digit is collected. Reaching it early makes the remaining audits fire quickly.
5. At the open exit a **mark** (symbol) appears. Look it up in the **Old Case Key** on the right, then enter the full case code: the register digits in order, followed by the decoded mark. Correct code shows **CASE CLOSED** with the message for the next puzzle.

Audit rules in the pool: highest, lowest, middle value, left-most even, right-most even, left-most odd, right-most odd, and the digit that appears twice. Zero counts as even.

## Facilitator guide

All settings live in **`js/config.js`**. Edit, save, and reload the browser.

| Setting | Default | What it does |
| --- | --- | --- |
| `finalCode` | `"47192"` | The code that unlocks the case. All digits but the last come from audits (questions are generated so the right answer is that digit). The last digit comes from the exit symbol. Set to `null` for a random code each run. |
| `randomAuditCount` | `4` | Audit digits per run when `finalCode` is `null`. |
| `mazeSize` | `15` | Cells per side. 11 is quick, 21 is long. |
| `auditGapSeconds` | `[6, 18]` | Random range of tracing time before each audit. |
| `rushGapSeconds` | `[1.5, 3]` | Audit gap once the player has reached the sealed exit. |
| `caseKey` | see file | Symbol to digit mapping shown as the Old Case Key. Each digit 0 to 9 once. |
| `shuffleCaseKey` | `false` | Shuffle the key each run (use with `finalCode: null`). |
| `successMessage` | see file | Text on the Case Closed screen, e.g. the clue for the next puzzle. |
| `sound` | `true` | Sound effects on at start (toggle with the SOUND button). |

With the default code `47192`, the exit mark is always the **diamond** (= 2).

**Between groups:** press **NEW CASE** (or `Ctrl+Shift+N`) for a fresh maze.

**Rehearsal mode:** open `index.html?demo` (for example `http://127.0.0.1:8000/index.html?demo` via a local server, or add `?demo` to the address bar) for a tiny maze and 2 to 4 second audit gaps.

**Data:** the Case Closed screen shows total time, audits cleared, audit errors, mean audit response time, and code attempts. The same numbers (including every audit response time in ms) are logged to the browser console (F12), which is handy for talking about switch costs in the debrief.

## How it links to the course (task switching)

- Players alternate between two tasks with different goals and response sets: spatial navigation (arrow keys) and numeric judgement (digit keys). Each audit forces a **switch** and a reconfiguration of the task set, and returning to the maze forces another.
- Audits arrive at **random, unpredictable intervals**, so players cannot prepare in advance. This removes the benefit of anticipatory preparation and makes switch costs larger.
- The audit **rule changes every time** (never the same rule twice in a row), so even within the audit task players must update which rule is active, adding a second layer of switching.
- The frozen maze means players must hold their place in memory and **re-orient** after each interruption, a classic resumption cost after task interruption.
- The final step requires integrating information from both tasks (register digits plus the decoded mark).

## Project structure

```
index.html               Console layout and overlays
css/style.css            Cassette Futurism styling
js/config.js             Facilitator settings
js/app.js                Game flow: maze, audits, exit, final code
js/maze.js               Maze generation (recursive backtracker) and CRT rendering
js/audit.js              Audit question generator
js/symbols.js            SVG glyphs for the Old Case Key
js/sound.js              Synthesized sound effects (Web Audio)
Start Getaway Route.bat  Windows launcher
```

## Changelog

- **v0.1** First playable version: random maze, random-interval audits with frozen maze, code register, sealed exit, Old Case Key symbol decoding, final code entry, Case Closed stats, Windows launcher.
