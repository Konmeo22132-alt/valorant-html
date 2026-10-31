# Cypher runtime integration — 2026-10-17

**Retired at the user's request.** Release `v42-20261017-195308` removed Cypher
from the live roster, runtime and preload package. The following describes the
historical implementation, not the current release. Work has moved to Neon;
see `NEON-DEVELOPMENT.md`.

Status: deployed as **v42-20261017-130828**. Only static syntax
and asset-reference inspection have been performed. No browser, game or Blender
was launched, following the user's RAM constraint. This is not a claim of 100%
visual or multiplayer validation.

## Assets and animation

- The 48-file native package (50.68 MiB) is copied into the web asset tree.
- Cypher is enabled in selection, roster, profile validation and saved results.
  Omen and the other previously locked agents remain locked.
- All eight TP and two FP supplementary banks load sequentially. Retargeted
  groups, cloned props, skeletons and temporary effects have disposal paths.
- Native held/deployed wire, cage, camera, dart and hat models are used. Camera
  control poses and ultimate lower-body poses apply to the local avatar and
  remote avatars. The body hat disappears after X and returns next round.
- Two extra animation-only banks (670,864 bytes total) provide dart-removal
  intro/loop/outro for all four playable agents, using native Core TP clips and
  Gumshoe FP clips. Export source: `tools/export-cypher-dart.py`.

## Shared gameplay rules

`val-strike-html/game/cypher-rules.js` is the array-vector simulation used by
`server/room.cjs` and the offline match adapter. Online placement, charges,
damage, cooldowns and reveal recipients are server decisions.

| Skill | Implemented behavior |
|---|---|
| C | Surface-to-surface placement and preview; 15 m wire limit; two devices; health/damage; swept crossing detection; 50% chained slow; 0.7 s windup; early zap after moving 4 m out; 1 s reveal/slow; rearm after 2 s; recall; disable on death/suppression |
| Q | Native thrown puck with gravity/bounce/landing; F to activate; pickup during buy phase; open-top cylindrical visibility wall; 7.25 s lifetime; crossing cue; no slow |
| E | Wall placement with height/range limits; separate observation camera; constrained look; body stays in place, vulnerable; native HUD; dart flight/hits; repeated fixed-position reveals; held-F removal with a renewed input lease; 15 s recall / 60 s destroyed cooldown; 0.7 s exit lock |
| X | Enemy corpse targeting and obstruction check; native thrown hat; two snapshot reveals, first at 2 s and second 4 s later; seven ultimate points |

Reveals are position snapshots, not continuous tracking. Their network payloads
and events are restricted to the caster's team. The minimap uses the same
snapshots. Dart-removal state is public so other players see the removal pose.

## Spycam and controls

- E toggles an existing camera; left click fires a dart; right click exits.
- F activates an aimed own cage or recalls an aimed wire/camera; while marked,
  hold F to remove the dart instead. Cage activation also works from Spycam.
- Switching weapons, pause, death, damage, camera destruction, disconnection,
  suppression and round transitions release observation. A pending exit masks
  stale camera snapshots to avoid reopening the view during network latency.
- Movement, weapon fire, ADS, reload, objective interaction and equipment actions
  are blocked during observation/removal. Spycam look never updates body feet.
- Buying considers deployed devices; the free camera cannot be repurchased to
  bypass its cooldown. No changes were made to account storage or SQLite schema.

## Bots and presentation

- Cypher bots place devices, use cages, briefly observe and fire camera darts,
  and attempt Neural Theft on a valid aimed corpse.
- Marked bots remove darts. Bots can shoot detected enemy wires/cameras using
  world obstruction checks and their own ammunition/fire cadence.
- Cage wall shader, wire/tether lines, native device props, native minimap icons,
  camera overlay and temporary native-body golden reveal copies are implemented.
- Audio currently uses bounded procedural electronic cues with spatial panning.
  The local source contains no Cypher audio, and the Riot showcase downloads
  have no audio stream. These are **not original Riot SFX**.

## Accuracy limits and pending visual review

The current Trapwire changes, cage no-slow rule, ultimate cost/two scans and
camera destruction cooldown follow the official patch sources recorded in
`CYPHER-RESEARCH.md`. Baseline device stats and timings not stated by those
patches are configurable gameplay estimates; see the research spec for sources.

The following still need an actual game session before describing Cypher as
100% finished: FP/TP socket alignment, native removal retargeting on the other
three rigs, Cage visual match to the video, Spycam transitions, actual two-client
interaction/latency, and native SFX replacement if original audio is supplied.
No runtime tests have been added or run in this pass.

## Release preparation

The exact proposed paths are recorded in
`tools/.artifacts/cypher-release-files.json`. Refreshing the preload manifest is
separate from deployment. The production service and live rooms have not been
restarted during this integration pass.

## Production publication

Published `v42-20261017-130828` with 82 changed files (53.2 MiB before transport
compression, 26.8 MiB uploaded). Upload checksums and server health passed; SQLite
was preserved. Public HTTPS checks matched the new Cypher rules/controller,
selection config, catalogue and native menu/body GLBs. The performance profiles,
pose-buffer optimization and Matrix instance-API hotfix are retained. Evidence:
`tools/.artifacts/cypher-public-check.json`. No game/browser was opened; gameplay
and visual behavior remain unverified in this publication pass.

## Character-select texture URI hotfix

Published `v42-20261017-131634`. Babylon 8.32 rejects image URIs containing
`..`; the CS model previously referenced shared textures in a sibling folder.
Its three PNGs are now embedded in the GLB. All 25 Cypher GLBs were inspected
for loader-compatible URIs and image buffer bounds. The exporter now embeds
cross-folder textures automatically. Public HTTPS range requests confirmed the
new menu GLB has three embedded PNGs and no external image URI; upload checksums
and server health passed. Geometry/animation data and texture quality are kept.
