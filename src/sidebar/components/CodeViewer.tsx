// Collapsible strip showing the current extracted code snapshot.
// Default: collapsed (toggle shows line count).
// Expanded: read-only monospace pre block.
// If no code available, shows a placeholder.

import { useState } from 'react'
import { useChatStore } from '../stores/chatStore'

export default function CodeViewer() {
  const currentProblem = useChatStore((s) => s.currentProblem)
  const [expanded, setExpanded] = useState(false)

  const code = currentProblem?.code ?? ''
  const isPartial = currentProblem?.codeSource === 'dom-fallback' || currentProblem?.codeComplete === false
  const lineCount = code ? code.split('\n').length : 0

  return (
    <div className="border-t border-white/10">
      <button
        id="code-viewer-toggle"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors duration-200"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1.5">
          <span className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="font-mono">
            {code ? `Current Code (${lineCount} lines)` : 'No code captured yet'}
          </span>
          {code && isPartial && (
            <span className="text-[10px] text-amber-400/80 font-medium">
              partial
            </span>
          )}
        </span>
        {code && (
          <span className="text-[10px] text-gray-600 font-mono">
            {expanded ? 'collapse' : 'expand'}
          </span>
        )}
      </button>

      {expanded && code && (
        <div className="mx-2 mb-2 rounded-lg overflow-hidden border border-white/10">
          <pre
            id="code-viewer-content"
            className="text-xs font-mono bg-[#0d0d0d] text-gray-300 p-3 overflow-x-auto overflow-y-auto max-h-28 leading-relaxed"
          >
            {code}
          </pre>
        </div>
      )}

      {expanded && !code && (
        <p className="px-3 pb-2 text-xs text-gray-600 italic">
          Navigate to a LeetCode problem to capture code.
        </p>
      )}
    </div>
  )
}
