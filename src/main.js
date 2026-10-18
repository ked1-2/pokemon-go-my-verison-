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
