# Copilot Instructions — plants-vs-zombies

## Project Overview

Plants vs Zombies tower defense game. Two parallel implementations coexist in this repo:
- **Browser version** (root level): plain JS + HTML5 Canvas, no build tools, no modules
- **Godot version** (`godot_project/`): Godot 4.7 GDScript, separate project

## Commands

### Browser version
```bash
# Start local server
python -m http.server 8080          # or: npx serve .
# Run tests
npm install                          # one-time (puppeteer dependency)
npm test                            # runs test/headless-test.js
# Run a single section of the test suite
node test/headless-test.js
# Docker
docker-compose up -d                # serves on port 8080
```

### Godot version
```bash
# Open in Godot editor
godot -e res://godot_project
# Run headless (if Godot 4.7 is installed)
godot --headless -r res://godot_project
```

## Architecture — Browser Version

All JS is global-scope, loaded via `<script>` tags in `index.html` in strict dependency order:

```
config.js → sound.js → plants.js → zombies.js → level.js → game.js → ui.js → main.js
```

- **`config.js`** — `CONFIG` (grid, sun economy, timings), `PLANT_TYPES`, `ZOMBIE_TYPES`, `LEVELS`. All balance numbers live here; no code changes needed for tuning.
- **`game.js`** — `Game` class is the single source of truth for simulation state. Owns arrays: `plants`, `zombies`, `projectiles`, `suns`, `explosions`, `grid[rows][cols]`. Methods: `update(dt)`, `render()`, `startLevel(id)`. State machine: `menu | playing | win | lose`.
- **`level.js`** — `LevelManager` mini-state-machine per level: `idle → spawning → active → complete`. Zombies spawn in random rows. `getWaveInfo()` feeds HUD.
- **`ui.js`** — `UI` class subscribes to `Game` emitter callbacks (`onStateChange`, `onSunChange`, `onWaveChange`, `onPlantPlaced`). Card cooldowns are UI-owned and tick in `ui.update(dt)`.
- **`main.js`** — IIFE bootstrap. Exposes `window.__game` and `window.__ui` for the test harness.
- **`sound.js`** — Web Audio API synthesized tones (no audio files). `ctx` is null in headless Chrome; all sound calls guard against that.

### Game Loop (main.js)
```
requestAnimationFrame:
  dt = Math.min(now - lastTime, 50)   // clamped to 50ms
  game.update(dt)
  ui.update(dt)
  game.render()
  ui.updateWave(game.levelManager.getWaveInfo())
```

### Key Cross-File Patterns
- **No ECS** — entities are plain objects managed by `Game` arrays.
- **Emitter callbacks** — `Game` fires `onStateChange/onSunChange/onWaveChange/onPlantPlaced`; `UI` subscribes in its constructor.
- **Collision is query-based**, not physics-engine: `game.getFirstZombieInRow(row, minX, maxX)`, `game.getPlantAt(row, x)`, `game.getZombieInRowAt(row, x, isAlly)`.
- **Plant behaviors** keyed by `type.behavior` in `plants.js`: `sunProducer`, `shooter`, `charm`, `bomb`, `wall`.
- **Charm mechanic** is the most entangled feature — spans `plants.js`, `zombies.js`, and `game.js` (charm projectile converts zombies to allies, which walk right and fight regular zombies).
- **Pause is decoupled from state**: `game.isPaused` is a separate flag from `game.state`; overlays key off both.
- **dt units are ms**; per-second rates use `dt/1000`.

### Testing
`test/headless-test.js` is a Puppeteer E2E script — no test framework.
- Starts its own static server on port 8899.
- Drives the real page via DOM + `page.evaluate` on `window.__game`/`window.__ui`.
- Assertions use hard throws; randomness (zombie spawn rows) is tolerated with "≥" checks.
- Screenshots written to `test/screenshots/NN-name.png`.
- Chrome path is hardcoded: `C:\Program Files\Google\Chrome\Application\chrome.exe`.

## Architecture — Godot Version

- Main scene: `res://Main.tscn`
- Autoloads: `Input` (`InputManager.gd`), `PlantTypes` (`PlantTypes.gd`)
- GDScript files mirror the browser entities: `Plant.gd`, `Zombie.gd`, `Projectile.gd`, `Grid.gd`, `Menu.gd`, `HUD.tscn`, `PlantBar.tscn`
- Godot 4.7 project

## Conventions
- No module system in the browser version — all globals; add new files to the `<script>` order in `index.html`.
- All game numbers (costs, HP, wave timings, grid dims) live in `js/config.js`; do not hardcode in entity classes.
- Comments and code identifiers in the browser version are in Chinese; keep this convention.
- The `godot_test/` directory is a minimal Godot test scene, separate from `godot_project/`.
