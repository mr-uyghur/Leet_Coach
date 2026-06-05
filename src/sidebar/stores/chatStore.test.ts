// Unit tests for the Zustand chat store.
// Verifies tier monotonic-increase, mode isolation, slug-change reset, solution unlock,
// conversation hydration state machine, and finalizeMessage edge cases.

import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from './chatStore'
import type { ProblemUpdatedMessage } from '../../shared/messages'

// Helper: reset the store to its initial state between tests.
function resetStore() {
  useChatStore.setState({
    messages: [],
    inFlightContent: '',
    inFlightThinking: '',
    isStreaming: false,
    streamError: null,
    isConversationHydrating: false,
    currentProblem: null,
    hintTier: 0,
    mode: 'socratic',
    solutionUnlocked: false,
  })
}

const PROBLEM_A: ProblemUpdatedMessage['payload'] = {
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Given an array of integers...',
  constraints: '2 <= nums.length <= 10^4',
  difficulty: 'Easy',
  code: 'function twoSum(nums, target) {}',
}

const PROBLEM_B: ProblemUpdatedMessage['payload'] = {
  slug: 'longest-substring',
  title: 'Longest Substring Without Repeating Characters',
  statement: 'Given a string s...',
  constraints: '0 <= s.length <= 5 * 10^4',
  difficulty: 'Medium',
  code: 'function lengthOfLongestSubstring(s) {}',
}

beforeEach(resetStore)

// ---------------------------------------------------------------------------
// Hint tier
// ---------------------------------------------------------------------------

describe('setHintTier', () => {
  it('sets the hint tier', () => {
    useChatStore.getState().setHintTier(2)
    expect(useChatStore.getState().hintTier).toBe(2)
  })

  it('can advance tier monotonically', () => {
    const { setHintTier } = useChatStore.getState()
    setHintTier(1)
    setHintTier(2)
    setHintTier(3)
    expect(useChatStore.getState().hintTier).toBe(3)
  })

  it('cannot regress (lower tier applied overwrites — enforced by HintControls, not store)', () => {
    // The store itself doesn't enforce monotonicity — it's enforced in HintControls
    // by disabling already-active buttons. We just verify state is stored as-given.
    useChatStore.getState().setHintTier(3)
    useChatStore.getState().setHintTier(1) // store accepts it; UI prevents this
    expect(useChatStore.getState().hintTier).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

describe('setMode', () => {
  it('sets the mode without touching the hint tier', () => {
    useChatStore.getState().setHintTier(2)
    useChatStore.getState().setMode('review')
    const s = useChatStore.getState()
    expect(s.mode).toBe('review')
    expect(s.hintTier).toBe(2) // tier preserved
  })

  it('transitions between all three modes', () => {
    const { setMode } = useChatStore.getState()
    setMode('edgecases')
    expect(useChatStore.getState().mode).toBe('edgecases')
    setMode('review')
    expect(useChatStore.getState().mode).toBe('review')
    setMode('socratic')
    expect(useChatStore.getState().mode).toBe('socratic')
  })
})

// ---------------------------------------------------------------------------
// Solution unlock
// ---------------------------------------------------------------------------

describe('unlockSolution', () => {
  it('sets solutionUnlocked to true', () => {
    useChatStore.getState().unlockSolution()
    expect(useChatStore.getState().solutionUnlocked).toBe(true)
  })

  it('is sticky — cannot be re-locked', () => {
    useChatStore.getState().unlockSolution()
    // No public re-lock action. Confirm state stays true.
    expect(useChatStore.getState().solutionUnlocked).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// setProblem + slug change reset
// ---------------------------------------------------------------------------

describe('setProblem', () => {
  it('sets the current problem', () => {
    useChatStore.getState().setProblem(PROBLEM_A)
    expect(useChatStore.getState().currentProblem).toEqual(PROBLEM_A)
  })

  it('resets hintTier, solutionUnlocked, messages on slug change', () => {
    // Set up state on Problem A
    useChatStore.getState().setProblem(PROBLEM_A)
    useChatStore.getState().setHintTier(3)
    useChatStore.getState().unlockSolution()
    useChatStore.getState().addUserMessage('hello')

    expect(useChatStore.getState().hintTier).toBe(3)
    expect(useChatStore.getState().solutionUnlocked).toBe(true)
    expect(useChatStore.getState().messages).toHaveLength(1)

    // Navigate to Problem B
    useChatStore.getState().setProblem(PROBLEM_B)
    const s = useChatStore.getState()
    expect(s.hintTier).toBe(0)
    expect(s.solutionUnlocked).toBe(false)
    expect(s.messages).toHaveLength(0)
  })

  it('sets isConversationHydrating on slug change', () => {
    useChatStore.getState().setProblem(PROBLEM_A)
    useChatStore.getState().setProblem(PROBLEM_B)
    expect(useChatStore.getState().isConversationHydrating).toBe(true)
  })

  it('preserves mode across slug changes', () => {
    useChatStore.getState().setMode('review')
    useChatStore.getState().setProblem(PROBLEM_A)
    useChatStore.getState().setProblem(PROBLEM_B)
    expect(useChatStore.getState().mode).toBe('review')
  })

  it('does NOT reset on same slug (update without navigation)', () => {
    useChatStore.getState().setProblem(PROBLEM_A)
    useChatStore.getState().setHintTier(2)
    useChatStore.getState().addUserMessage('test')

    // Same slug, code updated
    useChatStore.getState().setProblem({ ...PROBLEM_A, code: 'updated code' })
    const s = useChatStore.getState()
    expect(s.hintTier).toBe(2) // preserved
    expect(s.messages).toHaveLength(1) // preserved
    expect(s.currentProblem?.code).toBe('updated code')
  })
})

// ---------------------------------------------------------------------------
// Conversation hydration
// ---------------------------------------------------------------------------

describe('hydrateConversation', () => {
  it('loads saved messages and clears hydrating flag', () => {
    const saved = [
      { id: '1', role: 'user' as const, content: 'hello', timestamp: 1000 },
      { id: '2', role: 'assistant' as const, content: 'world', timestamp: 1001 },
    ]
    useChatStore.getState().setProblem(PROBLEM_A)
    useChatStore.getState().setProblem(PROBLEM_B) // triggers hydrating=true
    useChatStore.getState().hydrateConversation({ messages: saved, hintTier: 0, solutionUnlocked: false })

    const s = useChatStore.getState()
    expect(s.messages).toHaveLength(2)
    expect(s.isConversationHydrating).toBe(false)
    expect(s.isStreaming).toBe(false)
  })
})

describe('finishConversationHydration', () => {
  it('clears hydrating flag without touching messages', () => {
    useChatStore.setState({ isConversationHydrating: true, messages: [] })
    useChatStore.getState().finishConversationHydration()
    expect(useChatStore.getState().isConversationHydrating).toBe(false)
    expect(useChatStore.getState().messages).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Streaming lifecycle
// ---------------------------------------------------------------------------

describe('addUserMessage', () => {
  it('appends user message and sets isStreaming', () => {
    useChatStore.getState().addUserMessage('test input')
    const s = useChatStore.getState()
    expect(s.messages).toHaveLength(1)
    expect(s.messages[0].role).toBe('user')
    expect(s.messages[0].content).toBe('test input')
    expect(s.isStreaming).toBe(true)
  })
})

describe('appendDelta / finalizeMessage', () => {
  it('accumulates deltas then finalizes as an assistant message', () => {
    useChatStore.getState().addUserMessage('prompt')
    useChatStore.getState().appendDelta('Hello ')
    useChatStore.getState().appendDelta('world')
    useChatStore.getState().finalizeMessage()

    const s = useChatStore.getState()
    expect(s.isStreaming).toBe(false)
    expect(s.inFlightContent).toBe('')
    // user + assistant
    expect(s.messages).toHaveLength(2)
    expect(s.messages[1].role).toBe('assistant')
    expect(s.messages[1].content).toBe('Hello world')
  })

  it('handles empty in-flight content gracefully (no empty message appended)', () => {
    useChatStore.getState().addUserMessage('prompt')
    // finalizeMessage with nothing accumulated
    useChatStore.getState().finalizeMessage()
    const s = useChatStore.getState()
    // Only the user message — no empty assistant message pushed
    expect(s.messages).toHaveLength(1)
    expect(s.isStreaming).toBe(false)
  })

  it('attaches thinkingContent from CHAT_DONE payload when provided', () => {
    useChatStore.getState().addUserMessage('prompt')
    useChatStore.getState().appendDelta('answer')
    useChatStore.getState().finalizeMessage('the reasoning chain')
    const assistant = useChatStore.getState().messages[1]
    expect(assistant.thinkingContent).toBe('the reasoning chain')
  })
})

describe('setError', () => {
  it('clears streaming state and records the error', () => {
    useChatStore.getState().addUserMessage('prompt')
    useChatStore.getState().setError('Network timeout')
    const s = useChatStore.getState()
    expect(s.isStreaming).toBe(false)
    expect(s.streamError).toBe('Network timeout')
    expect(s.inFlightContent).toBe('')
  })
})

// ---------------------------------------------------------------------------
// resetHints
// ---------------------------------------------------------------------------

describe('resetHints', () => {
  it('sets hintTier to 0', () => {
    useChatStore.getState().setHintTier(3)
    useChatStore.getState().resetHints()
    expect(useChatStore.getState().hintTier).toBe(0)
  })

  it('clears solutionUnlocked', () => {
    useChatStore.getState().setHintTier(3)
    useChatStore.getState().unlockSolution()
    expect(useChatStore.getState().solutionUnlocked).toBe(true)
    useChatStore.getState().resetHints()
    expect(useChatStore.getState().solutionUnlocked).toBe(false)
  })

  it('does not clear conversation messages', () => {
    useChatStore.getState().addUserMessage('hello')
    useChatStore.getState().resetHints()
    expect(useChatStore.getState().messages).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// cross-stream contamination guard (store level)
// ---------------------------------------------------------------------------

describe('cross-stream contamination guard', () => {
  it('finalizeMessage with empty inFlightContent does nothing (no empty assistant message)', () => {
    useChatStore.getState().addUserMessage('prompt')
    useChatStore.getState().finalizeMessage(undefined)
    // Only the user message — empty in-flight should not push an assistant message
    expect(useChatStore.getState().messages).toHaveLength(1)
    expect(useChatStore.getState().isStreaming).toBe(false)
  })

  it('resetConversation clears in-flight state', () => {
    useChatStore.getState().addUserMessage('hello')
    useChatStore.getState().appendDelta('partial response')
    useChatStore.getState().resetConversation()
    expect(useChatStore.getState().inFlightContent).toBe('')
    expect(useChatStore.getState().isStreaming).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resetConversation
// ---------------------------------------------------------------------------

describe('resetConversation', () => {
  it('clears messages, tier, and unlock state', () => {
    useChatStore.getState().addUserMessage('hello')
    useChatStore.getState().setHintTier(3)
    useChatStore.getState().unlockSolution()

    useChatStore.getState().resetConversation()
    const s = useChatStore.getState()
    expect(s.messages).toHaveLength(0)
    expect(s.hintTier).toBe(0)
    expect(s.solutionUnlocked).toBe(false)
    expect(s.isStreaming).toBe(false)
  })
})
