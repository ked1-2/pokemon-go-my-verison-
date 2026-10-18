import Phaser from 'phaser'
import { api } from '../api.js'
import { capitalize, loadSprites, text, textureKey } from '../ui.js'

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title')
  }

  create() {
    const { width } = this.scale
    this.starting = false

    text(this, width / 2, 70, 'POKÉMON GO', {
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#ffd54f',
      stroke: '#1a237e',
      strokeThickness: 8,
    }).setOrigin(0.5)
    text(this, width / 2, 125, 'Choose your starter', { fontSize: '20px' }).setOrigin(0.5)
    this.status = text(this, width / 2, 300, 'Loading starters...', { fontSize: '18px' }).setOrigin(0.5)

    api
      .starters()
      .then(async (starters) => {
        await loadSprites(this, starters)
        this.status.setText('')
        this.showStarters(starters)
      })
      .catch((err) => this.status.setText(`Could not load starters: ${err.message}`))
  }

  showStarters(starters) {
    const { width, height } = this.scale
    const cardW = 175
    const gap = 15
    const left = (width - (cardW * starters.length + gap * (starters.length - 1))) / 2

    starters.forEach((s, i) => {
      const x = left + i * (cardW + gap) + cardW / 2
      const y = 330
      const card = this.add
        .rectangle(x, y, cardW, 300, 0x1e2a4a)
        .setStrokeStyle(3, 0x5c6bc0)
        .setInteractive({ useHandCursor: true })
      this.add.image(x, y - 75, textureKey(s)).setScale(1.5)
      text(this, x, y + 10, capitalize(s.name), { fontSize: '20px', fontStyle: 'bold' }).setOrigin(0.5)
      text(this, x, y + 38, `Lv ${s.level}  ·  Power ${s.power}`, { fontSize: '13px', color: '#ffd54f' }).setOrigin(0.5)
      const { hp, attack, defense, speed } = s.stats
      text(this, x, y + 85, `HP ${hp}   ATK ${attack}\nDEF ${defense}   SPD ${speed}`, {
        fontSize: '13px',
        color: '#c5cae9',
        align: 'center',
        lineSpacing: 6,
      }).setOrigin(0.5)
      text(this, x, y + 128, `[${i + 1}]`, { fontSize: '13px', color: '#9fa8da' }).setOrigin(0.5)

      card.on('pointerover', () => card.setStrokeStyle(3, 0xffd54f))
      card.on('pointerout', () => card.setStrokeStyle(3, 0x5c6bc0))
      card.on('pointerdown', () => this.choose(s.name))
    })

    this.input.keyboard.on('keydown', (e) => {
      const i = Number(e.key) - 1
      if (starters[i]) this.choose(starters[i].name)
    })

    text(this, width / 2, height - 60, 'Catch Pokémon to build a team of 4. Heal in the lobby. End the trial whenever you like.', {
      fontSize: '14px',
      color: '#c5cae9',
    }).setOrigin(0.5)
    text(this, width / 2, height - 35, 'Move: WASD  ·  Interact/Fight: E  ·  Switch Pokémon: 1-4  ·  Catch: X  ·  Run: Q', { fontSize: '14px', color: '#c5cae9' }).setOrigin(0.5)
  }

  async choose(name) {
    if (this.starting) return
    this.starting = true
    this.status.setText(`Starting trial with ${capitalize(name)}...`).setY(500)
    try {
      const state = await api.start(name)
      this.scene.start('lobby', { state })
    } catch (err) {
      this.status.setText(err.message)
      this.starting = false
    }
  }
}

