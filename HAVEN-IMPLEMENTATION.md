# Haven — asset conversion and review

Updated 2026-10-17.

## Files and scope

- Original user file moved to `val-strike-html/assets/maps/raw/haven.blend` (225,784,219 bytes), with source SHA-256 recorded in the output manifest.
- Portable, self-contained asset: `val-strike-html/assets/maps/optimized/haven-art/haven_lowpoly.glb` (11,806,148 bytes / 11.26 MiB).
- Spatial version: 194 GLB chunks, 11,864,608 bytes in total, with a shared 95,214-byte atlas and two runtime materials (opaque and alpha test).
- Original structural collision data: `val-strike-html/assets/maps/raw/haven-collision-source.npz`, 1,460,416 triangles. This is conversion input for collision integration, not an installed gameplay BVH.
- Browser asset viewer: `python -X utf8 tools/preview-haven.py`, then `http://127.0.0.1:8461/`.

Haven was integrated and deployed in release v42-20261016-202519: shared map registry, server/client collision, native minimap registration, 11,254 navigation nodes, A/B/C objectives, random Abyss/Haven for normal queues and selectable Custom map/rules. Cypher/Omen conversion is paused while gameplay rendering is corrected.

## Geometry and style

The Blender file contains 12,088 mesh objects and 4,094,074 instanced triangles, including alternate/cinematic collections. The selected normal map contains 7,114 objects and 2,562,516 triangles before render simplification. Final render geometry is 1,717,141 triangles, about 33% below the selected scene; comparing only against the larger all-variants scene would overstate the geometric simplification.

The normal map collections are selected explicitly. Identical geometry/transform/material instances are omitted only after comparison, and 6 detached high roof debris objects are recorded separately in the filter audit. All 24 selected floor objects, 9 stairs objects and 171 Meteor/Shard cover objects are retained. Meteor/Shard names refer to map crates and cover and must not be filtered as effects.

The 319 original materials were reviewed using the generated contact sheets, then assigned authored colors and broad painted regions. Walls, wood and roofs use separate palettes. Roof material IDs 294–296 use clean brown colors; decorative details, door/window regions and crate framing retain simplified patterns. Native pink foliage cards become deterministic faceted crown clusters. Other cutout foliage retains its alpha silhouette.

Planar simplification protects material and painted UV boundaries. Subsequent meshoptimizer simplification uses locked borders, normal/UV attribute weights and a 0.015 absolute appearance-error limit. This is the algorithm's appearance metric, not a measured global Hausdorff-distance guarantee. Draco compression uses 16-bit position, 10-bit normal and 18-bit texture-coordinate quantization. Original collision is stored independently of these render changes.

## Inspection and reproducibility

```powershell
python -X utf8 tools/build-haven-map.py --render
```

The pipeline verifies GLB lengths, triangle totals, embedded/shared atlas equality and Draco decoding. Blender CPU renders were generated at overview, A/B/C and ground viewpoints; the final GLB also loaded in Babylon using the existing local Draco decoder. No match FPS or gameplay collision-completeness claim follows from these asset checks.

Data and images:

- `tools/art-review/haven-source/inventory.json`
- `tools/art-review/haven-source/object-filter.json`
- `tools/art-review/haven-source/geometry-optimization.json`
- `tools/art-review/haven-source/simplification.json`
- `tools/art-review/haven-output/`

## Why offline images and browser previews differed

The earlier attractive A/B/C pictures were Blender Cycles CPU renders: directional shadows, indirect illumination, contact darkening and denoising, at 1120×800. Several were from an intermediate palette before the roof color cleanup and the final render simplification.

The first Babylon viewer used hemispheric/directional lighting without a shadow generator or ambient occlusion, disabled antialiasing and capped the render size at 1100×780. It also used a wider perspective framing. Those settings omitted much of the depth visible in the offline renders.

The 2026-10-16 viewer update adds filtered 2048 shadow maps, SSAO2 contact shading where supported, FXAA, a higher resolution cap, closer light direction/framing, and shadow shader warmup before caching the static shadow map. The renderer pauses when idle. Visual checks at Site C found no browser errors; the before/after images are `babylon-site-c.png` and `babylon-site-c-quality.png`.

This remains a real-time raster preview. It does not reproduce Cycles indirect light transport exactly. Baked lighting would be the next step toward preserving those static lighting details at gameplay cost.

## 2026-10-17 gameplay rendering correction

The deployed map and the standalone preview use the same exported geometry, but
their presentation diverged in several concrete ways:

- Gameplay was capped at 960x600 with engine antialiasing disabled. The cap is now
  1920x1080 at device pixel ratio 1, with FXAA; the user's FPS choice still caps
  the render loop up to 240 FPS.
- Manual Draco decoding reflected X and then reversed the triangle indices.
  Reflection already converts glTF winding to Babylon's LH mesh convention.
  The second reversal made visible polygons back faces: two-sided PBR then
  inverted their lighting normals. Only that redundant render index reversal
  is removed; collision geometry is unchanged.
- Haven now uses the standalone glTF sampler (nearest, no mipmaps, clamp) and
  its default specular factor. The earlier trilinear atlas sampler could blend
  neighboring palette cells.
- `game/map-presentation.js` now supplies the same Haven sky/ground colors,
  directional light, contrast, shadow filtering, SSAO parameters and FXAA to
  gameplay and the local asset viewer. Contact AO uses a dedicated geometry
  buffer containing map meshes, excluding skinned agents, viewmodels and VFX.
- All 194 Haven render chunks fit the existing 80 MiB geometry budget
  (77.95 MiB estimated resident geometry). They are retained for every Haven
  mode, so off-camera buildings remain available as static shadow casters.
- The shadow bias is .002 instead of .0005, with normal bias .1. A local
  shadow on/off comparison confirmed that planar floor stripes were shadow
  self-intersection; the adjusted bias removes these stripes while keeping
  roof/foliage shadows. The shadow map is cached after shader warmup.

Visual comparison uses `tools/preview-entry.py` on loopback 8460, loading the
actual game HTML, renderer, chunk loader, agents and match initialization. Its
review camera can be placed at the same A/B/C camera as the standalone viewer.
The gameplay snapshot reached ready with 194 chunks / 1,717,141 triangles,
194 shadow casters, six postprocess passes and no recorded game errors.
It is a paused local visual inspection, not a claim of multiplayer/FPS testing.

Before the final bias adjustment, a Site C map crop excluding the HUD/crosshair
had mean absolute RGB difference 1.833/255 from the original standalone preview;
94.98% of sampled pixels differed by at most 5 per channel. This is a specific
same-camera crop comparison, not a whole-game or Cycles equivalence metric.

With the final shared presentation, the same comparison against the updated
standalone viewer measured mean RGB error 1.7612/255, p95 4/255 and 95.456% of
sampled pixels within 5 per channel. Coordinates and measurements are saved in
`tools/.artifacts/haven-quality-comparison.json`. Final first-person inspection
confirmed smooth floors with roof/foliage shadows enabled. JavaScript syntax
parsing passed for the three rendering modules. No automated test suite or
match FPS benchmark was run.

The six runtime paths for the selective release are listed in
`tools/.artifacts/haven-quality-release-files.json`; the uploader also refreshes
the preload manifest. No map GLBs, collision, server rules or chat files are part
of this rendering patch. The old `pending-haven-quality` folder is an earlier
backup, not the current implementation.

Published rendering correction: **v42-20261017-072848**. The selective uploader
verified all seven changed files and service health v42 OK, retaining SQLite.
Final evidence: `tools/.artifacts/haven-gameplay-first-person-final.png` and
`tools/.artifacts/haven-gameplay-site-c-clean.png` (local production-renderer
visual inspection; the latter uses the preview camera for comparison).
