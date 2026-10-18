import { createGame, GameError } from './game.js'

const ROUTES = {
  'GET /api/starters': (game) => game.starters(),
  'POST /api/session': (game, body) => game.start(body),
  'POST /api/state': (game, body) => game.state(body),
  'POST /api/enter': (game, body) => game.enter(body),
  'POST /api/leave': (game, body) => game.leave(body),
  'POST /api/heal': (game, body) => game.heal(body),
  'POST /api/swap': (game, body) => game.swap(body),
  'POST /api/battle': (game, body) => game.battle(body),
  'POST /api/attack': (game, body) => game.attack(body),
  'POST /api/switch': (game, body) => game.switch(body),
  'POST /api/run': (game, body) => game.run(body),
  'POST /api/catch': (game, body) => game.catch(body),
  'POST /api/eliminate': (game, body) => game.eliminate(body),
  'POST /api/upgrade': (game, body) => game.upgrade(body),
  'POST /api/end': (game, body) => game.end(body),
  'POST /api/results': (game, body) => game.results(body),
}

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

// Connect-style middleware, usable by Vite and by the standalone server.
export function createApiHandler(game = createGame()) {
  return async (req, res, next) => {
    const path = req.url.split('?')[0]
    if (!path.startsWith('/api/')) return next?.()
    const route = ROUTES[`${req.method} ${path}`]
    if (!route) return send(res, 404, { error: 'Not found' })
    try {
      send(res, 200, await route(game, await readJson(req)))
    } catch (err) {
      if (err instanceof GameError) return send(res, err.status, { error: err.message })
      console.error(err)
      send(res, 500, { error: 'Server error' })
    }
  }
}
