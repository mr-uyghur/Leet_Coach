// Injected into the page's main world (not the content script world) to access window.monaco.
// Responds to LC_GET_CODE postMessage requests from the content script.
// The requestId field is echoed back so the content script can ignore stale responses
// (e.g., from a timed-out previous call) even if they arrive late.
;(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window) return
    if (!event.data || event.data.type !== 'LC_GET_CODE') return

    const requestId = event.data.requestId  // echo back to prevent stale-response race

    try {
      const models = window.monaco && window.monaco.editor && window.monaco.editor.getModels()
      const code = models && models.length > 0 ? models[0].getValue() : null
      window.postMessage({ type: 'LC_CODE_RESULT', requestId, code: code || '', error: null }, '*')
    } catch (err) {
      window.postMessage({ type: 'LC_CODE_RESULT', requestId, code: '', error: String(err) }, '*')
    }
  })
})()
