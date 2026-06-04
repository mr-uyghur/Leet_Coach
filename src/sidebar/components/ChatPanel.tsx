// Scrollable message list + in-flight streaming bubble + input area.
//
// Auto-scrolls to bottom as new content arrives.
// Textarea grows to 5 rows max. Enter sends, Shift+Enter inserts newline.
// Send button is disabled while streaming or when input is empty.

import { useRef, useEffect, useState, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import ChatMessage, { markdownComponents } from './ChatMessage'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Mode } from '../../shared/types'

interface ChatPanelProps {
  onSend: (text: string) => void
}

const EMPTY_STATES: Record<Mode, {
  icon: string
  title: string
  subtitle: string
  quickActions?: { label: string; prompt: string }[]
}> = {
  socratic: {
    icon: '🧠',
    title: 'Ask me anything',
    subtitle: "I'll guide you with questions, not answers. Try explaining your current thinking.",
    quickActions: [
      { label: "Where do I start?", prompt: "I'm not sure where to start. Can you help me think through this problem?" },
      { label: "I'm stuck", prompt: "I'm stuck on this problem. Can you help me think through it?" },
    ],
  },
  review: {
    icon: '🔍',
    title: 'Ready to review your code',
    subtitle: "I'll find issues and ask you to fix them — no rewrites.",
    quickActions: [
      { label: "Review my code →", prompt: "Please review my current code for bugs and edge cases." },
    ],
  },
  edgecases: {
    icon: '⚡',
    title: 'Generate edge cases',
    subtitle: "I'll produce tricky test cases to stress-test your solution.",
    quickActions: [
      { label: "Generate edge cases →", prompt: "Generate edge cases for this problem." },
    ],
  },
}

export default function ChatPanel({ onSend }: ChatPanelProps) {
  const messages = useChatStore((s) => s.messages)
  const inFlightContent = useChatStore((s) => s.inFlightContent)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const streamError = useChatStore((s) => s.streamError)
  const mode = useChatStore((s) => s.mode)

  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom whenever messages or in-flight content changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, inFlightContent])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px` // 5 rows ≈ 120px
  }, [input])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    onSend(text)
    setInput('')
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, isStreaming, onSend])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmpty = messages.length === 0 && !isStreaming

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {isEmpty && (() => {
          const state = EMPTY_STATES[mode]
          return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-[#FFA116]/10 border border-[#FFA116]/20 flex items-center justify-center text-2xl">
                {state.icon}
              </div>
              <div>
                <p className="text-sm text-gray-400 font-medium">{state.title}</p>
                <p className="text-xs text-gray-600 mt-1 leading-snug">{state.subtitle}</p>
              </div>
              {state.quickActions && (
                <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
                  {state.quickActions.map(({ label, prompt }) => (
                    <button
                      key={label}
                      onClick={() => onSend(prompt)}
                      disabled={isStreaming}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium
                                 bg-white/5 border border-white/10 text-gray-400
                                 hover:bg-[#FFA116]/10 hover:border-[#FFA116]/25 hover:text-[#FFA116]
                                 disabled:opacity-30 disabled:cursor-not-allowed
                                 transition-all duration-200"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* In-flight streaming message */}
        {isStreaming && (
          <div className="flex justify-start">
            <div
              className="max-w-[95%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm
                         bg-white/5 border border-white/10
                         text-sm text-gray-100 leading-relaxed"
            >
              {inFlightContent ? (
                <div className="prose-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {inFlightContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <span className="flex items-center gap-1 text-gray-500">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse delay-75">●</span>
                  <span className="animate-pulse delay-150">●</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {streamError && (
          <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-400">
            ⚠ {streamError}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-3 pb-3 pt-2 border-t border-white/10">
        <div className="flex gap-2 items-end bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-[#FFA116]/30 transition-colors duration-200">
          <textarea
            ref={textareaRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Waiting for response…' : 'Ask a question… (Enter to send)'}
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 resize-none outline-none leading-relaxed disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            id="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                       bg-[#FFA116]/20 border border-[#FFA116]/30 text-[#FFA116]
                       hover:bg-[#FFA116]/30 hover:border-[#FFA116]/50
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-200"
            aria-label="Send message"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-gray-700 mt-1.5 text-center">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
