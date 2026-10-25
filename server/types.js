// Type matchups from PokéAPI. Each attacking type lists the defending types it
// hits for double, half and no damage. Cached per type for the life of the process.
const POKEAPI_TYPE = 'https://pokeapi.co/api/v2/type'

export const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]

const cache = new Map()

const httpError = (message, status) => Object.assign(new Error(message), { status })

export function fetchTypeRelations(name) {
  name = String(name ?? '').trim().toLowerCase()
  if (!/^[a-z]+(-[a-z]+)*$/.test(name)) return Promise.reject(httpError('Give a type name, like ?name=fire', 400))
  if (cache.has(name)) return cache.get(name)
  const promise = fetch(`${POKEAPI_TYPE}/${name}`).then(async (res) => {
    if (res.status === 404) throw httpError(`Unknown type: ${name}`, 404)
    if (!res.ok) throw httpError(`PokéAPI type ${name}: ${res.status}`, 502)
    const { damage_relations: r } = await res.json()
    const names = (list) => list.map((t) => t.name)
    return {
      name,
      double_damage_to: names(r.double_damage_to),
      half_damage_to: names(r.half_damage_to),
      no_damage_to: names(r.no_damage_to),
    }
  })
  cache.set(name, promise)
  promise.catch(() => cache.delete(name))
  return promise
}

// Attacking type → its relations, for every type moves can have.
export async function fetchTypeChart() {
  const all = await Promise.all(TYPE_NAMES.map(fetchTypeRelations))
  return Object.fromEntries(all.map((r) => [r.name, r]))
}

// Damage multiplier of a move type against a defender: 2, 0.5 or 0 per defending type, multiplied together.
export function effectiveness(chart, moveType, defenderTypes) {
  const r = chart[moveType]
  if (!r) return 1
  return defenderTypes.reduce((mult, t) => {
    if (r.double_damage_to.includes(t)) return mult * 2
    if (r.half_damage_to.includes(t)) return mult * 0.5
    if (r.no_damage_to.includes(t)) return 0
    return mult
  }, 1)
}
