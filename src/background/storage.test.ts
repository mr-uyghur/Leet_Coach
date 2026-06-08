import { beforeEach, describe, expect, it } from 'vitest'
import { clearChromeMockStorage } from '../test/setup'
import { loadConversation } from './storage'

beforeEach(() => {
  clearChromeMockStorage()
})

describe('loadConversation validation', () => {
  it('clamps invalid hint tier values', async () => {
    await chrome.storage.local.set({
      'conversation:two-sum': {
        messages: [],
        hintTier: 99,
        solutionUnlocked: true,
      },
    })

    const state = await loadConversation('two-sum')
    expect(state?.hintTier).toBe(0)
    expect(state?.solutionUnlocked).toBe(true)
  })

  it('filters malformed messages instead of casting blindly', async () => {
    await chrome.storage.local.set({
      'conversation:two-sum': {
        messages: [
          { id: 'ok', role: 'user', content: 'hello', timestamp: 1 },
          { id: 'bad-role', role: 'system', content: 'hidden', timestamp: 2 },
          { id: 'bad-content', role: 'assistant', content: 123, timestamp: 3 },
        ],
        hintTier: 2,
        solutionUnlocked: false,
      },
    })

    const state = await loadConversation('two-sum')
    expect(state?.messages).toHaveLength(1)
    expect(state?.messages[0]).toMatchObject({ id: 'ok', role: 'user', content: 'hello' })
    expect(state?.hintTier).toBe(2)
  })
})
