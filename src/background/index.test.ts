import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelRequest, ModelStreamChunk } from '../shared/types'

const mockState = vi.hoisted(() => ({
  requests: [] as ModelRequest[],
  gates: [] as Array<{ resolve: () => void }>,
}))

vi.mock('./api', () => ({
  callModel: vi.fn(async function* (request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    mockState.requests.push(request)
    await new Promise<void>((resolve) => mockState.gates.push({ resolve }))
    if (request.signal?.aborted) {
      const err = new Error('Aborted')
      err.name = 'AbortError'
      throw err
    }
    yield { type: 'content', text: 'ok' }
  }),
}))

interface FakePort extends chrome.runtime.Port {
  emitMessage: (message: unknown) => void
  emitDisconnect: () => void
}

function makePort(): FakePort {
  let messageListener: ((message: unknown) => void) | null = null
  let disconnectListener: (() => void) | null = null

  return {
    name: 'panel',
    postMessage: vi.fn(),
    disconnect: vi.fn(() => disconnectListener?.()),
    onMessage: {
      addListener: vi.fn((listener) => { messageListener = listener }),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
      hasListeners: vi.fn(),
      addRules: vi.fn(),
      getRules: vi.fn(),
      removeRules: vi.fn(),
    },
    onDisconnect: {
      addListener: vi.fn((listener) => { disconnectListener = listener }),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
      hasListeners: vi.fn(),
      addRules: vi.fn(),
      getRules: vi.fn(),
      removeRules: vi.fn(),
    },
    sender: undefined,
    emitMessage: (message: unknown) => messageListener?.(message),
    emitDisconnect: () => disconnectListener?.(),
  }
}

async function loadBackground() {
  vi.resetModules()
  const mod = await import('./index')
  mod.__testing.resetSessions()
  return mod
}

function getRuntimeMessageListener() {
  const calls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls
  return calls[calls.length - 1]?.[0]
}

function getConnectListener() {
  const calls = vi.mocked(chrome.runtime.onConnect.addListener).mock.calls
  return calls[calls.length - 1]?.[0]
}

function sendProblem(tabId: number, slug: string) {
  const listener = getRuntimeMessageListener()
  expect(listener).toBeDefined()
  const sendResponse = vi.fn()
  listener?.({
    type: 'PROBLEM_UPDATED',
    payload: {
      slug,
      title: slug,
      statement: 'statement',
      constraints: '',
      difficulty: 'Easy',
      code: 'code',
      codeSource: 'monaco',
      codeComplete: true,
      extractedAt: 1,
    },
  }, { tab: { id: tabId } } as chrome.runtime.MessageSender, sendResponse)
  return sendResponse
}

function connectPanel(tabId: number): FakePort {
  vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, cb?: (tabs: chrome.tabs.Tab[]) => void) => {
    const tabs = [{ id: tabId, url: 'https://leetcode.com/problems/two-sum/' }] as chrome.tabs.Tab[]
    cb?.(tabs)
    return Promise.resolve(tabs)
  }) as typeof chrome.tabs.query)

  const port = makePort()
  getConnectListener()?.(port)
  return port
}

const chatRequest = (requestId: string) => ({
  type: 'CHAT_REQUEST',
  payload: {
    requestId,
    messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1 }],
    settings: { provider: 'lmstudio', model: 'gemma-4-e4b', apiKey: '' },
    mode: 'socratic',
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mockState.requests.length = 0
  mockState.gates.length = 0
})

describe('background session authority', () => {
  it('rejects malformed PROBLEM_UPDATED payloads', async () => {
    await loadBackground()
    const listener = getRuntimeMessageListener()
    const sendResponse = vi.fn()

    listener?.({ type: 'PROBLEM_UPDATED', payload: { title: 'missing slug' } }, { tab: { id: 1 } } as chrome.runtime.MessageSender, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'Invalid PROBLEM_UPDATED payload' })
  })

  it('keeps per-tab problem sessions isolated', async () => {
    const bg = await loadBackground()
    sendProblem(1, 'two-sum')
    sendProblem(2, 'three-sum')

    expect(bg.__testing.getSessionSnapshot(1)?.latestProblem?.slug).toBe('two-sum')
    expect(bg.__testing.getSessionSnapshot(2)?.latestProblem?.slug).toBe('three-sum')
  })

  it('does not enter solution mode before trusted tier 3', async () => {
    await loadBackground()
    sendProblem(1, 'two-sum')
    const port = connectPanel(1)

    port.emitMessage({ type: 'UNLOCK_SOLUTION' })
    port.emitMessage(chatRequest('req-1'))
    await Promise.resolve()

    expect(mockState.requests[0].systemPrompt).toContain('<anti_spoiler>')
  })

  it('enters solution mode after trusted tier 3 and unlock', async () => {
    await loadBackground()
    sendProblem(1, 'two-sum')
    const port = connectPanel(1)

    port.emitMessage({ type: 'HINT_TIER_UPDATED', hintTier: 3 })
    port.emitMessage({ type: 'UNLOCK_SOLUTION' })
    port.emitMessage(chatRequest('req-1'))
    await Promise.resolve()

    expect(mockState.requests[0].systemPrompt).not.toContain('<anti_spoiler>')
    expect(mockState.requests[0].systemPrompt).toContain('Full Solution mode')
  })

  it('returns CHAT_ERROR for malformed chat requests', async () => {
    await loadBackground()
    const port = connectPanel(1)

    port.emitMessage({ type: 'CHAT_REQUEST', payload: { requestId: 'bad' } })

    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'CHAT_ERROR',
      requestId: 'bad',
      error: 'Invalid CHAT_REQUEST payload',
    })
  })

  it('aborts an active request when a newer request starts', async () => {
    await loadBackground()
    sendProblem(1, 'two-sum')
    const port = connectPanel(1)

    port.emitMessage(chatRequest('req-1'))
    await Promise.resolve()
    const firstSignal = mockState.requests[0].signal

    port.emitMessage(chatRequest('req-2'))
    await Promise.resolve()

    expect(firstSignal?.aborted).toBe(true)
  })

  it('aborts an active request when the port disconnects', async () => {
    await loadBackground()
    sendProblem(1, 'two-sum')
    const port = connectPanel(1)

    port.emitMessage(chatRequest('req-1'))
    await Promise.resolve()
    const signal = mockState.requests[0].signal

    port.emitDisconnect()

    expect(signal?.aborted).toBe(true)
  })

  it('aborts active stream and resets policy on problem slug change', async () => {
    const bg = await loadBackground()
    sendProblem(1, 'two-sum')
    const port = connectPanel(1)
    port.emitMessage({ type: 'HINT_TIER_UPDATED', hintTier: 3 })
    port.emitMessage({ type: 'UNLOCK_SOLUTION' })
    port.emitMessage(chatRequest('req-1'))
    await Promise.resolve()
    const signal = mockState.requests[0].signal

    sendProblem(1, 'three-sum')

    expect(signal?.aborted).toBe(true)
    expect(bg.__testing.getSessionSnapshot(1)?.hintTier).toBe(0)
    expect(bg.__testing.getSessionSnapshot(1)?.solutionUnlocked).toBe(false)
  })
})
