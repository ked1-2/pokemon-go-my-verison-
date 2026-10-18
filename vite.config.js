import { defineConfig } from 'vite'
import { createApiHandler } from './server/api.js'

// Mounts the game server's API on the Vite dev and preview servers.
function gameServer() {
  return {
    name: 'poke-arena-server',
    configureServer(server) {
      server.middlewares.use(createApiHandler())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createApiHandler())
    },
  }
}

export default defineConfig({
  plugins: [gameServer()],
})
