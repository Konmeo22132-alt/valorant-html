# Neon development — 2026-10-17

## Live release

Cypher was retired at the user's request. Release **v42-20261017-195308** removes
its playable entry, runtime hooks and 54 unique game/asset files. The live roster
is Clove, Jett and Sage. Raw exports and account history are retained. Archived
runtime files are under `tools/archived/cypher-20261017/`.

Deployment health and public file checks are recorded in
`tools/.artifacts/cypher-removal-public-check.json`. No gameplay session was run.

**Neon is not playable or published yet.** Its assets are staged outside the web
root, so the current download manifest does not force players to download them.

## Native asset package

The initial native conversion contains 57 asset files, 67,222,320 bytes
(64.11 MiB). Two visual runtime scripts are now also staged in
`tools/converted/neon/`; `package-files.json` records the current combined size.

- Native character selection model and intro/idle animation.
- Native first person arms and third person body, with original texture maps.
- Thirteen supplementary animation banks, including directional sprint/slide,
  weapon and skill actions, and backpack cosmetic states.
- Twenty-three effect geometry files, two original beam textures, two source
  material descriptions and four official ability icons.

There are 39 GLBs in total. Static inspection checked GLB structure, buffer view
bounds and local external-image references. The three primary models have no
unresolved materials. Eleven models preserve additional UV channels; five
preserve native vertex color data.

This inspection does not establish correct appearance in Babylon. Effect models
with unresolved native shaders are explicitly invisible until their shaders are
bound. They are not complete effects. Do not publish these as white fallback
geometry or unlock Neon based on conversion success.

Reproduction scripts:

```powershell
python -X utf8 tools/research-neon.py
python -X utf8 tools/convert-neon.py
```

`tools/converted/neon/manifest.json` records source material and clip mappings.
`package-files.json` records paths, sizes and SHA-256 hashes.
`tools/art-review/neon/conversion-report.json` records static inspection counts.

## Research and gameplay contract

All four videos from the [official Neon page](https://playvalorant.com/en-us/agents/neon/)
were decoded sequentially and their frame timelines inspected, without opening
a browser or the game. `tools/art-review/neon/riot-videos.json` records source
URLs, hashes and frame paths. The source character codename is **Sprinter**.

| Key | Ability | Native folder | Requirements from reference |
| --- | --- | --- | --- |
| C | Fast Lane | Ability_4 | Two advancing ground traces and opaque blue/cyan plasma walls, yellow-white bases, irregular flow, ground and obstruction clipping. |
| Q | Relay Bolt | Ability_Q | Native throwing hand, one bounce, two ground blasts, delayed concuss, blue energy with yellow-white center. |
| E | High Gear | Ability_E | Distinct native sprint/slide poses, hand energy, directional boot trails and weapon return during slide. |
| X | Overdrive | Ability_X | Native hand/finger/backpack states, bright beam core and electrical branches, consistent aim and damage rays in first/third person. |

The agent page's Fast Lane text still mentions damage. The official
[4.08 notes](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-4-08/)
removed that damage; video appearance and current mechanics must be treated
separately.

Confirmed changes used in `tools/art-review/neon/implementation-spec.json`:

- [8.11](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-811/):
  9.11 m/s ground sprint, one Relay Bolt, 0.8 s windup, 4 s Fast Lane duration and
  2 s dissolve, 0.2 s slide weapon equip buffer.
- [9.11](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-9-11/):
  one slide charge, crouching movement accuracy during slide, eight-point ult
  and 10 s ult duration.
- [11.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-08/):
  16 s full-battery sprint, 60 s full recharge, 2.5 s Relay Bolt concuss.
- [12.09](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-12-09/):
  no sprint speed bonus in the air; kill fuel regeneration only during ult.

Values still requiring confirmation are explicitly listed in the specification:
slide timing/speed, fuel recharge delay, wall dimensions and precise dissolve
timing, bolt physics/radius, beam tick/range/falloff and missing parent shaders.
Do not silently label estimates as source values.

## Material and animation integration notes

The beam PNGs contain packed red/green masks. They must not be rendered as
literal red/green diffuse textures. The source material selects the red channel,
uses one column, tiling 2, and depleted linear RGB `[1, .416101, .048028]`.
The eight-row texture layout was observed from the actual images; the parent
material graph is absent, so complete shader reconstruction is still pending.

Extra UVs and vertex colors contain effect data. Preserve them during loading and
bind them deliberately. `E_sprint_additive` is additive and must not replace the
absolute skeleton pose. Backpack cosmetic clips also need separate state mapping.

Apply the UE centimeter/axis conversion once per hierarchy. Preserve exported
root transforms when instantiating containers. Do not add a second 0.01 scale or
apply animation root translation on top of physics displacement.

## Remaining implementation order

1. Build E sprint/slide on shared movement physics with fuel, collisions, weapon
   return and server state. Maintain local input prediction and stairs handling.
2. Bind native arm/body animation and power materials for local first person,
   local third person, remote players and bots using the same action state.
3. Integrate Q bounce/concuss, C vision blocking and X authoritative beam damage,
   with their native effect geometry/material roles.
4. Integrate shop, HUD, selection and match reset/death/disposal behavior.
5. Resolve visual and network validation before unlocking or publishing Neon.

The current work ran conversion and static/deployment inspections only. No
browser, game, Blender session or gameplay tests were launched under the user's
RAM constraint.

## Visual runtime added after native conversion

Canonical source: `val-strike-html/game/neon-vfx-shaders.js` and `neon-vfx.js`.
The Fast Lane-only file is loaded by `game.html` as a dormant renderer, but is
not called by the live match while Neon remains locked. Run
`python -X utf8 tools/stage-neon-vfx.py` after editing to refresh the staged
package and SHA-256 inventory. No production assets or unlock flags change.

Implemented visual paths:

- **C**: two independently supplied terrain profiles, opaque blue/cyan wall
  surfaces, broad moving flow, yellow-white bases, advancing reveal and irregular
  dissolution. The caller provides pre-clipped terrain profiles and timing.
- **Q**: simulation-driven bolt position, delayed ground warning/blast and native
  cylinder geometry. Simulation, rather than the renderer, determines bounces.
- **E**: native 1P/3P arm cylinders, native boot overlays with source vertex alpha,
  equip swooshes and two bounded foot trails. Trails retain 18 points each, update
  at most 30 times per second and break at teleports, gaps and clock rewinds.
- **X**: source red-channel beam/glow masks, eight-row atlas with half-texel guards
  and frame interpolation, native equip geometry and batched fingertip glows.
  One glow mesh covers ten fingertips rather than ten separate draw calls.

`createActor()` uses bone nodes and a single state contract for local first/third
person, remote actors and bots. This is an adapter ready for gameplay wiring;
it is not an assertion that Neon gameplay/network synchronization exists.
The beam originates at the right index finger and uses the caller's authoritative
endpoint. The visual renderer never performs its own damage or collision raycast.

World effects remain in the world depth group. Only first-person overlays use the
existing viewmodel group. Materials are unlit and do not require dynamic lights,
bloom, a particle system, a fullscreen effect or a second render loop. Source
containers and textures are loaded sequentially and every handle has disposal.
Only cosmetic equip effects are eligible for the 24-effect budget; active walls,
impact warnings, beams and owner overlays are not evicted by it.

The wall surface, concuss ground pattern and fingertip caps are **reconstructions
from the official footage**, not recovered original parent shaders. Native arm,
boot, equip and cylinder geometry and the two beam texture atlases are used
directly. The mesh-flipbook puff is still excluded: its frame data is unresolved.
Source MRAE alpha was inspected and is uniformly 255; treating it as an emission
mask would make the whole character glow. Full-body power-state masks remain
unresolved.

References for the shader integration:
[Babylon transparency](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/materials/advanced/transparent_rendering.md),
[Babylon bones/skeletons](https://doc.babylonjs.com/features/featuresDeepDive/mesh/bonesSkeletons).

### Isolated preview

`tools/art-review/neon/preview.html` provides C/Q/E/X selection, first/third-person
views, pause and timeline controls. It loads one Neon model for the selected view
and the staged VFX assets, with no map, game boot, preload worker or multiplayer
connection. Preview trajectories/dimensions are authoring values, not gameplay
parameters. Start a local static server from this workspace when RAM permits:

```powershell
python -m http.server 8766 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8766/tools/art-review/neon/preview.html`.
The preview has not been opened: the machine had about 300 MB free at the start
of this phase. JavaScript parsing checks do not establish shader compilation,
appearance, performance, skeletal attachment correctness or multiplayer behavior.
