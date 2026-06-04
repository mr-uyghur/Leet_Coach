// Injects page-script.js into the page's main world so it can access window.monaco.
// Uses <script> tag injection because chrome.scripting is not available to content scripts.
// page-script.js is declared in web_accessible_resources in manifest.json, so
// chrome.runtime.getURL resolves it as a URL accessible to leetcode.com pages.

let injected = false

export function injectPageScript(): void {
  if (injected) return
  injected = true

  try {
    const script = document.createElement('script')

    script.addEventListener('load', () => script.remove())
    script.addEventListener('error', () => {
      console.error('[LCCoach] Failed to inject page-script.js; Monaco API extraction unavailable')
      injected = false
    })

    script.src = chrome.runtime.getURL('page-script.js')
    script.type = 'text/javascript'
    ;(document.head || document.documentElement).appendChild(script)
  } catch (err) {
    console.warn(
      '[LCCoach] Failed to inject page-script.js; refresh the LeetCode tab after reloading the extension.',
      err
    )
    injected = false
  }
}
