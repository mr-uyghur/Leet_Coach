import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const root = document.getElementById('root')
if (root) {
  // NOTE: StrictMode is intentionally omitted. Chrome extension ports are real,
  // persistent objects — StrictMode's double-mount would disconnect the background
  // port before useChat can attach its CHAT_DELTA listener.
  ReactDOM.createRoot(root).render(<App />)
}
