// Owns the long-lived chrome.runtime.Port to the background service worker.
// Listens for PROBLEM_UPDATED and updates the Zustand store.
// Also exposes the port so useChat can attach its CHAT_DELTA/DONE/ERROR listener.
//
// The port is opened once on mount and torn down on unmount.
// It is used bidirectionally: PROBLEM_UPDATED arrives inbound; CHAT_REQUEST goes outbound.

import { useEffect, useRef } from 'react'
import { PANEL_PORT_NAME } from '../../shared/messages'
import type { ProblemUpdatedMessage } from '../../shared/messages'
import { loadConversation } from '../../background/storage'
import { useChatStore } from '../stores/chatStore'

export function useProblem() {
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const setProblem = useChatStore((s) => s.setProblem)
  const hydrateConversation = useChatStore((s) => s.hydrateConversation)
  const finishConversationHydration = useChatStore((s) => s.finishConversationHydration)

  useEffect(() => {
    const port = chrome.runtime.connect({ name: PANEL_PORT_NAME })
    portRef.current = port

    port.onMessage.addListener((msg) => {
      if (msg.type === 'PROBLEM_UPDATED') {
        const payload = (msg as ProblemUpdatedMessage).payload
        const prevState = useChatStore.getState()
        const shouldLoadConversation =
          prevState.currentProblem?.slug !== payload.slug || prevState.messages.length === 0

        setProblem(payload)

        if (!shouldLoadConversation) return

        loadConversation(payload.slug)
          .then((savedState) => {
            const currentSlug = useChatStore.getState().currentProblem?.slug
            if (currentSlug !== payload.slug) return

            if (savedState) {
              hydrateConversation(savedState)
            } else {
              finishConversationHydration()
            }
          })
          .catch((err) => {
            console.error('[LCCoach Panel] Failed to load conversation:', err)
            const currentSlug = useChatStore.getState().currentProblem?.slug
            if (currentSlug === payload.slug) finishConversationHydration()
          })
      }
      // CHAT_DELTA / CHAT_DONE / CHAT_ERROR are handled by useChat's listener
      // attached to the same port. Both listeners coexist — Chrome fans all messages
      // to all registered onMessage listeners on the port.
    })

    port.onDisconnect.addListener(() => {
      portRef.current = null
    })

    return () => {
      port.disconnect()
      portRef.current = null
    }
  }, [setProblem, hydrateConversation, finishConversationHydration])

  return portRef
}
