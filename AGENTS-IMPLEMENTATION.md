# Clove, Jett, Sage — v23

Cập nhật 2026-10-10. Đây là nhánh gameplay local cho Range/Abyss; chưa phải trận Unrated 5v5 hay multiplayer.

## Animation/VFX v22

Sửa tiếp v23 theo ảnh người dùng: `Wall_Chunk` là mảnh vỡ nên không dùng làm silhouette barrier nguyên vẹn. Tường dùng bốn khối kín liền nhau, shader jade sáng ở trên/xanh đậm dưới, vân/crack và collision cùng footprint. Floor placement lấy y của từng floor hit; công thức top khi mọc dùng chiều cao cấu hình thay vì giả định height=2. Chưa nghiệm thu hình ảnh WebGL.

- Jett Blade Storm: năm clip Attack01–05 nguồn, chuẩn hóa thời gian theo chu kỳ bắn để không bị reset trước khi phóng. Clip 3P cũng theo chu kỳ bắn. Dao đang giữ có sway/orbit; dao phóng có mesh nguồn, đường bay từ tay và streak, tối đa 16 visual đồng thời. Damage vẫn hitscan; mesh bay chỉ là hiệu ứng.
- Jett dash/updraft: sáu ribbon có texture gió cuộn, chuyển động theo thời gian và fade, hỗ trợ góc nhìn 1P/3P. Không thêm post-process hoặc particle pool lớn.
- Clove/Jett smoke: bung khối 320 ms, hai lớp noise chuyển động/warp và billow nhẹ, co lại 380 ms trước khi hết hạn. Radius LOS thay đổi cùng khối. Clove E thêm source idle pose; bướm orbit/flap rõ hơn.
- Clove Meddle: blast mở rộng/fade. Sage: slow mở/co field, orb đang giữ bob/xoay; giữ source cast/heal/revive và wall rise hiện có.
- Material agent/effect xuất lại với metallic factor .12 và roughness factor 1 khi có packed texture; map dùng material riêng.
- Timer dùng game clock, dừng khi pause; effect dọn khi đổi agent/reset. Syntax đã kiểm tra, source clip/asset export đã đọc; chưa nghiệm thu trong WebGL. Chưa tuyên bố animation/VFX cả ba agent hoàn thiện hoặc giống hoàn toàn VALORANT.

## Sửa sau phản hồi v20

- E Clove có con trỏ thao tác map, không yêu cầu tự ESC để nhả chuột; trái chọn/xóa vị trí, phải thả, E/1/2/3 về súng. Khóa chuột được yêu cầu lại từ thao tác xác nhận/hủy, còn ESC pause bình thường.
- Sửa texture tay Jett và dao bằng reference JSON material nguồn, không suy tên texture từ tên material. Nhúng cả normal và mask MRAE.
- Smoke Clove dùng shader tím/hồng + noise trên shell kín. Mesh VFX `WorldGridMaterial` không thay shell và làm trắng smoke nữa.
- Smoke có sáu bướm từ texture nguồn; Clove X tải tay resurrection riêng với texture/animation nguồn khi kích hoạt.
- Tường Sage có preview xanh/đỏ, vân tinh thể và thay đổi vết nứt theo HP; slow có pattern, heal/revive và Jett dash/updraft có cue, HUD có 12 icon nguồn.
- Equip/cast kỹ năng và chết hủy reload đang dở, tránh nạp đạn âm thầm khi tay đang làm kỹ năng; dao Jett giữ tâm chính xác khi di chuyển.
- [Danh sách texture và phần còn lại](AGENT-TEXTURES.md). Chưa coi v21 là nghiệm thu hoàn thiện cả ba agent: gameplay WebGL, VFX đầy đủ, audio và các cinematic vẫn cần hoàn tất/đối chiếu.

## Những phần đã code

- Roster đồng nhất tên/codename/role với dữ liệu [Valorant API](https://valorant-api.com/v1/agents?isPlayableCharacter=true). Sửa mapping sai và xuất bổ sung Hunter/Nox: tổng 29 agent có mesh preview, TrainingBot riêng. `playable` chỉ bật cho Clove/Jett/Sage.
- Asset gameplay chọn đúng Smonk/Wushu/Thorne; tay 1P riêng, skin và pose súng dùng chung animation core theo tên bone. Tay Reyna cũ trong gun được ẩn khi tay agent tải xong.
- Export PSK/PSA bằng Python, texture tối đa 512, không cần Blender. `assets/playable/manifest.json` lưu đường dẫn asset nguồn và danh sách clip thực tế.
- 24 clip Run/Walk/CrouchWalk theo tám hướng, idle/jump/land/death; mask bone theo nhánh Spine1, blend hai hướng lân cận và chuyển trạng thái 120 ms. Thân trên có pose cầm/reload súng và clip kỹ năng nguồn khi có. V bật camera nhân vật và gun gắn vào bone vũ khí; body chỉ tải khi bật V.
- Một agent active; đổi agent hủy asset/instance cũ, loader dùng phiên bản để bỏ kết quả cũ. Mesh kỹ năng tải theo yêu cầu, giới hạn smoke sáu cái. Tường dùng BVH riêng 48 tam giác tối đa cho một lần dựng, chỉ xây lại khi đang mọc hoặc bị phá; không dựng lại BVH map.
- Kỹ năng, projectile, heal, cooldown và animation dùng cùng đồng hồ gameplay; ESC/tab ẩn dừng thời gian. Cầm kỹ năng khóa bắn súng, 1/2/3 hủy equip; Jett có thể cất/đổi rồi rút lại ult còn dao bằng X.

## Cơ chế

| Agent | 4 (slot C) | Q | E | X |
|---|---|---|---|---|
| Clove | Pick-me-up sau kill/damaging assist, +50 overheal có giới hạn tổng 150, haste 15% trong 3s | Meddle nảy trên tường, dính sàn, chờ 0.75s; Decay theo thời gian, LOS và bán kính 4m | Ruse chọn vị trí trên map, trái đánh dấu/phải xác nhận; 14s sống, 6s chết, hồi 40s, sau chết tối đa 1 charge | Hồi sinh, intangible có thể hủy sớm, sau đó cần kill/damaging assist trong 10s; không hồi sinh khi rơi khỏi Abyss |
| Jett | Cloudburst projectile; giữ 4 để lái theo aim, smoke 2.5s | Updraft, va chạm trần; giữ Space để Drift khi rơi | E chuẩn bị 1s, E lần nữa trong cửa sổ 7.5s; dash theo WASD, có collision và slow; hồi sau 2 kills | 5 dao hitscan: trái chính xác khi chạy/nhảy, kill nạp 5; phải tung phần còn lại có spread, không refill khi kill |
| Sage | Tường 4 đoạn, xoay bằng phải, mọc nâng người, chặn người/đạn, từng đoạn phá được; 400 HP, sau 2s lên 600 nếu chưa bị bắn, tồn tại 40s | Orb nảy tường, tạo vùng 7s slow 50% | Trái heal đồng đội có LOS, phải heal bản thân; 100 HP/5s, tạm dừng khi nhận damage, cooldown 45s | Ngắm corpse đồng đội trong 12m; channel và hồi sinh 100 HP, không giáp, kiểm tra chỗ đứng |

Mua C/Q và charge E mua thêm bằng credits trong buy phase; signature miễn phí và ult theo điểm. Range có nút nạp để thử đầy đủ mà không cần economy của một trận. Đồng đội thử hiện là capsule xanh, có HP và corpse; bot Range hiện là hitbox tĩnh.

## Đối chiếu nguồn

Ưu tiên patch Riot khi wiki cũ khác thông số. Không coi wiki fan remake là nguồn chính.

- [Riot: giới thiệu Clove](https://playvalorant.com/en-gb/news/game-updates/clove-death-is-only-the-beginning/): cơ chế bốn kỹ năng.
- [Riot 8.11](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-8-11/): giá Pick-me-up và ult Clove; [Riot 10.04](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-10-04/): Meddle đổi từ fuse trên không sang chờ sau chạm sàn, cooldown Ruse và thời gian buffs.
- [Riot 11.10](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-10/): Clove overheal 50 và một smoke charge sau chết. [Riot 12.05](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-12-05/): smoke chết 6s, Meddle 4m.
- [Wiki Pick-me-up](https://wiki.playvalorant.com/en-us/Pick-me-up), [Meddle](https://wiki.playvalorant.com/en-us/Meddle), [Ruse](https://wiki.playvalorant.com/en-us/Ruse), [Not Dead Yet](https://wiki.playvalorant.com/en-us/Not_Dead_Yet): hành vi chi tiết, thứ tự hồi sinh và giới hạn thời gian. Ruse hiện 60m sống/42.5m chết, radius 4m; wiki fan remake còn số cũ 55m/4.72m đã loại.
- [Riot 7.04](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-7-04/): Jett Updraft 1, Cloudburst 2.5s, Tailwind 7.5s và ult 8 điểm. [Wiki Jett](https://wiki.playvalorant.com/en-us/Jett), [Tailwind](https://wiki.playvalorant.com/en-us/Tailwind), [Updraft](https://wiki.playvalorant.com/en-us/Updraft), [Blade Storm](https://wiki.playvalorant.com/en-us/Blade_Storm): dash, drift, damage và refill dao.
- [Riot 11.04](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-04/): tầm wall 15m, resurrect 12m. [Riot 11.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-08/): wall giá 300, fortify 2s, 600 HP.
- [Riot 13.00](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-00/) và [Wiki Healing Orb](https://wiki.playvalorant.com/en-us/Healing_Orb): self-heal Sage hiện 100 HP, không dùng số cũ 50. [Wiki Resurrection](https://wiki.playvalorant.com/en-us/Resurrection), [Slow Orb](https://wiki.playvalorant.com/en-us/Slow_Orb): targeting và timings.

## Nghiệm thu ingame còn cần người dùng xác nhận

Mốc 2 v18/v19 đã được người dùng xác nhận PASS. v21 chưa test WebGL/gameplay; mới kiểm tra cú pháp JavaScript, reference material/texture trong GLB và các endpoint asset trả HTTP 200. Không tự mở browser trên máy từng freeze/crash.

Mở `http://127.0.0.1:8455/game/game.html?map=range&agent=Clove`, bấm tải map. ESC chọn agent, bấm **Nạp kỹ năng + ult**, sau đó chơi.

- [ ] Clove/Jett/Sage đúng ngoại hình và tay; không còn tay Reyna hoặc vai che camera; đổi agent liên tục không nhân bộ nhớ.
- [ ] 4/Q/E/X HUD và charge; C cúi, Ctrl fullscreen, ADS + bắn, reload/đổi súng còn hoạt động.
- [ ] V: tám hướng, walk/crouch/jump/land/death, reload thân trên khi chân vẫn chạy; gun gắn đúng tay. Kiểm tra camera sau vai và tỉ lệ avatar.
- [ ] Clove: kill target rồi 4; overheal không tăng giáp/HP gốc, tổng HP + giáp + overheal ≤150; hết buff giảm về 0.
- [ ] Meddle chỉ nổ sau chạm sàn, không xuyên tường, Decay không giết trực tiếp và hồi lại theo thời gian.
- [ ] Ruse hai vị trí khi sống, một charge sau chết; duration/cooldown đúng, smoke chặn nhìn nhưng vẫn bắn xuyên được, người bên trong thấy nội thất smoke.
- [ ] E tự hiện con trỏ, không pause: trái chọn/xóa vị trí, phải thả; E/1/2/3 về súng. ESC đóng map và pause. Thử cả chế độ khóa chuột và không khóa chuột.
- [ ] Chết thử, resume, X trong 3s: revive → intangible → 10s cần kill; thử hủy intangible bằng X, thử không kill để chết lại. Rơi Abyss không dùng X.
- [ ] Jett giữ 4 rồi xoay để lái smoke, Q dưới trần thấp, E theo cả tám hướng và vào tường; 2 kills hồi E. Space Drift giảm tốc rơi.
- [ ] Blade Storm trái/giữ trái trừ dao, head/body/leg damage, kill trái nạp lại; phải hết dao và không refill; X rút lại sau đổi súng.
- [ ] Sage 4 xem/xoay/dựng tường, đứng trên tường lúc mọc; bắn phá từng đoạn, không đi/bắn xuyên đoạn còn sống.
- [ ] Sage Q đứng trong/ngoài vùng slow; E phải tự heal, E trái vào capsule đồng đội đã tạo ở menu ESC; hạ đồng đội thử rồi X + trái hồi sinh.
- [ ] ESC giữa projectile/dash/heal/ult/reload: thời gian dừng, resume không tự bắn. Range reset/đổi agent xóa hiệu ứng cũ.
- [ ] Abyss: cùng các kỹ năng, không phá streaming, quan sát FPS/RAM và console sau chơi dài.

## Giới hạn còn lại

- VFX dùng mesh nguồn có sẵn và material Babylon đơn giản; chưa tái tạo shader/Niagara, audio/voice và toàn bộ cinematic của Riot.
- Updraft dùng impulse với độ cao mục tiêu khoảng 5m, không phải đường cong force gốc; tốc độ projectile/độ nảy, vùng slow, kích thước dựng wall và một số equip timings là cấu hình mô phỏng cần đối chiếu ingame. Cửa sổ kích hoạt ult Clove 3s cần kiểm tra cảm giác thực tế.
- v30 đã có round/team/bot AI local và AI dùng kỹ năng ba agent, charge/cooldown/ult riêng, native animation plant/defuse/dash và VFX theo owner. Bản này chưa nghiệm thu WebGL; chưa gọi ba agent hoàn chỉnh cho Unrated hoặc multiplayer. Xem [MATCH-IMPLEMENTATION.md](MATCH-IMPLEMENTATION.md) để chơi thử.
- Không sửa thông số các agent còn lại: dữ liệu kit cũ được giữ với `playable:false`.
