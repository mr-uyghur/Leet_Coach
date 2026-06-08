// Typed discriminated union for all chrome.runtime messages.
import type { HintTier, Message, Settings, ProblemContext } from './types'

// Shared constant — used by both background and sidebar to avoid silent string mismatch.
export const PANEL_PORT_NAME = 'panel' as const

export interface ProblemUpdatedMessage {
  type: 'PROBLEM_UPDATED'
  payload: ProblemContext
}

export interface ChatRequestMessage {
  type: 'CHAT_REQUEST'
  payload: {
    /** Unique id for this request. Background echoes it in CHAT_DELTA/DONE/ERROR so
     *  the panel can discard chunks from aborted (stale) requests. */
    requestId: string
    messages: Message[]
    settings: Settings
    mode: 'socratic' | 'review' | 'edgecases'
  }
}

export interface HintTierUpdatedMessage {
  type: 'HINT_TIER_UPDATED'
  hintTier: HintTier
}

/**
 * Sent only after the side-panel confirmation dialog is accepted.
 * The background still validates that the trusted session is at tier 3 before
 * entering solution mode.
 */
export interface UnlockSolutionMessage {
  type: 'UNLOCK_SOLUTION'
}

export interface ChatDeltaMessage {
  type: 'CHAT_DELTA'
  /** Echoed from the originating CHAT_REQUEST. Panel ignores chunks with wrong id. */
  requestId: string
  delta: string
}

export interface ChatDoneMessage {
  type: 'CHAT_DONE'
  /** Echoed from the originating CHAT_REQUEST. Panel ignores chunks with wrong id. */
  requestId: string
  thinkingContent?: string
}

export interface ChatErrorMessage {
  type: 'CHAT_ERROR'
  /** Echoed from the originating CHAT_REQUEST. Panel ignores chunks with wrong id. */
  requestId: string
  error: string
}

export interface RequestExtractMessage {
  type: 'REQUEST_EXTRACT'
}

/**
 * Sent by the sidebar when the user starts a new chat, to abort any in-flight
 * LLM stream in the background service worker before resetting local state.
 * Unlike a new CHAT_REQUEST (which implicitly aborts the previous stream), New Chat
 * sends no request, so an explicit abort signal is required.
 */
export interface AbortStreamMessage {
  type: 'ABORT_STREAM'
}

export type ExtensionMessage =
  | ProblemUpdatedMessage
  | RequestExtractMessage
  | ChatRequestMessage
  | HintTierUpdatedMessage
  | UnlockSolutionMessage
  | ChatDeltaMessage
  | ChatDoneMessage
  | ChatErrorMessage
  | AbortStreamMessage
