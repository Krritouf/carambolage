# Carambolage

Everything in this folder is the game. Everything outside it is the Claude Code Game
Studios kit downloaded from GitHub, apart from three files it retouched: the engine
lines in `../CLAUDE.md` and `../project.yaml`, and a few lines in `../.gitignore`.

| Folder or file | What it holds |
|---|---|
| `src/` | The game's code (TypeScript): `main.ts` the game, `i18n.ts` the English text, `native.ts` the Android bridge |
| `data/` | Every tuning value (`config.json`, notes in `config-notes.md`) and the 19 levels (`levels.json`) |
| `assets/` | The icon and the opening picture (drawn by `tools/brand/art.html`) |
| `tests/` | Unit tests (Vitest) and the in-browser tests (Playwright) |
| `android/` | The Android app (Capacitor). `keystore.properties` names the Play Store key and is never committed |
| `store/` | The Play Store art: the feature graphic and the screenshots, in French and English |
| `tools/` | The APK/AAB build, the store screenshots, the icon and banner drawings |
| `design/game-brief.md` | The game's brief: what it is and every feature added |
| `prototype/` | The first one-file version of the game, kept as it was |
| `qa/evidence/` | Screenshots taken to check each change |

## Commands (run them in this folder)

| Command | What it does |
|---|---|
| `npm install` | Once, after a fresh copy |
| `npm run dev` | Plays the game in the browser while you work on it |
| `npm test` | All the tests |
| `npm run build:single` | `dist-single/index.html`: the whole game in one file (for GitHub Pages or itch.io) |
| `npm run android:apk` | A test APK for your phone |
| `npm run android:aab` | The signed bundle for the Play Store (raise `versionCode` in `android/app/build.gradle` first) |
| `node tools/store-shots.mjs` | The Play Store screenshots again, after `npm run build:single` |
