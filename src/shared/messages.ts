// Typed discriminated union for all chrome.runtime messages.
import type { Message, Settings, ProblemContext } from './types'

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
    problemContext: ProblemContext
    hintTier: 0 | 1 | 2 | 3
    mode: 'socratic' | 'review' | 'edgecases'
    solutionUnlocked: boolean
  }
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

export type ExtensionMessage =
  | ProblemUpdatedMessage
  | RequestExtractMessage
  | ChatRequestMessage
  | ChatDeltaMessage
  | ChatDoneMessage
  | ChatErrorMessage
