// Unit tests for api.ts utilities.
// callAnthropic/callOpenAICompatible require fetch streaming mocks — tested manually.
// makeThinkParser and truncateMessages are pure functions, tested here.

import { describe, it, expect } from 'vitest'
import { makeThinkParser, truncateMessages } from './api'

// ---------------------------------------------------------------------------
// makeThinkParser
// ---------------------------------------------------------------------------

describe('makeThinkParser', () => {
  it('passes plain content through as content chunks', () => {
    const parser = makeThinkParser()
    const chunks = parser.feed('Hello world')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ type: 'content', text: 'Hello world' })
  })

  it('splits a complete think block in one chunk', () => {
    const parser = makeThinkParser()
    const chunks = parser.feed('Before<think>reasoning</think>after')
    const content = chunks.filter(c => c.type === 'content').map(c => c.text).join('')
    const thinking = chunks.filter(c => c.type === 'thinking').map(c => c.text).join('')
    expect(content).toBe('Beforeafter')
    expect(thinking).toBe('reasoning')
  })

  it('handles a <think> open tag split across two chunks', () => {
    const parser = makeThinkParser()
    const r1 = parser.feed('Hello <thi')
    const r2 = parser.feed('nk>reasoning here</think> world')
    const all = [...r1, ...r2]
    const content = all.filter(c => c.type === 'content').map(c => c.text).join('')
    const thinking = all.filter(c => c.type === 'thinking').map(c => c.text).join('')
    expect(content).toBe('Hello  world')
    expect(thinking).toBe('reasoning here')
  })

  it('handles a </think> close tag split across two chunks', () => {
    const parser = makeThinkParser()
    const r1 = parser.feed('<think>reasoning</thi')
    const r2 = parser.feed('nk>visible')
    const all = [...r1, ...r2]
    const content = all.filter(c => c.type === 'content').map(c => c.text).join('')
    const thinking = all.filter(c => c.type === 'thinking').map(c => c.text).join('')
    expect(content).toBe('visible')
    expect(thinking).toBe('reasoning')
  })

  it('flush emits pending partial tag as content at stream end', () => {
    const parser = makeThinkParser()
    parser.feed('Hello <thi') // '<thi' is a partial <think> — buffered as pending
    const flushed = parser.flush()
    // Pending partial tag emitted as-is (it turned out not to be a real tag)
    expect(flushed.map(c => c.text).join('')).toBe('<thi')
  })

  it('flush returns empty array when no pending text', () => {
    const parser = makeThinkParser()
    parser.feed('complete content')
    const flushed = parser.flush()
    expect(flushed).toHaveLength(0)
  })

  it('handles empty input gracefully', () => {
    const parser = makeThinkParser()
    expect(parser.feed('')).toHaveLength(0)
    expect(parser.flush()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// truncateMessages
// ---------------------------------------------------------------------------

describe('truncateMessages', () => {
  it('returns all messages when they fit within budget', () => {
    const messages = [
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: 'world' },
    ]
    const result = truncateMessages(messages, 'system', 100_000)
    expect(result).toHaveLength(2)
  })

  it('drops oldest messages first to stay within budget', () => {
    const messages = [
      { role: 'user' as const, content: 'a'.repeat(4000) },       // ~1000 tokens each
      { role: 'assistant' as const, content: 'b'.repeat(4000) },
      { role: 'user' as const, content: 'c'.repeat(4000) },
    ]
    // maxTokens=7000, system=400chars=100tokens, headroom=4096 → available=2804 tokens
    // c+b fit (2000 tokens), a would push to 3000 > 2804 → dropped
    const result = truncateMessages(messages, 'x'.repeat(400), 7000)
    expect(result).toHaveLength(2)
    // Newest message must survive
    expect(result[result.length - 1].content).toBe('c'.repeat(4000))
    // Oldest (a) must be dropped
    expect(result[0].content).toBe('b'.repeat(4000))
  })

  it('returns empty array when system prompt alone exceeds budget', () => {
    const messages = [{ role: 'user' as const, content: 'question' }]
    // System prompt >> maxTokens
    const result = truncateMessages(messages, 'x'.repeat(80_000), 10_000)
    expect(result).toHaveLength(0)
  })

  it('preserves message order (newest messages at the end)', () => {
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'second' },
      { role: 'user' as const, content: 'third' },
    ]
    const result = truncateMessages(messages, 'system', 100_000)
    expect(result[0].content).toBe('first')
    expect(result[2].content).toBe('third')
  })
})
