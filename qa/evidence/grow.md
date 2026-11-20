# Grow record: carambolage

From the one-shot `prototypes/carambolage/` at commit `d21b161` (tag `one-shot/carambolage`), into a
Vite + TypeScript web project at the repository root. The one-shot folder was not edited.

| Step | Result | Evidence |
|---|---|---|
| 1. Reference | same-seed run twice: `exact yes` | `reference.tsv`, `reference.png` |
| 2. Copy (still JavaScript) | `match yes`; the levels table carried by hand into `data/levels.json` (it was `window.LEVELS`, not a tuning value) | `copy.tsv`, `copy.png` |
| 3. TypeScript | `match yes`; `tsc --noEmit` strict, 0 errors | `typescript.tsv`, `typescript.png` |
| 4. Rules under test | Vitest 7 passed (stars, score, damage, prices, rng, fmt), seen failing once on a broken star rule; Playwright 2 passed (`@boot`, same-seed drive) | `tests/unit/rules.test.ts`, `tests/integration/boot.spec.ts` |
| 5. Record | `engine.name: Web` (Vite 8.3.4) written; `npm run build` ok; `test-run.sh web` rule `web:pass` (9 tests); `npm run smoke` 1 passed | this file |

`typescript.png` was looked at beside `reference.png`: the same results screen, pixel for pixel.

**NOT ASSESSED:** nothing in the steps above. The reference run's scripted car reached the time-out
without a crash, so the pile-up, the garage purchases and the touch controls are covered by the
person's play, not by this replay.

**Still `Loose` (typing to do):** the vehicles and blocks (bodies), particles, oil and skid marks,
pickups, the run's state, the levels, the garage items and the save — every object `src/main.ts`
builds field by field shares `type Loose = any` from `src/game/types.ts`.

**Layout:** `src/game/rules.ts` (scoring, pure), `src/game/random.ts` (the two random streams),
`src/config.ts` (data/config.json and data/levels.json), `src/audio.ts` (Web Audio), `src/main.ts`
(screen, input, world, physics, drawing, HUD, garage, scenes, loop), `src/hook.ts` (what the checks drive).
