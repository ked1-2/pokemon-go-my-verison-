import Phaser from 'phaser'

export const FONT = 'Verdana, Geneva, sans-serif'

export const BALLS = [
  { key: 'regular', name: 'Poké Ball', hotkey: '1', color: 0xe53935 },
  { key: 'legendary', name: 'Legend Ball', hotkey: '2', color: 0xffb300 },
  { key: 'master', name: 'Master Ball', hotkey: '3', color: 0x8e24aa },
]

export const PARTY_SIZE = 3
export const PARTY_KEYS = Array.from({ length: PARTY_SIZE }, (_, i) => String(i + 1))

export const capitalize = (s) =>
  s
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')

// Shiny Pokémon use different sprites, so they get their own texture keys.
export const textureKey = (poke) => `poke-${poke.id}${poke.shiny ? '-shiny' : ''}`
export const backTextureKey = (poke) => `poke-back-${poke.id}${poke.shiny ? '-shiny' : ''}`

export const TYPE_COLORS = {
  normal: 0xbdbdbd, fire: 0xff7043, water: 0x42a5f5, electric: 0xffee58, grass: 0x66bb6a, ice: 0x80deea,
  fighting: 0xd84315, poison: 0xab47bc, ground: 0xd7b56d, flying: 0x90caf9, psychic: 0xf06292, bug: 0x9ccc65,
  rock: 0xa1887f, ghost: 0x7e57c2, dragon: 0x7c4dff, dark: 0x5d4037, steel: 0x90a4ae, fairy: 0xf8bbd0,
}

export const RARITY_COLORS = {
  common: '#ffffff', uncommon: '#81c784', rare: '#64b5f6', epic: '#ce93d8', legendary: '#ffb300', titan: '#ff1744',
}

export const AURA_COLOR = 0xffd54f

export const displayName = (p) => `${p.shiny ? '★ ' : ''}${capitalize(p.name)}`

// Turns the pulsing golden aura glow of a caught Titan on or off (WebGL only).
export function setAura(sprite, on) {
  if (!sprite.preFX) return
  if (on && !sprite.auraFx) {
    sprite.auraFx = sprite.preFX.addGlow(AURA_COLOR, 4, 0, false, 0.1, 12)
    sprite.auraTween = sprite.scene.tweens.add({ targets: sprite.auraFx, outerStrength: 9, yoyo: true, repeat: -1, duration: 700 })
  } else if (!on && sprite.auraFx) {
    sprite.auraTween.remove()
    sprite.preFX.remove(sprite.auraFx)
    sprite.auraFx = null
  }
}

// Loads PokéAPI sprites (front, plus back when known) at runtime,
// skipping any already in the texture cache.
export function loadSprites(scene, pokes) {
  const images = pokes.flatMap((p) => [
    { key: textureKey(p), url: p.sprite },
    ...(p.backSprite ? [{ key: backTextureKey(p), url: p.backSprite }] : []),
  ])
  const missing = images.filter((img) => !scene.textures.exists(img.key))
  if (missing.length === 0) return Promise.resolve()
  return new Promise((resolve) => {
    scene.load.setCORS('anonymous')
    for (const img of missing) scene.load.image(img.key, img.url)
    scene.load.once(Phaser.Loader.Events.COMPLETE, resolve)
    scene.load.start()
  })
}

// Draws once into a texture so static scenery isn't re-tessellated every frame.
export function bake(scene, width, height, draw) {
  const g = scene.make.graphics({}, false)
  draw(g)
  const rt = scene.add.renderTexture(0, 0, width, height).setOrigin(0)
  rt.draw(g)
  g.destroy()
  return rt
}

export function text(scene, x, y, str, style = {}) {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', ...style })
}

export function button(scene, x, y, label, onClick, { disabled = false, color = '#2b4a8b', fontSize = '15px', width } = {}) {
  const btn = text(scene, x, y, label, {
    fontSize,
    backgroundColor: disabled ? '#555555' : color,
    color: disabled ? '#999999' : '#ffffff',
    padding: { x: 10, y: 6 },
    ...(width ? { fixedWidth: width, align: 'center' } : {}),
  }).setOrigin(0.5)
  if (!disabled) {
    btn.setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => btn.setAlpha(0.8))
    btn.on('pointerout', () => btn.setAlpha(1))
    btn.on('pointerdown', onClick)
  }
  // Stop any looping pulse tween with the button, or it keeps running forever.
  btn.once('destroy', () => scene.tweens.killTweensOf(btn))
  return btn
}

export class Bar {
  constructor(scene, x, y, width, height, { kind = 'hp' } = {}) {
    this.scene = scene
    this.width = width
    this.height = height
    this.kind = kind
    this.g = scene.add.graphics({ x, y })
  }

  set(value, max) {
    // Redraw only when the fill actually changes, not every frame.
    const ratio = Phaser.Math.Clamp(max > 0 ? value / max : 0, 0, 1)
    const fill = Math.round(this.width * ratio)
    this.value = value
    if (fill === this.drawnFill) return this
    this.drawnFill = fill
    let color = 0x42a5f5
    if (this.kind === 'hp') color = ratio > 0.5 ? 0x43a047 : ratio > 0.2 ? 0xfdd835 : 0xe53935
    this.g.clear()
    this.g.fillStyle(0x111111).fillRect(-2, -2, this.width + 4, this.height + 4)
    this.g.fillStyle(0x333333).fillRect(0, 0, this.width, this.height)
    this.g.fillStyle(color).fillRect(0, 0, fill, this.height)
    return this
  }

  // Smoothly drains or fills the bar; onStep receives the rounded value each frame.
  animateTo(value, max, duration = 450, onStep) {
    const from = { v: this.value ?? value }
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: from,
        v: value,
        duration,
        onUpdate: () => {
          this.set(from.v, max)
          onStep?.(Math.round(from.v))
        },
        onComplete: () => {
          this.set(value, max)
          onStep?.(value)
          resolve()
        },
      })
    })
  }

  setPosition(x, y) {
    this.g.setPosition(x, y)
  }

  setDepth(d) {
    this.g.setDepth(d)
    return this
  }

  destroy() {
    this.g.destroy()
  }
}
