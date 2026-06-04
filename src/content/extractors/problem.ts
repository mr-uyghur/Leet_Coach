// Extracts problem title, statement, constraints, and difficulty from the LeetCode DOM.
// Uses layered fallbacks and logs which extraction path succeeded — important for debugging
// since selectors.ts is the most fragile surface in the project.

import { SELECTORS } from './selectors'

export interface ProblemData {
  slug: string
  title: string
  statement: string
  constraints: string
  difficulty: string
}

function getSlug(): string {
  // URL slug is the most reliable identifier — always present in the pathname.
  const match = window.location.pathname.match(/\/problems\/([^/]+)/)
  return match?.[1] ?? ''
}

function getTitle(): string {
  const el = document.querySelector(SELECTORS.problemTitle)
  if (el?.textContent?.trim()) {
    console.log('[LCCoach] title: data-cy selector')
    return el.textContent.trim()
  }

  // document.title is "Problem Name - LeetCode" on problem pages — very reliable.
  const titleParts = document.title.split(' - ')
  if (titleParts.length >= 2 && titleParts[titleParts.length - 1].toLowerCase().includes('leetcode')) {
    console.log('[LCCoach] title: document.title parse')
    return titleParts.slice(0, -1).join(' - ').trim()
  }

  const h1 = document.querySelector(SELECTORS.problemTitleFallback)
  if (h1?.textContent?.trim()) {
    console.log('[LCCoach] title: h1 fallback')
    return h1.textContent.trim()
  }

  console.warn('[LCCoach] title: all paths failed')
  return ''
}

function getStatement(): string {
  const el = document.querySelector(SELECTORS.problemStatement)
  if (el?.textContent?.trim()) {
    console.log('[LCCoach] statement: data-track-load selector')
    return el.textContent.trim()
  }
  console.warn('[LCCoach] statement: selector not found — page may not be fully loaded')
  return ''
}

function getConstraints(): string {
  const container = document.querySelector(SELECTORS.problemStatement)
  if (!container) return ''

  // Look for a heading element whose text starts with "Constraints" and grab the next <ul>.
  const inlineElements = container.querySelectorAll('p, strong, b, li')
  for (const el of inlineElements) {
    if (el.textContent?.trim().toLowerCase().startsWith('constraints')) {
      let next: Element | null = el.nextElementSibling
      // The list may be a sibling of the parent paragraph, not the strong/b itself.
      if (!next) next = el.parentElement?.nextElementSibling ?? null
      if (next?.tagName === 'UL') {
        console.log('[LCCoach] constraints: heading+list search')
        return next.textContent?.trim() ?? ''
      }
    }
  }

  // Fallback: last <ul> in the description (usually constraints in LeetCode's layout).
  const uls = container.querySelectorAll('ul')
  if (uls.length > 0) {
    console.log('[LCCoach] constraints: last-ul fallback')
    return uls[uls.length - 1].textContent?.trim() ?? ''
  }

  console.warn('[LCCoach] constraints: not found')
  return ''
}

function getDifficulty(): string {
  // No stable selector exists for the difficulty badge — LeetCode uses computed classes.
  // Scan for elements whose text content is exactly "Easy", "Medium", or "Hard".
  const known = new Set(['Easy', 'Medium', 'Hard'])
  const candidates = document.querySelectorAll('span, div, a')
  for (const el of candidates) {
    const text = el.textContent?.trim()
    if (text && known.has(text)) {
      console.log(`[LCCoach] difficulty: text scan found "${text}"`)
      return text
    }
  }
  console.warn('[LCCoach] difficulty: text scan found nothing')
  return ''
}

export function extractProblem(): ProblemData {
  return {
    slug: getSlug(),
    title: getTitle(),
    statement: getStatement(),
    constraints: getConstraints(),
    difficulty: getDifficulty(),
  }
}
