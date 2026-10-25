import { BALLS, Bar, PARTY_SIZE, displayName, loadSprites, setAura, text, textureKey } from './ui.js'

const SLOT_W = 66

// Top bar shared by the lobby and the arena: active Pokémon, party slots, score, clock and balls.
export class Hud {
  constructor(scene, { onSlot, onTime } = {}) {
    this.scene = scene
    this.onTime = onTime
    scene.add.rectangle(400, 35, 800, 70, 0x14213d)

    this.name = text(scene, 16, 8, '', { fontSize: '15px', fontStyle: 'bold' })
    this.hp = new Bar(scene, 16, 34, 170, 10)
    this.hpText = text(scene, 194, 29, '', { fontSize: '12px' })
    this.xp = new Bar(scene, 16, 52, 170, 6, { kind: 'xp' })
    this.xpText = text(scene, 194, 47, '', { fontSize: '11px', color: '#90caf9' })

    this.slots = Array.from({ length: PARTY_SIZE }, (_, i) => i).map((i) => {
      const x = 300 + i * (SLOT_W + 6)
      const frame = scene.add.rectangle(x + SLOT_W / 2, 35, SLOT_W, 60, 0x1e2a4a).setStrokeStyle(2, 0x3949ab)
      frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => onSlot?.(i))
      const sprite = scene.add.image(x + SLOT_W / 2, 30, '__DEFAULT').setScale(0.55).setVisible(false)
      const key = text(scene, x + 4, 7, String(i + 1), { fontSize: '11px', fontStyle: 'bold', color: '#ffd54f' })
      const lv = text(scene, x + SLOT_W - 4, 7, '', { fontSize: '10px', color: '#c5cae9' }).setOrigin(1, 0)
      const bar = new Bar(scene, x + 6, 56, SLOT_W - 12, 4)
      return { frame, sprite, key, lv, bar }
    })

    this.score = text(scene, 786, 8, '', { fontSize: '14px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(1, 0)
    this.clock = text(scene, 786, 24, '', { fontSize: '11px' }).setOrigin(1, 0)
    this.aura = text(scene, 598, 10, '', { fontSize: '11px', fontStyle: 'bold', color: '#ffd54f' })
    scene.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() })
    this.balls = BALLS.map((b, i) => {
      const x = 604 + i * 62
      scene.add.circle(x, 46, 7, b.color).setStrokeStyle(1, 0xffffff)
      return text(scene, x + 11, 38, '', { fontSize: '13px' })
    })
  }

  update(state) {
    const p = state.player
    this.name.setText(`${displayName(p)}  Lv ${p.level}  ·  Power ${p.power}`)
    this.hp.set(p.hp, p.maxHp)
    this.hpText.setText(`HP ${p.hp}/${p.maxHp}`)
    this.xp.set(p.xp, p.xpNext)
    this.xpText.setText(`XP ${p.xp}/${p.xpNext}`)
    this.score.setText(`Score ${state.score}`)
    this.aura.setText(state.auraBoost > 1 ? `✦ Aura ×${state.auraBoost}` : '')
    BALLS.forEach((b, i) => this.balls[i].setText(`×${state.balls[b.key]}`))
    this.time = state.time
    this.timeAt = Date.now()
    this.tick()

    loadSprites(this.scene, state.party).then(() => {
      this.slots.forEach((slot, i) => {
        const m = state.party[i]
        const isActive = i === state.active
        slot.frame.setStrokeStyle(isActive ? 3 : 2, isActive ? 0xffd54f : 0x3949ab)
        slot.sprite.setVisible(Boolean(m))
        slot.lv.setText(m ? `Lv${m.level}` : '')
        slot.bar.g.setVisible(Boolean(m))
        if (!m) return
        slot.sprite.setTexture(textureKey(m)).setAlpha(m.fainted ? 0.35 : 1)
        setAura(slot.sprite, m.aura)
        if (m.fainted) slot.sprite.setTint(0x666666)
        else slot.sprite.clearTint()
        slot.bar.set(m.hp, m.maxHp)
      })
    })
  }

  // Counts down locally between server updates, flipping day/night when the timer runs out.
  tick() {
    if (!this.time) return
    const { dayMs, nightMs } = this.time
    let night = this.time.night
    let left = this.time.msLeft - (Date.now() - this.timeAt)
    while (left <= 0) {
      night = !night
      left += night ? nightMs : dayMs
    }
    const secs = Math.ceil(left / 1000)
    const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    this.clock.setText(night ? `☾ Night · day in ${mmss}` : `☀ Day · night in ${mmss}`).setColor(night ? '#b39ddb' : '#ffe082')
    if (night !== this.night) {
      const changed = this.night !== undefined
      this.night = night
      this.onTime?.(night, changed)
    }
  }
}

