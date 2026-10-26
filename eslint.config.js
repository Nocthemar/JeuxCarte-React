import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // (supabase/functions : fichiers construits par « npm run arbitre »)
  globalIgnores(['dist', 'Ancient', 'supabase/functions']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Les tests et la configuration tournent dans Node (fichiers, chemins…), pas dans le navigateur
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // Le service worker tourne à part, sans page (self, caches, clients)
  {
    files: ['src/appli/service-worker.js'],
    languageOptions: { globals: globals.serviceworker },
  },
])
