// Vercel serverless entry: every /api/* request goes through the same handler
// the Vite dev server and server/index.js use.
import { createApiHandler } from '../server/api.js'

const handle = createApiHandler()

export default function handler(req, res) {
  return handle(req, res, () => {
    res.statusCode = 404
    res.end('Not found')
  })
}
