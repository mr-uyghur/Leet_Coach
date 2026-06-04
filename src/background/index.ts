// Background service worker — entry point.
// Handles PROBLEM_UPDATED messages from content scripts and relays them to the side panel
// via a long-lived chrome.runtime.Port. On panel connect, requests a fresh extraction
// from the active LeetCode tab to compensate for the SW's ephemeral in-memory cache.

import type { ProblemUpdatedMessage } from '../shared/messages'
import { PANEL_PORT_NAME } from '../shared/messages'

// In-memory cache — lost when the service worker is killed after ~30s idle.
// The on-connect re-request pattern (below) compensates for this.
let latestProblem: ProblemUpdatedMessage['payload'] | null = null
let panelPort: chrome.runtime.Port | null = null

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PROBLEM_UPDATED') {
    latestProblem = msg.payload
    console.log('[LCCoach BG] PROBLEM_UPDATED received:', msg.payload)

    if (panelPort) {
      try {
        panelPort.postMessage({ type: 'PROBLEM_UPDATED', payload: msg.payload })
      } catch {
        // Port closed unexpectedly — clean up so next connect starts fresh.
        panelPort = null
      }
    }

    sendResponse({ ok: true })
    return true
  }
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT_NAME) return
  panelPort = port
  console.log('[LCCoach BG] Side panel connected')

  // Send cached problem immediately if the SW has one in memory.
  if (latestProblem) {
    port.postMessage({ type: 'PROBLEM_UPDATED', payload: latestProblem })
  }

  // Also request a fresh extraction from the active LeetCode tab.
  // This handles the case where the SW was killed and latestProblem is null.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const lcTab = tabs.find((t) => t.url?.includes('leetcode.com/problems/'))
    if (lcTab?.id != null) {
      chrome.tabs.sendMessage(lcTab.id, { type: 'REQUEST_EXTRACT' }).catch(() => {
        // Content script may not yet be injected — the next PROBLEM_UPDATED will arrive soon.
      })
    }
  })

  port.onDisconnect.addListener(() => {
    if (panelPort === port) panelPort = null
    console.log('[LCCoach BG] Side panel disconnected')
  })
})
