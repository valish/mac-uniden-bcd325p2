# Contributing

This public project is experimental. Keep compatibility claims tied to the evidence in [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md). Package publication, release tags and public hosting require an explicit maintainer release decision.

## Run and test

Node.js 22+ is the only runtime requirement. No package installation is required for the application or unit/integration tests.

```sh
npm test
npm run check
npm run release:check
```

Use synthetic test plans. Add a regression case when fixing a protocol offset, reserved field, memory handle, timeout, quick-key or recovery error. Keep request/response fixtures independent of the production field map.

Schema edits belong in `src/schema.mjs`. Regenerate the distributed schema with:

```sh
node scripts/check.mjs --write-schema
```

## Browser checks

The browser smoke script uses Playwright as a development-only tool. Install it locally if needed; the application itself remains dependency-free:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/browser-check.mjs
```

An existing Playwright installation can be supplied with `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs`. `CHROMIUM_EXECUTABLE` can select an existing Chromium binary. The script uses an isolated browser context and synthetic scanner transport; it does not connect to real hardware. Its local service uses a temporary private directory and an ephemeral loopback port.

Inspect screenshots in `artifacts/` at desktop and mobile sizes. Check keyboard focus, file import, agent brief, MCP config, review gating, channel filtering, programming/verification, records and printing. Screenshots and browser test output are ignored by Git unless a separately reviewed public preview is deliberately included.

The script also captures `artifacts/public-preview/` using only the included weather example, fictional research areas and the scanner emulator. After inspecting them, copy the three PNGs into `docs/images/` to refresh the README. Keep the simulation captions and update [asset provenance](docs/ASSETS.md). Capture after fonts finish loading; finish UI transitions before taking screenshots. Never substitute a generated image for an application screenshot.

## Before a source push

- Run the tests, syntax/schema checks and release audit.
- Confirm only application code, synthetic examples, documentation and reviewed assets are tracked.
- Do not include `.local/`, session records, downloaded vendor manuals, API keys, personal plans or data from the originating emergency workspace.
- Keep compatibility claims scoped to actual evidence.

## Before a tagged release

Complete automated and browser/visual checks, review licensing/provenance, test installation from a clean checkout, and inspect the exact tracked-file inventory and Git history. Tie physical-device results to the revision actually tested; passing simulations does not extend an older hardware result to changed protocol code. Record hardware results in `docs/COMPATIBILITY.md` without publishing private evidence.

Follow [docs/RELEASING.md](docs/RELEASING.md). `package.json` deliberately keeps `private: true` to prevent accidental npm publication; that setting does not control GitHub repository visibility.
