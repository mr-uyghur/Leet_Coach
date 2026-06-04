// Zustand store: single source of truth for the sidebar's runtime state.
//
// Ownership model:
//   - useProblem.ts calls setProblem / resetConversation
//   - useChat.ts calls addUserMessage, appendDelta, appendThinking, finalizeMessage, setError
//   - Components read state + call setHintTier, setMode, unlockSolution

import { create } from 'zustand'
import type { Message, HintTier, Mode } from '../../shared/types'
import type { SavedConversationState } from '../../background/storage'
import type { ProblemUpdatedMessage } from '../../shared/messages'

interface ChatState {
  // Conversation
  messages: Message[]
  /** Accumulates CHAT_DELTA text for the in-flight assistant turn. */
  inFlightContent: string
  /** Accumulates thinking chunks for the in-flight assistant turn. */
  inFlightThinking: string
  isStreaming: boolean
  streamError: string | null
  isConversationHydrating: boolean

  // Problem context
  currentProblem: ProblemUpdatedMessage['payload'] | null

  // Coaching controls
  hintTier: HintTier
  mode: Mode
  solutionUnlocked: boolean

  // Actions
  addUserMessage: (content: string) => void
  appendDelta: (delta: string) => void
  appendThinking: (text: string) => void
  /**
   * Moves inFlightContent into messages[] as a finalized assistant Message.
   * Called on CHAT_DONE. Passes thinkingContent from the DONE message if present.
   */
  finalizeMessage: (thinkingContent?: string) => void
  setError: (err: string) => void
  setProblem: (payload: ProblemUpdatedMessage['payload']) => void
  hydrateConversation: (state: SavedConversationState) => void
  finishConversationHydration: () => void
  /** Called when the problem slug changes; clears conversation and resets coaching state. */
  resetConversation: () => void
  setHintTier: (tier: HintTier) => void
  setMode: (mode: Mode) => void
  unlockSolution: () => void
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  messages: [],
  inFlightContent: '',
  inFlightThinking: '',
  isStreaming: false,
  streamError: null,
  isConversationHydrating: false,
  currentProblem: null,
  hintTier: 0,
  mode: 'socratic',
  solutionUnlocked: false,

  // Actions

  addUserMessage: (content) => {
    const msg: Message = {
      id: makeId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    set((s) => ({
      messages: [...s.messages, msg],
      inFlightContent: '',
      inFlightThinking: '',
      isStreaming: true,
      streamError: null,
    }))
  },

  appendDelta: (delta) => {
    set((s) => ({ inFlightContent: s.inFlightContent + delta }))
  },

  appendThinking: (text) => {
    set((s) => ({ inFlightThinking: s.inFlightThinking + text }))
  },

  finalizeMessage: (thinkingContent) => {
    const { inFlightContent, inFlightThinking } = get()
    const finalThinking = thinkingContent ?? inFlightThinking

    if (!inFlightContent.trim()) {
      // Nothing to finalize (edge case: empty response)
      set({ isStreaming: false, inFlightContent: '', inFlightThinking: '' })
      return
    }

    const msg: Message = {
      id: makeId(),
      role: 'assistant',
      content: inFlightContent,
      thinkingContent: finalThinking || undefined,
      timestamp: Date.now(),
    }

    set((s) => ({
      messages: [...s.messages, msg],
      inFlightContent: '',
      inFlightThinking: '',
      isStreaming: false,
      streamError: null,
    }))
  },

  setError: (err) => {
    set({ isStreaming: false, streamError: err, inFlightContent: '', inFlightThinking: '' })
  },

  setProblem: (payload) => {
    const prev = get().currentProblem
    const slugChanged = prev?.slug !== payload.slug

    set((s) => ({
      currentProblem: payload,
      // Reset conversation on slug change so each problem starts fresh
      ...(slugChanged ? {
        messages: [],
        inFlightContent: '',
        inFlightThinking: '',
        isStreaming: false,
        streamError: null,
        isConversationHydrating: true,
        hintTier: 0,
        mode: s.mode,        // preserve mode across problems
        solutionUnlocked: false,
      } : {}),
    }))
  },

  hydrateConversation: ({ messages, hintTier, solutionUnlocked }) => {
    set({
      messages,
      hintTier,
      solutionUnlocked,
      inFlightContent: '',
      inFlightThinking: '',
      isStreaming: false,
      streamError: null,
      isConversationHydrating: false,
    })
  },

  finishConversationHydration: () => {
    set({ isConversationHydrating: false })
  },

  resetConversation: () => {
    set({
      messages: [],
      inFlightContent: '',
      inFlightThinking: '',
      isStreaming: false,
      streamError: null,
      isConversationHydrating: false,
      hintTier: 0,
      solutionUnlocked: false,
    })
  },

  setHintTier: (tier) => {
    set({ hintTier: tier })
  },

  setMode: (mode) => {
    set({ mode })
  },

  unlockSolution: () => {
    set({ solutionUnlocked: true })
  },
}))
