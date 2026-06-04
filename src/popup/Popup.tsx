export function Popup() {
  function openPanel() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id })
      }
    })
  }

  return (
    <div
      style={{
        width: 320,
        padding: 16,
        background: '#1a1a1a',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h2 style={{ margin: '0 0 8px', color: '#FFA116', fontSize: 16 }}>LeetCode Coach</h2>
      <p style={{ margin: '0 0 12px', color: '#9ca3af', fontSize: 13 }}>
        AI-powered Socratic tutor for LeetCode problems
      </p>
      <button
        onClick={openPanel}
        style={{
          width: '100%',
          padding: '8px 16px',
          background: '#FFA116',
          color: '#000',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Open Coach Panel
      </button>
    </div>
  )
}
