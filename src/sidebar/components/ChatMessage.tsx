// Renders a single chat message (user or assistant).
// User: right-aligned amber bubble.
// Assistant: left-aligned glass card with react-markdown rendering.
// If thinkingContent present: collapsible "💭 Show reasoning" disclosure.
//
// react-markdown v10: uses named export 'Markdown'. The 'code' component no longer
// receives an 'inline' prop — block vs inline is determined by whether the parent is <pre>.

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../../shared/types'
import type { ExtraProps } from 'react-markdown'

interface ChatMessageProps {
  message: Message
}

// Markdown component map — reused for both finalized and in-flight messages
export const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // code: block (inside <pre>) vs inline
  code(props) {
    const { className, children, node, ...rest } = props as React.HTMLAttributes<HTMLElement> & ExtraProps
    const isBlock = node?.position !== undefined && node?.type === 'element' &&
      // Parent detection: react-markdown wraps block code in <pre><code>
      // The className will be 'language-xxx' for fenced blocks
      (className?.startsWith('language-') ?? false)

    if (isBlock || className?.startsWith('language-')) {
      return (
        <pre className="bg-[#0d0d0d] rounded-lg p-3 overflow-x-auto my-2 border border-white/10">
          <code className={`${className ?? ''} text-xs font-mono text-gray-200 leading-relaxed`} {...rest}>
            {children}
          </code>
        </pre>
      )
    }
    // Inline code
    return (
      <code className="bg-white/10 rounded px-1 py-0.5 text-xs font-mono text-[#FFA116]" {...rest}>
        {children}
      </code>
    )
  },
  pre({ children }) {
    // Already wrapped by our code component — pass through
    return <>{children}</>
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>
  },
  ul({ children }) {
    return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
  },
  ol({ children }) {
    return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
  },
  strong({ children }) {
    return <strong className="text-[#FFA116] font-semibold">{children}</strong>
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-[#FFA116]/40 pl-3 italic text-gray-400 my-2">
        {children}
      </blockquote>
    )
  },
  h1({ children }) { return <h1 className="text-base font-semibold text-gray-100 mt-3 mb-1">{children}</h1> },
  h2({ children }) { return <h2 className="text-sm font-semibold text-gray-100 mt-3 mb-1">{children}</h2> },
  h3({ children }) { return <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h3> },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="w-full text-xs border-collapse">{children}</table>
      </div>
    )
  },
  th({ children }) {
    return <th className="px-2 py-1 border border-white/10 bg-white/5 font-semibold text-[#FFA116] text-left">{children}</th>
  },
  td({ children }) {
    return <td className="px-2 py-1 border border-white/10 text-gray-300">{children}</td>
  },
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [showThinking, setShowThinking] = useState(false)
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm
                     bg-[#FFA116]/15 border border-[#FFA116]/20
                     text-sm text-gray-100 leading-relaxed whitespace-pre-wrap break-words"
        >
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] flex flex-col gap-1.5">
        {/* Main content bubble */}
        <div
          className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm
                     bg-white/5 border border-white/10
                     text-sm text-gray-100 leading-relaxed"
        >
          <div className="prose-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Thinking disclosure */}
        {message.thinkingContent && (
          <div className="ml-1">
            <button
              onClick={() => setShowThinking((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-400 transition-colors duration-200"
              aria-expanded={showThinking}
            >
              <span>💭</span>
              <span>{showThinking ? 'Hide reasoning' : 'Show reasoning'}</span>
              <span className={`transition-transform duration-200 ${showThinking ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>

            {showThinking && (
              <div className="mt-1.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[11px] text-gray-500 font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto">
                {message.thinkingContent}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
