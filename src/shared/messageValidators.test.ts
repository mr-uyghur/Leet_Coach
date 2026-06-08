import { describe, expect, it } from 'vitest'
import {
  clampHintTier,
  normalizeChatRequestMessage,
  normalizeProblemUpdatedMessage,
} from './messageValidators'

describe('messageValidators', () => {
  it('clamps hint tiers to the supported range', () => {
    expect(clampHintTier(0)).toBe(0)
    expect(clampHintTier(2)).toBe(2)
    expect(clampHintTier(99)).toBe(0)
    expect(clampHintTier('3')).toBe(0)
  })

  it('normalizes valid CHAT_REQUEST messages', () => {
    const msg = normalizeChatRequestMessage({
      type: 'CHAT_REQUEST',
      payload: {
        requestId: 'req-1',
        messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1 }],
        settings: { provider: 'lmstudio', model: 'gemma-4-e4b', apiKey: '' },
        mode: 'socratic',
        problemContext: { slug: 'forged' },
        solutionUnlocked: true,
        hintTier: 3,
      },
    })

    expect(msg).toEqual({
      type: 'CHAT_REQUEST',
      payload: {
        requestId: 'req-1',
        messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1, thinkingContent: undefined }],
        settings: { provider: 'lmstudio', model: 'gemma-4-e4b', apiKey: '' },
        mode: 'socratic',
      },
    })
  })

  it('rejects malformed CHAT_REQUEST messages', () => {
    expect(normalizeChatRequestMessage({ type: 'CHAT_REQUEST', payload: {} })).toBeNull()
    expect(normalizeChatRequestMessage({
      type: 'CHAT_REQUEST',
      payload: {
        requestId: 'req-1',
        messages: [{ role: 'system', content: 'bad' }],
        settings: { provider: 'lmstudio', model: 'gemma-4-e4b' },
        mode: 'socratic',
      },
    })).toBeNull()
  })

  it('normalizes PROBLEM_UPDATED payloads and extraction metadata', () => {
    const msg = normalizeProblemUpdatedMessage({
      type: 'PROBLEM_UPDATED',
      payload: {
        slug: 'two-sum',
        title: 'Two Sum',
        code: 'function twoSum() {}',
        codeSource: 'dom-fallback',
        codeComplete: false,
        extractedAt: 123,
      },
    })

    expect(msg?.payload).toMatchObject({
      slug: 'two-sum',
      title: 'Two Sum',
      statement: '',
      constraints: '',
      difficulty: '',
      codeSource: 'dom-fallback',
      codeComplete: false,
      extractedAt: 123,
    })
  })

  it('rejects PROBLEM_UPDATED without a slug', () => {
    expect(normalizeProblemUpdatedMessage({ type: 'PROBLEM_UPDATED', payload: { title: 'No slug' } })).toBeNull()
  })
})
