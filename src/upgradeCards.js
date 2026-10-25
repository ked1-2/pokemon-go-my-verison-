import { button, displayName, text } from './ui.js'

const CARD_STYLE = {
  power: { color: 0xc62828, icon: '⚔' },
  quick: { color: 0xf9a825, icon: '⚡' },
  stride: { color: 0x2e7d32, icon: '➜' },
}

// Pauses on a full-screen overlay with the three upgrade cards from the server.
// Calls onPick(cardKey) once, or onPick(null) when every card is already maxed.
export function showUpgradeCards(scene, state, onPick) {
  const p = state.player
  const layer = scene.add.container(0, 0).setDepth(200)
  layer.add(scene.add.rectangle(400, 300, 800, 600, 0x000000, 0.78))
  layer.add(text(scene, 400, 70, 'LEVEL UP!', { fontSize: '40px', fontStyle: 'bold', color: '#ffd54f', stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5))
  layer.add(text(scene, 400, 116, `${displayName(p)}'s XP is full. Choose an upgrade (+5 levels too):`, { fontSize: '16px' }).setOrigin(0.5))

  let picked = false
  const pick = (key) => {
    if (picked) return
    picked = true
    scene.input.keyboard.off('keydown', onKey)
    layer.destroy()
    onPick(key)
  }

  const cards = state.upgradeCards
  const keys = {}
  cards.forEach((c, i) => {
    const x = 160 + i * 240
    const style = CARD_STYLE[c.key]
    const card = scene.add.container(x, 300)
    const bg = scene.add.rectangle(0, 0, 210, 250, c.maxed ? 0x37474f : 0x1e2a4a).setStrokeStyle(4, c.maxed ? 0x607d8b : style.color)
    card.add([
      bg,
      scene.add.rectangle(0, -100, 210, 50, c.maxed ? 0x546e7a : style.color),
      text(scene, 0, -100, `${style.icon}  ${c.name}`, { fontSize: '18px', fontStyle: 'bold' }).setOrigin(0.5),
      text(scene, 0, -40, c.desc, { fontSize: '14px', align: 'center', wordWrap: { width: 180 } }).setOrigin(0.5),
      text(scene, 0, 20, c.maxed ? 'MAXED OUT' : c.preview, { fontSize: '13px', fontStyle: 'bold', color: '#80cbc4', align: 'center', wordWrap: { width: 190 } }).setOrigin(0.5),
      text(scene, 0, 62, `Level ${c.level} / ${c.max}`, { fontSize: '13px', color: '#c5cae9' }).setOrigin(0.5),
      text(scene, 0, 100, c.maxed ? '' : `Press ${i + 1}`, { fontSize: '14px', fontStyle: 'bold', color: '#ffd54f' }).setOrigin(0.5),
    ])
    layer.add(card)
    if (c.maxed) return
    keys[String(i + 1)] = c.key
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => card.setScale(1.05))
    bg.on('pointerout', () => card.setScale(1))
    bg.on('pointerdown', () => pick(c.key))
    card.setScale(0.6).setAlpha(0)
    scene.tweens.add({ targets: card, scale: 1, alpha: 1, delay: i * 90, duration: 250, ease: 'Back.Out' })
  })

  if (cards.every((c) => c.maxed)) {
    layer.add(button(scene, 400, 500, 'Level up [Enter]', () => pick(null), { color: '#2e7d32', width: 200 }))
    keys.enter = null
  }

  function onKey(e) {
    const key = e.key.toLowerCase()
    if (key in keys) pick(keys[key])
  }
  scene.input.keyboard.on('keydown', onKey)
}
