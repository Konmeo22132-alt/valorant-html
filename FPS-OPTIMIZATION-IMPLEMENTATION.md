# FPS update — 2026-10-17

## Applied changes

- The Haven AO geometry pass now filters its explicit render list against the
  active camera frustum and layer mask. Its scratch list is reused. Static
  off-screen shadow casters stay in their separate cached shadow list.
- AO depth/normal buffers use the profile's explicit resolution ratio. Previously
  the forced geometry buffer was full resolution even though SSAO used 0.75.
- Graphics settings: High, Balanced and Performance. Balanced uses half-size AO
  buffers, 8 AO samples and 8 denoise samples; High keeps 16 samples. Performance
  keeps the map's sun/shadow lighting and disables contact AO. Colors, geometry
  and shadow-map size stay consistent with the corrected map presentation.
- WebGL context antialiasing is disabled while the existing FXAA remains enabled.
- 3D resolution can be automatic, 100%, 85% or 75%. HUD resolution is unchanged.
  Automatic mode uses valid asynchronous GPU timer samples, bounded scale changes
  and cooldowns. CPU stalls alone do not trigger resolution reduction. Its budget
  targets up to 60 FPS; the independent FPS cap remains selectable up to 240.
- These choices are saved using the existing account-data API backed by SQLite;
  there is no browser-local settings storage or database schema change.
- Animation snapshots and transition snapshots reuse per-clip/per-view pose
  storage. Bone aiming uses reusable vectors, quaternions and an inverse matrix.
  Unblended bot lower-body poses skip snapshot creation. Animation evaluation
  frequency and attack/skill timing are unchanged.
- Passive diagnostics are available as `window.__vsRenderStats`: frame interval
  mean/p95/p99, CPU submission time, GPU time when supported, resolution/scale,
  draw-call counter where available, and AO candidate/submitted mesh counts.
  No diagnostic buttons or overlays were added to gameplay.

## Research behind the implementation

- [PlayCanvas optimization guidelines](https://developer.playcanvas.com/user-manual/optimization/guidelines/): allocation and garbage-collection cost, draw-call and fill-rate budgets.
- [Three.js object optimization](https://threejs.org/manual/pages/optimize-lots-of-objects.html): scene-graph/object overhead and spatially appropriate geometry grouping.
- [Unity dynamic resolution](https://docs.unity.com/en-us/engine/6000.0/manual/cameras/resolution-scale/dynamic-resolution): scale GPU work through render targets.
- [Unreal visibility and occlusion](https://dev.epicgames.com/documentation/en-us/unreal-engine/visibility-and-occlusion-culling-in-unreal-engine): apply visibility filtering before expensive rendering.
- [Browser FPS BananaBread](https://kripken.github.io/BananaBread/), [Mozilla discussion of its worker experiment](https://research.mozilla.org/2014/07/22/webgl-in-web-workers-today-and-faster-than-expected/): browser FPS implementations and the distinction between throughput and input latency. This update does not introduce a worker-renderer migration based on the older experiment.
- [Babylon object renderer 8.32.0](https://github.com/BabylonJS/Babylon.js/blob/8.32.0/packages/dev/core/src/Rendering/objectRenderer.ts#L761): explicit RTT lists bypass the main scene's frustum selection.
- [Babylon SSAO2 8.32.0](https://github.com/BabylonJS/Babylon.js/blob/8.32.0/packages/dev/core/src/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.ts): explicit geometry-buffer ratios and AO/denoise parameters.

Further opportunities include baked lightmaps/AO, geometry LOD and precomputed
visibility. Those require asset production and visual validation; they are not
represented as completed changes in this release.

## Release isolation and evidence

The production base was `v42-20261017-072848`. Its public files were copied into
`tools/.artifacts/performance-release/project/` before applying the optimization.
This lets the update ship independently of the local Cypher work. The payload
does not unlock Cypher or change server gameplay/account code.

Review artifacts:

- `tools/.artifacts/performance-release/changes.patch`
- `tools/.artifacts/performance-release/files.json`
- `tools/.artifacts/performance-release/static-review.json`

JavaScript syntax and JSON parsing passed. No game/browser was opened and no
runtime game tests or FPS benchmark was run, respecting the RAM constraint and
the current testing instructions. Deployment health/checksum evidence will be
recorded separately. There is no measured percentage/FPS gain claim.

## Published release

Published **`v42-20261017-125407`** to `https://val.konmeo22132.dev/`.
The upload verified 12 changed files including the preload manifest, preserved
SQLite and passed the deployment health check. Public HTTPS requests to the
new runtime, map presentation, profile/menu scripts and preload manifest returned
200 with matching SHA-256 digests. Evidence: `tools/.artifacts/performance-release/public-check.json`.

The compressed deployment payload was about 0.3 MiB; native models/maps were not
changed. In-game FPS and visual quality have not been measured in this pass.

## Babylon compatibility hotfix

Published `v42-20261017-130021`: replaced the invalid static
`B.Matrix.InvertToRef(parent, target)` call with the Babylon 8.32 instance method
`parent.invertToRef(target)`. Body script cache version is now 61. The public
HTTPS script matches the published SHA-256; deployment health passed. Other new
math calls were checked against the bundled engine source. Game execution was
not performed in this pass.
