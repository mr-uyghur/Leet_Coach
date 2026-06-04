// All LeetCode DOM selectors.
// ONLY use ARIA attributes, structural selectors, data-* attributes, and stable text anchors.
// Never reference hashed class names like css-xyz123 — they change on every deploy.
// This file is the most break-prone surface in the project. When a selector stops working,
// add a fallback here rather than hardcoding class names in callers.

export const SELECTORS = {
  // Problem title.
  // data-cy="question-title" was stable on older LeetCode builds; may be absent on newer ones.
  // Callers should fall back to parsing document.title ("Title - LeetCode") or URL slug.
  problemTitle: '[data-cy="question-title"]',

  // h1 fallback for title — less precise (could match other headings) but avoids hashed classes.
  problemTitleFallback: 'h1',

  // Problem statement container.
  // data-track-load is a tracking attribute LeetCode adds for analytics — more stable than hashed classes.
  problemStatement: '[data-track-load="description_content"]',

  // Constraints — last <ul> inside the statement container is a common layout heuristic.
  // Callers should also try searching for a "Constraints" heading followed by a list.
  constraints: '[data-track-load="description_content"] ul:last-of-type',

  // Editor container — .monaco-editor is Monaco's own class, not LeetCode's — stable.
  editorContainer: '.monaco-editor',

  // DOM fallback for code: visible code lines (LOSSY).
  // Monaco virtualizes long files; only visible rows are in the DOM.
  // Files longer than ~50 visible lines will return a partial snapshot.
  viewLine: '.view-line',
} as const
