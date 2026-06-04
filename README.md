# LeetCode Coach

> AI-powered Socratic-tutor Chrome extension that lives as a native side panel on LeetCode problem pages. It coaches you to **think**, not to copy answers.

## Table of Contents

- [Overview](#overview)
- [For AI Coding Agents 🤖](#for-ai-coding-agents-)
- [Current Status](#current-status)
- [The Anti-Spoiler Rule](#the-anti-spoiler-rule)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Model Provider System](#model-provider-system)
- [Coaching System](#coaching-system)
- [UI System](#ui-system)
- [Content Script & DOM Extraction](#content-script--dom-extraction)
- [Persistence](#persistence)
- [Build System](#build-system)
- [Prerequisites & Installation](#prerequisites--installation)
- [Development Workflow](#development-workflow)
- [Testing](#testing)

---

## Overview

LeetCode Coach is a customizable Chrome extension (Manifest V3) that opens as a **Chrome Side Panel** on `leetcode.com/problems/*` pages. It acts as a Socratic coding interview coach:

- **Asks questions** instead of giving answers
- **Progressive hint system** (4 tiers) that gates how much the AI reveals
- **Three coaching modes**: Socratic Chat, Code Review, Edge Cases
- **Anti-Spoiler Rule**: The AI **never** gives the solution unless the user explicitly clicks through a confirmation gate
- **Live code extraction** from LeetCode's Monaco editor via injected page script
- **Multiple AI Providers**: Configurable support for LM Studio, Ollama, and Anthropic. LM Studio is the default configuration.
- **Streaming responses** via `chrome.runtime.Port`

---

## For AI Coding Agents 🤖

If you are an AI coding agent assigned to work on this project, please read this section carefully before modifying any code. It contains the most critical context to understand the current architecture and project state.

### 1. Provider System & Default Configuration
The codebase fully supports and implements three providers: **LM Studio**, **Ollama**, and **Anthropic** (via a UI settings panel). The default configuration relies primarily on LM Studio. When testing or modifying the codebase, prioritize the LM Studio/OpenAI-compatible streaming path, but do not delete or break the Ollama or Anthropic integrations.

### 2. The Anti-Spoiler Rule (Hard Invariant)
The AI must **never** exceed the user's current hint tier. If a user asks for the solution, the model must decline and guide them to use the hint button. A full solution is only accessible after explicitly unlocking Hint Tier 3 and confirming a UI dialog. This is strictly enforced via system prompts.

### 3. SPA Navigation on LeetCode
LeetCode is a client-side routed SPA. `DOMContentLoaded` only fires once. Navigating to a new problem relies on patching `history.pushState/replaceState`, listening to `popstate`, and observing `<title>` mutations (see `src/content/bridge.ts`). If you break this, extraction will silently fail when the user switches problems.

### 4. Code Extraction Rules
Code extraction primarily uses the Monaco API via `page-script.js` injected into the main world. The fallback is a DOM `.view-line` scrape, but this is **lossy** due to Monaco's virtualization. Do not treat the fallback as equivalent to the primary extraction.

### 5. Build Bugs
`@crxjs/vite-plugin` 2.4 has bugs generating the service worker loader and `web_accessible_resources`. These are patched automatically by `scripts/postbuild.js`. Always use `npm run build` to ensure this patch is applied.

---

## Current Status

**Phase 1 MVP: Complete**

All core features have been implemented and verified:
1. Project Scaffold
2. DOM Extraction + Bridge
3. Model Providers + Streaming
4. Sidebar UI
5. Coaching Logic + Prompts
6. Persistence

---

## The Anti-Spoiler Rule

The AI must **never** exceed the user's current hint tier, regardless of how the request is phrased. If a user says "just give me the answer," the model responds:

> *"I can give you a stronger hint if you click the hint button — let's work through this together."*

A full solution is **only** shown after the user reaches Hint Tier 3 (Pseudocode), clicks "Show Full Solution", and confirms. This rule is enforced at the system prompt level in `src/shared/prompts/coaching.ts`. No code path bypasses it except the explicitly gated Solution prompt.

---

## Architecture

### System Diagram

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

### Data Flow
1. **Extraction**: `page-script.js` accesses `window.monaco` to get user code. `content/extractors/problem.ts` scrapes problem data from DOM.
2. **Bridge Relay**: The content script sends `PROBLEM_UPDATED` to the background, which relays it to the side panel via `chrome.runtime.Port`.
3. **Chat Request**: `useChat.ts` assembles `CHAT_REQUEST` (messages, settings, problem context, mode, tier) and sends it over the Port.
4. **LLM Inference**: `api.ts` routes the request to the configured provider (LM Studio, Ollama, or Anthropic) and streams SSE chunks.
5. **Streaming**: Content chunks are sent back as `CHAT_DELTA`. A stateful `<think>` tag parser separates reasoning tokens from visible content for compatible models.

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Extension format | Manifest V3 |
| UI framework | React 18 + TypeScript (strict mode) |
| Styling | Tailwind CSS v3 — glassmorphism dark |
| Build tool | Vite 8 + `@crxjs/vite-plugin` 2.4 |
| State management | Zustand 5 |
| Markdown rendering | `react-markdown` v10 + `remark-gfm` |
| Persistence | `chrome.storage.local` |

---

## Project Structure

```text
src/
├── background/           # Service worker: LLM routing (api.ts), port management, storage
├── content/              # Content script: SPA bridge, DOM extraction, Monaco bridge
├── shared/               # Types, constants, prompt templates, message protocols
├── sidebar/              # React side panel: Chat, Code Viewer, Hint Controls, Settings
└── popup/                # Minimal popup to open the side panel
public/
└── page-script.js        # Main-world script for Monaco API access
scripts/
├── postbuild.js          # CRXJS bug patching
└── test-providers.mjs    # Streaming tests for Providers
```

---

## Model Provider System

The project allows users to dynamically switch between providers in the Settings Panel:
- **LM Studio** (Local, Default): `http://localhost:1234/v1/chat/completions` (OpenAI-compatible)
- **Ollama** (Local): `http://localhost:11434/v1/chat/completions` (OpenAI-compatible)
- **Anthropic** (Cloud): `https://api.anthropic.com/v1/messages` (Requires API Key)

All LLM calls route through one function: `callModel()` in `src/background/api.ts`. This layer abstracts the provider details. `callModel` invokes `callOpenAICompatible()` to handle SSE streaming for both LM Studio and Ollama, and `callAnthropic()` for Anthropic.

### Thinking Mode
For models that support thinking tokens (like `qwen3`), the extension implements a **task-conditional thinking mode**:
- **Socratic Chat + Code Review**: Thinking mode **ON**.
- **Edge Cases**: Thinking mode **OFF**.

The `<think>…</think>` tag parser in `api.ts` is boundary-safe. Thinking content is accumulated separately and sent with `CHAT_DONE`, then displayed in a collapsible "Show reasoning" block in the UI.

### Context Truncation
`truncateMessages()` implements a token-budget sliding window:
1. Always pins the system prompt and problem context.
2. Keeps most-recent conversation turns; drops oldest first.
3. Leaves `RESPONSE_HEADROOM_TOKENS` (4096) for the model's reply.

---

## Coaching System

### Hint Tiers
Tiers are **monotonically increasing** — the user cannot go backward. Each tier unlocks progressively more information:

| Tier | Name | What the AI Can Do |
|------|------|--------------------|
| 0 | *(none)* | Clarifying questions only. **Never** names any pattern or data structure. |
| 1 | Nudge | Guiding questions. Pattern name still off-limits. |
| 2 | Strategy | Names the pattern + explains **why** it fits. No steps. |
| 3 | Pseudocode | Step-by-step approach in plain English. **No code.** |

Each tier has an explicit `ALLOWED` and `FORBIDDEN` block in the system prompt (`coaching.ts`).

### Modes

| Mode | Behavior | Hint Controls |
|------|----------|---------------|
| **Socratic Chat** | Default. Conversational coaching bounded by hint tier. | Enabled |
| **Code Review** | Analyzes user's code; identifies bugs Socratically; never rewrites wholesale. | Disabled |
| **Edge Cases** | Generates 3–5 tricky test cases with per-case explanations. | Disabled |

---

## UI System

- **Theme**: Glassmorphism dark, matching LeetCode's dark theme (`#1a1a1a` / `#262626`).
- **Glass cards**: `bg-white/5 backdrop-blur-md border border-white/10 rounded-xl`.
- **Accent color**: `#FFA116` (LeetCode orange).

**Key Components:**
- `ChatPanel`: Message list + streaming bubble + input.
- `ChatMessage`: Renders user and assistant bubbles. Uses `react-markdown` + GFM.
- `ModeSelector`: Three-tab pill selector.
- `HintControls`: Progressive unlock buttons.
- `SettingsPanel`: Slide-in overlay for configuring Provider, Model, and API Keys.
- `CodeViewer`: Collapsible code preview.

---

## Content Script & DOM Extraction

### SPA Navigation Detection
LeetCode is a client-side routed SPA. The bridge (`bridge.ts`) detects navigation via:
1. Patched `history.pushState` / `history.replaceState`.
2. `popstate` event listener.
3. `MutationObserver` on `<title>`.

### Code Extraction (Monaco API)
**Primary path** (accurate): `page-script.js` accesses `window.monaco.editor.getModels()[0].getValue()` and posts the result back.
**Fallback path** (lossy): Scrapes `.view-line` DOM elements.

### Selector Strategy
All selectors in `selectors.ts` use ARIA attributes, structural selectors, or `data-*` attributes. **Never** hashed class names (e.g., `css-xyz123`).

---

## Persistence

Handled by `src/background/storage.ts` using `chrome.storage.local`:
- `settings`: User preferences.
- `conversation:{slug}`: Per-problem conversation history.

---

## Prerequisites & Installation

1. **Node.js** (v18+) and npm
2. **Google Chrome** (or Chromium-based browser)
3. **Local AI Server** (Optional but recommended: LM Studio or Ollama)

### AI Server Setup
If you want to run the AI entirely locally (the default):
1. Download [LM Studio](https://lmstudio.ai/) or [Ollama](https://ollama.com/).
2. Load a model (recommended: `gemma-4-e4b` or `qwen3:14b`).
3. Start the local server. For LM Studio, it defaults to port `1234`. For Ollama, it defaults to `11434`.

### Building the Extension
```bash
# Install dependencies
npm install

# Build the extension (includes required postbuild patches)
npm run build
```

### Loading in Chrome
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist/` directory inside the project.

### Usage
1. Navigate to any LeetCode problem page.
2. Click the LeetCode Coach extension icon in the toolbar.
3. Open the **Settings** gear to configure your provider.
4. Use the Socratic Chat and **Hint Controls** to work through the problem!

---

## Development Workflow

```bash
# Start Vite dev server (HMR for sidebar/popup code)
npm run dev

# Type-check without building
npm run typecheck
```

**Important:** React `StrictMode` is intentionally omitted in `main.tsx`. Chrome ports are persistent objects — StrictMode's double-mount would disconnect the port.

---

## Testing

`scripts/test-providers.mjs` is a standalone Node.js script that tests the streaming pipeline outside the browser for the configured providers.

```bash
# Test LM Studio and Anthropic (if key provided)
ANTHROPIC_API_KEY=sk-ant... node scripts/test-providers.mjs
```
