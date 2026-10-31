# Soát skill VFX — v30, 2026-10-11

## Bổ sung v38 — Ruse và Meddle theo ảnh người dùng

Ruse chuyển sang hologram 3D, giữ hands Equip/Cast và bổ sung SmokeSet PSA; không có nền map vuông tối. Smoke dùng RGB essence cùng generic flow cho các dải màu sáng, không nhuộm smoke-noise xám làm material chính. Giữ đóng shell để chặn nhìn, native outer/inner, ripple và butterfly. Dome Clove neo vào sàn; Jett giữ cách đặt cũ.

Meddle trước dùng Butterfly tĩnh, nay dùng Spikeball Butterfly đúng 21 bones và ba PSA nguồn. Material slot `None` ở model chứa 1.598 vertex của Spikeball_Offset, được tái dựng thành core cyan; các slot Butterfly giữ essence/wing tím. R_WeaponMaster trong Toss có quỹ đạo ngoài view, nên component và release lấy R_Hand. Không đặt sphere flash trong suốt phủ toàn vùng nữa: hiệu ứng nổ thể hiện bằng source ribbons, ring và các curl dựng lên.

CPU `test-clove-vfx.cjs` PASS về animation thật, picking/map, release/chạm đất/fuse, source layer/disposal. Review Sage/Jett/Clove cũ PASS. Các shader Unreal/Niagara không có trong asset xuất; màu/material được tái dựng theo texture và ảnh, chưa xác nhận WebGL hoặc giống bản gốc 100%. Xem v38 ở DEVELOPMENT.md cho giới hạn bộ test toàn trận.

v30 nối skill cho bot theo owner và giữ texture/lớp effect nguồn. Chưa nghiệm thu WebGL v30; xem phần bổ sung cuối tài liệu và [checklist trận đấu](MATCH-IMPLEMENTATION.md).

## Phản hồi vẫn tối v27

Ảnh người dùng xác nhận v26 vẫn không đạt: DF tím tối nhân Fresnel không tái dựng được trạng thái spectral của Clove. Thay bằng shader riêng ánh xạ luminance DF sang core palette sáng; 1P xanh trắng/lavender, 3P tím hồng; rim theo normal và camera thật, có chuyển động ánh sáng nhẹ. Có độ sáng nền và trần màu .99 để tránh hai lỗi tối đen/cháy trắng của v25/v26.

Shader dùng `bonesDeclaration`/`bonesVertex` và binding bones có sẵn trong Babylon ShaderMaterial 8.32, giữ skeleton animation nguồn. Không đổi shader Sage hoặc các effect khác. Source DF không resize hoặc ghi đè. Bảng đối chiếu palette CPU đã xem: `tools/art-review/clove-spectral-v27-palette.png`. Đây là bảng UV/màu, không phải ảnh render WebGL hoặc bằng chứng giống hoàn toàn bản gốc. Đã kiểm tra cú pháp, chưa chạy test/GPU cho v27.

## Phản hồi cháy trắng v26

Ảnh người dùng v25 cho thấy cả tay/body Clove X thành silhouette trắng. Đọc shader `defaultPixelShader` của Babylon 8.32 trong vendor xác nhận `emissiveColor += texture2D(emissiveSampler, ...).rgb`, rồi nhân Fresnel. Base White cùng gain 7/6/8 là lỗi của material v25. Đã đổi base thành Black, giảm gain viền, giữ DF native/normal/skinning và alpha. Chưa có ảnh WebGL xác nhận màu cuối.

16 mote Clove trước là polyhedron đặc nên hiện thành khối vuông tím. Đã thay bằng 16 plane dùng texture bướm nguồn, mask luminance/alpha, billboard và flap. Smoke butterfly cũng bỏ base emissive phẳng để không hiện nền texture. Không giảm số lượng hoặc bỏ lớp skill. Chỉ kiểm tra cú pháp trong lượt sửa v26; các kết quả CPU dưới đây thuộc v24/v25.

## Sửa theo ảnh phản hồi v25

- Sage orb C/Q/E có shard quá lớn: polyhedron size .065 với scale Y 1.8 lớn hơn lõi .18 m. Đổi riêng shard cầm tay về .012; giữ 8 shard, halo và source orb-energy. Các shard world không bị thu nhỏ theo.
- `disableLighting` đi cùng emissive .15 làm crystal/mote/flight tối. VFX mesh hiện dùng màu emissive đầy đủ. Layer năng lượng dùng additive để không phủ tối lớp bên dưới; không đổi shell smoke/barrier sang additive.
- Clove resurrection có texture DF tím tối vốn cần tái dựng material đặc biệt. Đã xem trực tiếp DF 1P/3P và MI nguồn (Skin Undercolor B16CF0, Skin Intensity .5, Brightness Max 1.2); Babylon dùng emissive texture native + Fresnel rim, giữ normal và skinning. Các hệ số tái dựng chưa được nghiệm thu WebGL, không phải chuyển nguyên shader Unreal.
- Sửa visibility súng 1P/3P trong revive/intangible/outro, cả đường cập nhật ADS. Tách deadline ghost khỏi lock chung để cast sau hồi sinh không làm ghost xuất hiện lại.
- Resurrection 1P có đủ Revive, Idle, Walk, Run, Embody từ PSA nguồn.
- Đối chiếu [Riot 8.05](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-8-05/) và [bài giới thiệu Clove](https://playvalorant.com/en-gb/news/game-updates/clove-death-is-only-the-beginning/): C Pick-me-up hấp thụ sinh lực để được haste/HP tạm; X Not Dead Yet là hồi sinh. Ảnh ghost/tay phát sáng người dùng gửi dùng để đối chiếu X. Không đổi thông số gameplay sang mốc 7 ult points trong ảnh cũ.
- Rà CPU PASS: giữ 8 shard, bounding height < .08 m, emissive G > .9; additive halo; hide weapon qua phase và không bật ghost lại do lock sau đó; material spectral. Pixel/native texture review vẫn 19 VFX, 34 GLB/43 ảnh PASS.
- Cần người dùng xác nhận WebGL: orb không che tay bằng mảng đen; Clove C cast cất súng rồi trả lại; X không có súng trong ghost, tay/body có viền sáng và chuyển sang súng sau outro. Không tự mở browser GPU do lịch sử máy freeze/crash.

Phạm vi: 12 kỹ năng Clove/Jett/Sage, ảnh preview Barrier do người dùng cung cấp, asset nguồn và đường đi runtime. Chưa nghiệm thu hình ảnh WebGL.

## Những chỗ bị giản lược tìm thấy và sửa

1. VFX và texture model bị thu xuống 512 px. Exporter agent hiện giữ kích thước nguồn, alpha màu; normal/packed vẫn đổi kênh đúng glTF. Guns vẫn dùng cấu hình riêng. Icon HUD vẫn 64 px vì là icon UI.
2. Animation agent từng lấy mẫu lại xuống khoảng 24 FPS. Hiện xuất mọi frame nguồn, giữ thời gian clip. Blade Storm phát trọn clip theo chu kỳ bắn.
3. Mesh tải khi cast có thể tới sau khi effect hết hạn. Hiện chuẩn bị texture/mesh của agent đang chọn trước khi cho dùng kỹ năng; model tải tối đa hai request đồng thời. Lỗi tải được báo, không coi placeholder là skill hoàn thiện.
4. Source layer 1P được tải bất đồng bộ từng rơi về rendering group 0. Hiện xác định viewmodel từ toàn chuỗi parent để giữ group 1.
5. Preview Sage chỉ là bốn hộp trong suốt. Thay bằng footprint năng lượng sát đất, indicator, wisp, mảnh pha lê động và orb giữa hai tay; valid/invalid vẫn đổi màu.
6. Barrier từng dùng Wall_Chunk. Hiện dùng `AB_Thorne_S0_E` nguyên vẹn, beam/skirt/ground; collision shell riêng giữ footprint. Shader gradient chuyển tọa độ mesh nguồn về tọa độ segment để không sai do scale/rotation.
7. Glow mask Clove, lớp secondary smoke, beam heal, silhouette hồi sinh và một số trail đã có nguồn nhưng chưa dùng. Đã nối các lớp bên dưới.
8. Bỏ cơ chế đẩy smoke/knife flight còn sống ra khỏi danh sách khi chạm ngưỡng số lượng. Dao bay tới endpoint thật của ray, không chặn ở 60 m hoặc ép mọi chuyến bay vào 140 ms. Cleanup theo vòng đời/reset.

## Ma trận 12 kỹ năng

| Skill | Lớp nguồn/runtime hiện có | Kết thúc |
|---|---|---|
| Clove C | Source cast, pickup swirl, ground ripple, motes, HUD overheal/haste | Fade theo thời gian |
| Clove Q | Bướm/essence + glow mask, formation ribbon, hand swipe, projectile halo/trail, burst ring/ribbon | Bung burst rồi fade |
| Clove E | Equip/idle/cast, telegraph ripple, shell noise/billow, inner mesh/Generic, ground ripple, bướm orbit/flap | Shell co, lớp telegraph hết hạn riêng |
| Clove X | Tay resurrection riêng, body resurrection 3P riêng + intro/idle/outro, shockwave, swipe, motes và cue intangible | Outro/reequip theo trạng thái |
| Jett C | Cast, projectile halo/wind, shell noise/billow, hemisphere/ground flow | Co/fade khi hết smoke |
| Jett Q | Source cast, hemisphere updraft + ribbon wind | Fade cuối updraft |
| Jett E | Source cast, dash spline trái/phải + ribbon wind | Fade cuối dash |
| Jett X | Equip fan-out, Attack01–05, twirl/swipe flipbook, dao/source textures, bay + streak | Tới endpoint, không xóa do cap |
| Sage C | Equip/idle/cast, orb core/energy/shards, indicator/wisp/ground preview, intact wall + crystal/noise/flow + beams/skirt | HP/crack, thời gian/đập vỡ; bỏ preview khi hủy |
| Sage Q | Equip/idle/cast, orb source/glow/trail, field flow + 64 crystal shards | Mở/co field theo thời gian |
| Sage E | Equip/idle/ally/self cast, orb core/halo, healing ribbon + beam tới ally, ground flow/motes/HUD cue | Fade theo heal duration |
| Sage X | Equip/idle/cast, source res ribbon/body silhouette, ground flow/motes | Fade cuối channel |

## Bằng chứng đã chạy

- `node tools/review-agent-effects.cjs`: PASS bằng Babylon NullEngine (CPU). Rà bindings preview/wall/heal/revive/smoke/wind/flight, chân tường lúc mọc, không eviction effect đang sống, cleanup mesh khi reset. Kiểm tra dùng texture giả 1 px và stub tải source mesh; **không chứng minh shader hoặc mesh import render đúng trên GPU**.
- `python tools/review-agent-textures.py`: PASS. **19 VFX** giống từng pixel RGBA và kích thước nguồn; **34 GLB / 43 ảnh nhúng** giữ kích thước texture nguồn.
- Syntax các file runtime đã rà. Script/GLB/VFX dùng cache version 24.
- `assets/playable/manifest.json` lưu source/material/clip từng GLB. `assets/playable/vfx/texture-inventory.json` lưu source của từng texture.

## Giới hạn cần phân biệt

Shader đang được tái dựng trong Babylon từ mesh, mask, texture và thông số nguồn. Pack không tự cung cấp shader graph/Niagara chạy được trong Babylon. Vì vậy chưa khẳng định giống 100% VALORANT hoặc đã nghiệm thu đủ mọi lớp chỉ từ tên asset. VAT bướm HDR WIP chưa được đưa vào renderer; bướm hiện dùng source texture với animation runtime, không chuyển HDR thành ảnh màu 8 bit. VFX CharSelect/WIP không đồng nghĩa đều là một lớp skill đang dùng trong game gốc.

Không có tùy chọn low/medium làm mất lớp skill trong code mới. Cần xem WebGL trên máy người dùng: C Sage có dải năng lượng sát đất/orb đúng giữa tay, các nguồn mesh được import đúng hướng, alpha không thành ô vuông, shader không lỗi, effect còn hoạt động khi quay camera, pause dừng đồng hồ và reset dọn sạch. Chưa đo FPS/RAM v24 trong browser.
# Bổ sung v30 — kỹ năng bot (2026-10-11)

- Clove/Jett/Sage bot dùng cùng runtime shader/layers với người chơi; source mesh và config lấy theo agent sở hữu skill, không theo agent người chơi đang chọn.
- Preload mọi effect GLB và texture nguồn của roster, chia sẻ container giữa các bản sao. Các lớp Meddle, smoke, Sage orb/wall/heal/revive, Jett wind/knife và Clove spectral được nối vào world effect; held/flight/trail có rendering group phù hợp góc nhìn.
- Không giảm kích thước hoặc sửa PNG VFX nguồn, không xóa lớp skill để tối ưu map. Native animation mới là GLB chỉ chứa track; không đổi texture agent.
- Lifecycle: cast ẩn gun, chết dọn held prop/buff/dash; round/mode dọn effect sống. Spectral Clove chỉ bật trong phase revive/intangible/reequip.
- Đây là thay đổi mã và asset CPU; **chưa chạy test tự động hoặc WebGL v30**. Các PASS phía dưới là lịch sử, không chứng minh các skill bot mới hiển thị đúng. Checklist ingame ở [MATCH-IMPLEMENTATION.md](MATCH-IMPLEMENTATION.md).

