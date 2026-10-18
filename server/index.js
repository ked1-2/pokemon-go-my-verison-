// Production server: serves the built client from dist/ plus the game API.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiHandler } from './api.js'

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
const PORT = process.env.PORT || 3000
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }

const api = createApiHandler()

createServer((req, res) => {
  api(req, res, async () => {
    const urlPath = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\]|\.\.)+/, '')
    const file = join(DIST, urlPath || 'index.html')
    try {
      const body = await readFile(file)
      res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream')
      res.end(body)
    } catch {
      res.statusCode = 404
      res.end('Not found')
    }
  })
}).listen(PORT, () => console.log(`Poke Arena running at http://localhost:${PORT}`))
