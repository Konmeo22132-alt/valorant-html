// ============================================================
// Val-Strike HTML — Global State
// ============================================================

window.VS = window.VS || {
  player: {
    name: 'Player',
    agent: null,
    credits: 800,
    hp: 100,
    armor: 0,
    weapon: 'Vandal',
    ammo: { clip: 25, reserve: 100 }
  },
  round: {
    number: 1,
    phase: 'buy',     // buy | live | end
    timeLeft: 30,
    score: { a: 0, b: 0 }
  },
  team: [],
  enemies: []
};
