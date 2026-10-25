import Phaser from 'phaser'
import { api } from '../api.js'
import { BALLS, Bar, RARITY_COLORS, TYPE_COLORS, backTextureKey, bake, button, displayName, loadSprites, setAura, text, textureKey } from '../ui.js'

const PANEL_TOP = 450
const WILD_SPOT = { x: 580, y: 250 }
const PLAYER_SPOT = { x: 220, y: 445 }
const WILD_SCALE = 2
const TITAN_SCALE = 3.4
const PLAYER_SCALE = 3
const RIGHT_COL_X = 680

// Classic two-sided battle view: your Pokémon from behind (bottom-left)
// facing the wild Pokémon (top-right). Every outcome comes from the server.
export class BattleScene extends Phaser.Scene {
  constructor() {
    super('battle')
  }

  init({ state, onEnd }) {
    this.state = state
    this.wildScale = state.wild.titan ? TITAN_SCALE : WILD_SCALE
    this.onEnd = onEnd
    this.mode = 'busy' // busy | choose | balls | party | won
    this.menuKeys = {}
  }

  create() {
    this.drawBackdrop()
    this.createFighters()
    this.createInfoBoxes()
    this.createPanel()
    this.input.keyboard.on('keydown', (e) => this.menuKeys[e.key.toLowerCase()]?.())
    this.time.addEvent({ delay: 300, loop: true, callback: () => this.shinySparkle() })
    this.playIntro()
  }

  // ---------- layout ----------

  drawBackdrop() {
    const { width } = this.scale
    bake(this, width, PANEL_TOP, (g) => {
      g.fillGradientStyle(0x6ab7ff, 0x6ab7ff, 0xd8f3ff, 0xd8f3ff).fillRect(0, 0, width, 260)
      g.fillGradientStyle(0x9ccc65, 0x9ccc65, 0x689f38, 0x689f38).fillRect(0, 200, width, PANEL_TOP - 200)
      g.fillStyle(0xffffff, 0.5).fillEllipse(120, 70, 140, 34).fillEllipse(330, 110, 110, 26).fillEllipse(720, 60, 120, 30)
      g.fillStyle(0x7cb342).lineStyle(4, 0x558b2f)
      g.fillEllipse(WILD_SPOT.x, WILD_SPOT.y, 270, 62).strokeEllipse(WILD_SPOT.x, WILD_SPOT.y, 270, 62)
      g.fillEllipse(PLAYER_SPOT.x, PLAYER_SPOT.y - 10, 330, 74).strokeEllipse(PLAYER_SPOT.x, PLAYER_SPOT.y - 10, 330, 74)
    })
  }

  createFighters() {
    this.wildSprite = this.add.image(WILD_SPOT.x, WILD_SPOT.y + 8, textureKey(this.state.wild)).setOrigin(0.5, 0.8).setScale(this.wildScale)
    this.playerSprite = this.add.image(PLAYER_SPOT.x, PLAYER_SPOT.y, '__DEFAULT').setOrigin(0.5, 0.8).setScale(PLAYER_SCALE)
    this.setPlayerTexture()
    if (this.state.wild.titan) {
      this.bossLabel = text(this, WILD_SPOT.x, 22, 'BOSS', { fontSize: '30px', fontStyle: 'bold', color: '#ff1744', stroke: '#000000', strokeThickness: 6 })
        .setOrigin(0.5, 0)
        .setDepth(26)
      this.tweens.add({ targets: this.bossLabel, scale: 1.15, yoyo: true, repeat: -1, duration: 500 })
    }
  }

  setPlayerTexture() {
    const p = this.state.player
    const back = this.textures.exists(backTextureKey(p)) ? backTextureKey(p) : textureKey(p)
    this.playerSprite.setTexture(back).setFlipX(back === textureKey(p))
    setAura(this.playerSprite, p.aura)
  }

  createInfoBoxes() {
    const w = this.state.wild
    const box = (x, y, wdt, h) =>
      this.add.graphics().fillStyle(0xfdfcf0).lineStyle(4, 0x37474f).fillRoundedRect(x, y, wdt, h, 12).strokeRoundedRect(x, y, wdt, h, 12)

    const rarityTag = w.rarity === 'common' ? '' : `  ${w.rarity.toUpperCase()}`
    this.wildBox = this.add.container(0, 0, [
      box(24, 24, 300, 92),
      text(this, 40, 32, displayName(w), { fontSize: '20px', fontStyle: 'bold', color: w.shiny ? '#f9a825' : '#263238' }),
      text(this, 308, 34, `Lv ${w.level}`, { fontSize: '16px', color: '#263238' }).setOrigin(1, 0),
      text(this, 40, 60, `${w.types.map((t) => t.toUpperCase()).join(' / ')}${rarityTag}  ·  ${w.ability.name}`, {
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#546e7a',
      }),
      text(this, 40, 86, 'HP', { fontSize: '13px', fontStyle: 'bold', color: '#ef6c00' }),
    ])
    if (rarityTag) this.wildBox.add(text(this, 308, 60, '◆', { fontSize: '12px', color: RARITY_COLORS[w.rarity], stroke: '#263238', strokeThickness: 2 }).setOrigin(1, 0))
    this.wildHp = new Bar(this, 68, 88, 236, 10).set(w.hp, w.maxHp)
    this.catchBadge = text(this, 174, 122, 'LOW HP: PRESS X TO CATCH!', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#c62828',
      padding: { x: 6, y: 3 },
    })
      .setOrigin(0.5, 0)
      .setVisible(false)
    this.tweens.add({ targets: this.catchBadge, alpha: 0.4, yoyo: true, repeat: -1, duration: 450 })

    this.playerBox = this.add.container(0, 0, [box(460, 318, 316, 96)])
    this.playerName = text(this, 476, 328, '', { fontSize: '20px', fontStyle: 'bold', color: '#263238' })
    this.playerLevel = text(this, 760, 330, '', { fontSize: '16px', color: '#263238' }).setOrigin(1, 0)
    this.playerBox.add([this.playerName, this.playerLevel, text(this, 476, 362, 'HP', { fontSize: '13px', fontStyle: 'bold', color: '#ef6c00' })])
    this.playerHp = new Bar(this, 504, 364, 256, 10)
    this.playerHpText = text(this, 760, 382, '', { fontSize: '16px', color: '#263238' }).setOrigin(1, 0)
    this.playerAbility = text(this, 476, 386, '', { fontSize: '12px', fontStyle: 'bold', color: '#546e7a' })
    this.playerBox.add(this.playerAbility)
    this.refreshPlayerBox()

    this.hudParts = [this.wildBox, this.wildHp.g, this.playerBox, this.playerHp.g, this.playerHpText, ...(this.bossLabel ? [this.bossLabel] : [])]
    this.hudParts.forEach((o) => o.setAlpha(0))
  }

  refreshPlayerBox() {
    const p = this.state.player
    this.playerName.setText(displayName(p)).setColor(p.shiny ? '#f9a825' : '#263238')
    this.playerLevel.setText(`Lv ${p.level}`)
    this.playerHp.drawnFill = null
    this.playerHp.set(p.hp, p.maxHp)
    this.playerHpText.setText(`${p.hp} / ${p.maxHp}`)
    this.playerAbility.setText(`${p.ability.name}${p.aura ? '  ✦ AURA' : ''}`)
  }

  createPanel() {
    const { width, height } = this.scale
    this.add.rectangle(width / 2, (PANEL_TOP + height) / 2, width, height - PANEL_TOP, 0x14213d)
    this.add.rectangle(width / 2, PANEL_TOP + 2, width, 4, 0xffd54f)
    this.message = text(this, 24, PANEL_TOP + 12, '', { fontSize: '17px', wordWrap: { width: 752 } })
    this.menu = this.add.container(0, 0)
  }

  // ---------- VS intro ----------

  async playIntro() {
    const { width, height } = this.scale
    const p = this.state.player
    const w = this.state.wild
    const overlay = this.add.container(0, 0).setDepth(100)
    overlay.add(this.add.rectangle(width / 2, height / 2, width, height, 0x000000))

    const left = this.add.container(-520, 0, [
      this.add.polygon(0, 0, [0, 0, 470, 0, 330, height, 0, height], 0x1e88e5).setOrigin(0),
      this.add.image(185, 270, textureKey(p)).setScale(2.6).setFlipX(true),
      text(this, 175, 420, displayName(p).toUpperCase(), { fontSize: '28px', fontStyle: 'bold', stroke: '#0d47a1', strokeThickness: 6 }).setOrigin(0.5),
      text(this, 175, 458, `Lv ${p.level}`, { fontSize: '18px' }).setOrigin(0.5),
    ])
    const right = this.add.container(520, 0, [
      this.add.polygon(0, 0, [470, 0, width, 0, width, height, 330, height], 0xe53935).setOrigin(0),
      this.add.image(625, 270, textureKey(w)).setScale(2.6),
      text(this, 625, 420, `${w.titan ? 'TITAN' : 'WILD'} ${displayName(w).toUpperCase()}`, { fontSize: '28px', fontStyle: 'bold', stroke: '#b71c1c', strokeThickness: 6 }).setOrigin(0.5),
      text(this, 625, 458, `Lv ${w.level}${w.rarity === 'common' ? '' : `  ·  ${w.rarity.toUpperCase()}`}`, { fontSize: '18px', color: RARITY_COLORS[w.rarity] }).setOrigin(0.5),
    ])
    const vs = text(this, width / 2, height / 2 - 20, 'VS', {
      fontSize: '110px',
      fontStyle: 'bold italic',
      color: '#ffd54f',
      stroke: '#000000',
      strokeThickness: 12,
    })
      .setOrigin(0.5)
      .setScale(4)
      .setAlpha(0)
    overlay.add([left, right, vs])

    await Promise.all([
      this.tweenTo(left, { x: 0, ease: 'Back.Out' }, 380),
      this.tweenTo(right, { x: 0, ease: 'Back.Out' }, 380),
    ])
    await this.tweenTo(vs, { scale: 1, alpha: 1, ease: 'Bounce.Out' }, 420)
    this.cameras.main.shake(250, 0.015)
    this.tweens.add({ targets: vs, scale: 1.1, yoyo: true, repeat: 2, duration: 160 })
    await this.wait(1100)

    // Flash into the over-the-shoulder battle view.
    this.cameras.main.flash(350, 255, 255, 255)
    overlay.destroy()
    this.wildSprite.x = this.scale.width + 120
    this.playerSprite.x = -160
    await Promise.all([
      this.tweenTo(this.wildSprite, { x: WILD_SPOT.x, ease: 'Cubic.Out' }, 500),
      this.tweenTo(this.playerSprite, { x: PLAYER_SPOT.x, ease: 'Cubic.Out' }, 500),
    ])
    this.hudParts.forEach((o) => this.tweens.add({ targets: o, alpha: 1, duration: 250 }))
    const shinyNote = w.shiny ? ' It\'s SHINY!' : ''
    const intro = w.titan
      ? `The TITAN ${displayName(w)} towers over you! Every Pokémon you've caught joins this fight!`
      : `A wild ${displayName(w).replace('★ ', '')} appeared!${shinyNote}`
    this.message.setText(`${intro} Go, ${displayName(p)}!`)
    await this.wait(w.shiny ? 1400 : 900)
    this.choose()
  }

  // ---------- menus ----------

  setMenu(options) {
    this.menu.removeAll(true)
    this.menuKeys = {}
    for (const o of options) {
      const btn = button(this, o.x, o.y, o.label, o.action, { disabled: o.disabled, color: o.color, fontSize: '13px', width: o.width })
      if (o.pulse && !o.disabled) this.tweens.add({ targets: btn, scale: 1.06, yoyo: true, repeat: -1, duration: 400 })
      this.menu.add(btn)
      if (!o.disabled) this.menuKeys[o.key] = o.action
    }
  }

  busy() {
    this.mode = 'busy'
    this.setMenu([])
  }

  grid(i) {
    return { x: 150 + (i % 2) * 280, y: 512 + Math.floor(i / 2) * 44, width: 262 }
  }

  choose() {
    this.mode = 'choose'
    const low = this.state.catchable
    this.catchBadge.setVisible(low)
    const p = this.state.player
    this.message.setText(low ? `${displayName(this.state.wild)} is weak! Press X to catch it, or keep attacking.` : `What will ${displayName(p)} do?  (Ability: ${p.ability.name})`)

    const opts = this.state.abilities.map((a, i) => {
      const hex = `#${(TYPE_COLORS[a.type] ?? 0x1565c0).toString(16).padStart(6, '0')}`
      return {
        ...this.grid(i),
        label: `[${i + 1}] ${a.name}  ${a.kind === 'heal' ? '' : a.type.toUpperCase() + '  '}PP ${a.pp}/${a.maxPp}${a.noEffect ? '  ✕ NO EFFECT' : ''}`,
        key: String(i + 1),
        color: a.noEffect ? '#4e342e' : a.kind === 'heal' ? '#2e7d32' : darken(hex),
        disabled: a.pp <= 0,
        action: () => this.useAbility(i),
      }
    })
    const canSwitch = this.state.party.some((m, i) => i !== this.state.active && !m.fainted)
    opts.push(
      { label: 'CATCH [X]', key: 'x', x: RIGHT_COL_X, y: 498, width: 170, color: '#c62828', disabled: !low, pulse: true, action: () => this.ballMenu() },
      { label: 'SWITCH [S]', key: 's', x: RIGHT_COL_X, y: 536, width: 170, color: '#00838f', disabled: !canSwitch, action: () => this.partyMenu(false) },
      { label: 'RUN [Q]', key: 'q', x: RIGHT_COL_X, y: 574, width: 170, color: '#455a64', action: () => this.runAway() },
    )
    this.setMenu(opts)
  }

  ballMenu() {
    const back = this.mode === 'won' ? () => this.wonMenu() : () => this.choose()
    this.mode = 'balls'
    this.message.setText(`Which ball? Odds depend on ${displayName(this.state.wild)}'s level, rarity${this.state.wild.shiny ? ' and shininess' : ''}.`)
    const opts = BALLS.map((b, i) => ({
      ...this.grid(i),
      label: `[${b.hotkey}] ${b.name}  ${this.state.catchChances[b.key]}%  ×${this.state.balls[b.key]}`,
      key: b.hotkey,
      color: '#1565c0',
      disabled: this.state.balls[b.key] <= 0,
      action: () => this.throwBall(b),
    }))
    opts.push({ label: 'Back [Esc]', key: 'escape', x: RIGHT_COL_X, y: 536, width: 170, color: '#455a64', action: back })
    this.setMenu(opts)
  }

  partyMenu(forced) {
    this.mode = 'party'
    this.message.setText(forced ? 'Choose your next Pokémon!' : 'Switch to which Pokémon? Switching uses your turn.')
    const opts = this.state.party.map((m, i) => ({
      ...this.grid(i),
      label: `[${i + 1}] ${displayName(m)} Lv ${m.level}  ${m.fainted ? 'FAINTED' : `HP ${m.hp}/${m.maxHp}`}`,
      key: String(i + 1),
      color: '#00838f',
      disabled: m.fainted || i === this.state.active,
      action: () => this.switchTo(i),
    }))
    if (!forced) opts.push({ label: 'Back [Esc]', key: 'escape', x: RIGHT_COL_X, y: 536, width: 170, color: '#455a64', action: () => this.choose() })
    this.setMenu(opts)
  }

  wonMenu(msg) {
    this.mode = 'won'
    this.catchBadge.setVisible(false)
    if (msg) this.message.setText(msg)
    this.setMenu([
      { label: 'CATCH [X]', key: 'x', x: 260, y: 540, width: 220, color: '#c62828', pulse: true, action: () => this.ballMenu() },
      { label: 'ELIMINATE [E]', key: 'e', x: 540, y: 540, width: 220, color: '#6d4c41', action: () => this.eliminate() },
    ])
  }

  // ---------- actions ----------

  async act(task) {
    this.busy()
    try {
      await task()
    } catch (err) {
      this.message.setText(err.message)
      await this.wait(1500)
      this.afterTurn(this.state.phase === 'won' ? 'win' : this.state.phase === 'fainted' ? 'fainted' : 'ongoing')
    }
  }

  useAbility(i) {
    if (this.mode !== 'choose') return
    return this.act(async () => {
      const res = await api.attack(this.state.sessionId, i)
      for (const ev of res.events) await this.playEvent(ev)
      this.state = res.state
      await this.afterTurn(res.result)
    })
  }

  async afterTurn(result) {
    if (result === 'win') {
      const w = this.state.wild
      this.wonMenu(`${w.titan ? 'The TITAN' : 'Wild'} ${displayName(w)} was defeated! +${w.level * 10 * (w.titan ? 3 : 1)} XP. Catch it or eliminate it?`)
    } else if (result === 'fainted') {
      this.partyMenu(true)
    } else if (result === 'blackout') {
      this.message.setText('All your Pokémon are at 0 HP... GAME OVER!')
      await this.wait(2000)
      this.finish('blackout', 'Game over')
    } else {
      this.choose()
    }
  }

  switchTo(slot) {
    if (this.mode !== 'party') return
    return this.act(async () => {
      const res = await api.switch(this.state.sessionId, slot)
      const name = displayName(this.state.player)
      await loadSprites(this, [res.state.player])
      if (!this.state.player.fainted) this.message.setText(`Come back, ${name}!`)
      await this.tweenTo(this.playerSprite, { scale: 0, alpha: 0 }, 250)
      this.state = res.state
      // Show the newcomer's HP from before the wild Pokémon's free hit, so the hit animates.
      const first = res.events[0]
      if (first) this.state.player.hp = Math.min(this.state.player.maxHp, first.playerHp + (first.damage ?? 0))
      this.setPlayerTexture()
      this.playerSprite.setY(PLAYER_SPOT.y)
      this.refreshPlayerBox()
      this.message.setText(`Go, ${displayName(this.state.player)}!`)
      this.burst(PLAYER_SPOT.x, PLAYER_SPOT.y - 100, 0xffffff, 10, 70)
      await this.tweenTo(this.playerSprite, { scale: PLAYER_SCALE, alpha: 1 }, 300)
      await this.wait(500)
      for (const ev of res.events) await this.playEvent(ev)
      this.state = res.state
      await this.afterTurn(res.result)
    })
  }

  runAway() {
    if (this.mode !== 'choose') return
    return this.act(async () => {
      const name = displayName(this.state.wild)
      const res = await api.run(this.state.sessionId)
      this.state = res.state
      this.message.setText('Got away safely!')
      await this.tweenTo(this.playerSprite, { x: -200 }, 400)
      this.finish('fled', `You ran from ${name}. Something new is wandering in...`)
    })
  }

  throwBall(ball) {
    if (this.mode !== 'balls') return
    const wildName = displayName(this.state.wild)
    const wasWon = this.state.phase === 'won'
    return this.act(async () => {
      this.message.setText(`You threw a ${ball.name}!`)
      const pending = api.catch(this.state.sessionId, ball.key)
      const orb = this.makeBall(ball.color, 110, PANEL_TOP - 10)
      await this.arc(orb, { x: WILD_SPOT.x, y: WILD_SPOT.y - 70 }, 600)

      // Pull the wild Pokémon into the ball.
      this.wildSprite.setTintFill(0xffffff)
      await this.tweenTo(this.wildSprite, { scale: 0, alpha: 0 }, 250)
      await this.tweenTo(orb, { y: WILD_SPOT.y - 6, ease: 'Bounce.Out' }, 450)
      let res
      try {
        res = await pending
      } catch (err) {
        orb.destroy()
        this.wildSprite.clearTint().setScale(this.wildScale).setAlpha(wasWon ? 0.5 : 1)
        throw err
      }

      const wobbles = res.caught ? 3 : Phaser.Math.Between(1, 2)
      for (let i = 0; i < wobbles; i++) {
        await this.wait(250)
        await this.tweenTo(orb, { angle: -28 }, 130)
        await this.tweenTo(orb, { angle: 28 }, 200)
        await this.tweenTo(orb, { angle: 0 }, 130)
      }

      if (res.caught) {
        this.burst(orb.x, orb.y, 0xffd54f, 14, 70)
        const where = res.destination === 'party' ? 'It joined your party!' : 'Your party is full, so it was sent to the box.'
        this.message.setText(`Gotcha! ${wildName} was caught! ${where}`)
        if (this.state.wild.titan) {
          await this.wait(1400)
          this.burst(orb.x, orb.y, 0xffd54f, 24, 140)
          this.message.setText('The Titan shrank to normal size... but it glows with a golden aura! All your Pokémon are stronger now!')
        }
        this.state = res.state
        await this.wait(1600)
        return this.finish('resolved', `${wildName} was caught with a ${ball.name}! ${where}`)
      }

      // Broke free.
      this.burst(orb.x, orb.y, 0xffffff, 10, 50)
      orb.destroy()
      this.wildSprite.clearTint()
      await this.tweenTo(this.wildSprite, { scale: this.wildScale, alpha: wasWon ? 0.5 : 1 }, 220)
      this.message.setText(`Oh no! ${wildName} broke free!`)
      await this.wait(900)
      for (const ev of res.events) await this.playEvent(ev)
      this.state = res.state
      if (res.result === 'win') this.wonMenu(`${wildName} is still down. Try another ball, or eliminate it?`)
      else await this.afterTurn(res.result)
    })
  }

  eliminate() {
    if (this.mode !== 'won') return
    return this.act(async () => {
      const name = displayName(this.state.wild)
      this.state = await api.eliminate(this.state.sessionId)
      this.message.setText(`${name} was eliminated.`)
      this.burst(WILD_SPOT.x, WILD_SPOT.y - 60, 0x9e9e9e, 16, 80)
      await this.tweenTo(this.wildSprite, { scaleX: 0, alpha: 0 }, 400)
      await this.wait(700)
      this.finish('resolved', `${name} was eliminated.`)
    })
  }

  finish(outcome, message) {
    this.busy()
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.wake('arena')
      this.onEnd({ state: this.state, outcome, message })
      this.scene.stop()
    })
  }

  // ---------- event playback ----------

  async playEvent(ev) {
    if (ev.kind === 'status') return this.playStatus(ev)
    if (ev.kind === 'team') return this.playTeam(ev)
    const isPlayer = ev.actor === 'player'
    const attacker = isPlayer ? this.playerSprite : this.wildSprite
    const defender = isPlayer ? this.wildSprite : this.playerSprite
    const name = isPlayer ? displayName(this.state.player) : `${this.state.wild.titan ? 'Titan' : 'Wild'} ${displayName(this.state.wild)}`
    this.message.setText(`${name} used ${ev.ability}!`)
    await this.wait(350)

    if (ev.kind === 'heal') {
      this.sparkle(this.playerSprite, 0x69f0ae)
      await this.updateHp(ev)
      this.message.setText(`${name} recovered ${ev.heal} HP!`)
      return this.wait(600)
    }

    const color = TYPE_COLORS[ev.type] ?? 0xffffff
    if (ev.kind === 'signature') await this.beam(attacker, defender, color)
    else if (ev.kind === 'strong') await this.projectile(attacker, defender, color)
    else await this.lunge(attacker, defender)

    if (ev.immune) {
      // The attack passes harmlessly through the immune Pokémon.
      this.tweens.add({ targets: defender, alpha: 0.3, yoyo: true, repeat: 1, duration: 120 })
      this.message.setText(`It doesn't affect ${displayName(this.state.wild)}... (${this.state.wild.types.map((t) => t.toUpperCase()).join('/')} is immune to ${ev.type.toUpperCase()})`)
      return this.wait(1200)
    }
    if (ev.miss) {
      await this.tweenTo(defender, { x: defender.x + 40, yoyo: true }, 140)
      this.message.setText(ev.notes?.[0] ?? 'But it missed!')
      return this.wait(900)
    }

    const hit = this.center(defender)
    this.burst(hit.x, hit.y, color, ev.kind === 'signature' ? 18 : 10, ev.kind === 'signature' ? 110 : 60)
    this.cameras.main.shake(ev.kind === 'signature' ? 350 : 140, ev.crit || ev.kind === 'signature' ? 0.02 : 0.006)
    this.blink(defender)
    await this.updateHp(ev)
    if (ev.crit) {
      this.message.setText('A critical hit!')
      await this.wait(550)
    }
    for (const note of ev.notes ?? []) {
      this.message.setText(note)
      await this.wait(850)
    }

    if (ev.wildHp === 0 && isPlayer) {
      await this.faint(this.wildSprite, 0.5)
      this.message.setText(`Wild ${displayName(this.state.wild)} fainted!`)
      await this.wait(700)
    } else if (ev.playerHp === 0 && !isPlayer) {
      await this.faint(this.playerSprite, 0)
      this.message.setText(`${displayName(this.state.player)} fainted!`)
      await this.wait(700)
    } else {
      await this.wait(250)
    }
  }

  async playStatus(ev) {
    const sprite = ev.actor === 'player' ? this.playerSprite : this.wildSprite
    this.message.setText(ev.text)
    this.sparkle(sprite, 0xce93d8)
    this.tweens.add({ targets: sprite, angle: 6, yoyo: true, repeat: 3, duration: 70, onComplete: () => sprite.setAngle(0) })
    await this.updateHp(ev)
    await this.wait(900)
    await this.checkFaint(ev)
  }

  // Every other Pokémon you own piles onto the Titan.
  async playTeam(ev) {
    this.message.setText(`Your whole team joins in! ${ev.names.length} Pokémon attack the Titan!`)
    const to = this.center(this.wildSprite)
    const shots = ev.names.slice(0, 10).map((_, i) => {
      const orb = this.add.circle(40 + i * 36, PANEL_TOP - 20, 10, 0xffd54f).setStrokeStyle(3, 0xffffff).setDepth(22)
      const target = { x: to.x + Phaser.Math.Between(-40, 40), y: to.y + Phaser.Math.Between(-40, 40), delay: i * 60 }
      return this.tweenTo(orb, target, 380).then(() => orb.destroy())
    })
    await Promise.all(shots)
    this.burst(to.x, to.y, 0xffd54f, 20, 130)
    this.cameras.main.shake(300, 0.012)
    this.blink(this.wildSprite)
    await this.updateHp(ev)
    this.message.setText(`Your team dealt ${ev.damage} damage to the Titan!`)
    await this.wait(900)
    await this.checkFaint(ev)
  }

  async checkFaint(ev) {
    if (ev.wildHp === 0) {
      await this.faint(this.wildSprite, 0.5)
      this.message.setText(`${this.state.wild.titan ? 'The Titan' : 'Wild'} ${displayName(this.state.wild)} fainted!`)
      await this.wait(700)
    } else if (ev.playerHp === 0) {
      await this.faint(this.playerSprite, 0)
      this.message.setText(`${displayName(this.state.player)} fainted!`)
      await this.wait(700)
    }
  }

  updateHp(ev) {
    const p = this.state.player
    const w = this.state.wild
    p.hp = ev.playerHp
    w.hp = ev.wildHp
    return Promise.all([
      this.playerHp.animateTo(ev.playerHp, p.maxHp, 450, (v) => this.playerHpText.setText(`${v} / ${p.maxHp}`)),
      this.wildHp.animateTo(ev.wildHp, w.maxHp, 450),
    ])
  }

  // ---------- effects ----------

  shinySparkle() {
    for (const [poke, sprite] of [[this.state.wild, this.wildSprite], [this.state.player, this.playerSprite]]) {
      if (!poke?.shiny || sprite.alpha < 0.5) continue
      const c = this.center(sprite)
      const s = this.add.star(c.x + Phaser.Math.Between(-60, 60), c.y + Phaser.Math.Between(-50, 50), 4, 3, 9, 0xfff59d).setDepth(25)
      this.tweens.add({ targets: s, scale: 0, angle: 90, duration: 600, onComplete: () => s.destroy() })
    }
  }

  center(sprite) {
    return { x: sprite.x, y: sprite.y - sprite.displayHeight * 0.35 }
  }

  async lunge(attacker, defender) {
    const dx = Math.sign(defender.x - attacker.x) * 50
    const dy = Math.sign(defender.y - attacker.y) * 30
    await this.tweenTo(attacker, { x: attacker.x + dx, y: attacker.y + dy, yoyo: true, ease: 'Quad.In' }, 120)
  }

  async projectile(attacker, defender, color) {
    const from = this.center(attacker)
    const to = this.center(defender)
    const orb = this.add.circle(from.x, from.y, 16, color).setStrokeStyle(4, 0xffffff, 0.8).setDepth(20)
    const glow = this.add.circle(from.x, from.y, 28, color, 0.35).setDepth(19)
    await this.tweenTo(attacker, { scale: attacker.scale * 1.08, yoyo: true }, 120)
    await Promise.all([this.tweenTo(orb, { x: to.x, y: to.y }, 320), this.tweenTo(glow, { x: to.x, y: to.y }, 320)])
    orb.destroy()
    glow.destroy()
  }

  async beam(attacker, defender, color) {
    const from = this.center(attacker)
    const to = this.center(defender)
    this.cameras.main.flash(200, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff)
    attacker.setTint(color)
    await this.tweenTo(attacker, { scale: attacker.scale * 1.15, yoyo: true }, 220)
    const g = this.add.graphics().setDepth(20)
    const beam = { t: 0 }
    await this.tweenTo(
      beam,
      {
        t: 1,
        onUpdate: () => {
          const x = Phaser.Math.Linear(from.x, to.x, beam.t)
          const y = Phaser.Math.Linear(from.y, to.y, beam.t)
          g.clear()
          g.lineStyle(26, color, 0.45).lineBetween(from.x, from.y, x, y)
          g.lineStyle(10, 0xffffff, 0.95).lineBetween(from.x, from.y, x, y)
        },
      },
      300,
    )
    await this.tweenTo(g, { alpha: 0 }, 250)
    g.destroy()
    attacker.clearTint()
  }

  burst(x, y, color, count, radius) {
    const ring = this.add.circle(x, y, 10).setStrokeStyle(4, color).setDepth(21)
    this.tweens.add({ targets: ring, scale: radius / 10, alpha: 0, duration: 400, onComplete: () => ring.destroy() })
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4
      const dot = this.add.circle(x, y, Phaser.Math.Between(3, 7), color).setDepth(21)
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * radius,
        y: y + Math.sin(a) * radius,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.Out',
        onComplete: () => dot.destroy(),
      })
    }
  }

  sparkle(sprite, color) {
    const c = this.center(sprite)
    for (let i = 0; i < 14; i++) {
      const s = this.add.star(c.x + Phaser.Math.Between(-70, 70), c.y + Phaser.Math.Between(0, 80), 4, 3, 8, color).setDepth(21)
      this.tweens.add({ targets: s, y: s.y - 90, alpha: 0, angle: 180, delay: i * 40, duration: 700, onComplete: () => s.destroy() })
    }
  }

  blink(sprite) {
    sprite.setTintFill(0xffffff)
    this.tweens.add({ targets: sprite, alpha: 0.2, yoyo: true, repeat: 2, duration: 70, onComplete: () => sprite.clearTint().setAlpha(1) })
  }

  faint(sprite, restAlpha) {
    return this.tweenTo(sprite, { y: sprite.y + 40, alpha: restAlpha }, 450)
  }

  makeBall(color, x, y) {
    const g = this.add.graphics({ x, y }).setDepth(30)
    g.fillStyle(0xffffff).fillCircle(0, 0, 14)
    g.fillStyle(color).beginPath().arc(0, 0, 14, Math.PI, 0, false).closePath().fillPath()
    g.lineStyle(3, 0x111111).strokeCircle(0, 0, 14).lineBetween(-14, 0, 14, 0)
    g.fillStyle(0xffffff).fillCircle(0, 0, 5).strokeCircle(0, 0, 5)
    return g
  }

  arc(obj, to, duration) {
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(obj.x, obj.y),
      new Phaser.Math.Vector2((obj.x + to.x) / 2, Math.min(obj.y, to.y) - 220),
      new Phaser.Math.Vector2(to.x, to.y),
    )
    const t = { v: 0 }
    return this.tweenTo(
      t,
      {
        v: 1,
        onUpdate: () => {
          const pt = curve.getPoint(t.v)
          obj.setPosition(pt.x, pt.y)
          obj.angle = t.v * 720
        },
      },
      duration,
    )
  }

  // ---------- helpers ----------

  tweenTo(target, props, duration) {
    return new Promise((resolve) => this.tweens.add({ targets: target, ...props, duration, onComplete: resolve }))
  }

  wait(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve))
  }
}

// Type colours are bright; darken them so white button text stays readable.
function darken(hex) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (shift) => Math.round(((n >> shift) & 0xff) * 0.55)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}
