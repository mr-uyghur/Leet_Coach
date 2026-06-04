// All shared TypeScript types for LeetCode Coach.
// TODO: Phase 3 — add ModelRequest, Provider types
// TODO: Phase 4 — add Message, ChatState, Settings types

export type Provider = 'anthropic' | 'ollama' | 'lmstudio'

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
