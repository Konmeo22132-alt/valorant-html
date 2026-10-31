"""Package Neon visual runtime without publishing or unlocking the agent."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / 'tools/converted/neon'
FILES = ('neon-vfx.js', 'neon-vfx-shaders.js', 'neon-fast-lane.js')
SHARED_TEXTURES = {
    'neon-fluid-noise.png': 'NoiseDissolve/SwirlyNoise01_TFX.png',
    'neon-flow-field.png': 'UVdist/FlowMap_1_TEX.png',
    'neon-caustics.png': 'Old/T_Noise_Caustics.png',
}


def main():
    target = PACKAGE / 'game'
    target.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copy2(ROOT / 'val-strike-html/game' / name, target / name)
    texture_root = ROOT / 'model/valorant-model-animations-agents/Content/VFX/Textures'
    for name, source in SHARED_TEXTURES.items():
        shutil.copy2(texture_root / source, PACKAGE / 'assets/playable/vfx' / name)
    manifest_path = PACKAGE / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['status'] = 'native assets and visual runtime staged; gameplay integration and visual validation pending; not published'
    manifest['visualRuntime'] = {
        'scriptsInLoadOrder': ['game/neon-vfx-shaders.js', 'game/neon-vfx.js', 'game/neon-fast-lane.js'],
        'api': 'VSNeonVFX.create(scene, {assetRoot})',
        'clock': 'caller-supplied simulation seconds',
        'preview': 'tools/art-review/neon/preview.html',
        'gameplayIntegrated': False,
        'browserExecuted': False,
        'nativeSharedTextures': SHARED_TEXTURES,
        'effects': {
            'C': 'independent neon-fast-lane.js renderer rebuilt from the two supplied in-game images; blue volume, open curved jade/lime plasma, fine contact arcs and enemy red lower body',
            'Q': 'position-driven energy core/trail, fractured ground warning, hemisphere blast and native cylinder crown',
            'E': 'native arm/boot overlays, native equip, 18-sample trails per foot with teleport discontinuities',
            'X': 'source red/green beam branches, blue halo and yellow-white core, interpolated atlas, finger-length power and native equip'
        },
        'reconstructedFromVideo': ['Fast Lane surface shader', 'concuss ground pattern', 'fingertip glow'],
        'fastLaneAuthoring': {
            'renderer': 'game/neon-fast-lane.js',
            'preview': 'tools/art-review/neon/fast-lane.html',
            'references': ['tools/art-review/neon/references/current-inside.png', 'tools/art-review/neon/references/current-outside.png'],
            'previousPromptRecipes': 'discarded; old Fast Lane methods/shaders removed from shared renderer',
            'depthTest': True, 'bodyDepthWrite': True,
            'textures': ['neon-caustics.png', 'neon-fluid-noise.png', 'Sprinter_Lightning_Beam_Flip01_T.png'],
        },
        'unresolved': ['body power-state masks', 'mesh-flipbook frame decoding', 'missing original parent shaders'],
        'limits': {'cosmeticEquipEffects': 24, 'trailSamplesPerFoot': 18, 'trailWritesPerSecond': 30},
        'notes': [
            'World effects retain depth testing. First-person overlays use the game viewmodel render group.',
            'Source texture masks are linear data; no mipmaps mix neighbouring atlas frames.',
            'No private render loop, dynamic lights or fullscreen passes in the renderer.',
            'MRAE alpha is uniformly 255 in these source maps; it is not a valid body emission mask.',
            'Do not unlock or publish based on successful conversion or JavaScript parsing.'
        ]
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    files = []
    for folder in ('assets', 'game'):
        for path in sorted((PACKAGE / folder).rglob('*')):
            if not path.is_file():
                continue
            with path.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            files.append({'file': path.relative_to(PACKAGE).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest})
    data = {'agent': 'Neon', 'status': manifest['status'], 'totalBytes': sum(f['bytes'] for f in files), 'files': files}
    (PACKAGE / 'package-files.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    report_path = ROOT / 'tools/art-review/neon/conversion-report.json'
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding='utf-8'))
        report.update(files=len(files), MiB=round(data['totalBytes'] / 1048576, 2), visualRuntimeFiles=len(FILES))
        report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'files': len(files), 'MiB': round(data['totalBytes'] / 1048576, 2), 'published': False}))


if __name__ == '__main__':
    main()
