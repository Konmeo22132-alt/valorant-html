# Trận đấu local — v30

Cập nhật 2026-10-11. Bản triển khai tiếp tục M3/M4 và AI kỹ năng ba agent; **chưa nghiệm thu ingame v30**. M6 chờ người dùng duyệt phần này.

## Mở game

[Unrated Abyss](http://localhost:8455/game/game.html?map=abyss&mode=unrated).

1. Bấm **Tải map đã chọn**.
2. Chọn đặc vụ cho bạn và 9 bot, bấm **Khóa đội hình và tải trận**.
3. Chờ model/animation/skill tải xong, mua đồ rồi bấm **Chơi**.
4. ESC tạm dừng và mở panel để đổi mode hoặc trở lại luyện tập.

Đổi `mode=deathmatch` để chọn Deathmatch. Server không tự mở browser hoặc khởi tạo WebGL vì máy từng freeze khi render.

## Luật đội hình và phím

- Team A/B: 5 người/team; bạn ở Team A.
- Clove/Jett/Sage: tối đa **2 bản sao mỗi đặc vụ/team**, kiểm tra tại UI và authority. Không đổi đội hình giữa trận.
- Màn chọn 90 giây, hết giờ khóa đội hình hợp lệ.

| Phím | Tác dụng |
|---|---|
| B | Pause và shop; chỉ mua/bán trong buy phase |
| Giữ G | Plant trong đường viền site, defuse gần Spike, lấy ult orb hoặc nhặt súng |
| H | Thả súng đang cầm, trừ Classic miễn phí và dao |
| Tab | Bảng điểm; thêm charge C/Q/E của bot đồng đội |
| ESC | Pause cả đồng hồ trận và bot |
| E / Q khi chết | Chuyển đồng đội còn sống kế tiếp / trước đó |
| V khi chết | Về free cam |
| WASD / Space / C khi chết | Bay / lên / xuống; Shift tăng tốc |

Clove chết: **4 mở smoke, X hồi sinh**; E/Q dành cho spectator. Camera free cam không thay đổi vị trí chết/hồi sinh. Deathmatch tự kết thúc spectator khi respawn. Phím sống giữ như trước; Ctrl crouch cần fullscreen + keyboard lock.

## Thay đổi v30

### Abyss và objective

- Spawn và site dựa trên mesh sàn có tên của map raw; vùng plant từ contour màu của minimap nguồn, có exclusions và giới hạn cao độ. Thay hai vòng plant gần đúng bằng đường viền vùng plant.
- Đăng ký minimap với floor mesh targeting nguồn và sàn map, lưu phép biến đổi/source trong `game/config/abyss-match.json`. Đây là hiệu chỉnh từ asset, chưa phải xác nhận tọa độ gameplay chính thức.
- Navigation hiện **12,319 node**, đã nối các component bằng **6 đoạn sàn liên tục** qua khe dữ liệu cầu thang. Các cạnh nhảy gần đúng trước đó đã bỏ; connector kiểm tra sàn, trần và bề rộng collision khi bake.
- Buy barrier dùng ranh giới vùng sàn liên thông từ spawn. Khi vượt ranh giới, người chơi về vị trí hợp lệ ngay trước đó; hết buy phase barrier biến mất.
- Plant/defuse: xuất clip tay 1P và thân UB/LB từ PSA nguồn, retarget riêng từng agent, gắn Spike/defuser vào tay. 1P không cần bật góc nhìn thứ ba trước để nhận clip.

### Bot và kỹ năng

- Giữ phân nhóm hai site, A* có biến thể đường đi, crouch ngắn và watchdog thoát kẹt v29. Motor dùng sàn theo footprint khi đi qua mép cầu thang; có collision trần khi bay lên.
- Clove: Pick-me-up sau kill/assist, Meddle tránh cụm đồng đội, Ruse khi thấy threat và smoke sau chết theo thông tin đồng đội; Not Dead Yet có cửa sổ hồi sinh, spectral và deadline cần kill/assist.
- Jett: Cloudburst khi cần che threat, Tailwind có windup và kiểm tra sàn liên tục, Updraft khi waypoint cao hơn và trần đủ thoáng, Blade Storm dùng dao trái/hitscan/travel VFX/refill khi kill.
- Sage: heal bản thân/đồng đội bị thương, Slow Orb tránh đồng đội, Barrier bảo vệ đồng đội đang plant/defuse khi không chắn đường đội mình, Resurrection khi có corpse hợp lệ và không đang giao tranh.
- Bot mua charge trong buy phase; signature/cooldown/ult riêng từng người. Charge chưa dùng được giữ theo round; pistol/OT reset bộ charge mua. Damage ledger ghi assist.
- Gun ẩn trong cast/channel/Blade Storm, dọn vật phẩm cầm khi chết. Sage hồi sinh người chơi trả lại camera; caster chết hủy channel, vị trí hồi sinh bị chặn kết thúc lần thử.
- Clove bot được tính là còn cơ hội hồi sinh tới khi xử lý xong revive, tránh round kết thúc ở đúng deadline. Spectral không xuất hiện lại ở những lần cast sau.
- Retain locomotion tám hướng và blend giữa hai hướng; thêm native channel/dash clips. Fire recoil của gun bot vẫn procedural; không coi đó là bộ animation combat hoàn chỉnh đã duyệt.

### Asset và VFX

- Bot dùng chung lớp skill/material runtime với người chơi, chọn mesh/config theo agent sở hữu skill.
- Preload đầy đủ GLB effect và texture nguồn cho roster, chia sẻ asset giữa các bản sao; animation mới là GLB chỉ chứa animation.
- **Không giảm kích thước, xóa texture hoặc cắt lớp VFX kỹ năng trong lượt v30.** Map streaming không quyết định vòng đời skill.
- Giữ shader spectral v27 đã được người dùng chấp nhận. Native texture/mesh cần xem ingame cùng animation bot để nghiệm thu alpha, màu và attachment.

## Vòng trận đã có từ v28/v29

- Buy 45 giây pistol/30 giây thường, live 100 giây, post 7 giây; halftime sau 12 round, từ 13 điểm và cách biệt 2; OT credits 5000.
- Shop weapon/armor/charge, hoàn tiền món mua trong buy phase hiện tại; economy, kill/death/assist và ult points local.
- Spike carrier/drop/pickup; plant 4 giây, nổ 45 giây, defuse 7 giây với checkpoint 3.5 giây. Channel khóa bắn/di chuyển.
- Deathmatch 10 người: 40 kills/10 phút, respawn 2.5 giây, Vandal/Classic/dao + heavy armor, không skill/shop/objective.

## Giới hạn còn lại

- Barrier là frontier theo graph, **chưa phải từng cửa buy barrier của Abyss gốc**. Ult orb là vị trí local đã snap lên sàn; cần đối chiếu ingame.
- Bot chưa dùng rope/ascender. Đường defender tới site có thể vòng xa theo cầu thang. Có waypoint hợp lệ không đồng nghĩa mọi lần chạy motor đã được duyệt.
- AI skill là quyết định theo điều kiện/threat thấy được; chưa phối hợp chiến thuật đội, chưa tránh nhau đầy đủ. Jett bot chưa có chiến thuật phóng dao chuột phải/Drift chủ động.
- Native animation retarget và vị trí cầm prop chưa xem WebGL v30; fire/additive/aim blending còn cần polish.
- Gun bot riêng mới Classic/Vandal; súng khác người chơi thả dùng marker hộp nhưng giữ tên/đạn.
- v31 đã triển khai M6 UI/minimap/shop/bảng điểm bằng PNG nguồn + CSS, đang chờ nghiệm thu ingame/pixel-perfect; xem `UI-IMPLEMENTATION.md`. Audio và multiplayer chưa triển khai.
- Giữ giới hạn render 30 FPS/960×600. **Chưa đo FPS/RAM hoặc độ ổn định với đủ 9 bot và VFX v30**.

## Bằng chứng và dựng asset

Lượt v30 đã xuất 6 GLB animation và bake/ghi navigation + layout bằng CPU. Không chạy test tự động, syntax checker hoặc browser/WebGL trong lượt này. Số node/clip chứng minh artifact đã được tạo, không chứng minh gameplay/shader đúng.

Kết quả authority/integration/controls PASS v28 là lịch sử của bản cũ; không dùng để nghiệm thu v29/v30.

Lệnh dựng asset, khi cần cập nhật nguồn:

```powershell
python tools/author-abyss-layout.py
# Chỉ dựng lại base graph khi collision/sàn map đã đổi; có thể mất nhiều phút.
node tools/build-match-navigation.cjs
# Chạy sau base bake để áp dụng layout và nối các component sàn.
node tools/extend-match-navigation.cjs
python tools/export-match-animations.py
python tools/dev-server.py
```

Không chạy riêng base bake rồi giữ kết quả: nó chưa áp dụng authored layout/connector cuối. Source ledger animation nằm ở `assets/match/animations.json`; hình đối chiếu layout nằm ở `tools/art-review/abyss-layout-source.png`.

## Checklist người dùng chơi thử v30

- [ ] Đội hình tối đa 2 bản sao/team; mua/bán charge, armor, súng đúng tiền; live không mua được.
- [ ] Spawn đúng khu vực attack/defend; plant được trong đường viền A/B, không plant ngoài vùng hoặc trên tầng khác. Buy barrier chặn tại chỗ, hết buy biến mất; halftime đổi bên.
- [ ] Bot chia hai site, tới được B qua sàn/cầu thang, không lơ lửng, không crouch treo; bị kẹt đổi đường. Theo dõi đặc biệt defender đi vòng xa.
- [ ] Plant/defuse có tay + prop đúng 1P và V/3P, gun ẩn; hủy channel trả súng. Checkpoint defuse còn đúng 3.5 giây.
- [ ] Bot Clove/Jett/Sage cast các skill khi đủ điều kiện; Tab charge giảm/hồi, gun ẩn rồi trở lại, native texture/VFX không mất màu/lớp.
- [ ] Clove bot sau chết smoke/hồi sinh đúng cửa sổ; bot cuối đội dùng X không bị kết thúc round sớm, hết deadline không kill chết lại. Spectral hết đúng phase, không quay lại khi cast khác.
- [ ] Jett dash không tự lao vào vực; Updraft không xuyên trần; Blade Storm có dao cầm, phóng/trail/refill khi kill.
- [ ] Sage heal mình/đồng đội; slow không liên tục phủ đồng đội; wall bảo vệ channel. Sage revive bot và người chơi từ free cam; caster chết hoặc vị trí bị chặn không lặp revive vô hạn.
- [ ] Spike drop/pickup, hết giờ/nổ/defuse, credits và reset qua nhiều round, pistol/halftime/OT không giữ charge/prop/status sai.
- [ ] Chết vào free cam, E/Q chỉ đồng đội sống, V bay; Clove C/X vẫn đúng vị trí chết (binding v33). Space lên/Ctrl xuống. Hồi sinh trả camera/weapon.
- [ ] Deathmatch không skill/objective, respawn đúng; ESC dừng cả skill và round. Đổi mode không còn bot/props/effect cũ.
- [ ] Quan sát console, FPS và RAM trong phiên dài với smoke/wall/heal/knife của nhiều bot. Báo agent/skill/round và ảnh nếu còn lỗi.

Người dùng đã cho phép triển khai **M6** ngày 2026-10-11 và báo chơi từ v29 gần như không lỗi. Bản v31 đã nối UI nguồn; research/checklist và giới hạn ở `UI-IMPLEMENTATION.md`. Chờ duyệt M6 trước khi chuyển M7 multiplayer/M8 audio.

v33 theo yêu cầu người dùng: C trở về kỹ năng, Ctrl cúi; chỉ chơi khi toàn màn hình và Keyboard Lock được cấp. Thoát fullscreen pause và hiện nút vào lại; bộ đếm chọn đội dừng ngoài fullscreen. Chưa thử fullscreen ingame; checklist mới tại `DEVELOPMENT.md`.
