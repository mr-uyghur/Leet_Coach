// All shared TypeScript types for LeetCode Coach.

export type Provider = 'anthropic' | 'ollama' | 'lmstudio'

// Canonical shape for a LeetCode problem as extracted by the content script.
// Used in messages.ts (PROBLEM_UPDATED / CHAT_REQUEST payloads) and by prompt builders.
// Defined here (not in messages.ts) to avoid circular imports: messages.ts imports types.ts,
// so types.ts must not import from messages.ts.
export interface ProblemContext {
  slug: string
  title: string
  statement: string
  constraints: string
  difficulty: string
  code: string
}

export type HintTier = 0 | 1 | 2 | 3

export type Mode = 'socratic' | 'review' | 'edgecases'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinkingContent?: string
  timestamp: number
}

export interface Settings {
  provider: Provider
  model: string
  apiKey: string
}

// A single conversation turn as sent to the model.
// Note: 'system' role messages are assembled by callModel() from systemPrompt; callers
// should only pass 'user' and 'assistant' turns in ModelRequest.messages.
export interface ModelMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// The request shape passed to callModel(). Business logic (prompt assembly, hint tiers, modes)
// sets these fields; api.ts knows nothing about coaching logic.
export interface ModelRequest {
  provider: Provider
  model: string
  apiKey?: string            // only required for Anthropic
  messages: ModelMessage[]   // conversation turns (user + assistant; system filtered out internally)
  systemPrompt: string       // fully assembled system prompt for this request
  stream: true
  thinkingMode?: boolean     // Qwen3-specific: false disables <think>…</think> output (Edge Cases)
}

// A single yielded chunk from callModel(). Separating 'thinking' from 'content' lets the UI
// accumulate them independently — 'thinking' becomes the collapsible "Show reasoning" block;
// 'content' is the visible assistant message.
export interface ModelStreamChunk {
  type: 'content' | 'thinking'
  text: string
}
