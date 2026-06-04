// Model max-context sizes and provider configuration.
// Token estimate: characters ÷ 4 (cheap approximation).

export const MAX_CONTEXT_TOKENS: Record<string, number> = {
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-8': 200_000,
  'qwen3:14b': 32_000,
  'qwen3:30b-a3b': 32_000,
  'gemma3:27b': 8_000,
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
    defaultModel: 'qwen3:14b',
  },
} as const

export const DEFAULT_PROVIDER = 'ollama' as const

export const AVAILABLE_LOCAL_MODELS = ['qwen3:14b', 'qwen3:30b-a3b', 'gemma3:27b'] as const
