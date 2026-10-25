// Thin client for the game server. The server owns all game state.
async function request(method, path, body) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  saveSquad(data.party ? data : data.state)
  return data
}

export const SQUAD_KEY = 'poke-arena:squad'

// Keeps a copy of the current team in localStorage. The server stays the source of truth;
// this is just so the squad survives in the browser between visits.
function saveSquad(state) {
  if (!state?.party) return
  const squad = {
    sessionId: state.sessionId,
    savedAt: new Date().toISOString(),
    members: state.party.map(({ id, name, level, shiny, types, sprite, aura }) => ({ id, name, level, shiny, types, sprite, aura })),
  }
  try {
    localStorage.setItem(SQUAD_KEY, JSON.stringify(squad))
  } catch {
    // Storage can be blocked (private mode, full quota); the game works without it.
  }
}

export function loadSquad() {
  try {
    return JSON.parse(localStorage.getItem(SQUAD_KEY))
  } catch {
    return null
  }
}

const post = (path, sessionId, extra) => request('POST', path, { sessionId, ...extra })

export const api = {
  starters: () => request('GET', 'starters'),
  start: (starter) => request('POST', 'session', { starter }),
  enter: (id) => post('enter', id),
  leave: (id) => post('leave', id),
  heal: (id) => post('heal', id),
  swap: (id, slot) => post('swap', id, { slot }),
  equip: (id, uid, slot) => post('equip', id, { uid, slot }),
  unequip: (id, uid) => post('unequip', id, { uid }),
  battle: (id) => post('battle', id),
  spawn: (id, pokemonId, level) => post('spawn', id, { id: pokemonId, level }),
  attack: (id, ability) => post('attack', id, { ability }),
  switch: (id, slot) => post('switch', id, { slot }),
  run: (id) => post('run', id),
  catch: (id, ball) => post('catch', id, { ball }),
  eliminate: (id) => post('eliminate', id),
  upgrade: (id, card) => post('upgrade', id, { card }),
  end: (id) => post('end', id),
  results: (id) => post('results', id),
}
