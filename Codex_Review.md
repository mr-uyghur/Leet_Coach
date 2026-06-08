# Codex Principal Review And Hardening Ledger

Date opened: 2026-06-07  
Last updated: 2026-06-07  
Project: LeetCode Coach Chrome Extension MV3

## Executive Status

The original review found seven architectural weaknesses. The implementation work now completed Phase 9 and Phase 10 hardening across the service-worker boundary, side-panel port lifecycle, content extraction path, storage hydration, and automated tests.

Current status:

| Area | Status | Evidence |
|---|---|---|
| Background-owned anti-spoiler authority | Fixed | `src/background/index.ts`, `src/shared/messageValidators.ts`, `src/background/index.test.ts` |
| Per-tab background session isolation | Fixed | `src/background/index.ts`, `src/background/index.test.ts` |
| Port reconnect / disconnect handling | Fixed for panel lifecycle | `src/sidebar/hooks/useBackgroundPort.ts`, `src/sidebar/hooks/useBackgroundPort.test.tsx` |
| Stream abort on disconnect / supersede / slug change | Fixed | `src/background/index.ts`, `src/background/index.test.ts` |
| SPA stale extraction race | Fixed | `src/content/bridge.ts`, `src/content/bridge.test.ts` |
| Monaco fallback provenance | Fixed | `src/content/extractors/code.ts`, `src/content/extractors/code.test.ts`, `src/shared/prompts/index.ts`, `src/sidebar/components/CodeViewer.tsx` |
| Storage validation | Fixed | `src/background/storage.ts`, `src/background/storage.test.ts` |
| Full runtime message validation | Fixed for extension protocol | `src/shared/messageValidators.ts`, `src/shared/messageValidators.test.ts` |
| True resumable LLM stream after MV3 service-worker death | Not implemented by design | See residual risk below |
| Manual Chrome extension verification | Still required | Cannot be completed from this terminal-only session |

## Verification History

Initial review verification:
- `npm.cmd run typecheck` passed.
- `npm.cmd run test` passed with 8 files / 97 tests.
- Direct `npm` failed under PowerShell because unsigned `npm.ps1` is blocked; `npm.cmd` is the correct command on this machine.

Phase 9 verification:
- `npm.cmd run typecheck` passed.
- `npm.cmd run test` passed with 9 files / 100 tests.
- `npm.cmd run build` passed and postbuild patches applied.

Phase 10 verification:
- `npm.cmd run typecheck` passed.
- `npm.cmd run test` passed with 14 files / 120 tests.
- `npm.cmd run build` passed and postbuild patches applied.

## Original Findings And Resolution

### 1. Background Trusted Client-Controlled Anti-Spoiler State

Original problem:
- `CHAT_REQUEST` carried `problemContext`, `hintTier`, and `solutionUnlocked`.
- The background selected system prompts from side-panel supplied state.
- A malformed client message could force full solution mode by setting `solutionUnlocked: true`.

Implemented fix:
- `CHAT_REQUEST` no longer carries trusted problem or policy state.
- Background owns active problem, hint tier, solution unlock state, active port, and active stream per tab.
- Side panel sends explicit `HINT_TIER_UPDATED` and `UNLOCK_SOLUTION` events.
- Background ignores `UNLOCK_SOLUTION` unless trusted background state is already Tier 3.
- Runtime validator strips forged legacy fields from chat requests.

Files:
- `src/background/index.ts`
- `src/shared/messages.ts`
- `src/shared/messageValidators.ts`
- `src/sidebar/hooks/useChat.ts`

Tests:
- `src/shared/messageValidators.test.ts`
- `src/background/index.test.ts`

Status: Fixed.

Residual risk:
- The side panel can still request Tier 3 through the allowed protocol because hint controls are client-side UI. This is acceptable for a personal extension; the hard invariant is that full solution mode requires a separate background-accepted unlock after Tier 3.

### 2. Single Global Service-Worker State Was Not Tab-Safe

Original problem:
- `latestProblem`, `panelPort`, and `activeAbortController` were module-level globals.
- Multiple LeetCode tabs could overwrite each other's state or abort each other's streams.

Implemented fix:
- Background now stores sessions in `Map<number, SessionState>` keyed by tab ID.
- Each session tracks its own problem, hint tier, solution unlock, port, and abort controller.
- Problem updates route through `sender.tab.id`.

Files:
- `src/background/index.ts`

Tests:
- `src/background/index.test.ts`

Status: Fixed.

Residual risk:
- Chrome's Side Panel UI is effectively active-tab oriented. The implementation isolates sessions by tab ID, but real multi-window behavior should still be manually checked in Chrome.

### 3. Port Reconnect Handling Was Fragile

Original problem:
- `useProblem` created the port and `useChat` attached listeners based on effect ordering.
- If a port disconnected and reconnected, listeners could stay bound to the old port.
- No explicit connected/disconnected state existed.

Implemented fix:
- Added `useBackgroundPort`.
- The hook owns connect, disconnect, bounded reconnect backoff, `portVersion`, `status`, `portError`, and `sendToBackground`.
- `useProblem` now only hydrates problem conversations from `PROBLEM_UPDATED`.
- `useChat` now only handles chat/policy messages through the port manager.
- Policy sync resets on `portVersion`, so a new background session receives current hint/unlock state.

Files:
- `src/sidebar/hooks/useBackgroundPort.ts`
- `src/sidebar/hooks/useProblem.ts`
- `src/sidebar/hooks/useChat.ts`
- `src/sidebar/App.tsx`

Tests:
- `src/sidebar/hooks/useBackgroundPort.test.tsx`

Status: Fixed for reconnect/disconnect lifecycle.

Residual risk:
- The UI does not yet show a persistent "reconnecting" banner when idle and disconnected. During streaming, interruption is surfaced as a chat error.

### 4. Streaming Was Volatile Across Side-Panel Close And MV3 Lifecycle Edges

Original problem:
- Partial assistant content lived only in sidebar state until `CHAT_DONE`.
- A panel close or disconnect could leave the stream running without a consumer.
- MV3 service-worker death could drop in-memory request state.

Implemented fix:
- Background aborts active streams when a newer request supersedes them.
- Background aborts active streams on port disconnect.
- Background aborts active streams on owning problem slug change.
- Sidebar detects disconnected status while streaming and shows: `Connection interrupted. Send again to retry.`

Files:
- `src/background/index.ts`
- `src/sidebar/hooks/useChat.ts`
- `src/sidebar/hooks/useBackgroundPort.ts`

Tests:
- `src/background/index.test.ts`

Status: Fixed for disconnect/supersede/navigation interruption.

Residual risk:
- True resumable streaming after MV3 service-worker death is not implemented. Current behavior is explicit interruption and retry. Real resume would require a persisted request journal and provider-level replay/resume semantics, which neither local OpenAI-compatible SSE nor Anthropic SSE provides in the current abstraction.

### 5. SPA Extraction Could Send Mismatched Problem/Code Context

Original problem:
- The content script captured problem metadata, awaited code extraction, then sent the payload.
- If navigation happened during the await, old metadata could pair with new code or the reverse.

Implemented fix:
- Added extraction generation IDs.
- Captures starting slug before extraction.
- Rechecks current slug and generation before sending.
- Drops stale extraction payloads.
- Added pure `shouldDropExtraction` helper for tests.

Files:
- `src/content/bridge.ts`

Tests:
- `src/content/bridge.test.ts`

Status: Fixed.

Residual risk:
- LeetCode can still change DOM structure. Selector brittleness remains an ongoing maintenance surface.

### 6. Monaco Fallback Had No Protocol-Level Provenance

Original problem:
- `extractCode()` returned a string only.
- DOM fallback is partial because Monaco virtualizes visible lines.
- Code Review mode could silently review incomplete code.

Implemented fix:
- Added `extractCodeSnapshot()`.
- Code snapshots include:
  - `source: "monaco" | "dom-fallback" | "missing"`
  - `complete: boolean`
- `ProblemContext` now carries:
  - `codeSource`
  - `codeComplete`
  - `extractedAt`
- Prompt formatter warns when code may be partial.
- CodeViewer shows a `partial` badge for DOM fallback or incomplete code.
- Monaco path now uses bounded polling before falling back.

Files:
- `src/content/extractors/code.ts`
- `src/shared/types.ts`
- `src/shared/prompts/index.ts`
- `src/sidebar/components/CodeViewer.tsx`

Tests:
- `src/content/extractors/code.test.ts`
- `src/shared/prompts/promptContent.test.ts`

Status: Fixed.

Residual risk:
- If Monaco exists but returns semantically stale code, the extension cannot independently prove freshness without deeper editor model identity checks. Current request IDs prevent stale page-script responses, and bridge generation prevents cross-navigation payloads.

### 7. Storage Validation Was Too Loose

Original problem:
- Saved `hintTier` was cast into the union type.
- Malformed messages were trusted from `chrome.storage.local`.

Implemented fix:
- Storage hydration now uses shared validators.
- Invalid hint tiers clamp to `0`.
- Malformed saved messages are filtered.
- Settings provider/model validation remains provider-aware.

Files:
- `src/background/storage.ts`
- `src/shared/messageValidators.ts`

Tests:
- `src/background/storage.test.ts`
- `src/shared/messageValidators.test.ts`

Status: Fixed.

Residual risk:
- `chrome.storage.local` can still be edited by a user with devtools, but invalid data now degrades to safe defaults instead of becoming trusted typed state.

## Remaining Work

### Required Manual Verification

These must be checked in Chrome with the unpacked extension:

1. Open Problem A, start a stream, close the side panel.
   Expected: no later chunks append; user sees interruption/retry behavior if panel remains open during disconnect.

2. Open two LeetCode problem tabs.
   Expected: each tab keeps separate problem context and stream ownership.

3. Navigate Problem A to Problem B during extraction.
   Expected: stale Problem A payload does not replace Problem B context.

4. Force/delay Monaco availability.
   Expected: Monaco polling succeeds when possible; DOM fallback shows `partial`.

5. Try full solution before Tier 3.
   Expected: background remains in anti-spoiler prompt mode.

6. Reach Tier 3, confirm full solution.
   Expected: background enters solution mode and returns the solution.

7. Reset hints/new chat after solution unlock.
   Expected: background returns to locked Socratic mode.

### Intentional Non-Goal

True resumable provider streaming after service-worker death is not implemented. The implemented policy is explicit interruption and retry. This is the correct engineering tradeoff for the current provider abstraction.

## Final Action Ledger

| Task | Status |
|---|---|
| Save principal review in project directory | Done |
| Mark tasks already worked on | Done, then replaced with this full ledger |
| Background source of truth for policy/problem/request | Done |
| Per-tab sessions | Done |
| Abort streams on port disconnect | Done |
| Abort streams on supersede | Done |
| Abort streams on problem slug change | Done |
| SPA stale extraction guard | Done |
| Monaco fallback provenance | Done |
| Monaco readiness polling | Done |
| Storage validation | Done |
| Full runtime protocol validation | Done |
| Sidebar port manager with reconnect/backoff/status | Done |
| Background service-worker behavior tests | Done |
| Extraction/provenance tests | Done |
| Manual Chrome verification | Not done in this terminal session |
| True resumable streaming after service-worker death | Not implemented by design |
