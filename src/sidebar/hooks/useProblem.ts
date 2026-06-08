// Listens for PROBLEM_UPDATED on the shared background port and hydrates the
// per-problem conversation from chrome.storage.local.

import { useEffect } from 'react'
import type { ProblemUpdatedMessage } from '../../shared/messages'
import { loadConversation } from '../../background/storage'
import { useChatStore } from '../stores/chatStore'
import type { BackgroundPortHandle } from './useBackgroundPort'

export function useProblem(backgroundPort: BackgroundPortHandle): void {
  const { portRef, portVersion } = backgroundPort
  const setProblem = useChatStore((s) => s.setProblem)
  const hydrateConversation = useChatStore((s) => s.hydrateConversation)
  const finishConversationHydration = useChatStore((s) => s.finishConversationHydration)

  useEffect(() => {
    const port = portRef.current
    if (!port) return

    function onMessage(msg: { type?: string; payload?: unknown }) {
      if (msg.type !== 'PROBLEM_UPDATED') return

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

    port.onMessage.addListener(onMessage)
    return () => {
      port.onMessage.removeListener(onMessage)
    }
  }, [portRef, portVersion, setProblem, hydrateConversation, finishConversationHydration])
}
