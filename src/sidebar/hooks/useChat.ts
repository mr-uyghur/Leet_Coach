// Sends CHAT_REQUEST over the shared port and wires CHAT_DELTA/DONE/ERROR back to the store.
//
// Accepts the portRef from useProblem (single port, used bidirectionally).
// Both useProblem and useChat attach onMessage listeners to the same port.
// Chrome fans all port messages to ALL registered listeners, so this is safe.
//
// NOTE: StrictMode is intentionally disabled in main.tsx. Chrome ports are real
// persistent objects; StrictMode's double-mount would kill the port before this
// listener is attached.

import { useEffect, useCallback, useRef } from 'react'
import type { RefObject } from 'react'
import type { Settings } from '../../shared/types'
import type {
  ChatRequestMessage,
  ChatDeltaMessage,
  ChatDoneMessage,
  ChatErrorMessage,
  AbortStreamMessage,
} from '../../shared/messages'
import { useChatStore } from '../stores/chatStore'

interface UseChatOptions {
  portRef: RefObject<chrome.runtime.Port | null>
  settings: Settings
}

export function useChat({ portRef, settings }: UseChatOptions) {
  // Use granular selectors to avoid subscribing to the full store on every delta.
  const messages        = useChatStore((s) => s.messages)
  const currentProblem  = useChatStore((s) => s.currentProblem)
  const hintTier        = useChatStore((s) => s.hintTier)
  const mode            = useChatStore((s) => s.mode)
  const solutionUnlocked = useChatStore((s) => s.solutionUnlocked)
  const addUserMessage   = useChatStore((s) => s.addUserMessage)
  const appendDelta      = useChatStore((s) => s.appendDelta)
  const appendThinking   = useChatStore((s) => s.appendThinking)
  const finalizeMessage  = useChatStore((s) => s.finalizeMessage)
  const setError         = useChatStore((s) => s.setError)
  const resetConversation = useChatStore((s) => s.resetConversation)

  // Stable refs for the action callbacks; these do not need to be in effect deps.
  const appendDeltaRef     = useRef(appendDelta)
  const appendThinkingRef  = useRef(appendThinking)
  const finalizeMessageRef = useRef(finalizeMessage)
  const setErrorRef        = useRef(setError)
  /** Tracks the requestId of the in-flight request. Chunks with a different id are stale and discarded. */
  const currentRequestIdRef = useRef<string | null>(null)

  // Keep the action refs current (Zustand actions are stable, but belt-and-suspenders).
  appendDeltaRef.current     = appendDelta
  appendThinkingRef.current  = appendThinking
  finalizeMessageRef.current = finalizeMessage
  setErrorRef.current        = setError

  // Wire CHAT_DELTA / CHAT_DONE / CHAT_ERROR to store actions.
  // Using refs for callbacks ensures the listener is attached exactly once (on mount)
  // without needing to remove/re-add it on every render.
  useEffect(() => {
    // portRef.current is set by useProblem's useEffect, which runs before this one
    // (hooks execute effects in the order they were called in the parent component).
    const port = portRef.current
    if (!port) {
      console.warn('[LCCoach Panel] useChat: port not available on mount; CHAT_DELTA listener not attached')
      return
    }

    console.log('[LCCoach Panel] useChat: attaching CHAT_DELTA listener')

    function onMessage(msg: {
      type: string
      requestId?: string
      delta?: string
      thinkingContent?: string
      error?: string
    }) {
      switch (msg.type) {
        case 'CHAT_DELTA':
          // Ignore chunks from a previous (aborted) request — they are stale
          if (msg.requestId !== currentRequestIdRef.current) return
          if (msg.delta) appendDeltaRef.current(msg.delta)
          break
        case 'CHAT_DONE':
          if (msg.requestId !== currentRequestIdRef.current) return
          currentRequestIdRef.current = null
          finalizeMessageRef.current(msg.thinkingContent)
          break
        case 'CHAT_ERROR':
          if (msg.requestId !== currentRequestIdRef.current) return
          console.error('[LCCoach Panel] CHAT_ERROR from background:', msg.error)
          currentRequestIdRef.current = null
          setErrorRef.current(msg.error ?? 'Unknown error from background')
          break
        // PROBLEM_UPDATED is handled by useProblem; silently ignored here.
      }
    }

    port.onMessage.addListener(onMessage)
    return () => {
      port.onMessage.removeListener(onMessage)
    }
    // portRef identity is stable (useRef object never changes).
    // We deliberately do not include action callbacks; we use refs for them.
  }, [portRef])

  // Build and send the CHAT_REQUEST message.
  // `messages` state is captured correctly: useCallback recreates on messages change.
  const sendMessage = useCallback(
    (text: string) => {
      const port = portRef.current
      if (!port || !text.trim()) return

      // Generate a unique id so stale CHAT_DELTA/DONE/ERROR from an aborted request can be discarded.
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      currentRequestIdRef.current = requestId

      // Optimistically add user message to the store so it appears immediately
      addUserMessage(text.trim())

      // Construct the request with the snapshot of messages *before* addUserMessage
      // + the new user turn appended. The background uses this full history.
      const chatRequest: ChatRequestMessage = {
        type: 'CHAT_REQUEST',
        payload: {
          requestId,
          messages: [
            ...messages,
            { id: `pending-${Date.now()}`, role: 'user', content: text.trim(), timestamp: Date.now() },
          ],
          settings,
          problemContext: currentProblem ?? {
            slug: '',
            title: '',
            statement: '',
            constraints: '',
            difficulty: '',
            code: '',
          },
          hintTier,
          mode,
          solutionUnlocked,
        },
      }

      console.log('[LCCoach Panel] Sending CHAT_REQUEST via port:', settings.provider, settings.model)

      try {
        port.postMessage(chatRequest)
      } catch (err) {
        currentRequestIdRef.current = null
        setErrorRef.current(err instanceof Error ? err.message : 'Failed to send message to background')
      }
    },
    // Note: messages, settings, currentProblem, etc. are included so the callback
    // captures the latest state when called.
    [portRef, messages, settings, currentProblem, hintTier, mode, solutionUnlocked, addUserMessage]
  )

  const sendSolutionRequest = useCallback(() => {
    sendMessage('Show me the full solution with explanation.')
  }, [sendMessage])

  /**
   * Aborts any in-flight stream, clears the local requestId reference, and resets
   * the store to a clean slate (messages, hintTier, solutionUnlocked all zeroed).
   *
   * The existing App.tsx saveConversation effect will automatically persist the
   * cleared state to chrome.storage.local because it depends on the same store fields.
   */
  const startNewChat = useCallback(() => {
    const port = portRef.current
    if (port) {
      const abortMsg: AbortStreamMessage = { type: 'ABORT_STREAM' }
      try {
        port.postMessage(abortMsg)
      } catch {
        // Port may be transiently disconnected — the store reset below still proceeds.
      }
    }
    // Drop any pending requestId so stale CHAT_DELTA chunks are discarded.
    currentRequestIdRef.current = null
    resetConversation()
  }, [portRef, resetConversation])

  return { sendMessage, sendSolutionRequest, startNewChat }
}
