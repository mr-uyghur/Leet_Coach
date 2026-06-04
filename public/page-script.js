// Injected into the page's main world (not the content script world) to access window.monaco.
// Responds to LC_GET_CODE postMessage requests from the content script.
// TODO: Phase 2 — verify Monaco API path works on current LeetCode build
;(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window) return
    if (!event.data || event.data.type !== 'LC_GET_CODE') return

    try {
      const models = window.monaco && window.monaco.editor && window.monaco.editor.getModels()
      const code = models && models.length > 0 ? models[0].getValue() : null
      window.postMessage({ type: 'LC_CODE_RESULT', code: code || '', error: null }, '*')
    } catch (err) {
      window.postMessage({ type: 'LC_CODE_RESULT', code: '', error: String(err) }, '*')
    }
  })
})()
