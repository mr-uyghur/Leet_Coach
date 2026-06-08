// LeetCode Coach — Sidebar App
// Full Phase 4 implementation.
//
// Layout:
//   ┌──────────────────────────────────────────┐
//   │ Header: title + difficulty badge     [⚙] │
//   ├──────────────────────────────────────────┤
//   │ ModeSelector tabs                         │
//   ├──────────────────────────────────────────┤
//   │                                           │
//   │ ChatPanel (flex-1, scrollable)            │
//   │                                           │
//   ├──────────────────────────────────────────┤
//   │ CodeViewer (collapsible strip)            │
//   ├──────────────────────────────────────────┤
//   │ HintControls          │ SolutionGate      │
//   └───────────────────────┴───────────────────┘
//
// useProblem owns the port (returned as a ref).
// useChat receives the portRef and settings to send CHAT_REQUEST + listen for deltas.

import { useEffect, useState } from 'react'
import { useProblem } from './hooks/useProblem'
import { useChat } from './hooks/useChat'
import { useSettings } from './hooks/useSettings'
import { useChatStore } from './stores/chatStore'
import { saveConversation } from '../background/storage'
import ModeSelector from './components/ModeSelector'
import ChatPanel from './components/ChatPanel'
import HintControls from './components/HintControls'
import SolutionGate from './components/SolutionGate'
import CodeViewer from './components/CodeViewer'
import SettingsPanel from './components/SettingsPanel'

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy:   'text-green-400 bg-green-400/10 border-green-400/20',
  Medium: 'text-[#FFA116] bg-[#FFA116]/10 border-[#FFA116]/20',
  Hard:   'text-red-400 bg-red-400/10 border-red-400/20',
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Settings (provider, model, apiKey) — persisted to chrome.storage.local
  const { settings, updateSettings, isLoaded } = useSettings()

  // Port ownership + PROBLEM_UPDATED listener
  const portRef = useProblem()

  // CHAT_REQUEST sender + delta wiring
  const { sendMessage, sendSolutionRequest, startNewChat } = useChat({ portRef, settings })

  const [newChatConfirming, setNewChatConfirming] = useState(false)

  // Read problem context from the store (set by useProblem)
  const currentProblem = useChatStore((s) => s.currentProblem)
  const messages = useChatStore((s) => s.messages)
  const hintTier = useChatStore((s) => s.hintTier)
  const solutionUnlocked = useChatStore((s) => s.solutionUnlocked)
  const isConversationHydrating = useChatStore((s) => s.isConversationHydrating)

  useEffect(() => {
    const slug = currentProblem?.slug
    if (!slug || isConversationHydrating) return

    saveConversation(slug, { messages, hintTier, solutionUnlocked }).catch((err) => {
      console.error('[LCCoach Panel] Failed to save conversation:', err)
    })
  }, [currentProblem?.slug, messages, hintTier, solutionUnlocked, isConversationHydrating])

  if (!isLoaded) {
    // Avoid flash before settings are hydrated from storage
    return (
      <div className="flex h-screen items-center justify-center bg-[#1a1a1a]">
        <div className="w-6 h-6 rounded-full border-2 border-[#FFA116]/30 border-t-[#FFA116] animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] text-white overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-white/10 bg-[#1a1a1a]/80 backdrop-blur-sm">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[#FFA116] font-bold text-sm tracking-tight">LC</span>
            <span className="text-white/80 font-semibold text-sm tracking-tight">Coach</span>
          </div>
          {currentProblem ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="text-xs text-gray-300 font-medium truncate max-w-[160px]"
                title={currentProblem.title}
              >
                {currentProblem.title}
              </span>
              {currentProblem.difficulty && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${
                    DIFFICULTY_COLORS[currentProblem.difficulty] ?? 'text-gray-400 bg-white/5 border-white/10'
                  }`}
                >
                  {currentProblem.difficulty}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-600 mt-0.5">Navigate to a problem</span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* New Chat — only shown when a problem is loaded and there are messages */}
          {currentProblem && messages.length > 0 && (
            <button
              id="new-chat-btn"
              onClick={() => setNewChatConfirming(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-all duration-200"
              aria-label="Start a new chat"
              title="New chat"
            >
              {/* Compose / new-document icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
          )}

          <button
            id="settings-gear-btn"
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-all duration-200"
            aria-label="Open settings"
            title="Settings"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── New Chat confirmation banner ──────────────────────────────────── */}
      {newChatConfirming && (
        <div className="flex-shrink-0 mx-3 mt-2 flex flex-col gap-2 p-3 bg-white/5 border border-white/15 rounded-xl">
          <p className="text-xs text-gray-300 leading-snug">
            Start a new chat? This will clear all messages and reset hints for this problem.
          </p>
          <div className="flex gap-2">
            <button
              id="new-chat-cancel"
              onClick={() => setNewChatConfirming(false)}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              id="new-chat-confirm"
              onClick={() => { startNewChat(); setNewChatConfirming(false) }}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FFA116]/15 border border-[#FFA116]/30 text-[#FFA116] hover:bg-[#FFA116]/25 hover:border-[#FFA116]/50 transition-all duration-200"
            >
              New Chat
            </button>
          </div>
        </div>
      )}

      {/* ── Mode Selector ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-white/10">
        <ModeSelector />
      </div>

      {/* ── Chat Panel (main scrollable area) ─────────────────────────────── */}
      <ChatPanel onSend={sendMessage} />

      {/* ── Code Viewer ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0">
        <CodeViewer />
      </div>

      {/* ── Bottom Controls ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-white/10 bg-[#161616]">
        <HintControls />
        <div className="mt-2">
          <SolutionGate onUnlock={sendSolutionRequest} />
        </div>
      </div>

      {/* ── Settings Panel (overlay) ───────────────────────────────────────── */}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
