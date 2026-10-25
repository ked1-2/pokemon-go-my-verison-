import Phaser from 'phaser'
import { api } from '../api.js'
import { Hud } from '../hud.js'
import { showUpgradeCards } from '../upgradeCards.js'
import { Bar, RARITY_COLORS, bake, button, capitalize, displayName, loadSprites, setAura, text, textureKey } from '../ui.js'

const HUD_HEIGHT = 70
const PANEL_HEIGHT = 110
const SPRITE_SCALE = 1.5
const TITAN_SCALE = 3.4
const NEAR_DISTANCE = 90
const WANDER_PAUSE_MS = [300, 1200]

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('arena')
  }

  init({ state }) {
    this.state = state
    // Phaser reuses this scene object on every visit; drop the last visit's
    // (now destroyed) sprites so update() can't touch them while loading.
    this.player = null
    this.wild = null
    this.mode = 'busy' // explore | busy
    this.wanderAt = 0
    this.wanderTarget = null
  }

  async create() {
    const { width, height } = this.scale
    this.fieldTop = HUD_HEIGHT
    this.fieldBottom = height - PANEL_HEIGHT

    this.drawField()
    this.physics.world.setBounds(0, this.fieldTop, width, this.fieldBottom - this.fieldTop)
    this.nightShade = this.add
      .rectangle(width / 2, (this.fieldTop + this.fieldBottom) / 2, width, this.fieldBottom - this.fieldTop, 0x0b1033)
      .setAlpha(0)
      .setDepth(4)
    this.hud = new Hud(this, { onSlot: (i) => this.swap(i), onTime: (night, changed) => this.setNight(night, changed) })
    this.cameras.main.fadeIn(300)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys('W,A,S,D')
    this.input.keyboard.on('keydown', (e) => this.onKey(e.key.toLowerCase()))

    this.panel = this.add.container(0, 0).setDepth(20)
    this.message = text(this, 400, height - PANEL_HEIGHT + 18, '', { fontSize: '16px', align: 'center', wordWrap: { width: 740 } })
      .setOrigin(0.5, 0)
      .setDepth(20)

    await loadSprites(this, [...this.state.party, this.state.wild])
    this.player = this.physics.add.sprite(width * 0.2, (this.fieldTop + this.fieldBottom) / 2, textureKey(this.state.player))
    this.player.setScale(SPRITE_SCALE).setCollideWorldBounds(true).setDepth(5)
    this.player.body.setSize(48, 48)
    setAura(this.player, this.state.player.aura)

    this.wildLabel = text(this, 0, 0, '', { fontSize: '13px', backgroundColor: '#000000aa', padding: { x: 4, y: 2 } })
      .setOrigin(0.5, 1)
      .setDepth(6)
    this.wildBar = new Bar(this, 0, 0, 70, 6).setDepth(6)
    this.bossLabel = text(this, 0, 0, 'BOSS', { fontSize: '26px', fontStyle: 'bold', color: '#ff1744', stroke: '#000000', strokeThickness: 5 })
      .setOrigin(0.5, 1)
      .setDepth(6)
      .setVisible(false)
    this.tweens.add({ targets: this.bossLabel, scale: 1.15, yoyo: true, repeat: -1, duration: 500 })
    this.time.addEvent({ delay: 350, loop: true, callback: () => this.shinySparkle() })

    this.spawnWild()
    this.explore()
  }

  // ---------- setup ----------

  drawField() {
    const { width } = this.scale
    bake(this, width, this.scale.height, (g) => {
      const tile = 40
      for (let y = this.fieldTop; y < this.fieldBottom; y += tile) {
        for (let x = 0; x < width; x += tile) {
          g.fillStyle(((x + y) / tile) % 2 === 0 ? 0x4caf50 : 0x469e49).fillRect(x, y, tile, tile)
        }
      }
      g.lineStyle(4, 0xffffff, 0.35).strokeCircle(width / 2, (this.fieldTop + this.fieldBottom) / 2, 90)
      g.lineBetween(width / 2, this.fieldTop, width / 2, this.fieldBottom)
      g.fillStyle(0x14213d).fillRect(0, this.fieldBottom, width, PANEL_HEIGHT)
    })
  }

  spawnWild() {
    const { width } = this.scale
    const w = this.state.wild
    // Appear on the side of the field farthest from the player.
    const x = this.player.x < width / 2 ? width - 70 : 70
    const y = Phaser.Math.Between(this.fieldTop + 60, this.fieldBottom - 60)
    if (this.wild) this.wild.destroy()
    this.wild = this.physics.add.sprite(x, y, textureKey(w)).setScale(w.titan ? TITAN_SCALE : SPRITE_SCALE).setCollideWorldBounds(true).setDepth(5)
    this.wild.body.setSize(48, 48)
    this.wild.setAlpha(0)
    this.tweens.add({ targets: this.wild, alpha: 1, duration: 400 })
    this.wanderTarget = null
    this.wanderAt = this.time.now + WANDER_PAUSE_MS[1]
    this.wildLabel.setText(`${w.night ? '☾ ' : ''}${w.titan ? 'TITAN ' : ''}${displayName(w)}  Lv ${w.level}`).setColor(RARITY_COLORS[w.rarity])
  }

  setNight(night, changed) {
    this.tweens.add({ targets: this.nightShade, alpha: night ? 0.45 : 0, duration: changed ? 1500 : 0 })
    if (!changed || this.mode !== 'explore') return
    this.message.setText(
      night
        ? 'Night has fallen... new wild Pokémon are stronger, and shinies appear far more often!'
        : 'The sun rises. Wild Pokémon are back to normal strength.',
    )
  }

  shinySparkle() {
    if (!this.wild || !this.state.wild?.shiny || this.wild.alpha < 0.5) return
    const s = this.add.star(this.wild.x + Phaser.Math.Between(-40, 40), this.wild.y + Phaser.Math.Between(-40, 30), 4, 3, 8, 0xfff59d).setDepth(7)
    this.tweens.add({ targets: s, scale: 0, angle: 90, duration: 600, onComplete: () => s.destroy() })
  }

  // ---------- modes ----------

  explore(msg) {
    this.mode = 'explore'
    this.near = false
    this.panel.removeAll(true)
    const w = this.state.wild
    const tag = `${w.shiny ? 'SHINY ' : ''}${w.rarity === 'common' ? '' : `${w.rarity.toUpperCase()} `}`
    const empowered = w.night ? ' It is empowered by the night!' : ''
    const titanMsg = `⚠ A giant TITAN ${displayName(w)} (Lv ${w.level}) appeared! All the Pokémon you've caught will fight it together. Press E to fight!`
    this.message.setText(msg ?? (w.titan ? titanMsg : null) ?? `A wild ${tag}${displayName(w).replace('★ ', '')} (Lv ${w.level}) is roaming!${empowered} Press E to fight.`)

    const opts = [
      { label: 'FIGHT! [E]', color: '#c62828', action: () => this.fight() },
      { label: 'LOBBY [L]', color: '#455a64', action: () => this.toLobby() },
    ]
    opts.forEach((o, i) =>
      this.panel.add(button(this, 400 + (i - (opts.length - 1) / 2) * 210, this.scale.height - 30, o.label, o.action, { color: o.color, width: 180 })),
    )
    this.hud.update(this.state)
    if (this.state.canUpgrade) this.offerUpgrade()
  }

  onKey(key) {
    if (this.mode !== 'explore') return
    if (key === 'e') this.fight()
    else if (key === 'l') this.toLobby()
    else if (['1', '2', '3', '4'].includes(key)) this.swap(Number(key) - 1)
  }

  async run(task) {
    this.mode = 'busy'
    this.player.setVelocity(0, 0)
    this.wild?.setVelocity(0, 0)
    this.panel.removeAll(true)
    try {
      return await task()
    } catch (err) {
      this.message.setText(err.message)
      this.time.delayedCall(1500, () => this.explore())
    }
  }

  // ---------- frame loop ----------

  update(time) {
    if (!this.player || !this.wild) return
    if (this.mode === 'explore') {
      const left = this.cursors.left.isDown || this.wasd.A.isDown
      const right = this.cursors.right.isDown || this.wasd.D.isDown
      const up = this.cursors.up.isDown || this.wasd.W.isDown
      const down = this.cursors.down.isDown || this.wasd.S.isDown
      const dir = new Phaser.Math.Vector2((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0))
      dir.normalize().scale(this.state.player.game.move)
      this.player.setVelocity(dir.x, dir.y)
      if (dir.x !== 0) this.player.setFlipX(dir.x > 0) // front sprites face left

      this.wander(time)
      const near = Phaser.Math.Distance.BetweenPoints(this.player, this.wild) < NEAR_DISTANCE
      if (near && !this.near) this.message.setText(`${displayName(this.state.wild)} is right next to you! Press E to fight!`)
      this.near = near
    }

    const visible = this.wild.alpha > 0.3 && this.wild.scale > 0.5
    this.wildLabel.setVisible(visible)
    this.bossLabel.setVisible(visible && Boolean(this.state.wild?.titan))
    this.wildBar.g.setVisible(visible)
    const top = this.wild.y - (this.wild.displayHeight / 2) * 0.6
    this.wildLabel.setPosition(this.wild.x, top - 4)
    this.bossLabel.setPosition(this.wild.x, top - 26)
    this.wildBar.setPosition(this.wild.x - 35, top + 3)
    this.wildBar.set(this.state.wild?.hp ?? 0, this.state.wild?.maxHp ?? 1)
  }

  // The wild Pokémon roams: walks to a random spot, pauses, then picks another.
  wander(time) {
    if (time < this.wanderAt) return
    const t = this.wanderTarget
    if (!t || Phaser.Math.Distance.BetweenPoints(this.wild, t) < 8) {
      this.wild.setVelocity(0, 0)
      this.wanderTarget = {
        x: Phaser.Math.Between(60, this.scale.width - 60),
        y: Phaser.Math.Between(this.fieldTop + 50, this.fieldBottom - 50),
      }
      this.wanderAt = time + Phaser.Math.Between(...WANDER_PAUSE_MS)
      return
    }
    this.physics.moveToObject(this.wild, t, this.state.wild.baseSpeed)
    this.wild.setFlipX(t.x > this.wild.x)
  }

  // ---------- actions ----------

  fight() {
    if (this.mode !== 'explore') return
    return this.run(async () => {
      this.message.setText('Battle!')
      const state = await api.battle(this.state.sessionId)
      const cam = this.cameras.main
      cam.flash(250, 255, 255, 255)
      cam.pan(this.wild.x, this.wild.y, 400, 'Cubic.easeIn')
      await new Promise((resolve) => cam.zoomTo(2.2, 400, 'Cubic.easeIn', false, (c, t) => t === 1 && resolve()))
      this.scene.sleep() // a sleeping scene is neither updated nor rendered
      this.scene.launch('battle', { state, onEnd: (r) => this.onBattleEnd(r) })
    })
  }

  async onBattleEnd({ state, outcome, message }) {
    this.state = state
    this.input.keyboard.resetKeys()
    this.cameras.main.setZoom(1).centerOn(this.scale.width / 2, this.scale.height / 2).fadeIn(300)
    if (outcome === 'blackout') {
      this.scene.start('results', { sessionId: state.sessionId, gameOver: true })
      return
    }
    await loadSprites(this, [...state.party, state.wild])
    this.player.setTexture(textureKey(state.player))
    setAura(this.player, state.player.aura)
    this.hud.update(state)
    // Caught, eliminated or fled: a new wild Pokémon wanders in.
    this.wild.setAlpha(0)
    this.message.setText(message)
    await this.wait(900)
    this.spawnWild()
    this.explore()
  }

  swap(slot) {
    if (this.mode !== 'explore' || slot === this.state.active || !this.state.party[slot]) return
    return this.run(async () => {
      this.state = await api.swap(this.state.sessionId, slot)
      await loadSprites(this, [this.state.player])
      await this.tweenTo(this.player, { scale: 0 }, 150)
      this.player.setTexture(textureKey(this.state.player))
      setAura(this.player, this.state.player.aura)
      await this.tweenTo(this.player, { scale: SPRITE_SCALE }, 150)
      this.explore(`Go, ${displayName(this.state.player)}!`)
    })
  }

  toLobby() {
    if (this.mode !== 'explore') return
    return this.run(async () => {
      const state = await api.leave(this.state.sessionId)
      this.cameras.main.fadeOut(300)
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('lobby', { state, message: 'Back in the lobby. Chansey can heal your team.' }),
      )
    })
  }

  // XP is full: pause the arena until a card is picked.
  offerUpgrade() {
    this.mode = 'cards'
    this.player.setVelocity(0, 0)
    this.wild?.setVelocity(0, 0)
    this.physics.pause()
    showUpgradeCards(this, this.state, (card) => {
      this.physics.resume()
      this.upgrade(card)
    })
  }

  upgrade(card) {
    return this.run(async () => {
      const { evolvedFrom, ...state } = await api.upgrade(this.state.sessionId, card)
      this.state = state
      const p = state.player
      await loadSprites(this, [p])
      this.player.setTint(0xffd54f)
      await this.tweenTo(this.player, { scale: SPRITE_SCALE * 1.4 }, 250)
      if (evolvedFrom) {
        this.cameras.main.flash(300, 255, 255, 255)
        this.player.setTexture(textureKey(p))
      }
      await this.tweenTo(this.player, { scale: SPRITE_SCALE }, 250)
      this.player.clearTint()
      const perk = state.upgradeCards.find((c) => c.key === card)
      const gained = perk ? ` ${perk.name} is now level ${perk.level}.` : ''
      this.explore(
        evolvedFrom
          ? `What? ${capitalize(evolvedFrom)} evolved into ${displayName(p)}! Lv ${p.level}, Power ${p.power}.${gained}`
          : `${displayName(p)} reached Lv ${p.level}! Power ${p.power}.${gained}`,
      )
    })
  }

  // ---------- helpers ----------

  tweenTo(target, props, duration) {
    return new Promise((resolve) => this.tweens.add({ targets: target, ...props, duration, onComplete: resolve }))
  }

  wait(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve))
  }
}
