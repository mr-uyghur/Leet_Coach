// Monaco code extraction.
// Primary path: page-script.js (main world) → window.postMessage → content script.
// Fallback path: DOM .view-line scrape — LOSSY.
//   Monaco virtualizes long files; only visible rows are rendered in the DOM.
//   Files longer than ~50 visible lines will return a partial snapshot.
//   Never treat the fallback as equivalent to the Monaco API path.

import { SELECTORS } from './selectors'

const MONACO_REQUEST_TIMEOUT_MS = 3000

/** Monotonically increasing counter; each getPrimaryCode() call gets a unique id. */
let _codeRequestCounter = 0

function getPrimaryCode(): Promise<string> {
  const requestId = `code-${++_codeRequestCounter}`

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Monaco code request timed out after 3s'))
    }, MONACO_REQUEST_TIMEOUT_MS)

    function handler(event: MessageEvent) {
      if (event.source !== window) return
      if (!event.data || event.data.type !== 'LC_CODE_RESULT') return
      // Ignore responses from a previous (timed-out) call arriving late
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

function getFallbackCode(): string {
  // DOM-based fallback — returns PARTIAL code for files taller than the visible editor window.
  // Only use when the Monaco API path fails.
  const lines = document.querySelectorAll(SELECTORS.viewLine)
  if (lines.length === 0) return ''
  const code = Array.from(lines)
    .map(l => (l as HTMLElement).innerText ?? l.textContent ?? '')
    .join('\n')
  console.warn('[LCCoach] code: using lossy DOM fallback — file may be truncated at visible viewport')
  return code
}

export async function extractCode(): Promise<string> {
  try {
    const code = await getPrimaryCode()
    console.log('[LCCoach] code: Monaco API primary path succeeded')
    return code
  } catch (err) {
    console.warn('[LCCoach] code: Monaco API path failed:', err, '— trying DOM fallback')
    return getFallbackCode()
  }
}
