// Load tất cả game config (data-driven architecture)
window.GAME_CONFIG = {};
window.CONFIG_READY = Promise.all([VSAssets.ready(),ACCOUNT_READY.then(data=>{if(!data){location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));throw Error('Vui lòng đăng nhập.');}}),Promise.all(
  ['movement', 'weapons', 'economy', 'rounds', 'agents', 'performance', 'playable-agents', 'match', 'abyss-match', 'haven-match', 'network'].map(async (f) => {
    const res = await fetch('config/' + f + '.json', {cache:'no-cache'});
    if (!res.ok) throw new Error('config ' + f + ': ' + res.status);
    window.GAME_CONFIG[f] = await res.json();
  })
)]).then(()=>{window.VSProfile?.apply(window.GAME_CONFIG);});
