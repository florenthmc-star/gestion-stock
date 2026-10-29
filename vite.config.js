import { defineConfig } from 'vite';

// Numéro de version de chaque publication : l'appli le compare à /version.json pour
// proposer de recharger quand une nouvelle version est en ligne (app/src/version.js).
const VERSION = process.env.GITHUB_SHA || String(Date.now());

export default defineConfig({
  root: 'app',
  envDir: '..',                 // les fichiers .env sont à la racine du dépôt
  define: { __VERSION__: JSON.stringify(VERSION) },
  plugins: [{
    name: 'version-json',
    apply: 'build',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: VERSION }) }); },
  }],
  // Firebase (base + connexion) et la lecture Excel pèsent lourd : c'est attendu.
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 1200 },
});
