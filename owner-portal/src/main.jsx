import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode entfernt: in Capacitor/Android WebView führt der doppelte
// Effect-Aufruf zu Race Conditions beim Datenladen (Provider mehrfach geladen).
createRoot(document.getElementById('root')).render(<App />)
