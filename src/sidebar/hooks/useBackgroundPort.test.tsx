import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBackgroundPort } from './useBackgroundPort'

interface FakePort extends chrome.runtime.Port {
  emitDisconnect: () => void
}

function makePort(): FakePort {
  let disconnectListener: (() => void) | null = null

  return {
    name: 'panel',
    postMessage: vi.fn(),
    disconnect: vi.fn(() => disconnectListener?.()),
    onMessage: {
      addListener: vi.fn(),
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
    emitDisconnect: () => disconnectListener?.(),
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useBackgroundPort', () => {
  it('connects and sends messages through the active port', () => {
    const port = makePort()
    vi.mocked(chrome.runtime.connect).mockReturnValue(port)

    const { result, unmount } = renderHook(() => useBackgroundPort())

    expect(result.current.status).toBe('connected')
    expect(result.current.sendToBackground({ type: 'PING' })).toBe(true)
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'PING' })

    unmount()
  })

  it('reconnects after a disconnect with bounded backoff', async () => {
    vi.useFakeTimers()
    const ports = [makePort(), makePort()]
    vi.mocked(chrome.runtime.connect)
      .mockReturnValueOnce(ports[0])
      .mockReturnValueOnce(ports[1])

    const { result, unmount } = renderHook(() => useBackgroundPort())
    expect(result.current.status).toBe('connected')

    act(() => {
      ports[0].emitDisconnect()
    })
    expect(result.current.status).toBe('disconnected')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(result.current.status).toBe('connected')
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(2)

    unmount()
  })
})
