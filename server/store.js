// Where game sessions live. Serverless hosts (Vercel) don't keep memory between
// requests, so when Upstash Redis credentials are present sessions go there;
// otherwise (local dev, `npm start`) a plain in-memory Map is enough.
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export function memoryStore() {
  const sessions = new Map()
  return {
    get: async (id) => sessions.get(id) ?? null,
    set: async (id, s) => void sessions.set(id, s),
  }
}

export function redisStore({ url, token }) {
  async function command(...args) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(`Redis ${args[0]}: ${data.error ?? res.status}`)
    return data.result
  }
  return {
    get: async (id) => {
      const raw = await command('GET', `session:${id}`)
      return raw ? JSON.parse(raw) : null
    },
    set: (id, s) => command('SET', `session:${id}`, JSON.stringify(s), 'EX', SESSION_TTL_SECONDS),
  }
}

// The Vercel Upstash integration sets KV_* (older) or UPSTASH_REDIS_* (newer) variables.
export function defaultStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN
  return url && token ? redisStore({ url, token }) : memoryStore()
}
