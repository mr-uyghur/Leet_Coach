// Model max-context sizes, provider configuration, streaming constants, and UI label constants.
// Token estimate: characters ÷ 4 (cheap approximation).
//
// UI LABEL CONSTANTS — single source of truth consumed by both the prompt builder and the UI
// components. Any rename of a control MUST go through these constants so that the AI's decline
// line always matches what the user actually sees on screen.

/** The section header rendered above the hint tier buttons. */
export const HINT_PANEL_LABEL = 'Hint Level' as const

/** Labels for the three hint tier buttons, in tier order (index 0 = Tier 1 = Nudge). */
export const HINT_TIER_LABELS = ['Nudge', 'Strategy', 'Pseudocode'] as const

/** Label on the "Show Full Solution" gate button (visible only at Tier 3). */
export const SOLUTION_GATE_LABEL = 'Show Full Solution' as const

// Anthropic API version header — required on every request.
export const ANTHROPIC_VERSION = '2023-06-01' as const

// Maximum tokens to allocate for the model's response.
// Anthropic requires max_tokens to be explicitly set (omitting it returns a 400).
// Reused as response headroom in the truncation budget for all providers.
export const MAX_RESPONSE_TOKENS = 4096

// Tokens reserved for the response when computing how many conversation turns fit in context.
// Matches MAX_RESPONSE_TOKENS — we leave exactly one response-worth of headroom.
export const RESPONSE_HEADROOM_TOKENS = MAX_RESPONSE_TOKENS

export const MAX_CONTEXT_TOKENS: Record<string, number> = {
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-8': 200_000,
  'qwen3:14b': 32_000,
  'qwen3:30b-a3b': 32_000,
  'gemma3:27b': 8_000,
  'gemma-4-e4b': 128_000,
}

export const PROVIDERS = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-6',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'qwen3:14b',
  },
  lmstudio: {
    baseUrl: 'http://localhost:1234/v1/chat/completions',
    defaultModel: 'gemma-4-e4b',
  },
} as const

export const DEFAULT_PROVIDER = 'lmstudio' as const

export const AVAILABLE_LOCAL_MODELS = ['gemma-4-e4b', 'qwen3:14b', 'qwen3:30b-a3b', 'gemma3:27b'] as const
