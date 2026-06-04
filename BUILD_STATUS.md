# Build Status

## Current Phase: 3 — Model Providers + Streaming (Pending)

> **Session prompt (use this every time you open a new window):**
> "Read `CLAUDE.md`, then `BUILD_STATUS.md`, then `BUILD_PROMPT.md`. Follow the build status to find the current phase. Plan what you're about to build, then build it. Stop at the checkpoint and wait for my confirmation before continuing."

---

## Phase Progress

| Phase | Status | Recommended Model | Notes |
|-------|--------|-------------------|-------|
| 1 — Project Scaffold | ✅ Complete | Sonnet | package.json, manifest.json, vite config, tsconfig, stub files, placeholder icons |
| 2 — DOM Extraction + Bridge | ✅ Complete | Sonnet | selectors.ts, page-script.js, injector, bridge, SPA nav detection |
| 3 — Model Providers + Streaming | ⬜ Pending | **Opus** | callModel(), provider routing, context truncation, streaming via Port |
| 4 — Sidebar UI | ⬜ Pending | Sonnet | All React components, Zustand store, hooks, glassmorphism styling |
| 5 — Coaching Logic + Prompts | ⬜ Pending | **Opus** | System prompts for all modes/tiers, Anti-Spoiler Rule enforcement |
| 6 — Persistence | ⬜ Pending | Sonnet | chrome.storage.local, conversation + settings persistence |

---

## Checkpoint Log

_Updated after each phase is verified._

### Phase 2 — ✅ Verified complete (2026-06-03)

**Built:**
- `selectors.ts`: ARIA/structural/data-* selectors with comments; title has 3-layer fallback (data-cy → document.title parse → h1)
- `problem.ts`: layered extraction logging which path wins; slug from URL (most reliable)
- `code.ts`: Monaco API primary (postMessage round-trip to page-script.js) + lossy DOM fallback; fallback clearly labeled
- `injector.ts`: `<script>` tag injection via `chrome.runtime.getURL('page-script.js')` (web_accessible_resources path)
- `bridge.ts`: SPA nav detection (pushState/replaceState patches + popstate + title MutationObserver); debounced re-extract on slug change; REQUEST_EXTRACT listener for on-connect re-request pattern
- `content/index.ts`: entry point calling injector + bridge
- `background/index.ts`: PROBLEM_UPDATED handler with in-memory cache; panel port management; on-connect triggers REQUEST_EXTRACT to active LeetCode tab (compensates for ephemeral SW cache)
- `sidebar/App.tsx`: minimal port connect + console.log for checkpoint verification; full UI deferred to Phase 4
- `shared/messages.ts`: added `PANEL_PORT_NAME` constant + `RequestExtractMessage` type

**Verified:**
- Full content↔background↔panel pipeline confirmed working on live LeetCode
- Monaco API primary path succeeded: title, statement, constraints, difficulty, code all extracted
- `[LCCoach BG] Side panel connected` + `[LCCoach BG] PROBLEM_UPDATED received` + `[LCCoach Panel] Problem received` all logged as expected
- Service worker alive and routing messages correctly
- **Build bug noted:** crxjs generates incorrect `service-worker-loader.js` (wrong chunk) and invalid `web_accessible_resources` (use_dynamic_url field, bad patterns). Fixed manually in dist; postbuild script added in Phase 3 prep to make rebuilds safe.

### Phase 1 — ✅ Completed (2026-06-03)
- `npm run build` exits 0, zero TS errors (`npm run typecheck` clean)
- All config files in place: package.json, tsconfig.json, vite.config.ts, tailwind.config.ts, postcss.config.cjs, manifest.json
- CRXJS 2.4.0 + Vite 8.0.16 + @vitejs/plugin-react 6.0.2 — compatible, build output verified
- dist/manifest.json confirms: `sidePanel` permission present, `side_panel.default_path` intact, icons resolved
- All stub source files created with `export {}` + TODO comments
- Placeholder icons (16/32/48/128px) generated as valid PNG files
- **Pending user verification:** Load unpacked from dist/ in chrome://extensions, confirm side panel icon appears on leetcode.com/problems/* and React shell renders
