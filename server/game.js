// Authoritative game rules. The client only sends intents; every spawn, roll,
// battle outcome, catch, heal, upgrade and score is decided here.
import { randomUUID } from 'node:crypto'
import { defaultStore } from './store.js'

const POKEAPI = 'https://pokeapi.co/api/v2/pokemon'
const POKEAPI_SPECIES = 'https://pokeapi.co/api/v2/pokemon-species'

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
  // Titans never come from the weighted roll; they spawn through TITAN_CHANCE instead.
  titan: { weight: 0, levels: [50, 65], catch: 0.8, bonus: 1500, ids: [383, 382, 384, 250, 249, 150, 487, 643, 644, 646, 716, 717] },
}

// Titans: giant bosses with huge HP. Your whole collection fights them together,
// and catching one gives it an aura that powers up your party.
const TITAN_CHANCE = 0.08
const TITAN_MIN_ENCOUNTERS = 3
const TITAN_HP = 8
const TITAN_ATTACK = 1.2
const TITAN_XP = 3
const TITAN_SCORE_MULT = 5
const ASSIST_POWER = 50
const AURA_BONUS = 0.25 // per aura Pokémon owned: party deals +25% damage, takes 20% less, +25% power

// Every Pokémon has the ability of its primary type.
export const TYPE_ABILITIES = {
  normal: { name: 'Double Hit', desc: '25% chance to strike again for half damage' },
  fire: { name: 'Burn', desc: '30% chance to burn the target, hurting it every turn' },
  water: { name: 'Aqua Shield', desc: '30% chance to halve the next hit it takes' },
  electric: { name: 'Paralyze', desc: '30% chance to paralyze the target so it may not move' },
  grass: { name: 'Leech', desc: 'Heals 40% of the damage it deals' },
  ice: { name: 'Freeze', desc: '20% chance to freeze the target for a turn' },
  fighting: { name: 'Focus', desc: 'Critical hits are 4x more likely' },
  poison: { name: 'Poison', desc: '40% chance to poison the target, hurting it every turn' },
  ground: { name: 'Aftershock', desc: '25% chance to deal 50% extra damage' },
  flying: { name: 'Evasion', desc: '30% chance to dodge the next attack' },
  psychic: { name: 'Confuse', desc: '30% chance to confuse the target so it may hurt itself' },
  bug: { name: 'Swarm', desc: 'Deals 50% more damage when below 1/3 HP' },
  rock: { name: 'Sturdy', desc: 'Survives one knockout hit per battle with 1 HP' },
  ghost: { name: 'Haunt', desc: 'Attacks never miss and pass through immunities' },
  dragon: { name: 'Dragon Rage', desc: '30% chance to raise its attack by 20% after a hit' },
  dark: { name: 'Intimidate', desc: "30% chance to lower the target's attack by 20%" },
  steel: { name: 'Iron Guard', desc: '30% chance to raise its defense by 25% after a hit' },
  fairy: { name: 'Wish', desc: '30% chance to heal 15% of its HP after attacking' },
}
const STATUS = {
  burn: { label: 'burned', tick: 1 / 12, turns: 3 },
  poison: { label: 'poisoned', tick: 1 / 8, turns: 4 },
  paralyze: { label: 'paralyzed', turns: 3 },
  freeze: { label: 'frozen solid', turns: 1 },
  confuse: { label: 'confused', turns: 2 },
}
const MAX_STAGE = 2 // stat boosts and drops from abilities stop at 2x / 0.5x
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

const evolutionCache = new Map()

// Ids of the species this one evolves into next; empty when fully evolved.
async function fetchEvolutions(id) {
  if (evolutionCache.has(id)) return evolutionCache.get(id)
  const getJson = async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`PokéAPI ${url}: ${res.status}`)
    return res.json()
  }
  const promise = (async () => {
    const species = await getJson(`${POKEAPI_SPECIES}/${id}`)
    const { chain } = await getJson(species.evolution_chain.url)
    const find = (node) => (node.species.name === species.name ? node : node.evolves_to.map(find).find(Boolean))
    return (find(chain)?.evolves_to ?? []).map((n) => Number(n.species.url.split('/').at(-2)))
  })()
  evolutionCache.set(id, promise)
  promise.catch(() => evolutionCache.delete(id))
  return promise
}

function boostedBase(base, { shiny, night }) {
  const boost = (shiny ? SHINY_STAT_BONUS : 1) * (night ? NIGHT_STAT_BONUS : 1)
  return boost === 1 ? base : Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * boost)]))
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
  const base = boostedBase(species.base, { shiny, night })
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
    fx: freshFx(),
  }
}

// Battle-only effects (status, stat stages, shields); reset at the start of every battle.
function freshFx() {
  return { status: null, atk: 1, def: 1, shield: false, dodge: false, sturdy: false }
}

const abilityOf = (f) => f.types[0]
const pretty = (name) => name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

function power(f) {
  return f.maxHp + f.attack + f.defense + f.speed
}

function immune(moveType, defender) {
  return (IMMUNITIES[moveType] ?? []).some((t) => defender.types.includes(t))
}

function damage(attacker, defender, movePower, { critRate = 1 / 16, mult = 1 } = {}) {
  const crit = Math.random() < critRate
  const atk = attacker.attack * (attacker.fx?.atk ?? 1)
  const def = defender.defense * (defender.fx?.def ?? 1)
  const raw = (((2 * attacker.level) / 5 + 2) * movePower * atk) / def / 50 + 2
  const roll = 0.85 + Math.random() * 0.15
  return { amount: Math.max(1, Math.floor(raw * roll * (crit ? 1.5 : 1) * mult)), crit }
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

export function createGame({ fetchPokemon = fetchSpecies, fetchNextEvolutions = fetchEvolutions, store = defaultStore() } = {}) {
  async function load(id) {
    const s = id && (await store.get(id))
    if (!s) throw new GameError('Unknown session. Start a new trial', 404)
    return s
  }

  // Loads a session, runs an action on it, and saves it back if anything changed.
  function withSession(action) {
    return async (args) => {
      const s = await load(args.sessionId)
      const before = JSON.stringify(s)
      const result = await action(s, args)
      if (JSON.stringify(s) !== before) await store.set(s.id, s)
      return result
    }
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

  // Every aura Pokémon you own, in the party or the box, powers up the whole party.
  const auraBoost = (s) => 1 + AURA_BONUS * [...s.party, ...s.box].filter((m) => m.aura).length

  function score(s) {
    const elim = s.eliminated.reduce((sum, w) => sum + w.level * 10 * (w.titan ? TITAN_SCORE_MULT : 1), 0)
    const caught = s.caught.reduce(
      (sum, c) => sum + c.level * 20 + BALLS[c.ball].bonus + RARITIES[c.rarity].bonus * (c.shiny ? 2 : 1),
      0,
    )
    const finalPower =
      Math.round(s.party.reduce((sum, m) => sum + power(m), 0) * auraBoost(s)) +
      Math.round(s.box.reduce((sum, m) => sum + power(m), 0) * 0.25)
    const blackoutPenalty = s.blackouts * BLACKOUT_PENALTY
    return { eliminatedPoints: elim, caughtPoints: caught, finalPower, blackoutPenalty, total: elim + caught + finalPower - blackoutPenalty }
  }

  const abilityView = (f) => ({ type: abilityOf(f), ...TYPE_ABILITIES[abilityOf(f)] })

  function memberView(m, boost = 1) {
    return {
      uid: m.uid, id: m.id, name: m.name, types: m.types, sprite: m.sprite, backSprite: m.backSprite,
      level: m.level, hp: m.hp, maxHp: m.maxHp, baseSpeed: m.base.speed, power: Math.round(power(m) * boost),
      xp: m.xp, xpNext: m.xpNext, fainted: m.fainted, shiny: m.shiny, rarity: m.rarity,
      aura: Boolean(m.aura), ability: abilityView(m),
    }
  }

  function view(s) {
    const p = active(s)
    const w = s.wild
    const boost = auraBoost(s)
    return {
      sessionId: s.id,
      location: s.location,
      phase: s.phase,
      player: memberView(p, boost),
      party: s.party.map((m) => memberView(m, boost)),
      active: s.active,
      box: s.box.map((m) => memberView(m)),
      wild: w && {
        id: w.id, name: w.name, types: w.types, sprite: w.sprite, level: w.level, hp: w.hp, maxHp: w.maxHp,
        baseSpeed: w.base.speed, shiny: w.shiny, night: w.night, rarity: w.rarity, titan: Boolean(w.titan),
        ability: abilityView(w),
      },
      time: { ...clock(s), dayMs: DAY_MS, nightMs: NIGHT_MS },
      levelBonus: levelBonus(s),
      auraBoost: boost,
      dex: Object.values(s.dex ?? {})
        .sort((a, b) => a.id - b.id)
        .map((e) => ({ ...e, ability: TYPE_ABILITIES[e.types[0]] })),
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
      eliminated: s.eliminated.map(({ name, level, titan }) => ({ name, level, titan: Boolean(titan) })),
      blackouts: s.blackouts,
      encounters: s.encounters,
      score: score(s).total,
      finished: s.finished,
    }
  }

  async function spawnWild(s) {
    const titan = s.encounters >= TITAN_MIN_ENCOUNTERS && Math.random() < TITAN_CHANCE
    const rarity = titan ? 'titan' : rollRarity()
    const r = RARITIES[rarity]
    const species = await fetchPokemon(pick(r.ids))
    const { night } = clock(s)
    const level = Math.min(MAX_LEVEL, between(...r.levels) + levelBonus(s))
    const shiny = Math.random() < (night ? NIGHT_SHINY_CHANCE : SHINY_CHANCE)
    s.wild = makeFighter(species, level, { shiny, night, rarity })
    if (titan) {
      s.wild.titan = true
      s.wild.maxHp *= TITAN_HP
      s.wild.hp = s.wild.maxHp
      s.wild.attack = Math.round(s.wild.attack * TITAN_ATTACK)
    }
    s.phase = 'explore'
  }

  // Records a species in the Pokédex.
  function register(s, f, how) {
    s.dex ??= {}
    const entry = (s.dex[f.id] ??= { id: f.id, name: f.name, types: f.types, sprite: f.sprite, shiny: f.shiny, count: 0, shinyCaught: false, how })
    if (how === 'caught') {
      entry.count += 1
      entry.shinyCaught ||= f.shiny
      entry.how = 'caught'
    }
  }

  const nameOf = (s, f) => (f === s.wild ? `${f.titan ? 'Titan' : 'Wild'} ${pretty(f.name)}` : pretty(f.name))
  const hps = (s) => ({ playerHp: active(s).hp, wildHp: s.wild.hp })

  // Applies a hit after Aqua Shield, the aura and Sturdy. Returns the HP actually lost.
  function land(s, target, amount, notes) {
    const fx = target.fx
    if (fx.shield) {
      fx.shield = false
      amount = Math.max(1, Math.floor(amount / 2))
      notes.push(`${nameOf(s, target)}'s Aqua Shield softened the blow!`)
    }
    if (target !== s.wild) amount = Math.max(1, Math.round(amount / auraBoost(s)))
    if (abilityOf(target) === 'rock' && !fx.sturdy && target.hp > 1 && amount >= target.hp) {
      fx.sturdy = true
      amount = target.hp - 1
      notes.push(`${nameOf(s, target)} endured the hit with Sturdy!`)
    }
    target.hp = Math.max(0, target.hp - amount)
    return amount
  }

  // The attacker's type ability, triggered after it lands a hit.
  function afterHit(s, user, target, dealt, notes) {
    const u = nameOf(s, user)
    const t = nameOf(s, target)
    const roll = (p) => Math.random() < p
    const inflict = (kind) => {
      if (target.hp === 0 || target.fx.status) return
      target.fx.status = { kind, turns: STATUS[kind].turns }
      notes.push(`${t} was ${STATUS[kind].label}!`)
    }
    const heal = (amount, why) => {
      const before = user.hp
      user.hp = Math.min(user.maxHp, user.hp + amount)
      if (user.hp > before) notes.push(`${u} ${why} ${user.hp - before} HP!`)
    }
    switch (abilityOf(user)) {
      case 'normal':
        if (target.hp > 0 && roll(0.25)) notes.push(`Double Hit! ${u} struck again for ${land(s, target, Math.max(1, Math.floor(dealt / 2)), notes)}.`)
        break
      case 'fire': if (roll(0.3)) inflict('burn'); break
      case 'electric': if (roll(0.3)) inflict('paralyze'); break
      case 'ice': if (roll(0.2)) inflict('freeze'); break
      case 'poison': if (roll(0.4)) inflict('poison'); break
      case 'psychic': if (roll(0.3)) inflict('confuse'); break
      case 'grass': heal(Math.ceil(dealt * 0.4), 'leeched'); break
      case 'fairy': if (roll(0.3)) heal(Math.ceil(user.maxHp * 0.15), 'made a Wish and healed'); break
      case 'water':
        if (!user.fx.shield && roll(0.3)) {
          user.fx.shield = true
          notes.push(`${u} raised an Aqua Shield!`)
        }
        break
      case 'flying':
        if (!user.fx.dodge && roll(0.3)) {
          user.fx.dodge = true
          notes.push(`${u} is ready to dodge the next attack!`)
        }
        break
      case 'dragon':
        if (user.fx.atk < MAX_STAGE && roll(0.3)) {
          user.fx.atk = Math.min(MAX_STAGE, user.fx.atk * 1.2)
          notes.push(`${u}'s Dragon Rage raised its attack!`)
        }
        break
      case 'steel':
        if (user.fx.def < MAX_STAGE && roll(0.3)) {
          user.fx.def = Math.min(MAX_STAGE, user.fx.def * 1.25)
          notes.push(`${u}'s Iron Guard raised its defense!`)
        }
        break
      case 'dark':
        if (target.fx.atk > 1 / MAX_STAGE && roll(0.3)) {
          target.fx.atk = Math.max(1 / MAX_STAGE, target.fx.atk * 0.8)
          notes.push(`${u}'s Intimidate lowered ${t}'s attack!`)
        }
        break
    }
  }

  // One damaging move from user to target, with abilities applied on both sides.
  function strike(s, user, target, move, movePower, { checks = true } = {}) {
    const ability = abilityOf(user)
    const notes = []
    if (checks && ability !== 'ghost' && immune(move.type, target)) return { immune: true, notes }
    if (checks && ability !== 'ghost' && Math.random() >= move.accuracy) return { miss: true, notes }
    if (target.fx.dodge) {
      target.fx.dodge = false
      return { miss: true, notes: [`${nameOf(s, target)} dodged it with Evasion!`] }
    }
    let mult = user === s.wild ? 1 : auraBoost(s)
    if (ability === 'ground' && Math.random() < 0.25) {
      mult *= 1.5
      notes.push('Aftershock! The ground shook for extra damage!')
    }
    if (ability === 'bug' && user.hp < user.maxHp / 3) {
      mult *= 1.5
      notes.push(`Swarm powered up ${nameOf(s, user)}!`)
    }
    const { amount, crit } = damage(user, target, movePower, { critRate: ability === 'fighting' ? 1 / 4 : 1 / 16, mult })
    const dealt = land(s, target, amount, notes)
    afterHit(s, user, target, dealt, notes)
    return { damage: dealt, crit, notes }
  }

  // Paralysis, freezing and confusion can stop a Pokémon before it moves.
  function statusCheck(s, f, actor) {
    const st = f.fx.status
    if (!st || !['paralyze', 'freeze', 'confuse'].includes(st.kind)) return null
    st.turns -= 1
    if (st.turns <= 0) f.fx.status = null
    const n = nameOf(s, f)
    let text = null
    if (st.kind === 'freeze') text = `${n} is frozen solid and can't move!`
    else if (st.kind === 'paralyze' && Math.random() < 0.4) text = `${n} is paralyzed! It can't move!`
    else if (st.kind === 'confuse' && Math.random() < 0.5) {
      const { amount } = damage(f, f, 40)
      f.hp = Math.max(0, f.hp - amount)
      text = `${n} is confused and hurt itself for ${amount}!`
    }
    return text && { actor, kind: 'status', text, ...hps(s) }
  }

  // Burn and poison hurt at the end of each round.
  function statusTick(s, f, actor) {
    const st = f.fx.status
    if (!st || !STATUS[st.kind].tick || f.hp === 0) return null
    const amount = Math.max(1, Math.floor((f.maxHp / (f.titan ? TITAN_HP : 1)) * STATUS[st.kind].tick))
    f.hp = Math.max(0, f.hp - amount)
    st.turns -= 1
    if (st.turns <= 0) f.fx.status = null
    return { actor, kind: 'status', text: `${nameOf(s, f)} is hurt by ${st.kind === 'burn' ? 'its burn' : 'poison'}! (-${amount})`, ...hps(s) }
  }

  // Against a Titan, every other Pokémon you own (party and box) joins in.
  function teamAssist(s) {
    const p = active(s)
    const helpers = [...s.party.filter((m) => m !== p && !m.fainted), ...s.box]
    if (!helpers.length) return null
    let total = 0
    for (const m of helpers) {
      if (!immune(m.moves[1].type, s.wild)) total += damage(m, s.wild, ASSIST_POWER, { mult: auraBoost(s) }).amount
    }
    s.wild.hp = Math.max(0, s.wild.hp - total)
    return { actor: 'team', kind: 'team', names: helpers.map((m) => m.name), damage: total, ...hps(s) }
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
    } else {
      Object.assign(event, strike(s, p, s.wild, move, move.power))
    }
    return { ...event, ...hps(s) }
  }

  // Wild Pokémon ignore immunities and never miss, as before; abilities still apply.
  function wildAct(s) {
    const slot = Math.random() < WILD_STRONG_CHANCE ? 1 : 0
    const move = s.wild.moves[slot]
    const hit = strike(s, s.wild, active(s), move, WILD_MOVE_POWER[slot], { checks: false })
    return { actor: 'wild', ability: move.name, kind: 'wild', type: move.type, ...hit, ...hps(s) }
  }

  // One side's go: a status may stop it, otherwise it attacks. Titans also face your whole team.
  function turn(s, actor, ability) {
    const f = actor === 'player' ? active(s) : s.wild
    const blocked = statusCheck(s, f, actor)
    const events = blocked ? [blocked] : []
    if (!blocked) events.push(actor === 'player' ? playerAct(s, ability) : wildAct(s))
    if (actor === 'player' && s.wild.titan && s.wild.hp > 0 && active(s).hp > 0) {
      const assist = teamAssist(s)
      if (assist) events.push(assist)
    }
    return events
  }

  // Moves the session out of 'battle' once either side faints.
  function settle(s) {
    const p = active(s)
    if (s.wild.hp === 0) {
      p.xp += s.wild.level * 10 * (s.wild.titan ? TITAN_XP : 1)
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

  // Turns the Pokémon into its next evolution (a random one when it branches, like Eevee).
  // Keeps level, XP, shininess and night boost. Returns the old name, or null if it can't evolve.
  async function evolve(s, p) {
    const next = await fetchNextEvolutions(p.id).catch((err) => {
      console.error(err)
      return []
    })
    if (!next.length) return null
    const species = await fetchPokemon(pick(next))
    const from = p.name
    Object.assign(p, {
      id: species.id,
      name: species.name,
      types: species.types,
      sprite: (p.shiny && species.shinySprite) || species.sprite,
      backSprite: (p.shiny && species.shinyBackSprite) || species.backSprite,
      base: boostedBase(species.base, p),
      moves: movesFor(species),
    })
    p.pp = p.moves.map((m) => m.pp)
    register(s, p, 'evolved')
    return from
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
      register(s, s.party[0], 'starter')
      await store.set(s.id, s)
      return view(s)
    },

    state: withSession(async (s) => view(s)),

    enter: withSession(async (s) => {
      if (s.finished) throw new GameError('The trial is over')
      if (s.location !== 'lobby') throw new GameError('You are already in the arena')
      if (!anyHealthy(s)) throw new GameError('Your whole team has fainted. Visit the Healing Center first')
      if (active(s).fainted) s.active = s.party.findIndex((m) => !m.fainted)
      s.location = 'arena'
      if (!s.wild) await spawnWild(s)
      s.phase = 'explore'
      return view(s)
    }),

    leave: withSession(async (s) => {
      if (s.location !== 'arena' || s.phase !== 'explore') throw new GameError('You cannot leave right now')
      s.location = 'lobby'
      return view(s)
    }),

    heal: withSession(async (s) => {
      if (s.location !== 'lobby') throw new GameError('The Healing Center is in the lobby')
      for (const m of [...s.party, ...s.box]) {
        m.hp = m.maxHp
        m.fainted = false
        m.pp = m.moves.map((mv) => mv.pp)
      }
      for (const [k, b] of Object.entries(BALLS)) s.balls[k] = Math.max(s.balls[k], b.start)
      return view(s)
    }),

    swap: withSession(async (s, { slot }) => {
      if (s.phase !== 'explore') throw new GameError('Use the SWITCH menu during battle')
      requireSlot(s, slot)
      s.active = slot
      return view(s)
    }),

    battle: withSession(async (s) => {
      if (s.location !== 'arena' || s.phase !== 'explore' || !s.wild) throw new GameError('No wild Pokémon to battle')
      if (active(s).fainted) throw new GameError('Switch to a healthy Pokémon first')
      s.phase = 'battle'
      for (const m of s.party) {
        m.pp = m.moves.map((mv) => mv.pp)
        m.fx = freshFx()
      }
      s.wild.fx = freshFx()
      return view(s)
    }),

    attack: withSession(async (s, { ability }) => {
      if (s.phase !== 'battle') throw new GameError('You are not in a battle')
      const p = active(s)
      if (!p.moves[ability]) throw new GameError('Unknown ability')
      if (p.pp[ability] <= 0) throw new GameError('No PP left for that ability')
      p.pp[ability] -= 1

      const events = []
      const playerFirst = p.speed >= s.wild.speed
      const order = playerFirst ? ['player', 'wild'] : ['wild', 'player']
      for (const actor of order) {
        events.push(...turn(s, actor, ability))
        if (p.hp === 0 || s.wild.hp === 0) break
      }
      for (const actor of order) {
        if (p.hp === 0 || s.wild.hp === 0) break
        const tick = statusTick(s, actor === 'player' ? p : s.wild, actor)
        if (tick) events.push(tick)
      }
      return { events, result: settle(s), state: view(s) }
    }),

    switch: withSession(async (s, { slot }) => {
      if (s.phase !== 'battle' && s.phase !== 'fainted') throw new GameError('You are not in a battle')
      if (slot === s.active) throw new GameError('That Pokémon is already battling')
      requireSlot(s, slot)
      const forced = s.phase === 'fainted'
      s.active = slot
      s.phase = 'battle'
      // Switching voluntarily costs your turn; replacing a fainted Pokémon is free.
      const events = forced ? [] : turn(s, 'wild')
      return { events, result: forced ? 'ongoing' : settle(s), state: view(s) }
    }),

    run: withSession(async (s) => {
      if (s.phase !== 'battle') throw new GameError('You are not in a battle')
      const fled = s.wild.name
      await spawnWild(s) // the old one is gone; something new wanders in
      return { fled, state: view(s) }
    }),

    catch: withSession(async (s, { ball }) => {
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
        if (s.phase === 'battle') active(s).xp += wild.level * 10 * (wild.titan ? TITAN_XP : 1) // a defeated Pokémon already paid XP
        s.caught.push({ name: wild.name, level: wild.level, ball, shiny: wild.shiny, rarity: wild.rarity })
        register(s, wild, 'caught')
        if (wild.titan) {
          // A caught Titan shrinks to normal size but keeps a glowing aura that powers up your party.
          wild.titan = false
          wild.aura = true
          Object.assign(wild, statsFor(wild))
        }
        Object.assign(wild, { hp: wild.maxHp, fainted: false, pp: wild.moves.map((m) => m.pp), fx: freshFx() })
        destination = s.party.length < PARTY_SIZE ? 'party' : 'box'
        ;(destination === 'party' ? s.party : s.box).push(wild)
        await resolveEncounter(s)
        result = 'caught'
      } else if (s.phase === 'battle') {
        // A failed throw mid-battle gives the wild Pokémon a free attack.
        events.push(...turn(s, 'wild'))
        result = settle(s)
      }
      return { caught, ball, pokemon: wild.name, destination, events, result, state: view(s) }
    }),

    eliminate: withSession(async (s) => {
      if (s.phase !== 'won') throw new GameError('Win the battle before eliminating')
      s.eliminated.push({ name: s.wild.name, level: s.wild.level, titan: Boolean(s.wild.titan) })
      await resolveEncounter(s)
      return view(s)
    }),

    upgrade: withSession(async (s) => {
      if (!canUpgrade(s)) throw new GameError('Your Pokémon cannot be upgraded right now')
      const p = active(s)
      p.xp -= p.xpNext
      p.level += UPGRADE_LEVELS
      p.xpNext = p.level * 20
      const evolvedFrom = await evolve(s, p)
      Object.assign(p, statsFor(p))
      p.hp = p.maxHp
      return { ...view(s), evolvedFrom }
    }),

    end: withSession(async (s) => {
      if (s.location !== 'lobby') throw new GameError('Return to the lobby to end the trial')
      s.finished = true
      s.phase = 'done'
      return view(s)
    }),

    results: withSession(async (s) => {
      if (!s.finished) throw new GameError('The trial is not finished yet')
      return { ...view(s), breakdown: score(s) }
    }),
  }
}
