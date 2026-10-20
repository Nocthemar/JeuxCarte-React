import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { appliquerClasses, appliquerTheme } from './lib/preferences.js'

// Avant le premier affichage : thème de jour et préférences d'affichage (classes sur <html>)
appliquerTheme()
appliquerClasses()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
