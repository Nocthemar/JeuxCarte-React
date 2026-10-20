import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import FiletErreur from './components/FiletErreur.jsx'
import { installerFilets } from './lib/erreurs.js'
import { demarrerAppli } from './lib/appli.js'
import { appliquerClasses, appliquerTheme } from './lib/preferences.js'

// Avant le premier affichage : thème de jour et préférences d'affichage (classes sur <html>)
appliquerTheme()
appliquerClasses()
// Erreurs hors des écrans, et fichiers périmés après une mise à jour du jeu
installerFilets()
// L'appli : copie du jeu sur l'appareil, mises à jour, installation
demarrerAppli()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FiletErreur pleinePage>
      <App />
    </FiletErreur>
  </StrictMode>,
)
