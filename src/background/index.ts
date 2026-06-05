// Background service worker — entry point.
// Handles PROBLEM_UPDATED messages from content scripts and relays them to the side panel
// via a long-lived chrome.runtime.Port. On panel connect, requests a fresh extraction
// from the active LeetCode tab to compensate for the SW's ephemeral in-memory cache.
//
// Phase 3: Added CHAT_REQUEST handler on the panel port.
// The port opened by App.tsx is reused bidirectionally — CHAT_REQUEST arrives over it,
// CHAT_DELTA / CHAT_DONE / CHAT_ERROR stream back over the same port. This is the only
// clean channel; we cannot open a port from the background to the panel (ports are always
// initiated by the connecting side).

import type { ProblemUpdatedMessage, ChatRequestMessage } from '../shared/messages'
import { PANEL_PORT_NAME } from '../shared/messages'
import { callModel } from './api'
import type { ModelRequest } from '../shared/types'
import { selectSystemPrompt } from '../shared/prompts/index'

// In-memory cache — lost when the service worker is killed after ~30s idle.
// The on-connect re-request pattern (below) compensates for this.
let latestProblem: ProblemUpdatedMessage['payload'] | null = null
let panelPort: chrome.runtime.Port | null = null
/** AbortController for the currently in-flight LLM request (null when idle). */
let activeAbortController: AbortController | null = null

// ---------------------------------------------------------------------------
// PROBLEM_UPDATED — from content script
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Panel port — long-lived connection from the sidebar
// ---------------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // CHAT_REQUEST — received from the sidebar over the same port
  // -------------------------------------------------------------------

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'CHAT_REQUEST') return

    const chatMsg = msg as ChatRequestMessage
    const { requestId } = chatMsg.payload

    // Abort any previous in-flight request before starting the new one.
    // This handles both C1 (cross-problem navigation) and H4 (double-send race).
    if (activeAbortController) {
      activeAbortController.abort()
    }
    activeAbortController = new AbortController()
    const signal = activeAbortController.signal

    // Select the correct system prompt for the current mode, hint tier, and problem context.
    // All prompt logic lives in src/shared/prompts/index.ts — the background only routes.
    const { mode, hintTier, solutionUnlocked, problemContext } = chatMsg.payload
    const systemPrompt = selectSystemPrompt({
      mode,
      hintTier,
      solutionUnlocked,
      problem: problemContext,
    })
    console.log(
      `[LCCoach BG] System prompt selected: mode=${mode}, tier=${hintTier}, solutionUnlocked=${solutionUnlocked}, length=${systemPrompt.length}`
    )

    const request: ModelRequest = {
      provider: chatMsg.payload.settings.provider,
      model: chatMsg.payload.settings.model,
      apiKey: chatMsg.payload.settings.apiKey || undefined,
      messages: chatMsg.payload.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      systemPrompt,
      stream: true,
      // Thinking mode off for Edge Cases (generative, no benefit from reasoning chain).
      thinkingMode: mode !== 'edgecases',
      signal,
    }

    let thinkingAccumulator = ''

    try {
      for await (const chunk of callModel(request)) {
        // Check abort between chunks (fetch abort throws above, but defensive here too)
        if (signal.aborted) return

        if (chunk.type === 'content') {
          port.postMessage({ type: 'CHAT_DELTA', requestId, delta: chunk.text })
        } else {
          // Accumulate thinking content to send with CHAT_DONE
          thinkingAccumulator += chunk.text
        }
      }

      if (!signal.aborted) {
        port.postMessage({
          type: 'CHAT_DONE',
          requestId,
          thinkingContent: thinkingAccumulator || undefined,
        })
      }
    } catch (err) {
      // Abort errors are expected when a new request supersedes this one — don't surface them.
      if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) return

      const message = err instanceof Error ? err.message : String(err)
      port.postMessage({ type: 'CHAT_ERROR', requestId, error: message })
    } finally {
      // Only clear if we're still the active request (not superseded by a newer one)
      if (activeAbortController?.signal === signal) {
        activeAbortController = null
      }
    }
  })

  port.onDisconnect.addListener(() => {
    if (panelPort === port) panelPort = null
    console.log('[LCCoach BG] Side panel disconnected')
  })
})

