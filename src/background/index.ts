// Background service worker.
// Owns trusted per-tab session state: current problem, hint tier, solution unlock,
// active side-panel port, and the in-flight LLM request.

import { PANEL_PORT_NAME } from '../shared/messages'
import { callModel } from './api'
import type { HintTier, ModelRequest, ProblemContext } from '../shared/types'
import { selectSystemPrompt } from '../shared/prompts/index'
import {
  normalizeAbortStreamMessage,
  normalizeChatRequestMessage,
  normalizeHintTierUpdatedMessage,
  normalizeProblemUpdatedMessage,
  normalizeUnlockSolutionMessage,
} from '../shared/messageValidators'

interface SessionState {
  tabId: number
  latestProblem: ProblemContext | null
  panelPort: chrome.runtime.Port | null
  activeAbortController: AbortController | null
  hintTier: HintTier
  solutionUnlocked: boolean
}

const sessions = new Map<number, SessionState>()

function emptyProblem(): ProblemContext {
  return {
    slug: '',
    title: '',
    statement: '',
    constraints: '',
    difficulty: '',
    code: '',
    codeSource: 'missing',
    codeComplete: false,
    extractedAt: Date.now(),
  }
}

function getSession(tabId: number): SessionState {
  let session = sessions.get(tabId)
  if (!session) {
    session = {
      tabId,
      latestProblem: null,
      panelPort: null,
      activeAbortController: null,
      hintTier: 0,
      solutionUnlocked: false,
    }
    sessions.set(tabId, session)
  }
  return session
}

function findSessionForPort(port: chrome.runtime.Port): SessionState | null {
  for (const session of sessions.values()) {
    if (session.panelPort === port) return session
  }
  return null
}

function abortActiveStream(session: SessionState): void {
  if (!session.activeAbortController) return
  session.activeAbortController.abort()
  session.activeAbortController = null
}

function safePost(port: chrome.runtime.Port, message: unknown): boolean {
  try {
    port.postMessage(message)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Extension action
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) {
    console.warn('[LCCoach BG] Extension action clicked without an active tab id')
    return
  }

  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    console.error('[LCCoach BG] Failed to open side panel:', err)
  })
})

// ---------------------------------------------------------------------------
// PROBLEM_UPDATED from content scripts
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'PROBLEM_UPDATED') return
  const problemMsg = normalizeProblemUpdatedMessage(msg)
  if (!problemMsg) {
    sendResponse({ ok: false, error: 'Invalid PROBLEM_UPDATED payload' })
    return true
  }

  const tabId = sender.tab?.id
  if (tabId == null) {
    sendResponse({ ok: false, error: 'PROBLEM_UPDATED missing sender tab id' })
    return true
  }

  const session = getSession(tabId)
  const previousSlug = session.latestProblem?.slug
  session.latestProblem = problemMsg.payload

  if (previousSlug && previousSlug !== session.latestProblem.slug) {
    abortActiveStream(session)
    session.hintTier = 0
    session.solutionUnlocked = false
  }

  if (session.panelPort && !safePost(session.panelPort, { type: 'PROBLEM_UPDATED', payload: session.latestProblem })) {
    session.panelPort = null
    abortActiveStream(session)
  }

  sendResponse({ ok: true })
  return true
})

// ---------------------------------------------------------------------------
// Side-panel port
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT_NAME) return
  console.log('[LCCoach BG] Side panel connected')

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const lcTab = tabs.find((t) => t.id != null && t.url?.includes('leetcode.com/problems/'))
    if (lcTab?.id == null) return

    const session = getSession(lcTab.id)
    if (session.panelPort && session.panelPort !== port) {
      abortActiveStream(session)
      try {
        session.panelPort.disconnect()
      } catch {
        // Old port may already be gone.
      }
    }

    session.panelPort = port

    if (session.latestProblem) {
      safePost(port, { type: 'PROBLEM_UPDATED', payload: session.latestProblem })
    }

    chrome.tabs.sendMessage(lcTab.id, { type: 'REQUEST_EXTRACT' }).catch(() => {
      // Content script may not yet be injected; a later PROBLEM_UPDATED will refresh state.
    })
  })

  port.onMessage.addListener(async (msg) => {
    const session = findSessionForPort(port)

    const hintTierMsg = normalizeHintTierUpdatedMessage(msg)
    if (hintTierMsg) {
      if (!session) return
      session.hintTier = hintTierMsg.hintTier
      if (hintTierMsg.hintTier < 3) session.solutionUnlocked = false
      return
    }

    if (normalizeUnlockSolutionMessage(msg)) {
      if (!session) return
      if (session.hintTier >= 3) session.solutionUnlocked = true
      return
    }

    if (normalizeAbortStreamMessage(msg)) {
      if (session) abortActiveStream(session)
      return
    }

    const chatMsg = normalizeChatRequestMessage(msg)
    if (!chatMsg) {
      if (msg?.type === 'CHAT_REQUEST') {
        const requestId = typeof msg?.payload?.requestId === 'string' ? msg.payload.requestId : 'invalid-request'
        safePost(port, {
          type: 'CHAT_ERROR',
          requestId,
          error: 'Invalid CHAT_REQUEST payload',
        })
      }
      return
    }

    const { requestId } = chatMsg.payload
    if (!session) {
      safePost(port, {
        type: 'CHAT_ERROR',
        requestId,
        error: 'No active LeetCode problem tab is connected. Open the side panel from a problem page.',
      })
      return
    }

    abortActiveStream(session)
    session.activeAbortController = new AbortController()
    const signal = session.activeAbortController.signal

    const problem = session.latestProblem ?? emptyProblem()
    const { mode } = chatMsg.payload
    const systemPrompt = selectSystemPrompt({
      mode,
      hintTier: session.hintTier,
      solutionUnlocked: session.solutionUnlocked,
      problem,
    })

    const request: ModelRequest = {
      provider: chatMsg.payload.settings.provider,
      model: chatMsg.payload.settings.model,
      apiKey: chatMsg.payload.settings.apiKey || undefined,
      messages: chatMsg.payload.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      systemPrompt,
      stream: true,
      thinkingMode: mode !== 'edgecases',
      signal,
    }

    let thinkingAccumulator = ''

    try {
      for await (const chunk of callModel(request)) {
        if (signal.aborted) return

        if (chunk.type === 'content') {
          if (!safePost(port, { type: 'CHAT_DELTA', requestId, delta: chunk.text })) {
            abortActiveStream(session)
            return
          }
        } else {
          thinkingAccumulator += chunk.text
        }
      }

      if (!signal.aborted) {
        safePost(port, {
          type: 'CHAT_DONE',
          requestId,
          thinkingContent: thinkingAccumulator || undefined,
        })
      }
    } catch (err) {
      if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) return

      const message = err instanceof Error ? err.message : String(err)
      safePost(port, { type: 'CHAT_ERROR', requestId, error: message })
    } finally {
      if (session.activeAbortController?.signal === signal) {
        session.activeAbortController = null
      }
    }
  })

  port.onDisconnect.addListener(() => {
    const session = findSessionForPort(port)
    if (session) {
      session.panelPort = null
      abortActiveStream(session)
    }
    console.log('[LCCoach BG] Side panel disconnected')
  })
})

export const __testing = {
  resetSessions(): void {
    for (const session of sessions.values()) {
      abortActiveStream(session)
    }
    sessions.clear()
  },
  getSessionSnapshot(tabId: number) {
    const session = sessions.get(tabId)
    if (!session) return null
    return {
      tabId: session.tabId,
      latestProblem: session.latestProblem,
      hasPanelPort: Boolean(session.panelPort),
      hasActiveStream: Boolean(session.activeAbortController),
      hintTier: session.hintTier,
      solutionUnlocked: session.solutionUnlocked,
    }
  },
}
