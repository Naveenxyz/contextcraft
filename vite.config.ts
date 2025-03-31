
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: 'electron/main.ts',
        // Explicitly mark problematic CJS modules as external for the plugin
        vite: {
          build: {
            // Tell Vite to treat node_modules as external, especially native ones
            rollupOptions: {
              external: ['electron', 'keytar', 'axios', 'electron-store', 'fs/promises', 'path', 'sqlite3'], // Added sqlite3
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: { // Add vite config for preload
          build: {
            rollupOptions: {
              external: ['electron'], // Preload might only need electron externalized
            }
          }
        },
        onstart(options) {
          // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
          // instead of restarting the entire Electron App.
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
})
