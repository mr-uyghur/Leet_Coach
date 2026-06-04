// Relays page-script postMessage results to the background service worker.
// Handles SPA navigation detection so problem context stays fresh when the user
// navigates between problems without a full page reload:
//   - patches history.pushState / history.replaceState
//   - listens for popstate
//   - MutationObserver on <title> as a fallback signal
// On each navigation (slug change) and initial load: extracts problem + code,
// sends PROBLEM_UPDATED to the background via chrome.runtime.sendMessage.
// Also listens for REQUEST_EXTRACT from the background (triggered when the panel connects).

import { extractProblem } from './extractors/problem'
import { extractCode } from './extractors/code'
import type { ProblemUpdatedMessage } from '../shared/messages'

// Delay after a navigation event before extracting. LeetCode's React app needs time
// to render the new problem's DOM and initialize Monaco.
const NAV_EXTRACT_DELAY_MS = 1000
// Delay on initial page load. Monaco may not be ready immediately.
const INITIAL_EXTRACT_DELAY_MS = 1500

let currentSlug = ''
let extractTimer: ReturnType<typeof setTimeout> | null = null

function warnRuntimeUnavailable(err?: unknown): void {
  console.warn(
    '[LCCoach] Extension context is unavailable; refresh the LeetCode tab after reloading the extension.',
    err
  )
}

function getRuntime(): typeof chrome.runtime | null {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null
    return chrome.runtime
  } catch (err) {
    warnRuntimeUnavailable(err)
    return null
  }
}

function getSlug(): string {
  const match = window.location.pathname.match(/\/problems\/([^/]+)/)
  return match?.[1] ?? ''
}

async function doExtract(): Promise<void> {
  const problem = extractProblem()

  // Always send the problem, even if code extraction fails. Partial context is better than none.
  let code = ''
  try {
    code = await extractCode()
  } catch {
    console.warn('[LCCoach] Code extraction failed; sending PROBLEM_UPDATED with empty code')
  }

  const payload: ProblemUpdatedMessage['payload'] = { ...problem, code }
  console.log('[LCCoach] Sending PROBLEM_UPDATED:', payload)

  await sendProblemUpdated(payload)
}

async function sendProblemUpdated(payload: ProblemUpdatedMessage['payload']): Promise<void> {
  const runtime = getRuntime()
  if (!runtime) {
    warnRuntimeUnavailable()
    return
  }

  try {
    await runtime.sendMessage({ type: 'PROBLEM_UPDATED', payload })
  } catch (err) {
    // Background SW may not be ready on first load, and stale tabs keep old
    // content scripts after extension reloads. Neither should crash the page.
    console.warn('[LCCoach] sendMessage PROBLEM_UPDATED failed:', err)
  }
}

function registerRequestExtractListener(): void {
  const runtime = getRuntime()
  if (!runtime) {
    warnRuntimeUnavailable()
    return
  }

  try {
    // Background sends REQUEST_EXTRACT when the panel connects and the SW cache may be stale.
    runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'REQUEST_EXTRACT') {
        doExtract()
          .then(() => sendResponse({ ok: true }))
          .catch(() => sendResponse({ ok: false }))
        return true // keep message channel open for async sendResponse
      }
    })
  } catch (err) {
    warnRuntimeUnavailable(err)
  }
}

function scheduleExtract(delayMs: number): void {
  if (extractTimer) clearTimeout(extractTimer)
  extractTimer = setTimeout(() => doExtract(), delayMs)
}

function handleNavigation(): void {
  const slug = getSlug()
  if (!slug || slug === currentSlug) return
  currentSlug = slug
  scheduleExtract(NAV_EXTRACT_DELAY_MS)
}

export function initBridge(): void {
  // Patch history methods. LeetCode's SPA router calls these on problem navigation.
  const origPushState = history.pushState.bind(history)
  const origReplaceState = history.replaceState.bind(history)

  history.pushState = function (...args: Parameters<typeof origPushState>) {
    origPushState(...args)
    handleNavigation()
  }

  history.replaceState = function (...args: Parameters<typeof origReplaceState>) {
    origReplaceState(...args)
    handleNavigation()
  }

  window.addEventListener('popstate', handleNavigation)

  // MutationObserver on <title> as an additional nav signal.
  // LeetCode updates document.title on every problem navigation.
  const titleEl = document.querySelector('title')
  if (titleEl) {
    const obs = new MutationObserver(() => handleNavigation())
    obs.observe(titleEl, { childList: true })
  }

  registerRequestExtractListener()

  // Initial extraction. Wait for Monaco and the problem DOM to render.
  currentSlug = getSlug()
  if (currentSlug) {
    scheduleExtract(INITIAL_EXTRACT_DELAY_MS)
  }
}
