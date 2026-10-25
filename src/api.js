// Thin client for the game server. The server owns all game state.
async function request(method, path, body) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const post = (path, sessionId, extra) => request('POST', path, { sessionId, ...extra })

export const api = {
  starters: () => request('GET', 'starters'),
  start: (starter) => request('POST', 'session', { starter }),
  enter: (id) => post('enter', id),
  leave: (id) => post('leave', id),
  heal: (id) => post('heal', id),
  swap: (id, slot) => post('swap', id, { slot }),
  battle: (id) => post('battle', id),
  attack: (id, ability) => post('attack', id, { ability }),
  switch: (id, slot) => post('switch', id, { slot }),
  run: (id) => post('run', id),
  catch: (id, ball) => post('catch', id, { ball }),
  eliminate: (id) => post('eliminate', id),
  upgrade: (id, card) => post('upgrade', id, { card }),
  end: (id) => post('end', id),
  results: (id) => post('results', id),
}
