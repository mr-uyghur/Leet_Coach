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
import { PROVIDERS } from '../shared/constants'

// In-memory cache — lost when the service worker is killed after ~30s idle.
// The on-connect re-request pattern (below) compensates for this.
let latestProblem: ProblemUpdatedMessage['payload'] | null = null
let panelPort: chrome.runtime.Port | null = null

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

    // TODO Phase 5: replace this placeholder with full prompt selection from
    // src/shared/prompts/ based on chatMsg.payload.mode and chatMsg.payload.hintTier.
    const systemPrompt =
      'You are a helpful coding assistant. Answer the user\'s question clearly and concisely.'

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
      thinkingMode: chatMsg.payload.mode !== 'edgecases',
    }

    let thinkingAccumulator = ''

    try {
      for await (const chunk of callModel(request)) {
        if (chunk.type === 'content') {
          port.postMessage({ type: 'CHAT_DELTA', delta: chunk.text })
        } else {
          // Accumulate thinking content to send with CHAT_DONE
          thinkingAccumulator += chunk.text
        }
      }

      port.postMessage({
        type: 'CHAT_DONE',
        thinkingContent: thinkingAccumulator || undefined,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      port.postMessage({ type: 'CHAT_ERROR', error: message })
    }
  })

  port.onDisconnect.addListener(() => {
    if (panelPort === port) panelPort = null
    console.log('[LCCoach BG] Side panel disconnected')
  })
})

// ---------------------------------------------------------------------------
// TEMPORARY Phase 3 verification handler — REMOVE before marking phase complete
// ---------------------------------------------------------------------------
// Listens for a 'TEST_PROVIDERS' message sent from the service-worker DevTools console:
//
//   chrome.runtime.sendMessage({ type: 'TEST_PROVIDERS', anthropicKey: 'sk-ant-...' })
//
// Streams a hardcoded prompt through all three providers and logs tokens.
// This handler will be deleted after the Phase 3 checkpoint is verified.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'TEST_PROVIDERS') return

  const anthropicKey: string = msg.anthropicKey ?? ''

  async function runTest(label: string, request: ModelRequest) {
    console.log(`\n[LCCoach TEST] ▶ Starting ${label}`)
    let content = ''
    let thinking = ''
    try {
      for await (const chunk of callModel(request)) {
        if (chunk.type === 'content') {
          content += chunk.text
        } else {
          thinking += chunk.text
        }
      }
      console.log(`[LCCoach TEST] ✅ ${label} content:\n`, content)
      if (thinking) console.log(`[LCCoach TEST] 💭 ${label} thinking:\n`, thinking)
    } catch (err) {
      console.error(`[LCCoach TEST] ❌ ${label} failed:`, err)
    }
  }

  const testPrompt = 'What is the two-sum problem? Answer in one sentence.'
  const testMessages = [{ role: 'user' as const, content: testPrompt }]

  ;(async () => {
    // Test Anthropic
    if (anthropicKey) {
      await runTest('Anthropic claude-sonnet-4-6', {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: anthropicKey,
        messages: testMessages,
        systemPrompt: 'You are a helpful assistant.',
        stream: true,
        thinkingMode: true,
      })
    } else {
      console.warn('[LCCoach TEST] Skipping Anthropic — no anthropicKey provided')
    }

    // Test Ollama (must have qwen3:14b pulled)
    await runTest('Ollama qwen3:14b', {
      provider: 'ollama',
      model: 'qwen3:14b',
      messages: testMessages,
      systemPrompt: 'You are a helpful assistant.',
      stream: true,
      thinkingMode: true,
    })

    // Test LM Studio (must be running with qwen3:14b loaded)
    await runTest('LM Studio qwen3:14b', {
      provider: 'lmstudio',
      model: PROVIDERS.lmstudio.defaultModel,
      messages: testMessages,
      systemPrompt: 'You are a helpful assistant.',
      stream: true,
      thinkingMode: true,
    })

    console.log('\n[LCCoach TEST] All tests complete.')
  })()

  sendResponse({ started: true })
  return true
})
