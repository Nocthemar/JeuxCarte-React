import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import FiletErreur from './components/FiletErreur.jsx'
import { installerFilets } from './lib/erreurs.js'
import { demarrerAppli } from './lib/appli.js'
import { appliquerClasses, appliquerTheme } from './lib/preferences.js'

// Le jeu ne s'affiche jamais dans le cadre (iframe) d'un autre site : un faux site pourrait poser des boutons
// invisibles par-dessus pour faire cliquer le joueur à son insu (GitHub Pages ne permet pas l'en-tête
// frame-ancestors, qui ferait la même chose côté serveur)
if (window.top !== window.self) {
  try { window.top.location.replace(window.location.href) } catch { document.documentElement.replaceChildren() }
}

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
