import Phaser from 'phaser'
import { api } from '../api.js'
import { BALLS, button, capitalize, loadSprites, text, textureKey } from '../ui.js'

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('results')
  }

  init({ sessionId, gameOver = false }) {
    this.sessionId = sessionId
    this.gameOver = gameOver
  }

  create() {
    const { width } = this.scale
    text(this, width / 2, 50, this.gameOver ? 'GAME OVER' : 'TRIAL COMPLETE', {
      fontSize: '38px',
      fontStyle: 'bold',
      color: '#ffd54f',
      stroke: '#1a237e',
      strokeThickness: 7,
    }).setOrigin(0.5)
    this.status = text(this, width / 2, 300, 'Tallying results...', { fontSize: '18px' }).setOrigin(0.5)

    api
      .results(this.sessionId)
      .then(async (r) => {
        await loadSprites(this, [r.player])
        this.status.destroy()
        this.show(r)
      })
      .catch((err) => this.status.setText(err.message))

    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('title'))
  }

  show(r) {
    const { width, height } = this.scale
    const p = r.player
    const b = r.breakdown

    // Starter summary
    this.add.rectangle(200, 250, 300, 260, 0x1e2a4a).setStrokeStyle(3, 0x5c6bc0)
    if (this.textures.exists(textureKey(p))) this.add.image(200, 175, textureKey(p)).setScale(1.5)
    text(this, 200, 250, `${capitalize(p.name)}  Lv ${p.level}`, { fontSize: '22px', fontStyle: 'bold' }).setOrigin(0.5)
    text(this, 200, 290, 'TEAM POWER', { fontSize: '13px', color: '#9fa8da' }).setOrigin(0.5)
    text(this, 200, 320, `${b.finalPower}`, { fontSize: '34px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(0.5)

    // Score breakdown
    const rows = [
      [`Eliminated (${r.eliminated.length})`, `+${b.eliminatedPoints}`],
      [`Caught (${r.caught.length})`, `+${b.caughtPoints}`],
      ['Team power', `+${b.finalPower}`],
      [`Blackouts (${r.blackouts})`, `−${b.blackoutPenalty}`],
    ]
    this.add.rectangle(580, 250, 380, 260, 0x1e2a4a).setStrokeStyle(3, 0x5c6bc0)
    text(this, 580, 140, 'SCORE', { fontSize: '13px', color: '#9fa8da' }).setOrigin(0.5)
    rows.forEach(([label, value], i) => {
      const y = 170 + i * 30
      text(this, 410, y, label, { fontSize: '16px' })
      text(this, 750, y, value, { fontSize: '16px', color: value.startsWith('−') ? '#ef9a9a' : '#a5d6a7' }).setOrigin(1, 0)
    })
    this.add.rectangle(580, 297, 340, 2, 0x5c6bc0)
    text(this, 410, 312, 'Total', { fontSize: '20px', fontStyle: 'bold' })
    text(this, 750, 308, `${b.total}`, { fontSize: '26px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(1, 0)

    // Pokémon outcomes
    const ballName = Object.fromEntries(BALLS.map((ball) => [ball.key, ball.name]))
    const caught = r.caught.map((c) => `${c.shiny ? '★ ' : ''}${capitalize(c.name)} Lv ${c.level} (${c.rarity}, ${ballName[c.ball]})`).join(', ') || 'none'
    const eliminated = r.eliminated.map((e) => `${capitalize(e.name)} Lv ${e.level}`).join(', ') || 'none'
    text(this, width / 2, 410, `Caught: ${caught}\nEliminated: ${eliminated}`, {
      fontSize: '15px',
      color: '#c5cae9',
      align: 'center',
      lineSpacing: 8,
      wordWrap: { width: 740 },
    }).setOrigin(0.5, 0)

    button(this, width / 2, height - 50, 'Play again [Enter]', () => this.scene.start('title'), { fontSize: '18px' })
  }
}
