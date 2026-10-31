// One active texture set and eight shared-geometry casings, independent of map streaming.
let weaponSkinCatalog = {}, weaponSkinTextures = [], weaponSkinVersion = 0;
const weaponSkinSelection = {}, weaponShells = [], weaponShellGeometry = {};
let weaponShellMaterial = null, weaponShellCursor = 0;
async function weaponExtrasInit() {
  if (new URLSearchParams(location.search).get('models') === '0') return;
  try {
    const res = await fetch('/assets/weapons/skins.json');
    if (!res.ok) throw new Error('Skin catalog ' + res.status);
    weaponSkinCatalog = await res.json(); weaponSkinPicker();
    const shells = await fetch('/assets/weapons/shells.json');
    if (!shells.ok) throw new Error('Shell geometry ' + shells.status);
    const data = await shells.json();
    if (scene.isDisposed) return;
    for (const [caliber, source] of Object.entries(data)) {
      const geometry = new BABYLON.Geometry('shell_' + caliber, scene);
      const vertex = new BABYLON.VertexData(); vertex.positions = source.positions; vertex.indices = source.indices;
      vertex.normals = []; BABYLON.VertexData.ComputeNormals(vertex.positions, vertex.indices, vertex.normals);
      geometry.setAllVerticesData(vertex); weaponShellGeometry[caliber] = geometry;
    }
    weaponShellMaterial = new BABYLON.StandardMaterial('shell_brass', scene);
    weaponShellMaterial.diffuseColor = new BABYLON.Color3(0.55, 0.38, 0.14);
    weaponShellMaterial.specularColor.set(0.35, 0.3, 0.2);
    scene.onDisposeObservable.add(() => { weaponSkinTextures.forEach(texture => texture.dispose()); weaponSkinTextures = []; });
  } catch (error) { console.warn('[weapon extras]', error.message); }
}
function weaponSkinPicker() {
  if(window.GameEntry)return;
  let picker = document.getElementById('range-skin');
  if (!picker) {
    const weaponPicker = document.getElementById('range-weapon'); if (!weaponPicker) return;
    const label = document.createElement('label'); label.className = 'hint'; label.textContent = 'Skin: ';
    picker = document.createElement('select'); picker.id = 'range-skin'; label.appendChild(picker); weaponPicker.parentElement.after(label);
    picker.addEventListener('change', () => { weaponSkinSelection[weaponState.current] = picker.value; weaponApplySkin(); });
  }
  picker.replaceChildren();
  for (const id of ['S0', ...Object.keys(weaponSkinCatalog[weaponState.current] || {})]) {
    const option = document.createElement('option'); option.value = option.textContent = id; picker.appendChild(option);
  }
  picker.value = weaponSkinSelection[weaponState.current] || 'S0';
}
function weaponClearSkin() {
  weaponSkinVersion++;
  weaponSkinTextures.forEach(texture => texture.dispose()); weaponSkinTextures = [];
}
async function weaponApplySkin() {
  const version = ++weaponSkinVersion, container = weaponAssetContainer;
  if (!container) return;
  const skin = weaponSkinCatalog[weaponState.current]?.[weaponSkinSelection[weaponState.current]];
  const material = container.materials.find(mat => mat.getClassName() === 'PBRMaterial' && mat.albedoTexture);
  if (!material) return;
  const properties = { albedo: 'albedoTexture', normal: 'bumpTexture', metallic: 'metallicTexture', ambient: 'ambientTexture' };
  material.metadata ||= {};
  material.metadata.s0Textures ||= Object.fromEntries(Object.values(properties).map(key => [key, material[key]]));
  const textures = [];
  try {
    const swaps = {};
    if (skin) for (const [slot, url] of Object.entries(skin.textures)) {
      const texture = await new Promise((resolve, reject) => {
        const value = new BABYLON.Texture(url, scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, () => resolve(value), (_, error) => reject(error || new Error(url)));
      });
      texture.gammaSpace = slot === 'albedo'; textures.push(texture); swaps[properties[slot]] = texture;
      if (version !== weaponSkinVersion || container !== weaponAssetContainer || scene.isDisposed) { textures.forEach(t => t.dispose()); return; }
    }
    Object.assign(material, material.metadata.s0Textures, swaps);
    weaponSkinTextures.forEach(texture => texture.dispose()); weaponSkinTextures = textures;
    window.__renderOnce = true;
  } catch (error) { textures.forEach(texture => texture.dispose()); console.warn('[skin]', error.message); }
}
function weaponEjectShell(reload = false) {
  const name = weaponState.current, def = weaponDef();
  if (!reload && ['Sheriff', 'Shorty', 'Outlaw'].includes(name)) return; // Retain empty cartridges until reload.
  const caliber = name === 'Sheriff' ? '44sw' : name === 'Shorty' || def.class === 'shotgun' ? '12g' : def.class === 'pistol' || def.class === 'smg' ? '9mm'
    : name === 'Operator' ? '50bmg' : def.class === 'sniper' ? '306' : name === 'Vandal' ? '762' : '556';
  const geometry = weaponShellGeometry[caliber]; if (!geometry) return;
  const slot = weaponShellCursor++ % 8;
  let shell = weaponShells[slot];
  if (!shell) {
    const mesh = new BABYLON.Mesh('ejected_shell', scene); mesh.isPickable = false; mesh.material = weaponShellMaterial;
    shell = weaponShells[slot] = { mesh };
  }
  geometry.applyToMesh(shell.mesh); shell.mesh.setEnabled(true);
  const right = camera.getDirection(BABYLON.Axis.X), forward = camera.getDirection(BABYLON.Axis.Z);
  shell.mesh.position.copyFrom(camera.position.add(right.scale(0.18)).add(forward.scale(0.35)).add(new BABYLON.Vector3(0, -0.12, 0)));
  shell.velocity = right.scale(1.2).add(new BABYLON.Vector3(0, 1.2, 0)); shell.expires = weaponNow() + 900;
}
function weaponUpdateShells() {
  const dt = window.__frameDT || 1 / 30;
  weaponShells.forEach(shell => {
    if (!shell.mesh.isEnabled()) return;
    if (weaponNow() >= shell.expires) { shell.mesh.setEnabled(false); return; }
    shell.velocity.y -= 9.8 * dt; shell.mesh.position.addInPlace(shell.velocity.scale(dt)); shell.mesh.rotation.x += dt * 12;
  });
}
