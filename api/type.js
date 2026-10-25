// GET /api/type?name=fire → the type names fire deals double, half and no damage to.
import { fetchTypeRelations } from '../server/types.js'

export default async function handler(req, res) {
  const send = (status, data) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  }
  if (req.method !== 'GET') return send(405, { error: 'Use GET' })
  const name = new URL(req.url, 'http://localhost').searchParams.get('name')
  try {
    const relations = await fetchTypeRelations(name)
    // Type matchups never change, so let the CDN keep them for a day.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    send(200, relations)
  } catch (err) {
    if (!err.status || err.status >= 500) console.error(err)
    send(err.status ?? 502, { error: err.status ? err.message : 'Could not reach PokéAPI' })
  }
}
