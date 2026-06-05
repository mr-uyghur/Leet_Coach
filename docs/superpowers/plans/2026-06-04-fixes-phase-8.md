# Phase 8 Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical and High bugs discovered in the Phase 7 codebase review; apply Medium and Low fixes; leave the extension in a tested, shippable state.

**Architecture:** Each fix is self-contained and tested. Fixes are ordered Critical → High → Medium → Low so each commit leaves the extension in a shippable state. The requestId system (Task 5) touches the most files and must land as a single atomic commit.

**Tech Stack:** TypeScript strict, Vitest + RTL, Zustand, Chrome MV3 service worker + Port API

---

## Context

Full `src/` audit performed after Phase 7 completion (38 TypeScript/TSX source files + manifest, public/page-script.js, scripts/postbuild.js).

The extension works but has several real-user-visible defects. The most severe is **cross-problem stream contamination**: when a user navigates between LeetCode problems while a response is streaming, the in-flight response from Problem A can land in Problem B's conversation and get persisted there under Problem B's slug. A second persisted bug: once a user unlocks the full solution, the ↺ hint-reset button does not clear `solutionUnlocked`, so the problem is permanently locked into solution mode — the Anti-Spoiler Rule can never be re-engaged for that problem.

---

## Prioritized Issue List

### CRITICAL

**C1 — Cross-problem stream contamination (no abort, no requestId)**
- **Files:** `src/background/index.ts` (no AbortController), `src/sidebar/hooks/useChat.ts` (no stale-message guard), `src/sidebar/stores/chatStore.ts:95` (`finalizeMessage` has no slug guard)
- **Root cause:** When the user navigates to Problem B, `setProblem` resets the store, but the background's `for await (chunk of callModel(...))` is still running for Problem A. `CHAT_DONE` arrives at the panel and `finalizeMessage()` appends Problem A's response to Problem B's message list — which is then persisted to storage under Problem B's slug.
- **Fix:** Add `AbortController` to background per-request; add `requestId` field to CHAT_REQUEST / CHAT_DELTA / CHAT_DONE / CHAT_ERROR; panel ignores chunks whose `requestId` doesn't match the current request.

---

### HIGH

**H1 — `solutionUnlocked` not cleared on ↺ reset (now persisted)**
- **Files:** `src/sidebar/components/HintControls.tsx:47-54`, `src/sidebar/stores/chatStore.ts:177-179`
- **Root cause:** The ↺ reset button calls `setHintTier(0)` which only sets `hintTier`; `solutionUnlocked` remains `true`. `selectSystemPrompt` routes to `buildSolutionPrompt` whenever `solutionUnlocked` is true, ignoring tier. Since the hotfix (Phase 7), this state is also persisted, so there is literally no UI path back to Socratic coaching for that problem — ever.
- **Fix:** Add `resetHints()` store action that sets `hintTier: 0, solutionUnlocked: false`; use it in ↺ button; show ↺ when `hintTier > 0 || solutionUnlocked`.

**H2 — TEST_PROVIDERS debug handler left in production**
- **File:** `src/background/index.ts:146-214`
- **Root cause:** The Phase 3 "TEMPORARY" handler was explicitly marked for removal before the phase was marked complete, but never removed. It adds a live `chrome.runtime.onMessage` listener to the production service worker, increasing SW activation surface area.
- **Fix:** Delete lines 146–214.

**H3 — Anthropic SSE parser drops partial `data:` lines**
- **File:** `src/background/api.ts:callAnthropic()`, lines 244–277
- **Root cause:** `decoder.decode(value, { stream: true })` can split a `data: {...}` line across two `reader.read()` calls. The OpenAI-compat path has an `incomplete` buffer for exactly this case; `callAnthropic()` does not. A partially received JSON line is silently dropped → the model's final text chunk is lost.
- **Fix:** Add `let incomplete = ''` to `callAnthropic`, buffer incomplete lines across reads exactly as `callOpenAICompatible` does.

**H4 — Concurrent CHAT_REQUEST streams (no in-flight guard)**
- **File:** `src/background/index.ts:76-128`
- **Root cause:** `port.onMessage.addListener(async (msg) => {...})` starts a new `for await` loop for every `CHAT_REQUEST` with no guard. Two simultaneous requests race to call `port.postMessage({ type: 'CHAT_DONE' })`, corrupting in-flight state.
- **Fix:** Fixed together with C1 — the AbortController from C1 becomes the guard.

**H5 — OpenAI-compat `incomplete` buffer silently discarded at natural stream end**
- **File:** `src/background/api.ts:callOpenAICompatible()`, after the while loop
- **Root cause:** Some providers end the stream with `data: {...}\n` (no trailing `[DONE]` line). The `incomplete` variable holds this last partial line through the loop and is discarded. Last chunk of content is lost.
- **Fix:** After the while loop, attempt to parse `incomplete` as an SSE data line before calling `parser.flush()`.

---

### MEDIUM

**M1 — Monaco `LC_CODE_RESULT` has no requestId; stale response races next `extractCode()` call**
- **Files:** `src/content/extractors/code.ts:getPrimaryCode()`, `public/page-script.js`
- **Root cause:** If `extractCode()` times out and a new call starts, the old `LC_CODE_RESULT` arriving late resolves the *new* promise's handler (both listen for the same message type). The new call could receive the previous problem's code.
- **Fix:** Add a monotonic `requestId` to `LC_GET_CODE`; `page-script.js` echoes it in `LC_CODE_RESULT`; the handler ignores mismatched ids.

**M2 — `chat_template_kwargs` sent to LM Studio (may cause HTTP 400)**
- **File:** `src/background/api.ts:callOpenAICompatible()`, lines 299–305
- **Root cause:** `chat_template_kwargs: { enable_thinking: false }` is an Ollama-specific extension. LM Studio may reject it with a 400 error in Edge Cases mode.
- **Fix:** Only inject `chat_template_kwargs` when `request.provider === 'ollama'`.

**M3 — postbuild chunk detection is fragile**
- **File:** `scripts/postbuild.js:31–34`
- **Root cause:** Background chunk identified as `!src.trimStart().startsWith('(function(')`. If Vite's IIFE output format changes both chunks could look the same.
- **Fix:** Key on ES module `import` statement prefix as primary signal; fall back to non-IIFE check.

---

### LOW

**L1 — Production console.log noise** — All `[LCCoach]` prefixed logs useful for debugging but verbose for end users. (Deferred — not a correctness issue.)

**L2 — Popup `tab.id` falsy check**
- **File:** `src/popup/Popup.tsx:5`
- `if (tab?.id)` fails if `tab.id === 0`. Should be `if (tab?.id != null)`.

**L3 — Phase 3 TODO comment in messages.ts**
- **File:** `src/shared/messages.ts:3` — stale TODO from Phase 3, no longer accurate.

---

## File Map

| File | Changes |
|------|---------|
| `src/shared/messages.ts` | Add `requestId: string` to `ChatRequestMessage.payload`, `ChatDeltaMessage`, `ChatDoneMessage`, `ChatErrorMessage`; remove stale TODO |
| `src/shared/types.ts` | Add `signal?: AbortSignal` to `ModelRequest` |
| `src/background/api.ts` | Fix Anthropic incomplete-line buffer; fix OpenAI natural-end flush; thread `signal` into both `fetch()` calls; guard `chat_template_kwargs` to Ollama only |
| `src/background/index.ts` | Remove TEST_PROVIDERS handler; add `activeAbortController`; echo `requestId` in CHAT_DELTA/DONE/ERROR |
| `src/sidebar/hooks/useChat.ts` | Track `currentRequestIdRef`; ignore stale CHAT_DELTA/DONE/ERROR |
| `src/sidebar/stores/chatStore.ts` | Add `resetHints()` action |
| `src/sidebar/components/HintControls.tsx` | Use `resetHints()`; show ↺ when `hintTier > 0 || solutionUnlocked` |
| `src/content/extractors/code.ts` | Add requestId to `LC_GET_CODE` / validate `LC_CODE_RESULT` |
| `public/page-script.js` | Echo requestId in `LC_CODE_RESULT` |
| `scripts/postbuild.js` | Improve background chunk detection |
| `src/popup/Popup.tsx` | Fix tab.id falsy check |
| `src/background/api.test.ts` | New: unit tests for makeThinkParser + truncateMessages |
| `src/sidebar/stores/chatStore.test.ts` | Add tests for resetHints + cross-stream guard |
| `src/sidebar/components/HintControls.test.tsx` | Add tests for ↺ showing when solutionUnlocked |

---

## Tasks

### Task 1: Remove TEST_PROVIDERS debug handler [HIGH H2]

**Files:**
- Modify: `src/background/index.ts` — delete lines 146–214

- [ ] **Step 1: Delete the TEST_PROVIDERS block and unused PROVIDERS import**

Delete from `src/background/index.ts`:
- The entire block from `// TEMPORARY Phase 3 verification handler` to the end of file (lines 146–214)
- The `import { PROVIDERS } from '../shared/constants'` line (PROVIDERS only used in that block)

File should end with:
```ts
  port.onDisconnect.addListener(() => {
    if (panelPort === port) panelPort = null
    console.log('[LCCoach BG] Side panel disconnected')
  })
})
```

- [ ] **Step 2: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: zero TS errors, build exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/background/index.ts
git commit -m "fix(background): remove TEST_PROVIDERS debug handler left from Phase 3"
```

---

### Task 2: Fix solutionUnlocked not cleared on reset [HIGH H1]

**Files:**
- Modify: `src/sidebar/stores/chatStore.ts`
- Modify: `src/sidebar/components/HintControls.tsx`
- Modify: `src/sidebar/stores/chatStore.test.ts`
- Modify: `src/sidebar/components/HintControls.test.tsx`

- [ ] **Step 1: Write failing tests in chatStore.test.ts**

Add after existing `setHintTier` tests:
```ts
describe('resetHints', () => {
  it('sets hintTier to 0', () => {
    useChatStore.getState().setHintTier(3)
    useChatStore.getState().resetHints()
    expect(useChatStore.getState().hintTier).toBe(0)
  })

  it('clears solutionUnlocked', () => {
    useChatStore.getState().setHintTier(3)
    useChatStore.getState().unlockSolution()
    expect(useChatStore.getState().solutionUnlocked).toBe(true)
    useChatStore.getState().resetHints()
    expect(useChatStore.getState().solutionUnlocked).toBe(false)
  })

  it('does not clear conversation messages', () => {
    useChatStore.getState().addUserMessage('hello')
    useChatStore.getState().resetHints()
    expect(useChatStore.getState().messages).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
npm run test -- src/sidebar/stores/chatStore.test.ts
```

Expected: FAIL — `resetHints is not a function`.

- [ ] **Step 3: Add resetHints to the store interface and implementation**

In `src/sidebar/stores/chatStore.ts`:

Add to `ChatState` interface (after `unlockSolution`):
```ts
/** Resets hintTier to 0 AND clears solutionUnlocked. Used by the ↺ reset button. */
resetHints: () => void
```

Add to the `create<ChatState>` implementation (after `unlockSolution: () => { set({ solutionUnlocked: true }) },`):
```ts
resetHints: () => {
  set({ hintTier: 0, solutionUnlocked: false })
},
```

- [ ] **Step 4: Write failing HintControls tests**

In `src/sidebar/components/HintControls.test.tsx`, add:
```tsx
it('shows reset button when solutionUnlocked even if hintTier is 0', () => {
  useChatStore.setState({ hintTier: 0, solutionUnlocked: true, mode: 'socratic' })
  render(<HintControls />)
  expect(screen.getByTitle('Reset hint level')).toBeInTheDocument()
})
```

- [ ] **Step 5: Update HintControls to use resetHints**

In `src/sidebar/components/HintControls.tsx`:

Add subscription (after `const setHintTier = useChatStore((s) => s.setHintTier)`):
```ts
const solutionUnlocked = useChatStore((s) => s.solutionUnlocked)
const resetHints = useChatStore((s) => s.resetHints)
```

Change the ↺ button visibility and handler:

Old:
```tsx
{hintTier > 0 && (
  <button onClick={() => setHintTier(0)} ...>↺</button>
)}
```

New:
```tsx
{(hintTier > 0 || solutionUnlocked) && (
  <button onClick={resetHints} disabled={disabled} title="Reset hint level" ...>↺</button>
)}
```

- [ ] **Step 6: Run all tests**

```bash
npm run test
```

Expected: all tests pass (new tests included).

- [ ] **Step 7: Commit**

```bash
git add src/sidebar/stores/chatStore.ts src/sidebar/components/HintControls.tsx src/sidebar/stores/chatStore.test.ts src/sidebar/components/HintControls.test.tsx
git commit -m "fix(store): resetHints clears solutionUnlocked; show reset button when solution unlocked"
```

---

### Task 3: Fix Anthropic SSE incomplete-line buffer [HIGH H3]

**Files:**
- Modify: `src/background/api.ts` — `callAnthropic()` function
- Create: `src/background/api.test.ts`

- [ ] **Step 1: Create api.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { makeThinkParser, truncateMessages } from './api'

describe('makeThinkParser', () => {
  it('handles a think tag split across chunks', () => {
    const parser = makeThinkParser()
    const r1 = parser.feed('Hello <thi')
    const r2 = parser.feed('nk>reasoning</think> world')
    const all = [...r1, ...r2]
    expect(all.filter(c => c.type === 'content').map(c => c.text).join('')).toBe('Hello  world')
    expect(all.filter(c => c.type === 'thinking').map(c => c.text).join('')).toBe('reasoning')
  })

  it('flush emits pending partial tag as content', () => {
    const parser = makeThinkParser()
    parser.feed('Hello <thi')
    const flushed = parser.flush()
    expect(flushed.map(c => c.text).join('')).toBe('<thi')
  })
})

describe('truncateMessages', () => {
  it('drops oldest messages to fit within budget', () => {
    const messages = [
      { role: 'user' as const, content: 'a'.repeat(4000) },
      { role: 'assistant' as const, content: 'b'.repeat(4000) },
      { role: 'user' as const, content: 'c'.repeat(4000) },
    ]
    const result = truncateMessages(messages, 'x'.repeat(400), 5000)
    expect(result.length).toBeLessThan(3)
    expect(result[result.length - 1].content).toBe('c'.repeat(4000))
  })
})
```

- [ ] **Step 2: Confirm tests pass against existing code**

```bash
npm run test -- src/background/api.test.ts
```

Expected: PASS.

- [ ] **Step 3: Add incomplete-line buffer to callAnthropic()**

In `src/background/api.ts` inside `callAnthropic()`, find:
```ts
let eventType = ''
let dataBuffer = ''
```

Add `let incomplete = ''` after them.

Find:
```ts
const text = decoder.decode(value, { stream: true })
const lines = text.split('\n')
```

Replace with:
```ts
const text = decoder.decode(value, { stream: true })
const lines = (incomplete + text).split('\n')
incomplete = lines.pop() ?? ''
```

After the `while (true)` loop (before the function closes), add:
```ts
// Flush any incomplete SSE line at natural stream end
if (incomplete.startsWith('data:')) {
  dataBuffer = incomplete.slice(5).trim()
  if (eventType === 'content_block_delta' && dataBuffer) {
    try {
      const parsed = JSON.parse(dataBuffer) as { delta?: { type: string; text?: string } }
      if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
        yield { type: 'content', text: parsed.delta.text }
      }
    } catch { /* malformed — skip */ }
  }
} else if (incomplete.startsWith('event:')) {
  // event line without subsequent data — nothing to flush
}
```

- [ ] **Step 4: Typecheck + full test run**

```bash
npm run typecheck && npm run test
```

Expected: zero errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/background/api.ts src/background/api.test.ts
git commit -m "fix(api): add incomplete-line buffer to Anthropic SSE parser; add api.test.ts"
```

---

### Task 4: Fix OpenAI-compat natural stream end flush [HIGH H5]

**Files:**
- Modify: `src/background/api.ts` — `callOpenAICompatible()` function

- [ ] **Step 1: Apply the fix**

In `src/background/api.ts` inside `callOpenAICompatible()`, find the section after the while loop:
```ts
  // Flush at natural stream end (no [DONE] line)
  for (const chunk of parser.flush()) {
    yield chunk
  }
```

Replace with:
```ts
  // Parse any incomplete SSE line buffered at natural stream end (no [DONE] line)
  if (incomplete.startsWith('data:')) {
    const data = incomplete.slice(5).trim()
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string | null } }>
        }
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          for (const chunk of parser.feed(content)) {
            yield chunk
          }
        }
      } catch { /* malformed — skip */ }
    }
  }

  // Flush the think-tag parser at natural stream end
  for (const chunk of parser.flush()) {
    yield chunk
  }
```

- [ ] **Step 2: Typecheck + test**

```bash
npm run typecheck && npm run test
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/background/api.ts
git commit -m "fix(api): flush incomplete SSE line at OpenAI-compat natural stream end"
```

---

### Task 5: Add requestId + AbortController [CRITICAL C1 + HIGH H4]

This is the largest change — 5 files, one atomic commit.

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/background/api.ts`
- Modify: `src/background/index.ts`
- Modify: `src/sidebar/hooks/useChat.ts`
- Modify: `src/sidebar/stores/chatStore.test.ts`

- [ ] **Step 1: Update message types in src/shared/messages.ts**

```ts
export interface ChatRequestMessage {
  type: 'CHAT_REQUEST'
  payload: {
    requestId: string          // NEW
    messages: Message[]
    settings: Settings
    problemContext: ProblemContext
    hintTier: 0 | 1 | 2 | 3
    mode: 'socratic' | 'review' | 'edgecases'
    solutionUnlocked: boolean
  }
}

export interface ChatDeltaMessage {
  type: 'CHAT_DELTA'
  requestId: string            // NEW
  delta: string
}

export interface ChatDoneMessage {
  type: 'CHAT_DONE'
  requestId: string            // NEW
  thinkingContent?: string
}

export interface ChatErrorMessage {
  type: 'CHAT_ERROR'
  requestId: string            // NEW
  error: string
}
```

- [ ] **Step 2: Add signal to ModelRequest in src/shared/types.ts**

Add to `ModelRequest` interface:
```ts
signal?: AbortSignal           // NEW — for request cancellation
```

- [ ] **Step 3: Thread signal through fetch() calls in src/background/api.ts**

In `callAnthropic()`, add `signal: request.signal` to the fetch call options.
In `callOpenAICompatible()`, add `signal: request.signal` to the fetch call options.

- [ ] **Step 4: Update background/index.ts — AbortController + requestId echo**

Add module-level variable:
```ts
let activeAbortController: AbortController | null = null
```

Replace the entire `port.onMessage.addListener(async (msg) => {...})` block with:
```ts
port.onMessage.addListener(async (msg) => {
  if (msg.type !== 'CHAT_REQUEST') return

  const chatMsg = msg as ChatRequestMessage
  const { requestId } = chatMsg.payload

  // Abort any previous in-flight request (fixes C1 + H4)
  if (activeAbortController) {
    activeAbortController.abort()
  }
  activeAbortController = new AbortController()
  const signal = activeAbortController.signal

  const { mode, hintTier, solutionUnlocked, problemContext } = chatMsg.payload
  const systemPrompt = selectSystemPrompt({ mode, hintTier, solutionUnlocked, problem: problemContext })
  console.log(
    `[LCCoach BG] System prompt selected: mode=${mode}, tier=${hintTier}, solutionUnlocked=${solutionUnlocked}, length=${systemPrompt.length}`
  )

  const request: ModelRequest = {
    provider: chatMsg.payload.settings.provider,
    model: chatMsg.payload.settings.model,
    apiKey: chatMsg.payload.settings.apiKey || undefined,
    messages: chatMsg.payload.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    systemPrompt,
    stream: true,
    thinkingMode: mode !== 'edgecases',
    signal,
  }

  let thinkingAccumulator = ''

  try {
    for await (const chunk of callModel(request)) {
      if (signal.aborted) return
      if (chunk.type === 'content') {
        port.postMessage({ type: 'CHAT_DELTA', requestId, delta: chunk.text })
      } else {
        thinkingAccumulator += chunk.text
      }
    }

    if (!signal.aborted) {
      port.postMessage({
        type: 'CHAT_DONE',
        requestId,
        thinkingContent: thinkingAccumulator || undefined,
      })
    }
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
    const message = err instanceof Error ? err.message : String(err)
    port.postMessage({ type: 'CHAT_ERROR', requestId, error: message })
  } finally {
    if (activeAbortController?.signal === signal) {
      activeAbortController = null
    }
  }
})
```

- [ ] **Step 5: Update useChat.ts — track requestId, ignore stale chunks**

Add ref after the existing action refs:
```ts
const currentRequestIdRef = useRef<string | null>(null)
```

Update the `onMessage` handler to filter by requestId:
```ts
function onMessage(msg: {
  type: string
  requestId?: string
  delta?: string
  thinkingContent?: string
  error?: string
}) {
  switch (msg.type) {
    case 'CHAT_DELTA':
      if (msg.requestId !== currentRequestIdRef.current) return
      if (msg.delta) appendDeltaRef.current(msg.delta)
      break
    case 'CHAT_DONE':
      if (msg.requestId !== currentRequestIdRef.current) return
      currentRequestIdRef.current = null
      finalizeMessageRef.current(msg.thinkingContent)
      break
    case 'CHAT_ERROR':
      if (msg.requestId !== currentRequestIdRef.current) return
      console.error('[LCCoach Panel] CHAT_ERROR from background:', msg.error)
      currentRequestIdRef.current = null
      setErrorRef.current(msg.error ?? 'Unknown error from background')
      break
  }
}
```

Update `sendMessage` to generate + track requestId:
```ts
const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
currentRequestIdRef.current = requestId
// ... then include requestId in chatRequest.payload
```

On the `catch` block inside sendMessage:
```ts
currentRequestIdRef.current = null
```

- [ ] **Step 6: Add store tests for cross-stream safety**

In `src/sidebar/stores/chatStore.test.ts`, add:
```ts
describe('cross-stream contamination guard', () => {
  it('finalizeMessage with empty inFlightContent does nothing', () => {
    useChatStore.getState().finalizeMessage(undefined)
    expect(useChatStore.getState().messages).toHaveLength(0)
    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('resetConversation clears in-flight state', () => {
    useChatStore.getState().addUserMessage('hello')
    useChatStore.getState().appendDelta('partial')
    useChatStore.getState().resetConversation()
    expect(useChatStore.getState().inFlightContent).toBe('')
    expect(useChatStore.getState().isStreaming).toBe(false)
  })
})
```

- [ ] **Step 7: Typecheck + full test run + build**

```bash
npm run typecheck && npm run test && npm run build
```

Expected: zero TS errors, all tests pass, build exits 0.

- [ ] **Step 8: Commit atomically**

```bash
git add src/shared/messages.ts src/shared/types.ts src/background/api.ts src/background/index.ts src/sidebar/hooks/useChat.ts src/sidebar/stores/chatStore.test.ts
git commit -m "fix(critical): add requestId + AbortController to prevent cross-problem stream contamination"
```

---

### Task 6: Fix Monaco requestId race [MEDIUM M1]

**Files:**
- Modify: `src/content/extractors/code.ts`
- Modify: `public/page-script.js`

- [ ] **Step 1: Update page-script.js to echo requestId**

Replace entire file:
```js
;(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window) return
    if (!event.data || event.data.type !== 'LC_GET_CODE') return

    const requestId = event.data.requestId

    try {
      const models = window.monaco && window.monaco.editor && window.monaco.editor.getModels()
      const code = models && models.length > 0 ? models[0].getValue() : null
      window.postMessage({ type: 'LC_CODE_RESULT', requestId, code: code || '', error: null }, '*')
    } catch (err) {
      window.postMessage({ type: 'LC_CODE_RESULT', requestId, code: '', error: String(err) }, '*')
    }
  })
})()
```

- [ ] **Step 2: Update getPrimaryCode in code.ts**

Add module-level counter and update the function:
```ts
let _codeRequestCounter = 0

function getPrimaryCode(): Promise<string> {
  const requestId = `code-${++_codeRequestCounter}`

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Monaco code request timed out after 3s'))
    }, MONACO_REQUEST_TIMEOUT_MS)

    function handler(event: MessageEvent) {
      if (event.source !== window) return
      if (!event.data || event.data.type !== 'LC_CODE_RESULT') return
      if (event.data.requestId !== requestId) return  // ignore stale responses
      clearTimeout(timeout)
      window.removeEventListener('message', handler)
      if (event.data.error) {
        reject(new Error(String(event.data.error)))
      } else {
        resolve(event.data.code ?? '')
      }
    }

    window.addEventListener('message', handler)
    window.postMessage({ type: 'LC_GET_CODE', requestId }, '*')
  })
}
```

- [ ] **Step 3: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/content/extractors/code.ts public/page-script.js
git commit -m "fix(extraction): add requestId to Monaco LC_GET_CODE to prevent stale response race"
```

---

### Task 7: Guard chat_template_kwargs to Ollama only [MEDIUM M2]

**Files:**
- Modify: `src/background/api.ts`

- [ ] **Step 1: Apply the fix**

In `callOpenAICompatible()`, change:
```ts
if (request.thinkingMode === false) {
  extraBody['chat_template_kwargs'] = { enable_thinking: false }
}
```

To:
```ts
// chat_template_kwargs is Ollama-specific; LM Studio may reject it with HTTP 400
if (request.thinkingMode === false && request.provider === 'ollama') {
  extraBody['chat_template_kwargs'] = { enable_thinking: false }
}
```

- [ ] **Step 2: Typecheck + test**

```bash
npm run typecheck && npm run test
```

- [ ] **Step 3: Commit**

```bash
git add src/background/api.ts
git commit -m "fix(api): guard chat_template_kwargs to Ollama only; LM Studio may reject it"
```

---

### Task 8: Improve postbuild chunk detection [MEDIUM M3]

**Files:**
- Modify: `scripts/postbuild.js`

- [ ] **Step 1: Replace the IIFE-prefix check**

Replace the `bgChunk` detection block:
```js
const bgChunk = indexChunks.find(f => {
  const src = readFileSync(resolve(dist, 'assets', f), 'utf8').trimStart()
  // Primary: ES module (background) starts with import statement
  if (src.startsWith('import ') || src.startsWith('import{')) return true
  // Fallback: not an IIFE
  return !src.startsWith('(function(')
})
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: `[postbuild] service-worker-loader.js: now imports ./assets/index.ts-XXXX.js`

- [ ] **Step 3: Commit**

```bash
git add scripts/postbuild.js
git commit -m "fix(build): improve background chunk detection; use ES module import prefix as primary signal"
```

---

### Task 9: Low-severity cleanup + final BUILD_STATUS [LOW]

**Files:**
- Modify: `src/popup/Popup.tsx`
- Modify: `src/shared/messages.ts`
- Modify: `BUILD_STATUS.md`

- [ ] **Step 1: Fix Popup tab.id check**

Change `if (tab?.id) {` to `if (tab?.id != null) {`

- [ ] **Step 2: Remove stale TODO from messages.ts**

Remove the line: `// TODO: Phase 3 — finalize CHAT_REQUEST / CHAT_DELTA / CHAT_DONE / CHAT_ERROR payloads`

- [ ] **Step 3: Full verification**

```bash
npm run typecheck && npm run test && npm run build
```

Expected: zero TS errors, all tests pass, build exits 0.

- [ ] **Step 4: Add Phase 8 completion checkpoint to BUILD_STATUS.md**

Add to the top of the Checkpoint Log:

```markdown
### Phase 8 — ✅ Complete (2026-06-04) — Automated verification passed; manual Chrome check recommended

**Built:**
- Removed TEST_PROVIDERS debug handler from production background (High H2)
- `resetHints()` store action — ↺ button now clears `solutionUnlocked` too; button visible whenever `hintTier > 0 || solutionUnlocked` (High H1)
- `requestId` added to all CHAT_* messages; background uses `AbortController` to cancel in-flight requests on new CHAT_REQUEST; panel ignores stale chunks by requestId (Critical C1 + High H4)
- Anthropic SSE: added `incomplete` line buffer matching OpenAI-compat path (High H3)
- OpenAI-compat: parse `incomplete` buffer before `parser.flush()` at natural stream end (High H5)
- Monaco `LC_GET_CODE` / `LC_CODE_RESULT` now include requestId to prevent stale response race (Medium M1)
- `chat_template_kwargs` guarded to Ollama only — LM Studio no longer receives it in Edge Cases mode (Medium M2)
- postbuild chunk detection improved (Medium M3)
- Popup `tab.id` check corrected (Low L2); stale Phase 3 TODO removed from messages.ts (Low L3)

**Verified:**
- `npm run typecheck` — zero TS errors
- `npm run test` — all tests pass
- `npm run build` — exits 0, postbuild patches applied

**Manual Chrome check recommended:**
- Navigate to Problem A → start a chat → immediately navigate to Problem B → verify Problem B shows clean state (no Problem A content)
- Reach Tier 3, unlock solution, click ↺ reset → AI should return to Socratic coaching (Tier 0)
- Set Tier 3, unlock solution, close/reopen panel → solution should still be unlocked (persistence not broken by the fix)
- Use LM Studio in Edge Cases mode — should not fail with HTTP 400 errors
```

- [ ] **Step 5: Final commit**

```bash
git add src/popup/Popup.tsx src/shared/messages.ts BUILD_STATUS.md
git commit -m "fix(cleanup): popup tab.id check, remove stale TODO; Phase 8 complete in BUILD_STATUS"
```

---

## Verification

After all tasks complete:

```bash
npm run typecheck   # zero errors
npm run test        # all tests pass (count > 72 due to new tests)
npm run build       # exits 0, postbuild applies correctly
```

**Manual Chrome verification checklist:**
1. Load `dist/` unpacked in Chrome
2. Navigate Problem A → start chat → navigate mid-stream to Problem B → Problem B must show clean state
3. Set Tier 3, unlock solution, click ↺ → AI returns to Socratic coaching
4. Set Tier 3, unlock solution, close/reopen panel → solution still unlocked (persistence intact)
5. LM Studio + Edge Cases mode → no HTTP 400 errors
6. Ollama + Edge Cases mode → thinking correctly disabled
