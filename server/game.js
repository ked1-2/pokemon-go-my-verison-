// Authoritative game rules. The client only sends intents; every spawn, roll,
// battle outcome, catch, heal, upgrade and score is decided here.
import { randomUUID } from 'node:crypto'

const POKEAPI = 'https://pokeapi.co/api/v2/pokemon'

export const STARTERS = ['palkia', 'dialga', 'arceus', 'eternatus']

export const BALLS = {
  regular: { name: 'Poké Ball', chance: 0.5, start: 6, bonus: 100 },
  legendary: { name: 'Legend Ball', chance: 0.7, start: 3, bonus: 50 },
  master: { name: 'Master Ball', chance: 0.9, start: 1, bonus: 0 },
}

// Spawn table: rarer tiers appear less often, are stronger, and resist capture.
export const RARITIES = {
  common: { weight: 55, levels: [5, 14], catch: 1, bonus: 0, ids: [19, 16, 41, 52, 74, 92, 35, 81, 129, 10] },
  uncommon: { weight: 28, levels: [15, 24], catch: 0.85, bonus: 50, ids: [25, 58, 66, 95, 133, 93, 63, 215, 4, 7, 1, 280] },
  rare: { weight: 12, levels: [28, 36], catch: 0.7, bonus: 150, ids: [6, 94, 130, 212, 448, 197, 208, 468, 143, 9, 3] },
  epic: { weight: 4, levels: [45, 52], catch: 0.5, bonus: 300, ids: [149, 248, 445, 376, 282] },
  legendary: { weight: 1, levels: [60, 70], catch: 0.3, bonus: 600, ids: [150, 384, 487, 249] },
}
const SHINY_CHANCE = 1 / 40
const SHINY_CATCH = 0.6 // shinies are 40% harder to catch
const SHINY_STAT_BONUS = 1.1

// Day/night cycle, counted from the start of each trial. Wild Pokémon that
// spawn at night are stronger and far more likely to be shiny.
const DAY_MS = 3 * 60 * 1000
const NIGHT_MS = 2 * 60 * 1000
const NIGHT_STAT_BONUS = 1.25
const NIGHT_SHINY_CHANCE = 1 / 8

// Every elimination makes later wild Pokémon tougher.
const LEVELS_PER_ELIMINATION = 2
const MAX_LEVEL = 100

// Attack type → defending types that take no damage from it.
export const IMMUNITIES = {
  normal: ['ghost'],
  fighting: ['ghost'],
  poison: ['steel'],
  ground: ['flying'],
  ghost: ['normal'],
  electric: ['ground'],
  psychic: ['dark'],
  dragon: ['fairy'],
}

// [strong move, signature move] for each type, used to build movesets.
const TYPE_MOVES = {
  normal: ['Body Slam', 'Hyper Beam'],
  fire: ['Flamethrower', 'Fire Blast'],
  water: ['Surf', 'Hydro Pump'],
  electric: ['Thunderbolt', 'Thunder'],
  grass: ['Razor Leaf', 'Solar Beam'],
  ice: ['Ice Beam', 'Blizzard'],
  fighting: ['Brick Break', 'Close Combat'],
  poison: ['Sludge Bomb', 'Gunk Shot'],
  ground: ['Earthquake', 'Earth Power'],
  flying: ['Air Slash', 'Hurricane'],
  psychic: ['Psychic', 'Psystrike'],
  bug: ['X-Scissor', 'Megahorn'],
  rock: ['Rock Slide', 'Stone Edge'],
  ghost: ['Shadow Ball', 'Shadow Force'],
  dragon: ['Dragon Claw', 'Draco Meteor'],
  dark: ['Crunch', 'Night Daze'],
  steel: ['Iron Head', 'Flash Cannon'],
  fairy: ['Moonblast', 'Dazzling Gleam'],
}
const STARTER_MOVES = {
  palkia: [['Dragon Claw', 'dragon'], ['Aqua Tail', 'water'], ['Spacial Rend', 'dragon']],
  dialga: [['Metal Claw', 'steel'], ['Flash Cannon', 'steel'], ['Roar of Time', 'dragon']],
  arceus: [['Extreme Speed', 'normal'], ['Earth Power', 'ground'], ['Judgment', 'normal']],
  eternatus: [['Poison Tail', 'poison'], ['Flamethrower', 'fire'], ['Dynamax Cannon', 'dragon']],
}
const SLOTS = [
  { kind: 'basic', power: 40, accuracy: 1, pp: 30 },
  { kind: 'strong', power: 70, accuracy: 0.9, pp: 8 },
  { kind: 'signature', power: 110, accuracy: 0.8, pp: 3 },
  { kind: 'heal', power: 0, heal: 0.35, accuracy: 1, pp: 2 },
]
// Wild Pokémon only use their first two moves, at reduced power.
const WILD_MOVE_POWER = [40, 60]
const WILD_STRONG_CHANCE = 0.3

const START_LEVEL = 20
// Starters are boosted to these stats at START_LEVEL, scaling up as they level.
const STARTER_STATS = { maxHp: 300, attack: 200 }
const PARTY_SIZE = 4
const UPGRADE_LEVELS = 5
const BLACKOUT_PENALTY = 150
const WIN_HEAL = 0.25
const CATCH_HP_RATIO = 0.3 // wild HP must be at or below this to throw a ball mid-battle

const cache = new Map()

async function fetchSpecies(idOrName) {
  if (cache.has(idOrName)) return cache.get(idOrName)
  const promise = fetch(`${POKEAPI}/${idOrName}`).then(async (res) => {
    if (!res.ok) throw new Error(`PokéAPI ${idOrName}: ${res.status}`)
    const data = await res.json()
    const base = Object.fromEntries(data.stats.map((s) => [s.stat.name, s.base_stat]))
    return {
      id: data.id,
      name: data.name,
      types: data.types.map((t) => t.type.name),
      sprite: data.sprites.front_default,
      backSprite: data.sprites.back_default,
      shinySprite: data.sprites.front_shiny,
      shinyBackSprite: data.sprites.back_shiny,
      base: {
        hp: base.hp,
        // No type effectiveness beyond immunities, so physical and special are averaged.
        attack: Math.round((base.attack + base['special-attack']) / 2),
        defense: Math.round((base.defense + base['special-defense']) / 2),
        speed: base.speed,
      },
    }
  })
  cache.set(idOrName, promise)
  promise.catch(() => cache.delete(idOrName))
  return promise
}

function statsAt(base, level) {
  const stat = (b) => Math.floor((2 * b * level) / 100) + 5
  return {
    maxHp: Math.floor((2 * base.hp * level) / 100) + level + 10,
    attack: stat(base.attack),
    defense: stat(base.defense),
    speed: stat(base.speed),
  }
}

// Stats for a level, including the starter boost when it applies.
function statsFor(f) {
  const stats = statsAt(f.base, f.level)
  if (f.starter) {
    stats.maxHp = Math.round((STARTER_STATS.maxHp * f.level) / START_LEVEL)
    stats.attack = Math.round((STARTER_STATS.attack * f.level) / START_LEVEL)
  }
  return stats
}

function makeStarter(species) {
  const f = makeFighter(species, START_LEVEL)
  f.starter = true
  Object.assign(f, statsFor(f))
  f.hp = f.maxHp
  return f
}

function movesFor(species) {
  let named = STARTER_MOVES[species.name]
  if (!named) {
    const [t1, t2 = t1] = species.types
    named = [['Tackle', 'normal'], [TYPE_MOVES[t1][0], t1], [TYPE_MOVES[t2][1], t2]]
  }
  return SLOTS.map((slot, i) => ({ ...slot, name: named[i]?.[0] ?? 'Recover', type: named[i]?.[1] ?? 'normal' }))
}

function makeFighter(species, level, { shiny = false, night = false, rarity = null } = {}) {
  const boost = (shiny ? SHINY_STAT_BONUS : 1) * (night ? NIGHT_STAT_BONUS : 1)
  const base = boost === 1
    ? species.base
    : Object.fromEntries(Object.entries(species.base).map(([k, v]) => [k, Math.round(v * boost)]))
  const stats = statsAt(base, level)
  const moves = movesFor(species)
  return {
    uid: randomUUID(),
    id: species.id,
    name: species.name,
    types: species.types,
    sprite: (shiny && species.shinySprite) || species.sprite,
    backSprite: (shiny && species.shinyBackSprite) || species.backSprite,
    base,
    level,
    shiny,
    night,
    rarity,
    ...stats,
    hp: stats.maxHp,
    moves,
    pp: moves.map((m) => m.pp),
    xp: 0,
    xpNext: level * 20,
    fainted: false,
  }
}

function power(f) {
  return f.maxHp + f.attack + f.defense + f.speed
}

function immune(moveType, defender) {
  return (IMMUNITIES[moveType] ?? []).some((t) => defender.types.includes(t))
}

function damage(attacker, defender, movePower) {
  const crit = Math.random() < 1 / 16
  const raw = (((2 * attacker.level) / 5 + 2) * movePower * attacker.attack) / defender.defense / 50 + 2
  const roll = 0.85 + Math.random() * 0.15
  return { amount: Math.max(1, Math.floor(raw * roll * (crit ? 1.5 : 1))), crit }
}

export function catchChance(ballKey, wild) {
  const levelFactor = Math.max(0.2, 1 - Math.max(0, wild.level - 10) / 80) // Lv 50 → 0.5
  const chance = BALLS[ballKey].chance * levelFactor * RARITIES[wild.rarity].catch * (wild.shiny ? SHINY_CATCH : 1)
  return Math.min(0.95, Math.max(0.01, chance))
}

function clock(s) {
  const t = (Date.now() - s.startedAt) % (DAY_MS + NIGHT_MS)
  const night = t >= DAY_MS
  return { night, msLeft: night ? DAY_MS + NIGHT_MS - t : DAY_MS - t }
}

const levelBonus = (s) => s.eliminated.length * LEVELS_PER_ELIMINATION

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))

function rollRarity() {
  const entries = Object.entries(RARITIES)
  let roll = Math.random() * entries.reduce((sum, [, r]) => sum + r.weight, 0)
  for (const [key, r] of entries) {
    roll -= r.weight
    if (roll < 0) return key
  }
  return 'common'
}

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export function createGame({ fetchPokemon = fetchSpecies } = {}) {
  const sessions = new Map()

  function get(id) {
    const s = sessions.get(id)
    if (!s) throw new GameError('Unknown session', 404)
    return s
  }

  const active = (s) => s.party[s.active]
  const anyHealthy = (s) => s.party.some((m) => !m.fainted)

  function canUpgrade(s) {
    const p = active(s)
    return !s.finished && s.phase === 'explore' && !p.fainted && p.xp >= p.xpNext
  }

  function catchable(s) {
    if (!s.wild) return false
    return s.phase === 'won' || (s.phase === 'battle' && s.wild.hp <= s.wild.maxHp * CATCH_HP_RATIO)
  }

  function score(s) {
    const elim = s.eliminated.reduce((sum, w) => sum + w.level * 10, 0)
    const caught = s.caught.reduce(
      (sum, c) => sum + c.level * 20 + BALLS[c.ball].bonus + RARITIES[c.rarity].bonus * (c.shiny ? 2 : 1),
      0,
    )
    const finalPower =
      s.party.reduce((sum, m) => sum + power(m), 0) + Math.round(s.box.reduce((sum, m) => sum + power(m), 0) * 0.25)
    const blackoutPenalty = s.blackouts * BLACKOUT_PENALTY
    return { eliminatedPoints: elim, caughtPoints: caught, finalPower, blackoutPenalty, total: elim + caught + finalPower - blackoutPenalty }
  }

  function memberView(m) {
    return {
      uid: m.uid, id: m.id, name: m.name, types: m.types, sprite: m.sprite, backSprite: m.backSprite,
      level: m.level, hp: m.hp, maxHp: m.maxHp, baseSpeed: m.base.speed, power: power(m),
      xp: m.xp, xpNext: m.xpNext, fainted: m.fainted, shiny: m.shiny, rarity: m.rarity,
    }
  }

  function view(s) {
    const p = active(s)
    const w = s.wild
    return {
      sessionId: s.id,
      location: s.location,
      phase: s.phase,
      player: memberView(p),
      party: s.party.map(memberView),
      active: s.active,
      box: s.box.map(memberView),
      wild: w && {
        id: w.id, name: w.name, types: w.types, sprite: w.sprite, level: w.level, hp: w.hp, maxHp: w.maxHp,
        baseSpeed: w.base.speed, shiny: w.shiny, night: w.night, rarity: w.rarity,
      },
      time: { ...clock(s), dayMs: DAY_MS, nightMs: NIGHT_MS },
      levelBonus: levelBonus(s),
      abilities: p.moves.map((m, i) => ({
        name: m.name, type: m.type, kind: m.kind, power: m.power, accuracy: m.accuracy,
        pp: p.pp[i], maxPp: m.pp, noEffect: Boolean(w && m.kind !== 'heal' && immune(m.type, w)),
      })),
      catchable: catchable(s),
      catchChances: w ? Object.fromEntries(Object.keys(BALLS).map((k) => [k, Math.round(catchChance(k, w) * 100)])) : null,
      balls: { ...s.balls },
      canUpgrade: canUpgrade(s),
      canEnterArena: !s.finished && anyHealthy(s),
      caught: s.caught.map(({ name, level, ball, shiny, rarity }) => ({ name, level, ball, shiny, rarity })),
      eliminated: s.eliminated.map(({ name, level }) => ({ name, level })),
      blackouts: s.blackouts,
      encounters: s.encounters,
      score: score(s).total,
      finished: s.finished,
    }
  }

  async function spawnWild(s) {
    const rarity = rollRarity()
    const r = RARITIES[rarity]
    const species = await fetchPokemon(pick(r.ids))
    const { night } = clock(s)
    const level = Math.min(MAX_LEVEL, between(...r.levels) + levelBonus(s))
    const shiny = Math.random() < (night ? NIGHT_SHINY_CHANCE : SHINY_CHANCE)
    s.wild = makeFighter(species, level, { shiny, night, rarity })
    s.phase = 'explore'
  }

  function resolveEncounter(s) {
    s.encounters += 1
    s.wild = null
    return spawnWild(s)
  }

  function playerAct(s, i) {
    const p = active(s)
    const move = p.moves[i]
    const event = { actor: 'player', ability: move.name, kind: move.kind, type: move.type }
    if (move.heal) {
      const before = p.hp
      p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * move.heal))
      event.heal = p.hp - before
    } else if (immune(move.type, s.wild)) {
      event.immune = true
    } else if (Math.random() >= move.accuracy) {
      event.miss = true
    } else {
      const { amount, crit } = damage(p, s.wild, move.power)
      s.wild.hp = Math.max(0, s.wild.hp - amount)
      Object.assign(event, { damage: amount, crit })
    }
    return { ...event, playerHp: p.hp, wildHp: s.wild.hp }
  }

  function wildAct(s) {
    const p = active(s)
    const slot = Math.random() < WILD_STRONG_CHANCE ? 1 : 0
    const move = s.wild.moves[slot]
    const { amount, crit } = damage(s.wild, p, WILD_MOVE_POWER[slot])
    p.hp = Math.max(0, p.hp - amount)
    return { actor: 'wild', ability: move.name, kind: 'wild', type: move.type, damage: amount, crit, playerHp: p.hp, wildHp: s.wild.hp }
  }

  // Moves the session out of 'battle' once either side faints.
  function settle(s) {
    const p = active(s)
    if (s.wild.hp === 0) {
      p.xp += s.wild.level * 10
      p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * WIN_HEAL))
      s.phase = 'won'
      return 'win'
    }
    if (p.hp === 0) {
      p.fainted = true
      if (anyHealthy(s)) {
        s.phase = 'fainted' // must send in another party member
        return 'fainted'
      }
      // The whole party is down: black out and wake up in the lobby.
      s.blackouts += 1
      s.phase = 'explore'
      s.location = 'lobby'
      return 'blackout'
    }
    return 'ongoing'
  }

  function requireSlot(s, slot) {
    const m = s.party[slot]
    if (!m) throw new GameError('No Pokémon in that slot')
    if (m.fainted) throw new GameError(`${m.name} has fainted. Heal it at the Healing Center`)
    return m
  }

  return {
    async starters() {
      const list = await Promise.all(STARTERS.map((n) => fetchPokemon(n)))
      return list.map((sp) => {
        const f = makeStarter(sp)
        return { ...sp, power: power(f), level: START_LEVEL, stats: { hp: f.maxHp, attack: f.attack, defense: f.defense, speed: f.speed } }
      })
    },

    async start({ starter }) {
      if (!STARTERS.includes(starter)) throw new GameError('Pick one of the four starters')
      const s = {
        id: randomUUID(),
        startedAt: Date.now(),
        party: [makeStarter(await fetchPokemon(starter))],
        box: [],
        active: 0,
        location: 'lobby',
        phase: 'explore',
        wild: null,
        balls: Object.fromEntries(Object.entries(BALLS).map(([k, b]) => [k, b.start])),
        caught: [],
        eliminated: [],
        blackouts: 0,
        encounters: 0,
        finished: false,
      }
      sessions.set(s.id, s)
      return view(s)
    },

    state({ sessionId }) {
      return view(get(sessionId))
    },

    async enter({ sessionId }) {
      const s = get(sessionId)
      if (s.finished) throw new GameError('The trial is over')
      if (s.location !== 'lobby') throw new GameError('You are already in the arena')
      if (!anyHealthy(s)) throw new GameError('Your whole team has fainted. Visit the Healing Center first')
      if (active(s).fainted) s.active = s.party.findIndex((m) => !m.fainted)
      s.location = 'arena'
      if (!s.wild) await spawnWild(s)
      s.phase = 'explore'
      return view(s)
    },

    leave({ sessionId }) {
      const s = get(sessionId)
      if (s.location !== 'arena' || s.phase !== 'explore') throw new GameError('You cannot leave right now')
      s.location = 'lobby'
      return view(s)
    },

    heal({ sessionId }) {
      const s = get(sessionId)
      if (s.location !== 'lobby') throw new GameError('The Healing Center is in the lobby')
      for (const m of [...s.party, ...s.box]) {
        m.hp = m.maxHp
        m.fainted = false
        m.pp = m.moves.map((mv) => mv.pp)
      }
      for (const [k, b] of Object.entries(BALLS)) s.balls[k] = Math.max(s.balls[k], b.start)
      return view(s)
    },

    swap({ sessionId, slot }) {
      const s = get(sessionId)
      if (s.phase !== 'explore') throw new GameError('Use the SWITCH menu during battle')
      requireSlot(s, slot)
      s.active = slot
      return view(s)
    },

    battle({ sessionId }) {
      const s = get(sessionId)
      if (s.location !== 'arena' || s.phase !== 'explore' || !s.wild) throw new GameError('No wild Pokémon to battle')
      if (active(s).fainted) throw new GameError('Switch to a healthy Pokémon first')
      s.phase = 'battle'
      for (const m of s.party) m.pp = m.moves.map((mv) => mv.pp)
      return view(s)
    },

    attack({ sessionId, ability }) {
      const s = get(sessionId)
      if (s.phase !== 'battle') throw new GameError('You are not in a battle')
      const p = active(s)
      if (!p.moves[ability]) throw new GameError('Unknown ability')
      if (p.pp[ability] <= 0) throw new GameError('No PP left for that ability')
      p.pp[ability] -= 1

      const events = []
      const playerFirst = p.speed >= s.wild.speed
      for (const actor of playerFirst ? ['player', 'wild'] : ['wild', 'player']) {
        events.push(actor === 'player' ? playerAct(s, ability) : wildAct(s))
        if (p.hp === 0 || s.wild.hp === 0) break
      }
      return { events, result: settle(s), state: view(s) }
    },

    switch({ sessionId, slot }) {
      const s = get(sessionId)
      if (s.phase !== 'battle' && s.phase !== 'fainted') throw new GameError('You are not in a battle')
      if (slot === s.active) throw new GameError('That Pokémon is already battling')
      requireSlot(s, slot)
      const forced = s.phase === 'fainted'
      s.active = slot
      s.phase = 'battle'
      // Switching voluntarily costs your turn; replacing a fainted Pokémon is free.
      const events = forced ? [] : [wildAct(s)]
      return { events, result: forced ? 'ongoing' : settle(s), state: view(s) }
    },

    async run({ sessionId }) {
      const s = get(sessionId)
      if (s.phase !== 'battle') throw new GameError('You are not in a battle')
      const fled = s.wild.name
      await spawnWild(s) // the old one is gone; something new wanders in
      return { fled, state: view(s) }
    },

    async catch({ sessionId, ball }) {
      const s = get(sessionId)
      if (!catchable(s)) throw new GameError('Weaken the wild Pokémon before throwing a ball')
      if (!BALLS[ball]) throw new GameError('Unknown ball')
      if (s.balls[ball] <= 0) throw new GameError(`No ${BALLS[ball].name}s left`)
      s.balls[ball] -= 1
      const wild = s.wild
      const caught = Math.random() < catchChance(ball, wild)
      const events = []
      let result = s.phase === 'won' ? 'win' : 'ongoing'
      let destination = null
      if (caught) {
        if (s.phase === 'battle') active(s).xp += wild.level * 10 // a defeated Pokémon already paid XP
        s.caught.push({ name: wild.name, level: wild.level, ball, shiny: wild.shiny, rarity: wild.rarity })
        Object.assign(wild, { hp: wild.maxHp, fainted: false, pp: wild.moves.map((m) => m.pp) })
        destination = s.party.length < PARTY_SIZE ? 'party' : 'box'
        ;(destination === 'party' ? s.party : s.box).push(wild)
        await resolveEncounter(s)
        result = 'caught'
      } else if (s.phase === 'battle') {
        // A failed throw mid-battle gives the wild Pokémon a free attack.
        events.push(wildAct(s))
        result = settle(s)
      }
      return { caught, ball, pokemon: wild.name, destination, events, result, state: view(s) }
    },

    async eliminate({ sessionId }) {
      const s = get(sessionId)
      if (s.phase !== 'won') throw new GameError('Win the battle before eliminating')
      s.eliminated.push({ name: s.wild.name, level: s.wild.level })
      await resolveEncounter(s)
      return view(s)
    },

    upgrade({ sessionId }) {
      const s = get(sessionId)
      if (!canUpgrade(s)) throw new GameError('Your Pokémon cannot be upgraded right now')
      const p = active(s)
      p.xp -= p.xpNext
      p.level += UPGRADE_LEVELS
      p.xpNext = p.level * 20
      Object.assign(p, statsFor(p))
      p.hp = p.maxHp
      return view(s)
    },

    end({ sessionId }) {
      const s = get(sessionId)
      if (s.location !== 'lobby') throw new GameError('Return to the lobby to end the trial')
      s.finished = true
      s.phase = 'done'
      return view(s)
    },

    results({ sessionId }) {
      const s = get(sessionId)
      if (!s.finished) throw new GameError('The trial is not finished yet')
      return { ...view(s), breakdown: score(s) }
    },
  }
}
