# Build Status

## Current Phase: Phase 7 — Test foundation + hint system fixes ✅ Complete + hint persistence hotfix

> **Session prompt (use this every time you open a new window):**
> "Read `CLAUDE.md`, then `BUILD_STATUS.md`, then `BUILD_PROMPT.md`. Follow the build status to find the current phase. Plan what you're about to build, then build it. Stop at the checkpoint and wait for my confirmation before continuing."

---

## Phase Progress

| Phase | Status | Recommended Model | Notes |
|-------|--------|-------------------|-------|
| 1 — Project Scaffold | ✅ Complete | Sonnet | package.json, manifest.json, vite config, tsconfig, stub files, placeholder icons |
| 2 — DOM Extraction + Bridge | ✅ Complete | Sonnet | selectors.ts, page-script.js, injector, bridge, SPA nav detection |
| 3 — Model Providers + Streaming | ✅ Complete | **Opus** | callModel(), provider routing, context truncation, streaming via Port |
| 4 — Sidebar UI | ✅ Complete | Sonnet | All React components, Zustand store, hooks, glassmorphism styling |
| 5 — Coaching Logic + Prompts | ✅ Complete | **Opus** | System prompts for all modes/tiers, Anti-Spoiler Rule enforcement — verified manually |
| 6 — Persistence | ✅ Complete | Sonnet | chrome.storage.local settings + per-problem conversation persistence; manual Chrome checkpoint pending |
| 7 — Tests + Hint System Fixes | ✅ Complete | Opus | Vitest harness, 72 unit/component tests, hint labeling bug fixed, tier-aware decline line, layout hardening |

---

## Checkpoint Log

_Updated after each phase is verified._

### Phase 8 prep — ✅ Complete (2026-06-04) — Review complete, issue list + fix plan written

**Review scope:** Full `src/` audit (all 38 TypeScript/TSX files), manifest, public/page-script.js, scripts/postbuild.js.

**Issues found:** 1 Critical, 4 High, 3 Medium, 3 Low — full list in `docs/superpowers/plans/2026-06-04-fixes-phase-8.md`.

**Top issues:**
- C1: Cross-problem stream contamination (no abort, no requestId) — A's response can land in B's conversation
- H1: `solutionUnlocked` never cleared on ↺ reset — permanent Anti-Spoiler bypass, now persisted
- H2: TEST_PROVIDERS debug handler still in production background
- H3: Anthropic SSE partial-line buffer missing — last chunk dropped on network splits
- H4: Concurrent CHAT_REQUEST streams — no in-flight guard
- H5: OpenAI `incomplete` buffer discarded at natural stream end

### Hint Persistence Hotfix — ✅ Complete (2026-06-04) — Automated verification passed; manual Chrome check recommended

**Bug fixed:** `hintTier` and `solutionUnlocked` were never persisted to `chrome.storage.local`. Closing and reopening the side panel restored conversation messages but reset hint level to 0 and `solutionUnlocked` to false — making the AI revert to Tier 0 coaching and hiding the SolutionGate even if users had reached Tier 3.

**Changed files:**
- `src/background/storage.ts`: Added `SavedConversationState` type `{ messages, hintTier, solutionUnlocked }`. Updated `saveConversation` to persist all three. Updated `loadConversation` to return the full state with backward compat for old bare `Message[]` format.
- `src/sidebar/stores/chatStore.ts`: `hydrateConversation` now accepts `SavedConversationState` and restores `hintTier` + `solutionUnlocked` alongside messages.
- `src/sidebar/App.tsx`: Subscribes to `hintTier` and `solutionUnlocked`; includes them in the `saveConversation` dep array and call.
- `src/sidebar/hooks/useProblem.ts`: Passes full `savedState` (not just messages) to `hydrateConversation`.
- `src/sidebar/stores/chatStore.test.ts`: Updated one test call to match the new signature.

**Verified:**
- `npm run typecheck` — zero TS errors
- `npm run test` — 72/72 tests pass
- `npm run build` — exits 0, postbuild patches applied

**Manual Chrome check recommended:**
- Set hint level to Strategy, send a message, close and reopen the panel — AI should still behave at Strategy level and buttons should show Strategy as the active tier.
- Reach Tier 3 (Pseudocode), close and reopen — SolutionGate should still be visible.
- Navigate to a different problem — hintTier should reset to 0, then restore if you return to the first problem.

### Phase 7 — ✅ Complete (2026-06-04) — Automated verification passed; manual Chrome check recommended

**Built:**
- `vitest.config.ts` + `src/test/setup.ts` + `src/test/vitest.d.ts`: Full Vitest + RTL + jsdom test harness with mocked `chrome.*` API (storage, runtime.connect, getURL).
- `package.json`: Added `"test"`, `"test:watch"`, `"test:cov"` scripts.
- `src/shared/constants.ts`: Added `HINT_PANEL_LABEL`, `HINT_TIER_LABELS`, `SOLUTION_GATE_LABEL` — single source of truth for UI label names consumed by both the prompt builder and UI components. Drift-proof.
- `src/shared/prompts/coaching.ts`: Replaced hardcoded `ANTI_SPOILER_CEILING` constant with a `buildAntiSpoilerCeiling(tier)` function. Tier < 3 → decline line points at the **"Hint Level"** buttons (Nudge/Strategy/Pseudocode). Tier 3 → decline line points at **"Show Full Solution"** gate (no higher hint exists).
- `src/sidebar/components/HintControls.tsx`: Labels now imported from `shared/constants`. Section header uses `HINT_PANEL_LABEL`.
- `src/sidebar/components/SolutionGate.tsx`: Button label imported from `SOLUTION_GATE_LABEL` constant.
- `src/sidebar/components/CodeViewer.tsx`: `max-h-48` → `max-h-28` to reduce risk of hint controls being clipped off-screen.
- 6 test files (72 tests): store lifecycle, prompt selection routing, coaching tier directives, Anti-Spoiler ceiling, HintControls gating, SolutionGate visibility + confirm flow, ModeSelector, drift guards.

**Bugs fixed:**
1. AI said "click the hint button" but no button was labeled "hint" — replaced with "Hint Level buttons (Nudge → Strategy → Pseudocode)".
2. Tier-blind decline pointer at Tier 3 — at max tier the AI now correctly points at the Show Full Solution gate, not non-existent higher hints.
3. Prompt ↔ UI label coupling — shared constants make this class of mismatch structurally impossible to reintroduce without breaking tests.

**Verified (automated):**
- `npm run test` — 72/72 tests pass across 6 test files.
- `npm run typecheck` — zero TS errors.
- `npm run build` — exits 0, 299+ modules, postbuild patches applied.

**Manual checkpoint still recommended in Chrome:**
- Expand CodeViewer on a long solution and confirm hint controls remain visible (layout clip fix).
- At Tier 0: ask "just give me the answer" → AI should now say "Unlock the next hint level using the Hint Level buttons below (Nudge → Strategy → Pseudocode)".
- At Tier 3: ask "just give me the answer" → AI should say "click the Show Full Solution button below".
- Click Show Full Solution → full solution unlocks.

### Phase 6 — ✅ Complete (2026-06-04) — Automated verification passed; manual checkpoint pending

**Built:**
- `background/storage.ts`: Added Promise-based `chrome.storage.local` helpers for `settings` and `conversation:{slug}` keys, with provider-aware settings defaults.
- `sidebar/hooks/useSettings.ts`: Replaced direct storage calls with `loadSettings()` / `saveSettings()` while preserving provider default model reset behavior.
- `sidebar/stores/chatStore.ts`: Added conversation hydration state and actions so slug changes clear transient streaming state and saved finalized messages can be restored separately.
- `sidebar/hooks/useProblem.ts`: Loads saved conversations after `PROBLEM_UPDATED`, ignores stale async loads when navigation changes slug, and keeps a fresh empty session when no saved conversation exists.
- `sidebar/App.tsx`: Persists finalized `messages[]` for the current problem slug while skipping saves during conversation hydration.

**Verified (automated):**
- `npm run typecheck` — zero TS errors.
- `npm run build` — exits 0, all 299 modules transformed, postbuild patches applied.

**Manual checkpoint still needed in Chrome:**
- Problem A conversation restores after closing/reopening the side panel.
- Problem B opens with a fresh conversation.
- Returning to Problem A restores its prior conversation.
- Settings persist across panel close/reopen.
- In-flight partial assistant content is not restored as a finalized message.

### Phase 5 — ✅ Complete (2026-06-03) — Verified

**Built:**
- `shared/types.ts`: Added `ProblemContext` interface — canonical problem shape shared by messages and prompt builders (eliminates the inline object literal that was duplicated across `messages.ts`).
- `shared/messages.ts`: Refactored to use `ProblemContext` in `ProblemUpdatedMessage` and `ChatRequestMessage.problemContext`. Pure structural refactor, no payload shape change.
- `shared/prompts/coaching.ts`: Full `buildCoachingPrompt(hintTier, problem)` — Socratic coach with per-tier directive blocks (Tier 0–3), Anti-Spoiler Rule hard ceiling with verbatim decline line, problem context embedded via shared formatter.
- `shared/prompts/codeReview.ts`: `buildCodeReviewPrompt(problem)` — Socratic code review; asks before correcting; no wholesale rewrites; handles "code is correct" case.
- `shared/prompts/edgeCases.ts`: `buildEdgeCasesPrompt(problem)` — generates 3–5 tricky test cases with input/expected output/one-sentence explanation; explicitly does not hint at solution approach.
- `shared/prompts/solution.ts`: `buildSolutionPrompt(problem)` — full solution prompt (only bypasses Anti-Spoiler Rule); structured as intuition → algorithm → implementation → complexity → pitfalls.
- `shared/prompts/index.ts` (new): `formatProblemContext(problem)` shared formatter + `selectSystemPrompt({ mode, hintTier, solutionUnlocked, problem })` routing function — the single entry point for the background.
- `background/index.ts`: Replaced placeholder system prompt with `selectSystemPrompt()` call; added console.log for prompt debugging (mode, tier, solutionUnlocked, prompt length).

**Verified (automated):**
- `npm run typecheck` — zero TS errors.
- `npm run build` — exits 0, all 298 modules transformed.

**Verified manually:**
- Socratic Tier 0: assistant asks Socratic questions, never names pattern. ✅
- "Show me the full solution" → verbatim Anti-Spoiler decline line. ✅
- Follow-up stuck case ("i dont get it") → more Socratic scaffolding, still no solution. ✅

### Phase 4 — ✅ Complete (2026-06-03)

**Built:**
- `sidebar/stores/chatStore.ts`: Zustand store — `messages[]`, `inFlightContent`, `inFlightThinking`, `isStreaming`, `streamError`, `currentProblem`, `hintTier`, `mode`, `solutionUnlocked` + all actions.
- `sidebar/hooks/useSettings.ts`: `chrome.storage.local` read/write; auto-resets model to provider default on provider change.
- `sidebar/hooks/useProblem.ts`: owns the port; listens for `PROBLEM_UPDATED`; calls `setProblem()` (which auto-resets conversation on slug change).
- `sidebar/hooks/useChat.ts`: wires `CHAT_DELTA/DONE/ERROR` to store; `sendMessage()` assembles and posts `CHAT_REQUEST`.
- `sidebar/components/ModeSelector.tsx`: glassmorphism tab buttons, sets mode in store.
- `sidebar/components/HintControls.tsx`: progressive unlock (N requires N-1 active), disabled in review/edgecases modes.
- `sidebar/components/SolutionGate.tsx`: visible at tier 3 only; inline confirmation dialog before unlocking.
- `sidebar/components/CodeViewer.tsx`: collapsible strip with line count toggle.
- `sidebar/components/ChatMessage.tsx`: user (amber right-aligned) + assistant (glass left-aligned) bubbles; `react-markdown` with GFM; collapsible thinking disclosure.
- `sidebar/components/ChatPanel.tsx`: scrollable list, in-flight streaming bubble (typing dots → text), auto-scroll, auto-grow textarea.
- `sidebar/components/SettingsPanel.tsx`: slide-in overlay; provider/model/apiKey; Test Connection for local providers.
- `sidebar/App.tsx`: full wiring — header (title + difficulty), ModeSelector, ChatPanel, CodeViewer, HintControls, SolutionGate, Settings gear.
- `sidebar/index.css`: Inter font (Google Fonts), markdown prose styles, streaming dot animation.
- `remark-gfm` added to dependencies.

**Verified:**
- `npm run build` exits 0, zero rolldown errors.
- `npm run typecheck` passes with zero TS errors.
- `react-markdown` v10 default export confirmed and used correctly.

### Phase 3 — ✅ Verified complete (2026-06-03)

**Built:**
- `shared/types.ts`: added `Provider`, `ModelRequest`, `ModelStreamChunk` types.
- `shared/constants.ts`: configured max-context sizes, providers, default model (`gemma-4-e4b`).
- `background/api.ts`: implemented `callModel()` router, `callAnthropic()` (SSE), `callOpenAICompatible()` (SSE for LM Studio/Ollama), and boundary-safe `<think>` tag parser.
- `scripts/test-providers.mjs`: test script verifying the streaming implementations.

**Verified:**
- `<think>` boundary parser correctly handles split tags.
- OpenAI-compatible streaming path works correctly with LM Studio (`gemma-4-e4b`).
- Anthropic path implemented (skipped in test due to no API key, but structurally complete).

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
