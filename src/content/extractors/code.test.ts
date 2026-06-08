import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractCodeSnapshot } from './code'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  window.onmessage = null
})

describe('extractCodeSnapshot', () => {
  it('reports complete Monaco code when the page script responds', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation((message) => {
      if ((message as { type?: string }).type !== 'LC_GET_CODE') return
      setTimeout(() => {
        window.dispatchEvent(new MessageEvent('message', {
          source: window,
          data: {
            type: 'LC_CODE_RESULT',
            requestId: (message as { requestId: string }).requestId,
            code: 'function twoSum() {}',
            error: null,
          },
        }))
      }, 0)
    })

    const result = await extractCodeSnapshot()

    postMessageSpy.mockRestore()
    expect(result).toEqual({
      code: 'function twoSum() {}',
      source: 'monaco',
      complete: true,
    })
  })

  it('reports lossy DOM fallback when Monaco never responds', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <div class="view-line">line one</div>
      <div class="view-line">line two</div>
    `

    const promise = extractCodeSnapshot()
    await vi.advanceTimersByTimeAsync(6000)
    const result = await promise

    expect(result).toEqual({
      code: 'line one\nline two',
      source: 'dom-fallback',
      complete: false,
    })
  })
})
