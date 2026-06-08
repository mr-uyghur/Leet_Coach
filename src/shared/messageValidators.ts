import type {
  AbortStreamMessage,
  ChatRequestMessage,
  HintTierUpdatedMessage,
  ProblemUpdatedMessage,
  UnlockSolutionMessage,
} from './messages'
import { PROVIDERS } from './constants'
import type { HintTier, Message, Mode, ProblemContext, Provider, Settings } from './types'

export function clampHintTier(value: unknown): HintTier {
  return value === 1 || value === 2 || value === 3 ? value : 0
}

export function isMode(value: unknown): value is Mode {
  return value === 'socratic' || value === 'review' || value === 'edgecases'
}

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && value in PROVIDERS
}

export function normalizeSettings(value: unknown): Settings | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<Settings>
  if (!isProvider(raw.provider)) return null
  if (typeof raw.model !== 'string' || !raw.model.trim()) return null

  return {
    provider: raw.provider,
    model: raw.model,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
  }
}

export function normalizeMessage(value: unknown): Message | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<Message>
  if (raw.role !== 'user' && raw.role !== 'assistant') return null
  if (typeof raw.content !== 'string') return null

  return {
    id: typeof raw.id === 'string' ? raw.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: raw.role,
    content: raw.content,
    timestamp: typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : Date.now(),
    thinkingContent: typeof raw.thinkingContent === 'string' ? raw.thinkingContent : undefined,
  }
}

export function normalizeMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value)) return null
  const messages: Message[] = []

  for (const item of value) {
    const message = normalizeMessage(item)
    if (!message) return null
    messages.push(message)
  }

  return messages
}

export function filterValidMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const message = normalizeMessage(item)
    return message ? [message] : []
  })
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeCodeSource(value: unknown): ProblemContext['codeSource'] {
  return value === 'monaco' || value === 'dom-fallback' || value === 'missing'
    ? value
    : 'missing'
}

export function normalizeProblemContext(value: unknown): ProblemContext | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<ProblemContext>
  const slug = normalizeString(raw.slug).trim()
  if (!slug) return null

  const code = normalizeString(raw.code)
  const codeSource = normalizeCodeSource(raw.codeSource)

  return {
    slug,
    title: normalizeString(raw.title),
    statement: normalizeString(raw.statement),
    constraints: normalizeString(raw.constraints),
    difficulty: normalizeString(raw.difficulty),
    code,
    codeSource,
    codeComplete: typeof raw.codeComplete === 'boolean'
      ? raw.codeComplete
      : codeSource === 'monaco' && Boolean(code),
    extractedAt: typeof raw.extractedAt === 'number' && Number.isFinite(raw.extractedAt)
      ? raw.extractedAt
      : Date.now(),
  }
}

export function normalizeProblemUpdatedMessage(value: unknown): ProblemUpdatedMessage | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { type?: unknown; payload?: unknown }
  if (raw.type !== 'PROBLEM_UPDATED') return null
  const payload = normalizeProblemContext(raw.payload)
  return payload ? { type: 'PROBLEM_UPDATED', payload } : null
}

export function normalizeChatRequestMessage(value: unknown): ChatRequestMessage | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { type?: unknown; payload?: Record<string, unknown> }
  if (raw.type !== 'CHAT_REQUEST' || !raw.payload) return null

  const requestId = raw.payload.requestId
  const messages = normalizeMessages(raw.payload.messages)
  const settings = normalizeSettings(raw.payload.settings)
  const mode = raw.payload.mode

  if (typeof requestId !== 'string' || !requestId.trim()) return null
  if (!messages || !settings || !isMode(mode)) return null

  return {
    type: 'CHAT_REQUEST',
    payload: { requestId, messages, settings, mode },
  }
}

export function normalizeHintTierUpdatedMessage(value: unknown): HintTierUpdatedMessage | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { type?: unknown; hintTier?: unknown }
  if (raw.type !== 'HINT_TIER_UPDATED') return null
  return { type: 'HINT_TIER_UPDATED', hintTier: clampHintTier(raw.hintTier) }
}

export function normalizeUnlockSolutionMessage(value: unknown): UnlockSolutionMessage | null {
  return value && typeof value === 'object' && (value as { type?: unknown }).type === 'UNLOCK_SOLUTION'
    ? { type: 'UNLOCK_SOLUTION' }
    : null
}

export function normalizeAbortStreamMessage(value: unknown): AbortStreamMessage | null {
  return value && typeof value === 'object' && (value as { type?: unknown }).type === 'ABORT_STREAM'
    ? { type: 'ABORT_STREAM' }
    : null
}
