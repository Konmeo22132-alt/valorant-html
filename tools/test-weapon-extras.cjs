const { harness } = require('./test-ingame.cjs');
const fs = require('node:fs'),path = require('node:path'),assert = require('node:assert/strict');
(async()=>{
  const h=harness(); const disposed=[];
  try {
    const files=path.join(__dirname,'../val-strike-html/assets/weapons');
    h.w.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(files,url.split('/').pop())))});
    class Texture {
      constructor(url,scene,mip,invert,sample,ready){this.url=url;setTimeout(ready,1);}
      dispose(){this.disposed=true;disposed.push(this.url);}
    }
    h.w.BABYLON={...h.w.BABYLON,Texture};
    h.read(fs.readFileSync(path.join(__dirname,'../val-strike-html/game/weapon-extras.js'),'utf8'));
    // Enable extras explicitly: normal harness disables model/network loading.
    h.w.history.replaceState({},'', 'http://localhost/game/game.html?map=range');
    await h.read('weaponExtrasInit()');
    assert.equal(h.read('Object.keys(weaponShellGeometry).length'),7);
    h.read("weaponState.current='Bulldog'");h.frame(65);
    h.read("window.material={getClassName:()=> 'PBRMaterial', albedoTexture:{s0:true},dispose(){}};weaponAssetContainer={materials:[material],dispose(){}};weaponSkinSelection.Bulldog='Glitter'");
    const original=h.read('material.albedoTexture');await h.read('weaponApplySkin()');
    assert.ok(h.read("material.albedoTexture.url.includes('/Glitter/')"));
    assert.equal(h.read('weaponSkinTextures.length'),4);
    h.read("weaponSkinSelection.Bulldog='S0'");await h.read('weaponApplySkin()');
    assert.equal(h.read('material.albedoTexture'),original);assert.equal(disposed.length,4);
    h.read("weaponSkinSelection.Bulldog='Glitter'");const pending=h.read('weaponApplySkin()');h.read('weaponClearSkin()');await pending;
    assert.equal(h.read('material.albedoTexture'),original);assert.equal(h.read('weaponSkinTextures.length'),0);
    for(let i=0;i<40;i++)h.read('weaponEjectShell()');
    assert.equal(h.read('weaponShells.length'),8);assert.equal(h.read('scene.meshes.filter(mesh=>mesh.name==="ejected_shell").length'),8);
    assert.ok(h.read('weaponShells.every(shell=>shell.mesh.geometry===weaponShellGeometry["556"])'));
    h.frame(60);assert.ok(h.read('weaponShells.every(shell=>!shell.mesh.isEnabled())'));
    h.read('rangeInit(true)');
    h.read('window.counts=[]');
    for(let i=0;i<15;i++)h.read(`rangeState.material='${i%2?'glass':'wood'}';rangeConfigure();counts.push({meshes:scene.meshes.length,materials:scene.materials.length})`);
    assert.equal(h.read('new Set(counts.map(n=>JSON.stringify(n))).size'),1);
    console.log('PASS source skin swap, S0 restoration, stale load disposal, shared shell geometry, bounded pool and range wall rebuild disposal');
  }finally{h.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
