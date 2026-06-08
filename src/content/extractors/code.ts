// Monaco code extraction.
// Primary path: page-script.js in the page world reads window.monaco.
// Fallback path: DOM .view-line scrape is lossy because Monaco virtualizes lines.

import { SELECTORS } from './selectors'

const MONACO_REQUEST_TIMEOUT_MS = 750
const MONACO_POLL_ATTEMPTS = 5
const MONACO_POLL_DELAY_MS = 300

export interface CodeExtractionResult {
  code: string
  source: 'monaco' | 'dom-fallback' | 'missing'
  complete: boolean
}

let codeRequestCounter = 0

function getPrimaryCode(): Promise<string> {
  const requestId = `code-${++codeRequestCounter}`

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Monaco code request timed out'))
    }, MONACO_REQUEST_TIMEOUT_MS)

    function handler(event: MessageEvent) {
      if (event.source !== window) return
      if (!event.data || event.data.type !== 'LC_CODE_RESULT') return
      if (event.data.requestId !== requestId) return

      clearTimeout(timeout)
      window.removeEventListener('message', handler)

      if (event.data.error) {
        reject(new Error(String(event.data.error)))
      } else {
        resolve(event.data.code ?? '')
      }
    }

    window.addEventListener('message', handler)
    window.postMessage({ type: 'LC_GET_CODE', requestId }, '*')
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getPrimaryCodeWithPolling(): Promise<string> {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MONACO_POLL_ATTEMPTS; attempt++) {
    try {
      const code = await getPrimaryCode()
      if (code || attempt === MONACO_POLL_ATTEMPTS) return code
    } catch (err) {
      lastError = err
    }

    if (attempt < MONACO_POLL_ATTEMPTS) {
      await delay(MONACO_POLL_DELAY_MS)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Monaco code request failed')
}

function getFallbackCode(): string {
  const lines = document.querySelectorAll(SELECTORS.viewLine)
  if (lines.length === 0) return ''

  const code = Array.from(lines)
    .map((line) => (line as HTMLElement).innerText ?? line.textContent ?? '')
    .join('\n')

  console.warn('[LCCoach] code: using lossy DOM fallback; file may be truncated at visible viewport')
  return code
}

export async function extractCode(): Promise<string> {
  try {
    const code = await getPrimaryCodeWithPolling()
    console.log('[LCCoach] code: Monaco API primary path succeeded')
    return code
  } catch (err) {
    console.warn('[LCCoach] code: Monaco API path failed:', err, 'trying DOM fallback')
    return getFallbackCode()
  }
}

export async function extractCodeSnapshot(): Promise<CodeExtractionResult> {
  try {
    const code = await getPrimaryCodeWithPolling()
    console.log('[LCCoach] code: Monaco API primary path succeeded')
    return {
      code,
      source: code ? 'monaco' : 'missing',
      complete: Boolean(code),
    }
  } catch (err) {
    console.warn('[LCCoach] code: Monaco API path failed:', err, 'trying DOM fallback')
    const code = getFallbackCode()
    return {
      code,
      source: code ? 'dom-fallback' : 'missing',
      complete: false,
    }
  }
}
