# LeetCode Coach — Phase 1 MVP Build Prompt

> Copy this entire document as a prompt into a fresh Claude Code session inside this directory.

---

## Your Mission

Build the Phase 1 MVP of **LeetCode Coach**: a personal AI-powered Socratic-tutor Chrome extension that lives as a side panel on LeetCode problem pages. It coaches the user to *think*, not to copy answers. This is a coach, not a cheat tool.

**The most important behavioral rule in this entire project — the Anti-Spoiler Rule:**
The AI must never exceed the user's current hint tier regardless of how the request is phrased. If a user says "just give me the answer," the model responds: *"I can give you a stronger hint if you click the hint button — let's work through this together."* A solution is only ever shown after an explicit button click + confirmation dialog. This rule is enforced via the system prompt at every model call.

Work **phased, plan-first.** Before writing any code, state what you're about to build in that phase, then build it. Verify each phase works before moving on. Build everything in the **current working directory** — do not create a nested `leetcode-coach/` subfolder.

---

## Locked Technical Decisions

These are settled. Do not relitigate them.

### 1. Chrome Side Panel API (not an injected sidebar)

Use `chrome.sidePanel` (the native Chrome Side Panel API, MV3). Do **not** inject a React `<div>` sidebar into the LeetCode page.

**Why:** The side panel is a separate document — full CSS isolation (Tailwind won't bleed into LeetCode's styles, LeetCode's styles won't fight yours), layout stability against LeetCode's React SPA re-renders, and a clean message-passing boundary enforced by the browser. The trade-off is that the panel cannot read page DOM directly — the content script handles extraction and relays via the background service worker's message bus. This is the cleaner architecture regardless.

### 2. Qwen3 Thinking Mode: Task-Conditional

- **Socratic Chat + Code Review:** thinking mode **on** by default (reasoning improves coaching quality).
- **Edge Cases mode:** thinking mode **off** (generative/enumerative, no benefit from deep reasoning chain).

Thinking tokens (`<think>…</think>` / `reasoning` fields) are **stripped from the visible answer** and offered as a collapsible "Show reasoning" UI element. They must never become the visible assistant message — that would violate the Anti-Spoiler Rule.

### 3. Streaming via Background Service Worker Ports

- Anthropic: SSE streaming.
- Ollama + LM Studio: OpenAI-compatible streaming (ReadableStream/SSE).

The background service worker opens a **long-lived `chrome.runtime.Port`** to the side panel and pushes token deltas as they arrive. The side panel's Zustand store appends deltas to the current in-flight assistant message. React re-renders are throttled (~30–60ms, or via `requestAnimationFrame`) to avoid layout thrash. `react-markdown` renders the accumulating string.

### 4. Context Truncation: Token-Budget Sliding Window

Always pin these in the context (never dropped):
1. The system prompt (with the active hint-tier directive embedded).
2. Problem context: title, statement, constraints, current user code snapshot.

Fill remaining budget with the most-recent conversation turns. Drop older turns when over budget (oldest first). Leave headroom for the model's response. Use a cheap token estimate (characters ÷ 4) against per-model max-context constants stored in `src/shared/constants.ts`. Note "conversation summarization" as a Phase 2 improvement hook but do not implement it now.

---

## LeetCode-Specific Extraction Rules

These are the details that separate an extractor that works from one that silently breaks.

### SPA Navigation (most likely thing to ship broken)

LeetCode is client-side routed. Navigating from problem A to problem B does **not** reload the page — no `DOMContentLoaded` fires. If extraction only runs on page load, the problem statement and code go stale the moment the user navigates.

**Requirement:** Re-trigger extraction on every route change. Implement both:
- `window.addEventListener('popstate', …)` + monkey-patching `history.pushState`/`history.replaceState`.
- A `MutationObserver` on the `<title>` element as a fallback signal (LeetCode updates `<title>` on navigation).

When a new problem is detected (URL slug changed), re-extract and push fresh problem context to the side panel, and start a new conversation.

### Monaco Code Extraction (API primary, DOM fallback is lossy)

LeetCode's code editor is Monaco. Two extraction paths exist:

**Primary — Monaco API via injected page script:**
`public/page-script.js` is injected into the page's main world (not the isolated content-script world) so it can access `window.monaco`. It calls `monaco.editor.getModels()[0].getValue()` and posts the result back via `window.postMessage`. The content script listens and relays to the background.

**Last-resort fallback — DOM `.view-line` scrape:**
Only used when the Monaco API path fails. This is **incomplete**: Monaco virtualizes long files and only renders visible lines in the DOM. Scraping `.view-line` elements returns a partial code snapshot for anything beyond ~50 lines. Do not treat these two paths as equivalent — make the fallback clearly labeled as degraded in comments and logs.

### Selector Fragility

LeetCode uses hashed/obfuscated class names that change with deployments. `src/content/extractors/selectors.ts` must prefer:
- Structural selectors (element type + position).
- ARIA attributes (`[aria-label]`, `[role]`).
- `data-*` attributes.
- Stable text content anchors.

Avoid any class name that looks like `css-xyz123` or is not a semantic/BEM name. Document why in comments. This file is the most break-prone surface in the project.

---

## Tech Stack (pinned — do not substitute)

| Concern | Choice |
|---------|--------|
| Extension format | Manifest V3 Chrome Extension |
| UI framework | React 18 + TypeScript |
| Styling | Tailwind CSS v3 — glassmorphism dark aesthetic matching LeetCode's dark theme |
| Build tool | Vite + `@crxjs/vite-plugin` |
| State management | Zustand |
| Markdown rendering | `react-markdown` |
| Persistence | `chrome.storage.local` |
| TypeScript | Strict mode (`"strict": true`) |

---

## Model Providers

Every LLM call routes through **one function**: `callModel(request: ModelRequest): AsyncIterable<string>` in `src/background/api.ts`. Swapping providers requires **zero changes** to any other file.

### Anthropic

- Endpoint: `https://api.anthropic.com/v1/messages`
- Default model: `claude-sonnet-4-6`
- Auth: Bearer API key from settings.
- Use the Messages API with `"stream": true`.

### Ollama

- Endpoint: `http://localhost:11434/v1/chat/completions`
- OpenAI-compatible API — use the same integration path as LM Studio.
- No auth required (local).
- Target local models (user has RTX 5070 Ti / 16GB VRAM — performance is not a concern):
  - **Qwen3-14B** — primary default.
  - Qwen3-30B-A3B MoE — listed as option.
  - Gemma 3 27B — listed as option.

### LM Studio

- Endpoint: `http://localhost:1234/v1/chat/completions`
- OpenAI-compatible API — same path as Ollama.
- No auth required (local).
- Same target model list as Ollama.

**OpenAI-compat shared path:** Ollama and LM Studio share a single `callOpenAICompatible()` helper that accepts a base URL + model name. Do not write two separate integrations.

---

## Folder Structure

Build exactly this layout:

```
.                          ← project root (current working directory)
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── src/
│   ├── content/
│   │   ├── index.ts           ← entry; registers extraction & navigation listeners
│   │   ├── extractors/
│   │   │   ├── problem.ts     ← extracts title, statement, constraints
│   │   │   ├── code.ts        ← Monaco API primary; DOM fallback
│   │   │   └── selectors.ts   ← all DOM selectors; prefer ARIA/structural
│   │   ├── injector.ts        ← injects public/page-script.js into main world
│   │   └── bridge.ts          ← postMessage relay from page-script → content script
│   ├── sidebar/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── HintControls.tsx   ← Nudge / Strategy / Pseudocode buttons
│   │   │   ├── ModeSelector.tsx   ← Socratic / Review / Edge Cases tabs
│   │   │   ├── CodeViewer.tsx     ← read-only snapshot of user's current code
│   │   │   ├── SettingsPanel.tsx  ← API key, provider, model selection
│   │   │   └── SolutionGate.tsx   ← unlock button + confirmation dialog
│   │   ├── hooks/
│   │   │   ├── useChat.ts
│   │   │   ├── useProblem.ts
│   │   │   └── useSettings.ts
│   │   └── stores/
│   │       └── chatStore.ts
│   ├── background/
│   │   ├── index.ts           ← service worker entry; registers message handlers
│   │   ├── api.ts             ← callModel() + provider routing + streaming
│   │   └── storage.ts         ← chrome.storage.local helpers
│   ├── shared/
│   │   ├── types.ts           ← all shared TypeScript types
│   │   ├── constants.ts       ← model max-context sizes, provider defaults, etc.
│   │   ├── messages.ts        ← typed chrome.runtime message schemas
│   │   └── prompts/
│   │       ├── coaching.ts    ← Socratic Chat system prompt (all 3 hint tiers)
│   │       ├── codeReview.ts  ← Code Review system prompt
│   │       ├── edgeCases.ts   ← Edge Cases system prompt
│   │       └── solution.ts    ← Solution unlock system prompt
│   └── popup/
│       ├── Popup.tsx          ← minimal popup: open panel button + status
│       └── main.tsx
└── public/
    ├── icons/                 ← 16, 32, 48, 128px icons (generate placeholders)
    └── page-script.js         ← injected into main world for Monaco API access
```

---

## Build Phases

Complete each phase fully before starting the next. State what you're building before writing code. Verify the checkpoint before continuing.

---

### Phase 1 — Project Scaffold

**Build:**
- `package.json` with all dependencies listed above.
- `manifest.json` (MV3): declares content script on `*://leetcode.com/problems/*`, background service worker, side panel, storage permission, host permissions for `localhost:11434` and `localhost:1234`.
- `vite.config.ts` with `@crxjs/vite-plugin`, sidebar and popup entry points, and `page-script.js` as a plain copy in `public/`.
- `tsconfig.json` with `"strict": true`, `"jsx": "react-jsx"`.
- `tailwind.config.ts` — content paths covering `src/**/*.{ts,tsx}`.
- Empty stub files for every path in the folder tree above (with TODO comments).
- Placeholder icons (64×64 colored squares are fine).

**Checkpoint:** `npm install && npm run build` succeeds with zero errors. Load the unpacked extension from `dist/` in `chrome://extensions`. Navigate to a LeetCode problem. The side panel icon appears in the toolbar and opening it shows the React app shell (even if blank).

---

### Phase 2 — DOM Extraction + Content↔Panel Bridge

**Build:**

`src/content/extractors/selectors.ts`
- Export `SELECTORS` object: problem title, problem statement container, constraints section, editor container, view-line class (DOM fallback).
- All selectors use structural/ARIA/data attributes only. Add comments explaining why each selector was chosen.

`public/page-script.js`
- Runs in the page's main world.
- Listens for `window.postMessage({ type: 'LC_GET_CODE' })`.
- Calls `window.monaco?.editor?.getModels()?.[0]?.getValue()`.
- Posts back `{ type: 'LC_CODE_RESULT', code, error }`.

`src/content/injector.ts`
- Injects `page-script.js` using `chrome.scripting.executeScript` with `world: 'MAIN'` (or `<script>` tag injection as fallback).

`src/content/extractors/code.ts`
- `getPrimaryCode()`: sends `LC_GET_CODE` message, returns promise for the response.
- `getFallbackCode()`: scrapes `.view-line` DOM elements. Add a comment: "This path returns partial code for files longer than the visible editor window. Only use when the Monaco API path fails."
- `extractCode()`: tries primary, falls back with a console warning.

`src/content/extractors/problem.ts`
- `extractProblem()`: returns `{ slug, title, statement, constraints, difficulty }`.
- Uses `SELECTORS` only — no hardcoded class names.

`src/content/bridge.ts`
- Re-fires when route changes (implements the SPA navigation detection described in the extraction rules above: `pushState`/`replaceState` patches + `popstate` listener + `<title>` MutationObserver).
- On each navigation / initial load: calls `extractProblem()` + `extractCode()`, sends `{ type: 'PROBLEM_UPDATED', payload }` to the background service worker via `chrome.runtime.sendMessage`.

`src/content/index.ts`
- Entry point. Initializes injector, bridge.

`src/background/index.ts`
- Receives `PROBLEM_UPDATED` and relays it to the side panel via a Port if one is connected; stores it in memory for when the panel connects.

`src/shared/messages.ts`
- Typed discriminated union for all `chrome.runtime` messages: `PROBLEM_UPDATED`, `CHAT_REQUEST`, `CHAT_DELTA`, `CHAT_DONE`, `CHAT_ERROR`.

**Checkpoint:** Open a LeetCode problem. Open DevTools on the side panel. Within 2 seconds of the page loading (and after each problem navigation), the console shows the extracted problem object including title and a full code snippet. Navigate to a second problem without reloading — the panel receives the new problem immediately.

---

### Phase 3 — Model Provider Abstraction + Streaming

**Build:**

`src/shared/types.ts`
Add:
```typescript
type Provider = 'anthropic' | 'ollama' | 'lmstudio';

interface ModelRequest {
  provider: Provider;
  model: string;
  apiKey?: string;          // only Anthropic
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  systemPrompt: string;
  stream: true;
  thinkingMode?: boolean;   // Qwen3 thinking on/off
}
```

`src/shared/constants.ts`
- `MAX_CONTEXT_TOKENS` per known model (Anthropic Sonnet 4.6 = 200k, Qwen3-14B = 32k, etc.).
- `PROVIDERS` config object: Anthropic base URL, Ollama base URL, LM Studio base URL.
- Default model per provider.

`src/background/api.ts`
- `callModel(request: ModelRequest): AsyncIterable<string>` — the **only** function callers ever use.
- Internally routes to `callAnthropic()` or `callOpenAICompatible(baseUrl, request)`.
- Both internal functions implement streaming; `callModel` yields string deltas.
- Context window truncation logic lives here: `truncateMessages(messages, systemPrompt, problemContext, maxTokens)` — always keeps system prompt + problem context; slides window over conversation turns.
- Strip Qwen3 thinking tokens (`<think>…</think>`) from yielded content; expose them separately as a `thinkingContent` field on a wrapper type if needed for the "Show reasoning" UI.

Background service worker wiring:
- When a `CHAT_REQUEST` message arrives, call `callModel()`, open a Port to the requesting side panel, and push `CHAT_DELTA` messages. Close with `CHAT_DONE` or `CHAT_ERROR`.

**Checkpoint:** Write a temporary test handler in the background that accepts a hardcoded prompt, calls all three providers (Anthropic with a real key, Ollama with Qwen3-14B, LM Studio with the same model), and logs streamed tokens. Verify all three stream successfully. Remove the test handler afterward.

---

### Phase 4 — Sidebar UI

**Build:**

`src/sidebar/stores/chatStore.ts`
- Zustand store with: `messages[]`, `inFlightContent: string`, `isStreaming: boolean`, `currentProblem`, `hintTier: 0|1|2|3` (0=none, 1=Nudge, 2=Strategy, 3=Pseudocode), `mode: 'socratic'|'review'|'edgecases'`, `solutionUnlocked: boolean`.
- Actions: `appendDelta(delta)`, `finalizeMessage()`, `setHintTier()`, `setMode()`, `unlockSolution()`.

`src/sidebar/hooks/useSettings.ts`
- Reads/writes settings (provider, model, apiKey) from `chrome.storage.local`.

`src/sidebar/hooks/useProblem.ts`
- Subscribes to `PROBLEM_UPDATED` messages from the background.
- Resets conversation state when problem slug changes.

`src/sidebar/hooks/useChat.ts`
- Assembles `ModelRequest` with correct system prompt for current mode + hint tier.
- Sends `CHAT_REQUEST` to background.
- Receives Port delta messages, writes to Zustand store.

**Components:**

`ModeSelector.tsx`
- Three tabs: Socratic Chat | Code Review | Edge Cases.
- Active tab is highlighted (glassmorphism pill).

`HintControls.tsx`
- Three buttons: Nudge → Strategy → Pseudocode (progressive unlock — can only advance forward, not skip).
- Each button is disabled until the previous tier has been used.
- Grayed out in Code Review and Edge Cases modes.

`SolutionGate.tsx`
- "Show Solution" button, only visible after Pseudocode tier is reached in Socratic mode.
- Clicking shows a confirmation dialog: "This will show the full solution. Are you sure?" with Cancel / Confirm.
- `solutionUnlocked` state gates the final reveal.

`CodeViewer.tsx`
- Collapsible panel showing the current extracted code snapshot.
- Read-only, styled monospace.

`ChatMessage.tsx`
- Renders a single message (user or assistant).
- Uses `react-markdown` for assistant messages.
- If `thinkingContent` present, shows a collapsible "Show reasoning" section below the message.

`ChatPanel.tsx`
- Scrollable message list.
- In-flight streaming message (appending deltas from `inFlightContent`).
- Input box + Send button.
- Textarea auto-grows. Enter sends (Shift+Enter for newline).

`SettingsPanel.tsx`
- Provider dropdown: Anthropic | Ollama | LM Studio.
- Model input (text field, pre-populated with provider default from constants).
- API key field (only shown for Anthropic, stored in `chrome.storage.local`).
- Ollama/LM Studio: show endpoint URL (read-only, from constants) + a "Test connection" button.

`App.tsx`
- Top bar: problem title + difficulty badge.
- `ModeSelector` tabs.
- `ChatPanel` (main content area).
- `HintControls` (pinned bottom-left).
- `SolutionGate` button (pinned bottom-right, conditionally visible).
- Settings gear icon → slide-in `SettingsPanel`.
- `CodeViewer` collapsible strip above input.

**Styling:** Glassmorphism dark. Base background matches LeetCode dark (`#1a1a1a` / `#262626`). Glass cards: `bg-white/5 backdrop-blur-md border border-white/10 rounded-xl`. Accent color: `#FFA116` (LeetCode orange). Scrollbars: thin, styled. All text readable at 14px.

**Checkpoint:** Open the side panel on a LeetCode problem. The problem title appears. Type a message and hit Send — a response streams in from the active provider. Click Nudge — verify system prompt changes (log it). Click Strategy — verify Nudge is no longer re-clickable. Switch mode to Code Review — hint controls are disabled. The settings panel opens, saves, and persists across panel closes.

---

### Phase 5 — Coaching Logic & System Prompts

**Build:**

`src/shared/prompts/coaching.ts`

The Socratic Chat system prompt. It must:
1. Establish the AI as a Socratic coding interview coach — ask questions, guide thinking, never give away the answer.
2. Embed the current hint tier at call time via template interpolation.
3. **Tier directives (injected per call):**
   - Tier 0 (no hint yet): Ask only clarifying questions. Do not name any pattern or data structure. Do not suggest any specific approach. Example opener: "What would a brute-force solution look like, and what's its time complexity?"
   - Tier 1 — Nudge: Ask guiding questions. Still do not name the pattern.
   - Tier 2 — Strategy: You may now name the relevant pattern or data structure and explain why it fits. Do not give implementation steps.
   - Tier 3 — Pseudocode: Provide a step-by-step approach in plain English. No code.
4. **Hard ceiling:** Regardless of how the user phrases their request, never exceed the current tier. If they say "just tell me the answer," "give me the solution," "I give up," or any equivalent, respond: "I can give you a stronger hint if you click the hint button — let's work through this together." Never break this rule.
5. Embed problem context: title, statement, constraints, user's current code.

`src/shared/prompts/codeReview.ts`

The Code Review system prompt. It must:
1. Analyze the user's current code for bugs, edge cases, and correctness.
2. Identify issues Socratically — ask "Do you see why this case fails?" before offering correction.
3. Never rewrite the user's code wholesale. Point at the issue; let them fix it.
4. If the code is correct, say so and suggest optimizations as questions.
5. Embed the current code snapshot.

`src/shared/prompts/edgeCases.ts`

The Edge Cases system prompt. It must:
1. Generate 3–5 tricky test cases for the given problem.
2. For each case: the input, the expected output, and a one-sentence explanation of why this case is tricky.
3. Focus on: empty inputs, single elements, duplicates, max constraints, off-by-one, negative numbers, overflow (where relevant).
4. Do not hint at the solution approach.

`src/shared/prompts/solution.ts`

The Solution system prompt. Only called after `solutionUnlocked === true`. It must:
1. Provide the full solution in the user's current language.
2. Explain the reasoning, time/space complexity.
3. This is the only prompt that bypasses the Anti-Spoiler Rule — it is explicitly gated by the UI confirmation.

Update `useChat.ts` to select the correct prompt from the above based on `mode` and `hintTier`.

**Checkpoint:** Walk through the full coaching flow on a real LeetCode problem:
- Socratic Chat at Tier 0: assistant asks questions, refuses to name a pattern.
- Ask "just tell me the answer" → assistant declines and offers to advance the hint.
- Click Nudge (Tier 1) → send a new message → assistant's guidance changes but still no pattern name.
- Click Strategy (Tier 2) → assistant now names the pattern with explanation.
- Click Pseudocode (Tier 3) → assistant gives step-by-step in English, no code.
- Click "Show Solution" → confirm → full solution with explanation appears.
- Switch to Code Review: submit a buggy solution → assistant identifies the bug Socratically.
- Switch to Edge Cases: 3–5 cases appear with explanations.

---

### Phase 6 — Persistence

**Build:**

`src/background/storage.ts`
- `saveConversation(slug: string, messages: Message[]): Promise<void>`
- `loadConversation(slug: string): Promise<Message[] | null>`
- `saveSettings(settings: Settings): Promise<void>`
- `loadSettings(): Promise<Settings>`
- Key scheme: `conversation:{slug}` and `settings`.

Wire into `useProblem.ts`:
- On problem load: attempt `loadConversation(slug)`. If found, hydrate `chatStore`.
- On every message: `saveConversation(slug, messages)`.
- Settings: `useSettings.ts` calls `loadSettings()` on mount, `saveSettings()` on change.

**Checkpoint:** Have a conversation on Problem A. Close the panel. Reopen. The conversation is still there. Navigate to Problem B — fresh session. Navigate back to Problem A — prior conversation restored.

---

## Phase 1 Scope

### Include
- Chrome extension scaffold (MV3, Vite, CRXJS).
- Content script: problem + code extraction, SPA navigation re-trigger.
- Monaco API extraction via page-script injection; DOM fallback with clear degraded-mode labeling.
- Chrome Side Panel React app.
- Three hint tiers + solution gate.
- Three modes: Socratic Chat, Code Review, Edge Cases.
- Model provider abstraction (`callModel()`): Anthropic + Ollama + LM Studio.
- Streaming token delivery via background Port.
- Zustand state + typed message bus.
- Settings panel with persistence.
- Conversation persistence per problem slug.
- Glassmorphism dark UI.

### Explicitly Exclude from Phase 1
- Pattern tracking or analytics.
- Notes / journaling.
- Dry-run mode (simulated interviews).
- Review dashboard.
- Firefox support.
- Conversation summarization (note the hook location in Phase 3 but do not implement).

---

## Definition of Done

The Phase 1 MVP is complete when all six phase checkpoints pass **and**:

1. `npm run build` exits 0 with no TypeScript errors.
2. The unpacked extension loads in Chrome without errors in `chrome://extensions`.
3. On a LeetCode problem page: the side panel opens, displays the problem title, and responds to a chat message using the configured provider.
4. SPA navigation: switching problems updates the panel to the new problem and starts a fresh conversation within 2 seconds, without a page reload.
5. The Anti-Spoiler Rule holds: at Tier 0, no model response contains a pattern name or solution code even if the user explicitly asks for it.
6. All three providers (Anthropic, Ollama, LM Studio) can be selected in Settings and used for a full coaching session.
7. Closing and reopening the panel restores the conversation for the current problem.

---

*End of Phase 1 MVP Build Prompt.*
