// Construit l'Edge Function « arbitre » en un seul fichier (moteur du jeu compris) : npm run arbitre
//   source : serveur/arbitre.js  ->  supabase/functions/arbitre/index.js (à déployer, voir supabase/LISEZ-MOI.md)
import { defineConfig } from 'vite'

export default defineConfig({
  // Pas de dossier public/ à recopier : seulement le code
  publicDir: false,
  build: {
    lib: { entry: 'serveur/arbitre.js', formats: ['es'], fileName: () => 'index.js' },
    outDir: 'supabase/functions/arbitre',
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
    sourcemap: false,
  },
})
