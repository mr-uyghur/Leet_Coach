# LeetCode Coach — Project Context for Claude Code

## What This Project Is

LeetCode Coach is a personal AI-powered Socratic-tutor Chrome extension that lives as a native side panel on LeetCode problem pages. It acts like a good coding interviewer: asks questions, points at what's wrong without rewriting everything, and builds genuine understanding of algorithms and patterns. It is explicitly a coach, not a cheat tool.

> **Build status:** Check `BUILD_STATUS.md` for the current phase and recommended model before doing anything else.

> **Session end rule (mandatory):** Before this session ends for any reason — phase complete, checkpoint reached, or user says they're done — update `BUILD_STATUS.md`: mark the phase status, update the Current Phase line, and add a Checkpoint Log entry with what was completed and any issues. Do not wait to be asked. This is required.

**The Anti-Spoiler Rule is a hard architectural invariant.** The AI never exceeds the user's current hint tier regardless of phrasing. A full solution is only accessible after an explicit UI button click + confirmation dialog. This rule is enforced via the system prompt at every model call — no code path bypasses it.

---

## Architecture Overview

```
Chrome Side Panel (React app)
        ↑  chrome.runtime.Port (streaming deltas)
        |
Background Service Worker
        ↑  chrome.runtime.sendMessage
        |
Content Script (runs on leetcode.com/problems/*)
        ↑  window.postMessage
        |
page-script.js (main world, accesses window.monaco)
```

Three boundary-crossing layers:
1. **Page world → content script:** `window.postMessage` used by `page-script.js` to deliver Monaco code.
2. **Content script → background:** `chrome.runtime.sendMessage` for `PROBLEM_UPDATED`.
3. **Background → side panel:** `chrome.runtime.Port` (long-lived) for streaming chat deltas.

The side panel cannot touch LeetCode DOM. The content script cannot call model APIs. The background service worker is the only thing that does both.

### The One Rule for LLM Calls

**Every LLM call routes through `callModel()` in `src/background/api.ts`.** This function is the entire provider abstraction. Business logic (coaching prompts, modes, hint tiers) is entirely isolated from provider details. Swapping providers requires zero changes outside `api.ts`.

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Extension format | Manifest V3 |
| UI framework | React 18 + TypeScript (strict mode) |
| Styling | Tailwind CSS v3 — glassmorphism dark |
| Build tool | Vite + `@crxjs/vite-plugin` |
| State management | Zustand |
| Markdown rendering | `react-markdown` |
| Persistence | `chrome.storage.local` |

---

## Settled Technical Decisions

### Side Panel: Chrome Side Panel API

This project uses `chrome.sidePanel` (the native MV3 Side Panel API), not an injected `<div>`. The panel is a separate document with full CSS isolation — Tailwind does not bleed into LeetCode's styles and LeetCode's SPA re-renders cannot disrupt the panel layout.

### Qwen3 Thinking Mode: Task-Conditional

- **Socratic Chat + Code Review:** thinking mode on.
- **Edge Cases:** thinking mode off (generative, no benefit from reasoning chain).

Thinking tokens (`<think>…</think>` / `reasoning` field) are stripped from the visible assistant message and offered as a collapsible "Show reasoning" element. They never become the visible answer.

### Streaming: Background Service Worker via chrome.runtime.Port

The background opens a long-lived Port to the side panel and pushes string deltas as they arrive. The panel's Zustand store appends deltas; React re-renders are throttled (~30–60ms). `react-markdown` renders the accumulating string.

Provider streaming:
- Anthropic: SSE via the Messages API.
- Ollama + LM Studio: OpenAI-compatible SSE. Both use the same `callOpenAICompatible(baseUrl, request)` helper — they are not separate integrations.

### Context Truncation: Token-Budget Sliding Window

Always pinned (never truncated):
1. System prompt with embedded hint-tier directive.
2. Problem context: title, statement, constraints, current code snapshot.

Older conversation turns are dropped first to stay within budget. Token estimate: `characters ÷ 4`. Per-model max-context sizes live in `src/shared/constants.ts`. Conversation summarization is noted as a Phase 2 hook but is not implemented.

---

## Model Providers

| Provider | Base URL | Auth | Default Model |
|----------|----------|------|---------------|
| Anthropic | `https://api.anthropic.com/v1/messages` | API key (settings) | `claude-sonnet-4-6` |
| Ollama | `http://localhost:11434/v1/chat/completions` | None | `qwen3:14b` |
| LM Studio | `http://localhost:1234/v1/chat/completions` | None | `qwen3:14b` |

Target local models (RTX 5070 Ti / 16GB VRAM — performance is not a constraint):
- **Qwen3-14B** — primary default.
- Qwen3-30B-A3B MoE — efficient MoE architecture, available as option.
- Gemma 3 27B — alternative.

---

## Hint-Tier System

| Tier | Name | Behavior |
|------|------|----------|
| 0 | (none) | Clarifying questions only. Never names any pattern or data structure. |
| 1 | Nudge | Guiding questions. Pattern name still off-limits. |
| 2 | Strategy | Names the pattern + explains why it fits. No steps. |
| 3 | Pseudocode | Step-by-step approach in plain English. No code. |
| — | Solution Gate | Full solution, only after explicit click + confirmation. Bypasses the Anti-Spoiler Rule by design. |

Tier advances forward via the tier buttons. A ↺ reset button (visible when tier > 0) returns the tier to 0; the conversation is preserved. Hint controls are disabled in Code Review and Edge Cases modes.

---

## Modes

| Mode | Behavior |
|------|----------|
| Socratic Chat | Default. Conversational coaching bounded by hint tier. |
| Code Review | Analyzes user's current code; identifies bugs Socratically; never rewrites wholesale. |
| Edge Cases | Generates 3–5 tricky test cases with per-case explanations. |

---

## Folder Structure

```
.
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── src/
│   ├── content/
│   │   ├── index.ts           ← registers extraction & navigation listeners
│   │   ├── extractors/
│   │   │   ├── problem.ts     ← title, statement, constraints
│   │   │   ├── code.ts        ← Monaco API primary; DOM scrape fallback (lossy)
│   │   │   └── selectors.ts   ← all DOM selectors (ARIA/structural only)
│   │   ├── injector.ts        ← injects page-script.js into main world
│   │   └── bridge.ts          ← page-script → content script relay + SPA nav detection
│   ├── sidebar/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── HintControls.tsx
│   │   │   ├── ModeSelector.tsx
│   │   │   ├── CodeViewer.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   └── SolutionGate.tsx
│   │   ├── hooks/
│   │   │   ├── useChat.ts
│   │   │   ├── useProblem.ts
│   │   │   └── useSettings.ts
│   │   └── stores/
│   │       └── chatStore.ts
│   ├── background/
│   │   ├── index.ts
│   │   ├── api.ts             ← callModel() — the ONLY entry point for LLM calls
│   │   └── storage.ts
│   ├── shared/
│   │   ├── types.ts
│   │   ├── constants.ts       ← model max-context, provider defaults
│   │   ├── messages.ts        ← typed chrome.runtime message schemas
│   │   └── prompts/
│   │       ├── coaching.ts
│   │       ├── codeReview.ts
│   │       ├── edgeCases.ts
│   │       └── solution.ts
│   └── popup/
│       ├── Popup.tsx
│       └── main.tsx
└── public/
    ├── icons/
    └── page-script.js         ← injected into main world; accesses window.monaco
```

---

## LeetCode DOM Extraction Rules

These rules exist because LeetCode is fragile. Violating them causes silent failures.

**SPA navigation:** LeetCode is client-side routed. `DOMContentLoaded` does not fire on problem navigation. `bridge.ts` must watch for route changes via: patched `history.pushState`/`replaceState` + `popstate` listener + `MutationObserver` on `<title>`. When the problem slug changes, re-extract and notify the side panel.

**Monaco code extraction:** `page-script.js` uses `monaco.editor.getModels()[0].getValue()` — this is the **primary path**. The DOM `.view-line` fallback only returns visible lines (Monaco virtualizes long files) and is explicitly labeled as lossy in `code.ts`. Never treat them as equivalent.

**Selector fragility:** `selectors.ts` uses only ARIA attributes, structural selectors, `data-*` attributes, and stable text anchors. No hashed class names like `css-xyz123`. This file is the most break-prone surface and must be commented accordingly.

---

## Development

```bash
npm install
npm run dev     # Vite HMR build; reload extension from dist/ after first build
npm run build   # Production build
```

Load the extension: `chrome://extensions` → Enable Developer mode → Load unpacked → select `dist/`.

The side panel opens from the extension icon in the Chrome toolbar on any `leetcode.com/problems/*` page.

---

## Code Conventions

- TypeScript strict mode everywhere (`"strict": true`).
- All shared types in `src/shared/types.ts`.
- All prompt templates in `src/shared/prompts/` — never inline system prompts in components or hooks.
- All chrome.runtime message types defined in `src/shared/messages.ts` as discriminated unions.
- All provider/model constants in `src/shared/constants.ts`.
- No hardcoded LeetCode class names outside `src/content/extractors/selectors.ts`.

---

## Phase 1 Scope

**In scope:** Extension scaffold, DOM extraction, Monaco code extraction, Chrome Side Panel React app, three hint tiers + solution gate, three coaching modes, model provider abstraction (Anthropic + Ollama + LM Studio), streaming, settings persistence, conversation persistence per problem.

**Out of scope for Phase 1:** Pattern tracking, analytics, notes/journaling, dry-run mode, review dashboard, Firefox support, conversation summarization.
