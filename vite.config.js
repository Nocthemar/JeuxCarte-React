import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// La politique de sécurité de l'ancien jeu (Content-Security-Policy, la même sur chaque page) :
// seuls les scripts du jeu s'exécutent ; le jeu ne parle qu'à son projet Supabase ; aucun cadre (iframe).
// Avec la vérification anti-robot (VITE_TURNSTILE_SITE_KEY) : son script et son cadre, chez Cloudflare.
// Ajoutée seulement à la version finale (npm run build) : en développement, Vite a besoin de scripts
// écrits dans la page, que cette politique interdit.
// (l'adresse de Supabase n'est lue qu'à la construction : les tests chargent aussi ce fichier, sans elle)
function politiqueDeSecurite(supabase, captcha) {
  const turnstile = captcha ? ' https://challenges.cloudflare.com' : ''
  const regles = (hote) => [
    "default-src 'self'",
    `script-src 'self'${turnstile}`,
    captcha ? `frame-src${turnstile}` : "frame-src 'none'",
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

// L'appli (téléphone, ordinateur) : fabrique dist/sw.js, le service worker (modèle : src/appli/service-worker.js),
// avec la liste des fichiers du jeu à ranger sur l'appareil. Les images (14 Mo) n'y sont pas : elles sont
// rangées au fur et à mesure qu'on les voit.
function appliHorsLigne() {
  return {
    name: 'appli-hors-ligne',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const fichiers = Object.keys(bundle).filter((f) => f === 'index.html' || (f.startsWith('assets/') && !f.endsWith('.map')))
      fichiers.push('manifest.webmanifest', 'icones/icone-192.png', 'img/Logo/favicon.png')
      fichiers.sort()
      // La version change dès qu'un fichier du jeu change (leurs noms contiennent une empreinte de leur contenu)
      const version = createHash('sha256').update(fichiers.join('\n') + readFileSync('public/manifest.webmanifest', 'utf8')).digest('hex').slice(0, 12)
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `self.__PRECACHE = ${JSON.stringify({ fichiers, version })};\n\n${readFileSync('src/appli/service-worker.js', 'utf8')}`,
      })
    },
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
    plugins: [react(), politiqueDeSecurite(env.VITE_SUPABASE_URL, env.VITE_TURNSTILE_SITE_KEY), appliHorsLigne()],
    // En développement (npm run dev) : Vite prépare les écrans et leurs styles dès le démarrage, au lieu
    // d'attendre la première visite de chaque écran (sinon plusieurs secondes d'attente la première fois)
    server: { warmup: { clientFiles: ['./src/pages/*.jsx', './src/styles/*.css'] } },
  }
})
