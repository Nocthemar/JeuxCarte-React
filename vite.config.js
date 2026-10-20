import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// La politique de sécurité de l'ancien jeu (Content-Security-Policy, la même sur chaque page) :
// seuls les scripts du jeu s'exécutent ; le jeu ne parle qu'à son projet Supabase.
// Ajoutée seulement à la version finale (npm run build) : en développement, Vite a besoin de scripts
// écrits dans la page, que cette politique interdit.
// (l'adresse de Supabase n'est lue qu'à la construction : les tests chargent aussi ce fichier, sans elle)
function politiqueDeSecurite(supabase) {
  const regles = (hote) => [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' https://${hote} wss://${hote}`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'politique-de-securite',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${regles(new URL(supabase).host)}" />`),
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // (.env.local sur l'ordinateur ; sur GitHub, les « Variables » du dépôt, voir .github/workflows/mise-en-ligne.yml)
  const env = loadEnv(mode, process.cwd())
  if (command === 'build' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquent : .env.local (ordinateur) ou Variables du dépôt (GitHub).')
  }
  return {
    // Adresses relatives : le jeu fonctionne à la racine d'un site comme dans un sous-dossier
    // (GitHub Pages : …github.io/CarteJeuxNocthemar/)
    base: './',
    plugins: [react(), politiqueDeSecurite(env.VITE_SUPABASE_URL)],
    // En développement (npm run dev) : Vite prépare les écrans et leurs styles dès le démarrage, au lieu
    // d'attendre la première visite de chaque écran (sinon plusieurs secondes d'attente la première fois)
    server: { warmup: { clientFiles: ['./src/pages/*.jsx', './src/styles/*.css'] } },
  }
})
