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
import type { Settings } from '../../shared/types'
import type {
  ChatRequestMessage,
  AbortStreamMessage,
  HintTierUpdatedMessage,
  UnlockSolutionMessage,
} from '../../shared/messages'
import { useChatStore } from '../stores/chatStore'
import type { BackgroundPortHandle } from './useBackgroundPort'

interface UseChatOptions {
  backgroundPort: BackgroundPortHandle
  settings: Settings
}

export function useChat({ backgroundPort, settings }: UseChatOptions) {
  const { portRef, portVersion, status, sendToBackground } = backgroundPort
  // Use granular selectors to avoid subscribing to the full store on every delta.
  const messages        = useChatStore((s) => s.messages)
  const hintTier        = useChatStore((s) => s.hintTier)
  const mode            = useChatStore((s) => s.mode)
  const solutionUnlocked = useChatStore((s) => s.solutionUnlocked)
  const addUserMessage   = useChatStore((s) => s.addUserMessage)
  const appendDelta      = useChatStore((s) => s.appendDelta)
  const appendThinking   = useChatStore((s) => s.appendThinking)
  const finalizeMessage  = useChatStore((s) => s.finalizeMessage)
  const setError         = useChatStore((s) => s.setError)
  const resetConversation = useChatStore((s) => s.resetConversation)
  const isStreaming      = useChatStore((s) => s.isStreaming)

  // Stable refs for the action callbacks; these do not need to be in effect deps.
  const appendDeltaRef     = useRef(appendDelta)
  const appendThinkingRef  = useRef(appendThinking)
  const finalizeMessageRef = useRef(finalizeMessage)
  const setErrorRef        = useRef(setError)
  /** Tracks the requestId of the in-flight request. Chunks with a different id are stale and discarded. */
  const currentRequestIdRef = useRef<string | null>(null)
  const lastSyncedHintTierRef = useRef<number | null>(null)
  const lastSyncedSolutionUnlockedRef = useRef<boolean>(false)
  const lastPolicyPortVersionRef = useRef<number | null>(null)

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
  }, [portRef, portVersion])

  useEffect(() => {
    if (status !== 'disconnected') return
    if (!isStreaming && !currentRequestIdRef.current) return

    currentRequestIdRef.current = null
    setErrorRef.current('Connection interrupted. Send again to retry.')
  }, [status, isStreaming])

  // Sync policy state over explicit protocol messages. The background owns the
  // trusted copy and uses it for prompt selection; CHAT_REQUEST does not carry
  // solutionUnlocked or problem context.
  useEffect(() => {
    if (!portRef.current) return

    if (lastPolicyPortVersionRef.current !== portVersion) {
      lastPolicyPortVersionRef.current = portVersion
      lastSyncedHintTierRef.current = null
      lastSyncedSolutionUnlockedRef.current = false
    }

    if (lastSyncedHintTierRef.current !== hintTier) {
      const msg: HintTierUpdatedMessage = { type: 'HINT_TIER_UPDATED', hintTier }
      if (!sendToBackground(msg)) return
      lastSyncedHintTierRef.current = hintTier
    }

    if (solutionUnlocked && !lastSyncedSolutionUnlockedRef.current) {
      const msg: UnlockSolutionMessage = { type: 'UNLOCK_SOLUTION' }
      if (!sendToBackground(msg)) return
      lastSyncedSolutionUnlockedRef.current = true
    }

    if (!solutionUnlocked) {
      lastSyncedSolutionUnlockedRef.current = false
    }
  }, [portRef, portVersion, hintTier, solutionUnlocked, sendToBackground])

  // Build and send the CHAT_REQUEST message.
  // `messages` state is captured correctly: useCallback recreates on messages change.
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return
      if (!portRef.current) {
        setErrorRef.current('Not connected to background service worker')
        return
      }

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
          mode,
        },
      }

      console.log('[LCCoach Panel] Sending CHAT_REQUEST via port:', settings.provider, settings.model)

      try {
        if (!sendToBackground(chatRequest)) {
          throw new Error('Failed to send message to background')
        }
      } catch (err) {
        currentRequestIdRef.current = null
        setErrorRef.current(err instanceof Error ? err.message : 'Failed to send message to background')
      }
    },
    // Note: messages, settings, mode, etc. are included so the callback
    // captures the latest state when called.
    [portRef, messages, settings, mode, addUserMessage, sendToBackground]
  )

  const sendSolutionRequest = useCallback(() => {
    if (portRef.current) {
      const msg: UnlockSolutionMessage = { type: 'UNLOCK_SOLUTION' }
      if (sendToBackground(msg)) {
        lastSyncedSolutionUnlockedRef.current = true
      }
    }
    sendMessage('Show me the full solution with explanation.')
  }, [portRef, sendMessage, sendToBackground])

  /**
   * Aborts any in-flight stream, clears the local requestId reference, and resets
   * the store to a clean slate (messages, hintTier, solutionUnlocked all zeroed).
   *
   * The existing App.tsx saveConversation effect will automatically persist the
   * cleared state to chrome.storage.local because it depends on the same store fields.
   */
  const startNewChat = useCallback(() => {
    if (portRef.current) {
      const abortMsg: AbortStreamMessage = { type: 'ABORT_STREAM' }
      sendToBackground(abortMsg)
    }
    // Drop any pending requestId so stale CHAT_DELTA chunks are discarded.
    currentRequestIdRef.current = null
    resetConversation()
  }, [portRef, resetConversation, sendToBackground])

  return { sendMessage, sendSolutionRequest, startNewChat }
}
