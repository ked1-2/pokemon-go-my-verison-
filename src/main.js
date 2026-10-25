import Phaser from 'phaser'
import { TitleScene } from './scenes/TitleScene.js'
import { LobbyScene } from './scenes/LobbyScene.js'
import { ArenaScene } from './scenes/ArenaScene.js'
import { BattleScene } from './scenes/BattleScene.js'
import { ResultsScene } from './scenes/ResultsScene.js'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 600,
  backgroundColor: '#0d1b2a',
  pixelArt: true,
  fps: { limit: 60 }, // don't burn CPU/GPU at 144Hz+ refresh rates
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [TitleScene, LobbyScene, ArenaScene, BattleScene, ResultsScene],
})

// Handy for poking at the game from the browser console during development.
if (import.meta.env.DEV) window.__game = game

// Playtest helper: `arena.spawn(150)` (optionally `arena.spawn(150, 40)` for a level) starts a
// battle against that Pokédex number. Works while walking around the arena; the server only
// allows it locally or on a deploy with PLAYTEST=1.
window.arena = {
  async spawn(id, level) {
    if (!game.scene.isActive('arena')) {
      console.warn('arena.spawn: enter the arena first.')
      return
    }
    try {
      const wild = await game.scene.getScene('arena').playtestSpawn(id, level)
      console.log(`arena.spawn: battling ${wild.name} (#${wild.id}) Lv ${wild.level}, capture rate ${wild.captureRate}/255`)
      return wild
    } catch (err) {
      console.error(`arena.spawn: ${err.message}`)
    }
  },
}
