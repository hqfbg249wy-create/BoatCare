import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode entfernt: in Capacitor/Android WebView führt der doppelte
// Effect-Aufruf zu Race Conditions beim Datenladen (Provider mehrfach geladen).
createRoot(document.getElementById('root')).render(<App />)

// Service Worker nur im echten Browser (app.skipily.app) registrieren — für
// PWA-Installierbarkeit. In der Capacitor-App überflüssig/störend → auslassen.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
