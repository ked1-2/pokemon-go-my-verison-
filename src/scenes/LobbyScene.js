import Phaser from 'phaser'
import { api } from '../api.js'
import { Hud } from '../hud.js'
import { BALLS, RARITY_COLORS, TYPE_COLORS, bake, button, capitalize, displayName, loadSprites, setAura, text, textureKey } from '../ui.js'

const PANEL_TOP = 490
const FIELD_TOP = 70
const INTERACT_RANGE = 70
const DEX_COLS = 4
const DEX_ROWS = 4

const NPC_SPECIES = [
  { id: 113, name: 'chansey', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/113.png' },
  { id: 122, name: 'mr-mime', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/122.png' },
  { id: 25, name: 'pikachu', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png' },
  { id: 133, name: 'eevee', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/133.png' },
  { id: 39, name: 'jigglypuff', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/39.png' },
  { id: 137, name: 'porygon', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/137.png' },
]

const TIPS = {
  pikachu: [
    'Pika! Every Pokémon you eliminate makes the next wild ones 2 levels higher.',
    'Pika! Every Pokémon has an ability from its type. Fire burns, grass leeches, electric paralyzes!',
    'Pika! Ghost types shrug off Normal and Fighting moves. Try another ability!',
    'Pika pika! Flying types float right over Ground moves.',
    'Fairy types are immune to Dragon moves. Switch with 1-4 if you get stuck!',
  ],
  eevee: [
    'Vee! Press U when the upgrade button shows up. Pokémon that can evolve will evolve, like Magikarp into Gyarados!',
    'Vee! Shiny Pokémon sparkle. They are rare, stronger, and harder to catch.',
    'The higher a wild Pokémon\'s level, the harder it is to catch. Lv 50s barely fit in a ball!',
    'Epic and legendary Pokémon roam the arena sometimes. Press Q to run if they are too strong.',
    'Vee~ At night wild Pokémon get stronger, but shinies show up much more often!',
  ],
  jigglypuff: [
    'Jiggly~ Watch out for TITANS! They are huge bosses, but every Pokémon you own fights them with you.',
    'Jiggly~ Catch a Titan and it glows with an aura that makes your whole team stronger!',
    'Jiggly~ Get a wild Pokémon below 30% HP, then press X to throw a ball.',
    'Your party holds 4 Pokémon. Extra catches go to the box in the Stats Hall.',
    'If your whole team faints you black out. Chansey will patch everyone up here for free!',
  ],
}

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('lobby')
  }

  init({ state, message }) {
    this.state = state
    this.startMessage = message
    // Phaser reuses this scene object on every visit; drop the last visit's
    // (now destroyed) sprites so update() can't touch them while loading.
    this.player = null
    this.target = null
    this.mode = 'busy' // walk | busy | dialog | stats | confirm
    this.tipIndex = {}
  }

  async create() {
    const { width, height } = this.scale
    this.drawLobby()
    this.hud = new Hud(this, { onSlot: (i) => this.swap(i) })
    this.hud.update(this.state)

    this.add.rectangle(width / 2, (PANEL_TOP + height) / 2, width, height - PANEL_TOP, 0x14213d)
    this.message = text(this, width / 2, PANEL_TOP + 16, '', { fontSize: '16px', align: 'center', wordWrap: { width: 740 } }).setOrigin(0.5, 0)
    this.panel = this.add.container(0, 0)
    this.prompt = text(this, 0, 0, '', { fontSize: '13px', fontStyle: 'bold', backgroundColor: '#000000cc', padding: { x: 6, y: 3 } })
      .setOrigin(0.5, 1)
      .setDepth(30)
      .setVisible(false)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys('W,A,S,D')
    this.input.keyboard.on('keydown', (e) => this.onKey(e.key.toLowerCase()))

    await loadSprites(this, [...NPC_SPECIES, ...this.state.party])
    this.player = this.physics.add.sprite(400, 320, textureKey(this.state.player)).setDepth(10)
    this.player.setCollideWorldBounds(true)
    this.player.body.setSize(40, 40)
    setAura(this.player, this.state.player.aura)
    this.physics.world.setBounds(0, FIELD_TOP + 140, width, PANEL_TOP - FIELD_TOP - 140)
    this.createNpcs()
    this.walk(this.startMessage)
  }

  // ---------- scenery ----------

  drawLobby() {
    const { width } = this.scale
    bake(this, width, PANEL_TOP, (g) => {
      // Plaza
      g.fillStyle(0x8bc34a).fillRect(0, FIELD_TOP, width, PANEL_TOP - FIELD_TOP)
      for (let y = FIELD_TOP + 150; y < PANEL_TOP; y += 32) {
        for (let x = 40; x < width - 40; x += 32) {
          g.fillStyle((x + y) % 64 === 0 ? 0xe0d6c3 : 0xd7ccb5).fillRect(x, y, 32, 32)
        }
      }
      // Healing Center (left)
      g.fillStyle(0xfce4ec).fillRect(50, 120, 200, 110)
      g.fillStyle(0xe53935).fillTriangle(30, 125, 150, 78, 270, 125)
      g.fillStyle(0xffffff).fillRect(138, 92, 24, 8).fillRect(146, 84, 8, 24)
      g.fillStyle(0x4fc3f7).fillRect(120, 180, 60, 50)
      // Stats Hall (right)
      g.fillStyle(0xe3f2fd).fillRect(550, 120, 200, 110)
      g.fillStyle(0x1e88e5).fillTriangle(530, 125, 650, 78, 770, 125)
      g.fillStyle(0xffd54f).fillRect(620, 180, 60, 50)
      // Pokédex lab (top centre)
      g.fillStyle(0xede7f6).fillRect(340, 140, 120, 80)
      g.fillStyle(0x7e57c2).fillTriangle(325, 144, 400, 104, 475, 144)
      g.fillStyle(0x9575cd).fillRect(385, 180, 30, 40)
      // Arena gate (bottom centre)
      g.fillStyle(0x6d4c41).fillRect(340, PANEL_TOP - 62, 14, 62).fillRect(446, PANEL_TOP - 62, 14, 62)
      g.fillStyle(0xc62828).fillRect(330, PANEL_TOP - 74, 140, 18)
      // End Trial signpost (bottom left)
      g.fillStyle(0x795548).fillRect(86, PANEL_TOP - 50, 8, 50)
      g.fillStyle(0xffecb3).fillRect(50, PANEL_TOP - 80, 80, 34)
    })
    text(this, 150, 135, 'HEALING\nCENTER', { fontSize: '15px', fontStyle: 'bold', color: '#c62828', align: 'center' }).setOrigin(0.5, 0)
    text(this, 650, 135, 'STATS\nHALL', { fontSize: '15px', fontStyle: 'bold', color: '#1565c0', align: 'center' }).setOrigin(0.5, 0)
    text(this, 400, 150, 'POKÉDEX', { fontSize: '13px', fontStyle: 'bold', color: '#4527a0' }).setOrigin(0.5, 0)
    text(this, 400, PANEL_TOP - 65, 'ARENA ▼', { fontSize: '13px', fontStyle: 'bold' }).setOrigin(0.5)
    text(this, 90, PANEL_TOP - 63, 'END\nTRIAL', { fontSize: '11px', fontStyle: 'bold', color: '#5d4037', align: 'center' }).setOrigin(0.5)
  }

  createNpcs() {
    const npc = (id, x, y) => this.add.image(x, y, `poke-${id}`).setDepth(9)
    this.interactables = [
      { sprite: npc(113, 150, 262), label: 'Heal with Chansey', action: () => this.heal() },
      { sprite: npc(122, 650, 262), label: 'Stats with Mr. Mime', action: () => this.showStats() },
      { sprite: npc(137, 400, 246), label: 'Open the Pokédex [P]', action: () => this.showDex() },
      { x: 400, y: PANEL_TOP - 30, label: 'Enter the arena', action: () => this.enterArena() },
      { x: 90, y: PANEL_TOP - 40, label: 'End the trial', action: () => this.confirmEnd() },
    ]
    // Wanderers stay clear of the spawn point and the arena gate.
    const homes = { pikachu: [250, 330], eevee: [560, 340], jigglypuff: [620, 420] }
    for (const [name, [hx, hy]] of Object.entries(homes)) {
      const id = NPC_SPECIES.find((n) => n.name === name).id
      const sprite = npc(id, hx, hy).setScale(0.8)
      const wanderer = { sprite, label: `Talk to ${capitalize(name)}`, action: () => this.talk(name), home: { x: sprite.x, y: sprite.y } }
      this.interactables.push(wanderer)
      this.time.addEvent({ delay: Phaser.Math.Between(1500, 2800), loop: true, callback: () => this.stroll(wanderer) })
    }
  }

  stroll(npc) {
    if (this.mode === 'dialog' && this.target === npc) return
    const x = Phaser.Math.Clamp(npc.home.x + Phaser.Math.Between(-60, 60), 60, 740)
    const y = Phaser.Math.Clamp(npc.home.y + Phaser.Math.Between(-35, 35), FIELD_TOP + 170, PANEL_TOP - 60)
    npc.sprite.setFlipX(x > npc.sprite.x)
    this.tweens.add({ targets: npc.sprite, x, y, duration: 1200, ease: 'Sine.InOut' })
  }

  // ---------- modes & input ----------

  walk(msg) {
    this.mode = 'walk'
    this.panel.removeAll(true)
    this.message.setText(msg ?? 'Welcome to the lobby! Walk with WASD, press E near someone to interact, 1-4 to switch Pokémon.')
    const opts = [{ label: 'ARENA ▼', action: () => this.enterArena(), color: '#c62828' }]
    if (this.state.canUpgrade) opts.unshift({ label: '▲ UPGRADE [U]', action: () => this.upgrade(), color: '#2e7d32' })
    opts.forEach((o, i) => this.panel.add(button(this, 400 + (i - (opts.length - 1) / 2) * 220, this.scale.height - 32, o.label, o.action, { color: o.color, width: 190 })))
  }

  dialog(msg, options = []) {
    this.mode = options.length ? 'confirm' : 'dialog'
    this.prompt.setVisible(false)
    this.player.setVelocity(0, 0)
    this.panel.removeAll(true)
    this.message.setText(msg + (options.length ? '' : '   [E]'))
    this.dialogKeys = {}
    options.forEach((o, i) => {
      this.panel.add(button(this, 400 + (i - (options.length - 1) / 2) * 200, this.scale.height - 32, o.label, o.action, { color: o.color, width: 170 }))
      this.dialogKeys[o.key] = o.action
    })
  }

  onKey(key) {
    if (this.mode === 'walk') {
      if (key === 'e' && this.target) this.target.action()
      else if (['1', '2', '3', '4'].includes(key)) this.swap(Number(key) - 1)
      else if (key === 'u') this.upgrade()
      else if (key === 'p') this.showDex()
    } else if (this.mode === 'dialog' && (key === 'e' || key === ' ' || key === 'escape')) {
      this.walk()
    } else if (this.mode === 'confirm') {
      this.dialogKeys[key]?.()
    } else if (this.mode === 'stats' && (key === 'e' || key === 'escape')) {
      this.statsLayer.destroy()
      this.walk()
    } else if (this.mode === 'dex') {
      if (key === 'e' || key === 'escape' || key === 'p') {
        this.dexLayer.destroy()
        this.walk()
      } else if (key === 'arrowright' || key === 'd') this.showDex(this.dexPage + 1)
      else if (key === 'arrowleft' || key === 'a') this.showDex(this.dexPage - 1)
    }
  }

  update() {
    if (!this.player) return
    if (this.mode !== 'walk') {
      this.player.setVelocity(0, 0)
      return
    }
    const left = this.cursors.left.isDown || this.wasd.A.isDown
    const right = this.cursors.right.isDown || this.wasd.D.isDown
    const up = this.cursors.up.isDown || this.wasd.W.isDown
    const down = this.cursors.down.isDown || this.wasd.S.isDown
    const dir = new Phaser.Math.Vector2((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0)).normalize().scale(220)
    this.player.setVelocity(dir.x, dir.y)
    if (dir.x !== 0) this.player.setFlipX(dir.x > 0)

    // Highlight the closest thing you can interact with.
    let best = null
    let bestDist = INTERACT_RANGE
    for (const it of this.interactables) {
      const pos = it.sprite ?? it
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, pos.x, pos.y)
      if (d < bestDist) {
        best = it
        bestDist = d
      }
    }
    this.target = best
    if (best) {
      const pos = best.sprite ?? best
      this.prompt.setText(`[E] ${best.label}`).setPosition(pos.x, pos.y - 44).setVisible(true)
    } else {
      this.prompt.setVisible(false)
    }
  }

  // ---------- actions ----------

  async call(task) {
    this.mode = 'busy'
    this.player.setVelocity(0, 0)
    try {
      await task()
    } catch (err) {
      this.dialog(err.message)
    }
  }

  setState(state) {
    this.state = state
    this.hud.update(state)
  }

  heal() {
    return this.call(async () => {
      this.setState(await api.heal(this.state.sessionId))
      for (let i = 0; i < 12; i++) {
        const s = this.add.star(150 + Phaser.Math.Between(-60, 60), 260, 4, 3, 8, 0xf48fb1).setDepth(20)
        this.tweens.add({ targets: s, y: 170, alpha: 0, angle: 180, delay: i * 50, duration: 700, onComplete: () => s.destroy() })
      }
      this.dialog(`Chansey: Your team is fully healed! I also restocked all your balls. ♥`)
    })
  }

  talk(name) {
    const lines = TIPS[name]
    const i = this.tipIndex[name] ?? 0
    this.tipIndex[name] = (i + 1) % lines.length
    this.dialog(`${capitalize(name)}: ${lines[i]}`)
  }

  swap(slot) {
    if (this.mode !== 'walk' || slot === this.state.active || !this.state.party[slot]) return
    return this.call(async () => {
      this.setState(await api.swap(this.state.sessionId, slot))
      await loadSprites(this, [this.state.player])
      this.player.setTexture(textureKey(this.state.player))
      setAura(this.player, this.state.player.aura)
      this.walk(`Go, ${displayName(this.state.player)}!`)
    })
  }

  upgrade() {
    if (this.mode !== 'walk' || !this.state.canUpgrade) return
    return this.call(async () => {
      const { evolvedFrom, ...state } = await api.upgrade(this.state.sessionId)
      this.setState(state)
      const p = state.player
      await loadSprites(this, [p])
      this.player.setTexture(textureKey(p))
      setAura(this.player, p.aura)
      this.walk(
        evolvedFrom
          ? `What? ${capitalize(evolvedFrom)} evolved into ${displayName(p)}! Now Lv ${p.level}.`
          : `${displayName(p)} was upgraded to Lv ${p.level}!`,
      )
    })
  }

  enterArena() {
    if (this.mode !== 'walk') return
    return this.call(async () => {
      const state = await api.enter(this.state.sessionId)
      this.cameras.main.fadeOut(300)
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('arena', { state }))
    })
  }

  confirmEnd() {
    this.dialog('End the trial and see your final results? You cannot come back afterwards.', [
      { label: 'Yes, end it [Y]', key: 'y', color: '#c62828', action: () => this.endTrial() },
      { label: 'Not yet [N]', key: 'n', color: '#455a64', action: () => this.walk() },
    ])
  }

  endTrial() {
    return this.call(async () => {
      await api.end(this.state.sessionId)
      this.scene.start('results', { sessionId: this.state.sessionId })
    })
  }

  // ---------- stats hall ----------

  async showStats() {
    this.mode = 'stats'
    this.prompt.setVisible(false)
    const s = this.state
    await loadSprites(this, [...s.party, ...s.box])
    const layer = this.add.container(0, 0).setDepth(50)
    this.statsLayer = layer
    layer.add(this.add.rectangle(400, 300, 800, 600, 0x0d1b2a, 0.96))
    layer.add(text(this, 400, 24, 'STATS HALL', { fontSize: '30px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(0.5, 0))

    const shinies = s.caught.filter((c) => c.shiny).length
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'titan']
    const rarest = [...s.caught].sort((a, b) => order.indexOf(b.rarity) - order.indexOf(a.rarity) || b.level - a.level)[0]
    const rows = [
      ['Score', s.score],
      ['Encounters', s.encounters],
      ['Caught', s.caught.length],
      ['Shinies caught', shinies],
      ['Eliminated', s.eliminated.length],
      ['Blackouts', s.blackouts],
      ['Pokédex', `${s.dex.length} species`],
      ['Titans beaten', s.eliminated.filter((e) => e.titan).length],
      ['Aura boost', s.auraBoost > 1 ? `×${s.auraBoost}` : 'none (catch a Titan!)'],
      ['Wild level bonus', `+${s.levelBonus}`],
      ['Rarest catch', rarest ? `${rarest.shiny ? '★ ' : ''}${capitalize(rarest.name)} Lv ${rarest.level} (${rarest.rarity})` : 'none yet'],
      ['Balls', BALLS.map((b) => `${b.name} ×${s.balls[b.key]}`).join('\n')],
    ]
    rows.forEach(([k, v], i) => {
      layer.add(text(this, 40, 76 + i * 30, k, { fontSize: '14px', color: '#9fa8da' }))
      layer.add(text(this, 190, 76 + i * 30, String(v), { fontSize: '14px', fontStyle: 'bold', lineSpacing: 2 }))
    })

    layer.add(text(this, 470, 80, 'PARTY', { fontSize: '14px', color: '#9fa8da' }))
    s.party.forEach((m, i) => {
      const y = 125 + i * 72
      layer.add(this.add.rectangle(600, y, 300, 64, i === s.active ? 0x283593 : 0x1e2a4a).setStrokeStyle(2, i === s.active ? 0xffd54f : 0x3949ab))
      layer.add(this.add.image(490, y - 4, textureKey(m)).setScale(0.6).setAlpha(m.fainted ? 0.4 : 1))
      layer.add(text(this, 530, y - 24, `[${i + 1}] ${displayName(m)}  Lv ${m.level}`, { fontSize: '14px', fontStyle: 'bold', color: RARITY_COLORS[m.rarity] ?? '#ffffff' }))
      layer.add(text(this, 530, y - 4, `${m.types.map((t) => t.toUpperCase()).join(' / ')}`, { fontSize: '11px', color: '#c5cae9' }))
      layer.add(text(this, 530, y + 12, `HP ${m.hp}/${m.maxHp}  ·  Power ${m.power}${m.fainted ? '  ·  FAINTED' : ''}`, { fontSize: '12px', color: m.fainted ? '#ef9a9a' : '#ffffff' }))
    })

    const box = s.box.map((m) => `${displayName(m)} Lv ${m.level}`).join(', ') || 'empty'
    layer.add(text(this, 470, 420, `BOX (${s.box.length}): ${box}`, { fontSize: '13px', color: '#c5cae9', wordWrap: { width: 310 } }))
    layer.add(button(this, 400, 560, 'Close [E]', () => this.onKey('escape'), { width: 160 }))
  }

  // ---------- pokédex ----------

  async showDex(page = 0) {
    const entries = this.state.dex
    const perPage = DEX_COLS * DEX_ROWS
    const pages = Math.max(1, Math.ceil(entries.length / perPage))
    page = Phaser.Math.Clamp(page, 0, pages - 1)
    if (this.mode === 'dex' && page === this.dexPage) return
    if (this.mode !== 'walk' && this.mode !== 'dex') return
    this.mode = 'dex'
    this.dexPage = page
    this.prompt.setVisible(false)
    this.player.setVelocity(0, 0)
    const shown = entries.slice(page * perPage, (page + 1) * perPage)
    await loadSprites(this, shown)
    this.dexLayer?.destroy()
    const layer = this.add.container(0, 0).setDepth(50)
    this.dexLayer = layer
    layer.add(this.add.rectangle(400, 300, 800, 600, 0x1a1033, 0.97))
    layer.add(text(this, 400, 16, 'POKÉDEX', { fontSize: '28px', fontStyle: 'bold', color: '#b39ddb' }).setOrigin(0.5, 0))
    const caught = entries.filter((e) => e.count > 0).length
    layer.add(text(this, 400, 52, `${entries.length} species registered  ·  ${caught} caught  ·  page ${page + 1}/${pages}`, { fontSize: '13px', color: '#d1c4e9' }).setOrigin(0.5, 0))

    if (!entries.length) layer.add(text(this, 400, 280, 'No Pokémon yet. Go catch some in the arena!', { fontSize: '16px' }).setOrigin(0.5))
    shown.forEach((e, i) => {
      const x = 22 + (i % DEX_COLS) * 191
      const y = 80 + Math.floor(i / DEX_COLS) * 112
      const typeColor = TYPE_COLORS[e.types[0]] ?? 0x9575cd
      layer.add(this.add.rectangle(x, y, 183, 104, 0x2a1f4d).setOrigin(0).setStrokeStyle(2, typeColor))
      layer.add(this.add.image(x + 34, y + 44, textureKey(e)).setScale(0.75))
      layer.add(text(this, x + 70, y + 6, `#${String(e.id).padStart(3, '0')}`, { fontSize: '10px', color: '#9e9e9e' }))
      layer.add(text(this, x + 70, y + 19, `${e.shinyCaught ? '★ ' : ''}${capitalize(e.name)}`, { fontSize: '12px', fontStyle: 'bold', color: e.shinyCaught ? '#ffd54f' : '#ffffff', fixedWidth: 110 }))
      e.types.forEach((t, j) => {
        const hex = `#${(TYPE_COLORS[t] ?? 0x9e9e9e).toString(16).padStart(6, '0')}`
        layer.add(text(this, x + 70 + j * 52, y + 38, t.toUpperCase(), { fontSize: '9px', fontStyle: 'bold', color: '#1a1033', backgroundColor: hex, padding: { x: 3, y: 1 } }))
      })
      layer.add(text(this, x + 70, y + 56, e.ability.name, { fontSize: '11px', fontStyle: 'bold', color: '#80cbc4' }))
      const how = e.count > 0 ? `Caught ×${e.count}` : e.how === 'starter' ? 'Starter' : 'Evolved'
      layer.add(text(this, x + 70, y + 72, how, { fontSize: '11px', color: '#c5cae9' }))
      layer.add(text(this, x + 8, y + 86, e.ability.desc, { fontSize: '9px', color: '#9fa8da', fixedWidth: 170 }))
    })

    const nav = [
      { label: '◀ Prev [←]', x: 230, disabled: page === 0, action: () => this.showDex(page - 1) },
      { label: 'Close [E]', x: 400, action: () => this.onKey('escape') },
      { label: 'Next [→] ▶', x: 570, disabled: page >= pages - 1, action: () => this.showDex(page + 1) },
    ]
    for (const n of nav) layer.add(button(this, n.x, 560, n.label, n.action, { width: 150, disabled: n.disabled, color: '#5e35b1' }))
  }
}
