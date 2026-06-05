// The ONLY entry point for all LLM calls in LeetCode Coach.
// Business logic (coaching prompts, hint tiers, modes) is entirely isolated from provider details.
// Swapping or adding a provider requires zero changes outside this file.
//
// Public API:
//   callModel(request: ModelRequest): AsyncIterable<ModelStreamChunk>
//
// Internal routing:
//   callAnthropic()          — Anthropic Messages API, SSE
//   callOpenAICompatible()   — OpenAI-compat SSE (Ollama + LM Studio share one helper)

import type { ModelRequest, ModelMessage, ModelStreamChunk } from '../shared/types'
import {
  PROVIDERS,
  MAX_CONTEXT_TOKENS,
  ANTHROPIC_VERSION,
  MAX_RESPONSE_TOKENS,
  RESPONSE_HEADROOM_TOKENS,
} from '../shared/constants'

// ---------------------------------------------------------------------------
// Token budget + context truncation
// ---------------------------------------------------------------------------

/** Cheap token estimate: characters ÷ 4. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Truncate the conversation turns so that the total token budget is not exceeded.
 *
 * Always pinned (never truncated):
 *   1. The system prompt (will embed problem context in Phase 5).
 *
 * Fills the remaining budget with the most-recent turns, dropping oldest first.
 * Leaves RESPONSE_HEADROOM_TOKENS room for the model's reply.
 *
 * Phase 5 hook: conversation summarization could compress dropped turns rather than
 * discarding them. Not implemented — see Phase 5 for the insertion point.
 */
export function truncateMessages(
  messages: ModelMessage[],
  systemPrompt: string,
  maxTokens: number
): ModelMessage[] {
  const systemTokens = estimateTokens(systemPrompt)
  const available = maxTokens - systemTokens - RESPONSE_HEADROOM_TOKENS

  if (available <= 0) {
    // System prompt alone exceeds budget — return empty turns and let the model do its best.
    console.warn('[LCCoach API] System prompt alone exceeds token budget; dropping all turns')
    return []
  }

  // Walk from newest to oldest, accumulating turns until the budget runs out.
  let used = 0
  const kept: ModelMessage[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const turn = messages[i]
    const cost = estimateTokens(turn.content)
    if (used + cost > available) break
    kept.unshift(turn)
    used += cost
  }

  if (kept.length < messages.length) {
    console.warn(
      `[LCCoach API] Truncated ${messages.length - kept.length} old turn(s) to fit context window`
    )
  }

  return kept
}

// ---------------------------------------------------------------------------
// <think>…</think> boundary-safe parser (Qwen3 / OpenAI-compat)
// ---------------------------------------------------------------------------
//
// Qwen3 emits thinking inline inside the content stream: <think>…reasoning…</think>visible text.
// We must split these apart so the UI can show thinking in a collapsible "Show reasoning" block.
//
// IMPORTANT: A delta can split a tag across chunk boundaries, e.g.:
//   chunk 1: "Let me think about this.<thi"
//   chunk 2: "nk>Here is my reasoning…"
// Per-delta regex is NOT safe here — it would either miss the tag or corrupt visible content.
//
// Solution: maintain stateful parser that holds a trailing partial-tag buffer and resolves it
// on the next chunk.

interface ThinkParserState {
  insideThink: boolean
  /** Incomplete trailing tag fragment that may complete on the next chunk (e.g. "<thi"). */
  pending: string
}

export function makeThinkParser() {
  const state: ThinkParserState = { insideThink: false, pending: '' }

  /**
   * Feed a raw SSE delta. Returns an array of chunks with type 'thinking' or 'content'.
   * Multiple chunks may be returned from one delta when a tag boundary is crossed mid-text.
   */
  function feed(raw: string): ModelStreamChunk[] {
    const input = state.pending + raw
    state.pending = ''

    const chunks: ModelStreamChunk[] = []
    let pos = 0

    while (pos < input.length) {
      if (state.insideThink) {
        // Looking for </think>
        const closeTag = '</think>'
        const closeIdx = input.indexOf(closeTag, pos)
        if (closeIdx === -1) {
          // Check if the tail of input could be a partial close-tag
          const tail = findPartialSuffix(input, closeTag, pos)
          if (tail > 0) {
            // Everything before the partial tail is confirmed thinking
            emit(chunks, 'thinking', input.slice(pos, input.length - tail))
            state.pending = input.slice(input.length - tail)
          } else {
            emit(chunks, 'thinking', input.slice(pos))
          }
          pos = input.length
        } else {
          emit(chunks, 'thinking', input.slice(pos, closeIdx))
          state.insideThink = false
          pos = closeIdx + closeTag.length
        }
      } else {
        // Looking for <think>
        const openTag = '<think>'
        const openIdx = input.indexOf(openTag, pos)
        if (openIdx === -1) {
          const tail = findPartialSuffix(input, openTag, pos)
          if (tail > 0) {
            emit(chunks, 'content', input.slice(pos, input.length - tail))
            state.pending = input.slice(input.length - tail)
          } else {
            emit(chunks, 'content', input.slice(pos))
          }
          pos = input.length
        } else {
          emit(chunks, 'content', input.slice(pos, openIdx))
          state.insideThink = true
          pos = openIdx + openTag.length
        }
      }
    }

    return chunks
  }

  /** Flush any buffered pending text as content (called at stream end). */
  function flush(): ModelStreamChunk[] {
    if (!state.pending) return []
    const chunk: ModelStreamChunk = { type: state.insideThink ? 'thinking' : 'content', text: state.pending }
    state.pending = ''
    return chunk.text ? [chunk] : []
  }

  return { feed, flush }
}

/**
 * Returns the length of the longest suffix of `input` (starting at `from`) that is a
 * prefix of `tag`. Used to detect partial tag fragments at the end of a delta.
 */
function findPartialSuffix(input: string, tag: string, from: number): number {
  const sub = input.slice(from)
  // Try decreasing suffix lengths, down to 1
  for (let len = Math.min(tag.length - 1, sub.length); len >= 1; len--) {
    const suffix = sub.slice(sub.length - len)
    if (tag.startsWith(suffix)) return len
  }
  return 0
}

function emit(chunks: ModelStreamChunk[], type: 'content' | 'thinking', text: string) {
  if (text) chunks.push({ type, text })
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

async function* callAnthropic(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
  if (!request.apiKey) {
    throw new Error('Anthropic provider requires an API key. Add it in Settings.')
  }

  const maxTokens = MAX_CONTEXT_TOKENS[request.model] ?? 200_000

  // Filter messages to user/assistant only — system goes in the top-level 'system' field.
  const turns = truncateMessages(
    request.messages.filter((m) => m.role !== 'system'),
    request.systemPrompt,
    maxTokens
  )

  const body = {
    model: request.model,
    system: request.systemPrompt,
    messages: turns.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: MAX_RESPONSE_TOKENS,
    stream: true,
    // NOTE: Anthropic extended-thinking (`thinking: {type:'enabled', budget_tokens: N}`) is out
    // of Phase 3 scope. Thinking-mode separation (yielding 'thinking' chunks vs 'content' chunks)
    // applies to Qwen3/OpenAI-compat only, via the <think> tag parser. If extended-thinking is
    // added for Anthropic in a future phase, the SSE parser below handles 'thinking' block
    // deltas structurally (event type 'content_block_delta' with type:'thinking_block_delta').
  }

  const response = await fetch(PROVIDERS.anthropic.baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Anthropic auth is x-api-key, NOT Authorization: Bearer (BUILD_PROMPT has this wrong).
      'x-api-key': request.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // Required for direct browser/service-worker access to the Anthropic API.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal: request.signal,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${errText}`)
  }

  if (!response.body) throw new Error('Anthropic response body is null')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  let eventType = ''
  let dataBuffer = ''
  let incomplete = '' // Holds a partial SSE line that was split across read() boundaries

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = (incomplete + text).split('\n')
    // Last element may be an incomplete line — hold it for the next read.
    incomplete = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataBuffer = line.slice(5).trim()

        if (eventType === 'content_block_delta' && dataBuffer) {
          try {
            const parsed = JSON.parse(dataBuffer) as {
              delta?: { type: string; text?: string }
            }
            if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
              yield { type: 'content', text: parsed.delta.text }
            }
            // If extended-thinking is added: 'thinking_block_delta' → yield type:'thinking'
          } catch {
            // Malformed SSE data — skip
          }
          eventType = ''
          dataBuffer = ''
        }
      } else if (line === '') {
        // Blank line = end of SSE event; reset
        eventType = ''
        dataBuffer = ''
      }
    }
  }

  // Flush any incomplete SSE line buffered at natural stream end
  if (incomplete.startsWith('event:')) {
    eventType = incomplete.slice(6).trim()
  } else if (incomplete.startsWith('data:')) {
    dataBuffer = incomplete.slice(5).trim()
    if (eventType === 'content_block_delta' && dataBuffer) {
      try {
        const parsed = JSON.parse(dataBuffer) as {
          delta?: { type: string; text?: string }
        }
        if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
          yield { type: 'content', text: parsed.delta.text }
        }
      } catch { /* malformed — skip */ }
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible provider (Ollama + LM Studio share this helper)
// ---------------------------------------------------------------------------

async function* callOpenAICompatible(
  baseUrl: string,
  request: ModelRequest
): AsyncIterable<ModelStreamChunk> {
  const maxTokens = MAX_CONTEXT_TOKENS[request.model] ?? 32_000

  const turns = truncateMessages(request.messages, request.systemPrompt, maxTokens)

  // Build the messages array: system prompt first, then user/assistant turns.
  const messages = [
    { role: 'system', content: request.systemPrompt },
    ...turns.map((m) => ({ role: m.role, content: m.content })),
  ]

  // Qwen3 thinking control: pass chat_template_kwargs to disable <think> output when
  // thinkingMode is explicitly false (Edge Cases mode per the task-conditional rule).
  // When thinkingMode is true or undefined, let Qwen3 decide (thinking on by default).
  //
  // NOTE: chat_template_kwargs is Ollama-specific. LM Studio uses a standard OpenAI-compat
  // server that may reject unknown extra body fields with HTTP 400. Guard to Ollama only.
  const extraBody: Record<string, unknown> = {}
  if (request.thinkingMode === false && request.provider === 'ollama') {
    extraBody['chat_template_kwargs'] = { enable_thinking: false }
  }

  const body = {
    model: request.model,
    messages,
    stream: true,
    ...extraBody,
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: request.signal,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI-compat API error ${response.status}: ${errText}`)
  }

  if (!response.body) throw new Error('OpenAI-compat response body is null')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = makeThinkParser()
  let incomplete = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = (incomplete + text).split('\n')
    // Last element may be an incomplete line — hold it for the next read.
    incomplete = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') {
        // Flush any partial tag buffer at stream end
        for (const chunk of parser.flush()) {
          yield chunk
        }
        return
      }
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
      } catch {
        // Malformed SSE data — skip
      }
    }
  }

  // Parse any incomplete SSE line buffered at natural stream end (no [DONE] line).
  // Some providers terminate the stream without a [DONE] sentinel; the last data: line
  // may still be sitting in `incomplete` if the connection closed without a trailing '\n'.
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
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Call the configured LLM provider and stream response chunks.
 *
 * Yields ModelStreamChunk objects:
 *   { type: 'content', text }  — visible assistant message text
 *   { type: 'thinking', text } — Qwen3 reasoning content (for collapsible "Show reasoning" UI)
 *
 * All callers (coaching logic, code review, edge cases) use this one function.
 * Zero provider details leak outside this file.
 */
export async function* callModel(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
  switch (request.provider) {
    case 'anthropic':
      yield* callAnthropic(request)
      break

    case 'ollama':
      yield* callOpenAICompatible(PROVIDERS.ollama.baseUrl, request)
      break

    case 'lmstudio':
      yield* callOpenAICompatible(PROVIDERS.lmstudio.baseUrl, request)
      break

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = request.provider
      throw new Error(`Unknown provider: ${String(_exhaustive)}`)
    }
  }
}
