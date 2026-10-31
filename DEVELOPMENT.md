# Val-Strike — trạng thái tiếp tục ZCode

Ngày cập nhật: 2026-10-11.

## Trạng thái mới nhất — v41: tài khoản, SQLite, sảnh ba chế độ

- Đăng nhập bắt buộc. Tài khoản admin `Konmeo22132` được tạo một lần khi DB mới khởi tạo; mật khẩu đã được băm scrypt với salt, không lưu plaintext. Không có API đăng ký công khai. Admin tạo tài khoản player tại `/settings`; API kiểm tra quyền và CSRF, WebSocket xác thực bằng cookie HttpOnly.
- SQLite tại `data/val-strike.sqlite` lưu tài khoản, session, hồ sơ/cài đặt, marker, kết quả và phiên phòng. Client chỉ giữ cache trong bộ nhớ; không còn đọc/ghi dữ liệu người chơi bằng Web Storage. Kết quả online do server ghi; kết quả trận bot có source riêng. Dữ liệu trình duyệt cũ của v40 không tự gán sang tài khoản mới.
- `/play` dùng artwork GameModes nguồn, ba lựa chọn UNRATED / DEATHMATCH / CUSTOM, form tạo/vào phòng và danh sách phòng thực. Sảnh có hàng người chơi/chỗ trống, sẵn sàng, mã phòng, chọn đội, start/leave. CUSTOM có bốn vị trí quan sát, free cam và Q/E xem người chơi. UNRATED yêu cầu đủ đội; CUSTOM cho số người cân bằng 1v1–5v5; Deathmatch cần tối thiểu hai người.
- Deathmatch online có 40 kill / 10 phút, hồi sinh 2,5 giây, spawn phân tán trên nav native, chọn vũ khí miễn phí bằng B, không kỹ năng/Spike. Luật chạy trên server; bảng điểm xếp hạng theo kill/death.
- Theo điều chỉnh mới của người dùng: chỉ Clove/Jett/Sage được hoàn thiện material + motion cho menu. Các agent khác có avatar mờ và khóa, mở xem được model trắng tĩnh, không nút chơi/chọn. Exporter mặc định chỉ xử lý ba agent playable. Một phần asset khác đã xuất trước điều chỉnh; viewer khóa material trắng và không chạy animation cho chúng.
- Ba model chính dùng diffuse/normal/MRAE nguồn, native CharSelect idle/intro khi có và core/face idle. Material mắt dùng overlay texture, kính dùng màu/opacity nguồn. Sảnh giữ cùng renderer khi chỉ cập nhật trạng thái ready để tránh tải lại model.
- Đã rà soát cú pháp các module sửa và đọc trạng thái server v41. Không chạy bộ test hay mở WebGL trong lượt này; nghiệm thu hình ảnh/chơi nhiều máy vẫn cần người dùng thực hiện. Kết quả CPU PASS ở mục v40 dưới đây là lịch sử, không phải kết quả kiểm thử v41.

## Trạng thái trước — v40

### Multiplayer, ping và menu chính

- M7 đã có server Node/WebSocket thực: 30 tick/s, snapshot 20/s; phòng 1v1–5v5, khóa đội hình/sẵn sàng, tối đa hai bản sao mỗi đặc vụ/team, đợi tất cả tải asset trước trận. Chuyển chủ phòng khi người chủ rời; kết nối lại dùng cùng player ID và không phát lại thao tác mua/bắn.
- Server quyết định di chuyển/va chạm Abyss, hit/damage/giáp/đạn, economy/refund/mua hộ, plant/defuse/orb và C/Q/E/X của Clove/Jett/Sage. Client dùng model/animation 3P nguồn, súng 3P đủ 19 loại, nội suy 100 ms, sửa sai vị trí từ xác nhận server và tên đồng đội theo world position. Không chạy AI bot trong phòng multiplayer.
- Z ping được chiếu theo camera vừa render ở mỗi frame, không còn cập nhật vị trí marker theo nhịp minimap 150 ms. Ping giữ tọa độ thế giới; server gửi ping cho cùng đội.
- Menu tiếng Việt gồm sáu trang có luồng thực: Trang chính, Chơi, Đặc vụ, Vũ khí, Lịch sử, Cài đặt. Nhân vật tự hiện bằng GLB nguồn; danh mục 29 model tách khỏi chọn đội hình. Dùng background Abyss/portrait/icon thật; lịch sử chỉ lưu trận hoàn thành, cài đặt áp dụng vào game. Có phòng/create/join thực, Unrated/Deathmatch bot và luyện tập; không dựng bạn bè/rank/store hoặc chế độ chưa có chức năng.
- Rà soát đã sửa tường Sage gửi Vector sai dạng, Meddle dùng nhầm biến trong LOS, decay còn sau hồi sinh, Jett X đóng nhầm sau fire reply, khóa kỹ năng còn qua vòng mới, sequence reset khi reload trang và phản hồi fetch của trang cũ ghi sang trang mới.
- CPU PASS: `test-multiplayer.cjs`, `test-network-skills.cjs`, `test-multiplayer-client.cjs`, `test-menu.cjs`, `test-native-ui.cjs`, `test-startup.cjs`. Có WebSocket/HTTP thật và collision Abyss thật; startup menu thay riêng renderer preview bằng stub để không tạo GPU context. Không mở browser/WebGL và chưa nghiệm thu render/model/VFX, chuyển fullscreen hoặc hai máy chơi thực.
- Server chạy tại http://127.0.0.1:8455/; startup chuyển sang Node. Chi tiết kết nối HTTPS cho máy khác, phạm vi và kiểm tra còn lại: [MULTIPLAYER-IMPLEMENTATION.md](MULTIPLAYER-IMPLEMENTATION.md). M8 audio chưa triển khai trong lượt này.

## Trạng thái trước — v39: Ruse input, đổi súng và smoke sau chết

- Sửa click Ruse bị áp dụng hardware scaling hai lần. Babylon tự đổi tọa độ CSS sang render; ray hiện bù theo hardware scaling thực tế và dùng camera đang hoạt động. Fixture NullEngine v38 ở scaling 1 đã không phát hiện lỗi trên engine thật.
- Đóng Ruse chỉ chạy fade nếu map đang mở; ghi nhận opacity lúc đóng. Đổi súng 1/2/3 khi chưa dùng Ruse không làm hologram xuất hiện, gọi đóng lặp lại không khởi động fade mới.
- Ruse sau chết giữ nguyên camera quan sát/đồng đội, tầm đặt smoke vẫn tính từ deathPoint. Không gọi chuyển góc nhìn thứ nhất, không chạy E_equip/E_set/E_cast hoặc bật tay. UI gắn vào camera đang xem; vị trí và target quan sát giữ trong lúc chọn điểm. X đóng Ruse trước khi hồi sinh.
- Smoke giữ mesh outer/inner và butterfly nguồn; cả shell chính và mesh nguồn dùng dải pearl/lavender/hồng với mép màu vàng/cyan/magenta. Hình thành bằng mặt cắt đi lên có mép lượn sóng rồi đóng đỉnh, thay cho chỉ phóng to/fade đồng đều. Butterfly chạy trên nửa dome nhìn thấy được thay vì chìm dưới sàn.
- Chưa chạy test tự động hay browser/WebGL trong lượt này; chưa nghiệm thu VFX giống 100%. Cần người dùng thử click trái/chọn điểm/phải đặt, đổi 1/2/3 trước và sau mở E, chết rồi C mở UI khi free cam/xem đồng đội.

## Trạng thái trước — v38: Ruse hologram, smoke và Meddle

- Ruse dùng DynamicTexture trên đĩa 3D giữa hai tay, vòng mesh nguồn, equip/fade trong khoảng 1 giây và thu lại khi xác nhận/hủy. Bản đồ trong suốt lavender/hồng/xanh, đường đi lấy từ navigation Abyss; range dùng collision. Không dùng nền vuông/grid 24×24. Click ray vào đĩa 3D, đổi tọa độ theo hướng nhìn; trái đặt tối đa hai vị trí, phải xác nhận. Có clip SmokeSet nguồn khi chọn điểm.
- Smoke Clove đặt dome vào đúng sàn, có telegraph trước hình thành, tăng kích thước/opacity và dải pearl/lavender/cyan/hồng chuyển động. Giữ cả shell đóng, mesh smoke/inner nguồn, ripple và sáu butterfly; không thêm chính sách bỏ skill theo khoảng cách hoặc số effect.
- Q dùng đúng Spikeball Butterfly có 21 bones, ba clip nguồn equip/idle/toss; core có material riêng, không dùng material wing tím cho core. Ghép component vào R_Hand vì R_WeaponMaster trong clip toss mô tả quỹ đạo xa; bàn giao projectile sau 240 ms. Có halo, ribbon thuận/nghịch, lõi bay, nhịp sáng lúc chạm đất, vòng nổ và các dải năng lượng dựng lên. Pixel essence/glow/generic được xem trực tiếp trước khi chọn shader.
- Đối chiếu [Riot Clove](https://playvalorant.com/en-gb/news/game-updates/clove-death-is-only-the-beginning/) và [Riot 10.04](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-10-04/): giữ Q chạm đất rồi nổ sau 0,75 giây; ảnh/video ra mắt dùng cho hình ảnh, không quay gameplay về timer 1,3 giây cũ.
- `tools/test-clove-vfx.cjs` PASS với NullEngine: mẫu GLB/PSA thật cùng tay thật, picking 3D qua viewport khác kích thước render, xoay bản đồ, release/fuse, đầy đủ layer và dispose. `tools/review-agent-effects.cjs` PASS, giữ các layer Sage/Jett. Không tạo browser/WebGL; đây chưa phải nghiệm thu màu/render giống 100%.
- Bộ `test-match-runtime.cjs` cũ chưa đồng bộ dependency UI/VM (`uiInitMapInputs`, `fetch`). Lượt chẩn đoán bổ sung dependency cũng vượt heap Node 384 MiB; không tăng heap hoặc dùng lượt đó để báo toàn trận PASS. Fixture chỉ bổ sung module Clove như production.
- Cần người dùng xem E triệu hồi/chọn/đặt hai smoke/hủy, dome trên sàn và chuyển động các dải màu; Q equip/idle/ném/nổ ở range rồi Abyss. Ngân sách engine/FPS hiện tại không tăng.

## Trạng thái trước — v37: Clove death camera và hồi sinh bằng X

- Clove tự vào third-person khi chết ngoài Deathmatch. Có tối đa 3 giây để dùng X nếu đủ ult; khi hết cửa sổ, camera chuyển sang free cam. E/Q vẫn xem đồng đội, V mở free cam ngay.
- Bổ sung prompt X ở giữa màn hình với vòng đếm thời gian; cast X chạy body resurrection `intro`, fade-in rồi fade-out trước khi trả về first-person spectral hands. Hiển thị xác nhận hồi sinh và thời gian còn lại để kiếm kill/assist.
- Tái dùng resurrection body/arms và animation nguồn có sẵn. Shader spectral có hệ số fade riêng; không cắt texture/VFX của skill khác.
- Chưa thử WebGL/browser. Không mở renderer do lịch sử máy freeze/crash; checklist cần người dùng xác nhận camera, prompt, chuyển first-person và thông báo.

## Trạng thái trước — v36: menu nạp skill vẫn dùng được nếu ESC thoát fullscreen

- v34/v35 vẫn chưa xử lý được trên máy người dùng. ESC vẫn mở menu pause và giữ Keyboard Lock; nếu browser vẫn thoát fullscreen theo ESC, gate không che menu luyện tập để người dùng nạp skill.
- Menu windowed chỉ cho thao tác luyện tập/đổi súng; trận vẫn dừng và nút tiếp tục gọi lại quy trình fullscreen + Keyboard Lock. ESC lần hai trong menu có thể thoát fullscreen chủ động.
- Thoát fullscreen không qua ESC vẫn hiện gate như trước. Chưa thử trên browser thật; cần người dùng xác nhận.

## Trạng thái trước — v33: C và toàn màn hình bắt buộc

- Theo yêu cầu người dùng: kỹ năng C trở về **KeyC**, bỏ binding 4; cúi dùng Ctrl trái/phải. HUD/hướng dẫn đồng bộ. Clove sau chết dùng **C** mở smoke để E/Q tiếp tục xem đồng đội; free cam dùng Space lên/Ctrl xuống.
- Game chỉ resume khi Fullscreen API đang hoạt động, Keyboard Lock được cấp và tab đang có focus. Bỏ nút chơi cửa sổ không khóa chuột. Click canvas, nút tiếp tục và pointer lock đến trễ đều qua cùng điều kiện.
- Sau tải map hoặc khi thoát fullscreen: hiện “Vui lòng bật toàn màn hình”; nút vào lại fullscreen. Game/clock dừng, xóa phím/bắn/cast/tương tác đang giữ, đóng shop/map, nhả khóa chuột/bàn phím. Nền menu bị inert khi prompt đang hiện. Vào fullscreen không reset trận.
- ESC/blur/tab ẩn hủy lượt xin quyền đang chờ bằng version token; quyền trả về sau pause không tự tiếp tục. Chọn đội và tải trận vẫn giữ menu; bộ đếm chọn đội dừng ngoài fullscreen.
- Nút fullscreen của trang dùng JavaScript Fullscreen API; F11 riêng không đáp ứng Keyboard Lock. Cần cấp quyền bàn phím khi browser hỏi. Đối chiếu [Chrome Keyboard Lock](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock). Không dùng fallback C cúi khi thiếu/từ chối Keyboard Lock; khi đó chưa cho chơi.
- Cache module v33 và config fetch revalidate. Giữ ngân sách render hiện hữu (30 FPS, tối đa 960×600), không sửa texture/VFX.
- **Chưa chạy test tự động hoặc thử fullscreen/Keyboard Lock ingame v33.** M6 UI vẫn chưa nghiệm thu 100%; M7/M8 chưa bắt đầu.

### Checklist người dùng v33

- [ ] Sau tải map, không chơi được trong cửa sổ; nút vào fullscreen và cấp quyền cho chơi tiếp.
- [ ] C/Q/E/X đúng skill của ba agent; C không cúi, 4 không kích hoạt skill; Ctrl+W đi tới khi cúi không đóng tab.
- [ ] Thoát fullscreen lúc chạy/bắn/cast/shop: prompt hiện, timer dừng, không giữ input. Vào lại giữ HP/đạn/credits/round và không tự bắn.
- [ ] ESC pause rồi tiếp tục, Alt+Tab, từ chối quyền và thoát fullscreen khi đang xin quyền không tự resume.
- [ ] Clove chết C smoke/X hồi sinh; E/Q chuyển đồng đội; free cam Space lên/Ctrl xuống. Chọn đội/tải trận không bị ẩn bởi nút vào fullscreen.

## Trạng thái trước — v32: chỉnh UI tiếng Việt

- Người dùng chọn tiếng Việt sau khi phản hồi v31 chưa giống UI/chữ của client. Đổi font HUD/shop/scoreboard sang DIN Next webfont Riot + Inter đủ dấu; tên kỹ năng ba agent theo trang Riot tiếng Việt.
- Dựng lại shop với cột giáp riêng, thanh kỹ năng dưới súng/giáp, sáu ô thông số và bảng sát thương theo vùng cơ thể. Thêm icon light/heavy/regen và nền minimap nguồn; tổng 61 PNG (~744 KiB), nguyên byte.
- Banner mua đồ, labels bảng điểm/báo cáo/tooltip được Việt hóa; tiền chuyển xuống dưới phải. Preview 2D đã xem ở 1280×720 và 960×600. Không chạy test tự động hoặc game WebGL v32; không đổi VFX skill hay ngân sách render.
- Chưa nghiệm thu giống 100%: thiếu font/metrics client tiếng Việt và ảnh UI đích. Chi tiết tại [UI-IMPLEMENTATION.md](UI-IMPLEMENTATION.md). M6 vẫn đang hoàn thiện; M7/M8 chưa bắt đầu.

## Trạng thái trước — v31: M6 UI nguồn

- Người dùng cho phép research/triển khai UI và báo chơi từ v29 gần như không lỗi. Đã đối chiếu Riot patch notes, curate 57 PNG UI nguồn (~687 KiB) và lưu source/hash manifest.
- HUD, minimap Abyss/visibility/Spike/Z wheel/M map, kill feed/banner/hit/damage report, Tab ACS/ÉCO/ult và shop category/xin mua hộ đã nối vào authority local. B không pause clock, hết buy đóng shop, giữ scope Z hiện hữu.
- Giữ ACS/19 vũ khí theo plan ZCode dù Riot 13.06 đã thay ACS. Không đổi shader hay cắt VFX skill. UI dùng DOM/canvas 2D, không tạo engine thứ hai.
- CPU UI regression và syntax 12 module PASS; preview 2D đã xem. Chưa chạy game WebGL v31/đo FPS/RAM hoặc nghiệm thu pixel-perfect.
- Research, giới hạn và checklist: [UI-IMPLEMENTATION.md](UI-IMPLEMENTATION.md). M6 chờ người dùng duyệt hình ảnh và gameplay; M7/M8 chưa bắt đầu.

## Trạng thái trước — v30: layout Abyss, animation objective và skill bot

- Spawn/site dùng tên sàn raw và contour vùng plant của minimap nguồn đăng ký với targeting floor mesh. Runtime có exclusions/cao độ, đường viền plant; source/biến đổi nằm trong `game/config/abyss-match.json`. Chưa khẳng định chính xác tọa độ gameplay chính thức.
- Bake bổ sung sàn dưới và 6 connector sàn liên tục, navigation 12,319 node. Bỏ cạnh nhảy gần đúng. Buy barrier theo frontier vùng spawn, trả về vị trí hợp lệ trước đó; chưa phải cửa barrier gốc. Bot chưa dùng rope/ascender nên defender có thể đi vòng xa.
- Xuất 6 GLB animation-only, retarget clip plant/defuse tay 1P + UB/LB của ba agent và dash Jett. Gắn Spike/defuser vào tay 1P/3P, blend locomotion tám hướng. Fire bot vẫn recoil procedural, attachment và blend chưa nghiệm thu hình ảnh.
- Thêm AI chủ động dùng C/Q/E/X Clove/Jett/Sage theo threat/HP/objective; mua charge, cooldown/ult riêng, assist ledger. Sage revive player trả camera; caster chết hủy channel, vị trí bị chặn không retry vô hạn. Clove bot có spectral/window/deadline, tránh kết thúc round ở đúng lúc revive hoàn tất.
- Bot dùng các lớp skill nguồn hiện có theo owner; preload đầy đủ và chia sẻ asset. Không cắt texture/VFX, không đổi palette spectral v27. Dọn held prop/buff/dash khi chết và reset round.
- Đã xuất asset và bake layout/navigation trên CPU. **Không chạy test tự động, syntax checker hoặc browser/WebGL v30**; chưa có số đo FPS/RAM. Kết quả v28/v29 không nghiệm thu thay v30.
- Checklist, giới hạn và lệnh dựng lại: [MATCH-IMPLEMENTATION.md](MATCH-IMPLEMENTATION.md). M3/M4 và AI skill là bản chờ chơi thử; M6 UI nguồn chỉ bắt đầu sau khi người dùng chấp nhận.

## Trạng thái trước — v29: free cam và bot navigation

- Theo yêu cầu người dùng: sau khi chết chuyển free cam (WASD/Space/C, Shift nhanh); E/Q chuyển đồng đội còn sống, V về free cam. Camera observer riêng không thay đổi feet/deathPoint. Reset khi round mới, hồi sinh, đổi mode hoặc dispose scene. Clove đã chết mở smoke bằng 4; X giữ chức năng hồi sinh.
- Phản hồi Unrated: bot lặp đường cố định và đôi khi crouch rồi đứng mãi. Rà mã thấy BFS theo cùng thứ tự edge, engage đứng/strafe tại chỗ không có giới hạn crouch, không có progress watchdog. Thay bằng A* có chi phí vùng theo seed mỗi bot/round; phân hai nhóm mục tiêu site, patrol vùng site, giới hạn crouch 650 ms và reposition khi giao tranh.
- Thêm watchdog 1.5 giây không tiến được 0.25 m: tránh edge/node tạm thời 12 giây, đổi seed, lùi qua node đã đi hoặc tìm bước thoát ngắn trên sàn hợp lệ. Có xử lý đường rỗng/anchor không tới được; không teleport bot để né collision. Không tính plant/defuse là bị kẹt.
- Đã sửa code và cache v29; **chưa chạy test hoặc browser trong lượt này**. Cần người dùng kiểm tra free cam, chuyển đồng đội, Clove 4/X, bot chia site/thoát kẹt và reset qua round. Không dùng PASS v28 để nghiệm thu v29.
- Bước tiếp theo: tiếp tục hoàn thiện M3 + M4 (hiệu chỉnh site/spawn/barrier Abyss, objective/round loop và animation combat bot), rồi chuyển M6 HUD/minimap/shop/bảng điểm từ UI nguồn sau nghiệm thu. AI chủ động dùng skill của 3 agent là phần mở rộng M5 cần làm trước khi coi bot có đủ bộ kỹ năng.

## Trạng thái trước — v28: trận đấu local

- Người dùng cho phép bắt đầu M3 + M4, đổi luật chọn đặc vụ thành tối đa **2 bản sao mỗi đặc vụ trong từng team**. Đã cập nhật plan; roster hiện tại Clove/Jett/Sage, 5 người/team. Màn chọn 90 giây và authority lúc khởi tạo đều áp dụng giới hạn này.
- Thêm vòng Unrated local: buy/live/post-round, economy, shop, đổi bên, overtime theo config, Spike plant/defuse/checkpoint, nhặt/thả súng, ult orb, K/D/A. Deathmatch 10 người: 40 kills/10 phút, hồi sinh 2.5 giây, không dùng skill.
- Chín bot dùng collision/motor chung với người chơi, graph sàn Abyss 8,760 node/60,458 liên kết; patrol/LOS/engage/strafe/crouch/reload/push/defend/plant/defuse. Body/animation/Classic/Vandal/Spike/defuser từ asset nguồn; material chia sẻ giữa bot, tải lần lượt. Giữ VFX v27 và giới hạn render hiện tại.
- Các lượt CPU đã chạy: authority 6 nhóm PASS; integration NullEngine import skeleton/model thật PASS (bỏ material để không dùng GPU); controls 28 + 3 lifecycle PASS. Sau đó rà mã và sửa reload bot, carry armor, cleanup material chia sẻ, marker Deathmatch và hiển thị thi thể. Chưa nghiệm thu WebGL hoặc đo FPS/RAM của 9 bot.
- Đây là bản đầu để chơi thử; site/spawn là layout local từ sàn liên thông, chưa phải A/B chính thức của Abyss. Bot chưa chủ động dùng ability; animation tay Spike/defuser và blend chiến đấu còn cần hoàn thiện. Chi tiết mở game, phím và phạm vi: [MATCH-IMPLEMENTATION.md](MATCH-IMPLEMENTATION.md).

## Trạng thái trước — v27

- Theo ảnh phản hồi v26 vẫn tối, thay material resurrection StandardMaterial bằng ShaderMaterial spectral riêng. Source DF cung cấp detail, được ánh xạ vào palette sáng có giới hạn; không dùng DF tối làm màu cuối trực tiếp.
- 1P dùng core xanh trắng/lavender; 3P core tím hồng và viền hồng theo góc nhìn. Màu nằm trong [0,.99], không phụ thuộc đèn/exposure của map. Giữ bone skinning, UV nguồn, phase/clip/vũ khí từ v25.
- Đã xem bảng palette từ DF thật tại tools/art-review/clove-spectral-v27-palette.png và kiểm tra cú pháp. Chưa chạy kiểm tra GPU/WebGL hoặc đo performance v27. Các kết quả test cũ không được coi là nghiệm thu shader mới.

## Trạng thái trước — v26

- Sửa Clove X cháy trắng theo ảnh người dùng: shader StandardMaterial cộng base emissive với texture trước Fresnel, nên base trắng + gain 7/6/8 đã làm mất chi tiết. Base hiện đen, texture nguồn cung cấp màu, gain viền giảm về 1.2–2.7 tùy kênh.
- Thay 16 polyhedron cast Clove bằng 16 sprite bướm nguồn có mask luminance/alpha và flap. Smoke butterflies dùng cùng shader alpha/additive thay nền emissive phẳng làm hiện ô vuông.
- Đã kiểm tra cú pháp runtime. Chưa kiểm tra hiển thị WebGL bản v26.

## Trạng thái trước — v25

- Sửa Sage orb C/Q/E: 8 shard giữ nguyên số lượng, size từ .065 về .012 để không vượt lõi, emissive đầy đủ thay 15% khi tắt lighting.
- Material VFX mesh (orb/preview/motes/slow/dao) tự phát sáng; lớp năng lượng alpha dùng additive, shell smoke và barrier vẫn giữ chức năng che tầm nhìn.
- Clove X: material spectral từ texture nguồn + viền emissive/Fresnel, ẩn súng cả 1P/3P trong revive/intangible/outro. Dùng deadline riêng của resurrection, không tái hiện ghost khi cast skill khác trong ult deadline.
- Bổ sung 1P resurrection idle/walk/run/Embody từ PSA nguồn, không giữ cứng frame cuối Revive.
- CPU regression gồm kích thước/độ sáng shard, blend mode, weapon state, material spectral: PASS. Native texture review PASS. Chưa nghiệm thu WebGL.

## Trạng thái trước — v24

- Soát lại 12 skill theo phản hồi bị cắt effect/texture. Chi tiết từng lớp và giới hạn: [SKILL-VFX-AUDIT.md](SKILL-VFX-AUDIT.md).
- Giữ native texture/alpha agent/VFX và mọi frame animation nguồn. Chuẩn bị asset agent đang chọn trước khi cast; sửa rendering group của source layer 1P tải async.
- Sage preview có indicator/wisp/ground/shards và orb giữa tay; barrier dùng source intact thay Wall_Chunk, thêm beam/skirt/ground. Bổ sung secondary smoke, Clove glow/ult body, Jett spline/trail, Sage heal beam/res silhouette/slow crystals.
- Bỏ eviction smoke/flight đang sống và cắt đường bay dao ở 60 m. Map streaming không quản lý skill VFX.
- CPU lifecycle/bindings PASS; 19 VFX pixel/alpha và 34 GLB/43 texture native PASS. Chưa nghiệm thu WebGL, chưa gọi là bản sao hoàn chỉnh shader/Niagara Riot.

## Trạng thái trước — v23

- Sửa Sage Barrier sau ảnh phản hồi: bỏ visual `Wall_Chunk` bị nhầm mảnh vỡ; dùng bốn khối kín khớp collision, chân đặt theo sàn và chuyển sắc xanh đậm → jade, vân/crack riêng. Sửa tính chiều cao mặt trên trong giai đoạn mọc tường.
- Foliage dựng thêm được đối chiếu BVH của map: cây/lá rơi bám sàn, vine bám bề mặt gần. Cụm không tìm thấy điểm bám bị bỏ, không dịch xuống một tầng xa tùy ý. Audit tại `assets/maps/optimized/abyss-art/foliage-anchors.json`.
- Thu nhỏ phạm vi lá, bo silhouette cabbage/vine nhiều cạnh, nối thân vine. Cần người dùng xem lại đúng vị trí ảnh 3 và barrier; chưa nghiệm thu bằng WebGL.

## Trạng thái trước — v22

- Abyss mặc định dùng art pass sau khi xem 189 diffuse: bảng màu chủ ý, atlas props/decal, lá rơi cutout, foliage có sống gấp. Giới hạn geometry nguồn: [ABYSS-ART.md](ABYSS-ART.md).
- Jett dùng năm clip phóng dao nguồn, thời gian clip khớp chu kỳ bắn; dao bay/streak riêng và dao đang giữ có chuyển động. Dash/updraft có sáu dải gió cuộn.
- Smoke bung khối 320 ms, cuộn hai lớp noise, biến dạng nhẹ, co lại 380 ms; radius LOS theo scale. Clove có idle E và bướm quay/flap. Sage slow mở/co field, orb nổi/xoay; Meddle bung/fade khi nổ.
- Export lại material ba agent với metallic thấp, roughness cao hơn. Script/asset cache v22.
- Đã kiểm tra cú pháp, đọc dữ liệu export và xem ảnh CPU. Chưa nghiệm thu gameplay/WebGL; chưa đánh dấu toàn bộ animation/VFX ba agent hoàn thiện.

## Trạng thái trước — v21

- Sửa E Clove: tạm trả con trỏ cho bản đồ kỹ năng mà không pause; click trái chọn/xóa vị trí, phải xác nhận, E/1/2/3 hủy và quay lại điều khiển. ESC đóng map và pause.
- Sửa material overlay tay Jett, dao Jett và reference texture khác tên material; nhúng diffuse/normal/MRAE, GLB có version mới để bỏ cache.
- Smoke Clove có shell tím/hồng và noise động; không thay shell bằng mesh WorldGrid trắng. Sage có preview tường xanh/đỏ, vân tường/slow, cue heal/revive. HUD có icon nguồn cho 12 kỹ năng.
- [AGENT-TEXTURES.md](AGENT-TEXTURES.md) liệt kê texture đã có, đã nối vào runtime và phần shader/animation còn lại. Kiểm kê không thấy thiếu file được tham chiếu trong JSON material của ba agent; VAT Clove là HDR.
- Chưa nghiệm thu v21 bằng WebGL; không gọi ba agent hoàn thiện về hình ảnh, âm thanh và cảm giác chơi.

- Mốc 2 đã được người dùng nghiệm thu sau sửa tay/dao/Odin và Ctrl + W.
- Roster sửa thành 29 tên/codename đúng, 29 GLB preview có sẵn; bổ sung file Sova/Vyse bị thiếu. Chỉ Clove/Jett/Sage có runtime kỹ năng ở nhánh này.
- Clove → Smonk, Jett → Wushu, Sage → Thorne. Trước đó ba tên đều trỏ sai mesh.
- Gameplay local bổ sung 12 kỹ năng, tay 1P theo agent, locomotion tám hướng và phân tách bone thân trên/thân dưới. V bật camera kiểm tra nhân vật; body/clip 3P chỉ tải khi cần.
- Thông số đối chiếu VALORANT Wiki hiện tại và patch Riot. Sage tự heal 100 HP theo 13.00; Clove smoke sau chết 6 giây theo 12.05, tối đa một charge theo 11.10.
- Phím kỹ năng: **4 / Q / E / X**; **C vẫn cúi**. Menu ESC có mua/nạp kỹ năng, gây sát thương/chết thử và tạo đồng đội thử heal/resurrect.
- Chi tiết nguồn, cơ chế, giới hạn và checklist nghiệm thu: [AGENTS-IMPLEMENTATION.md](AGENTS-IMPLEMENTATION.md).
- v20 mới kiểm tra cú pháp; chưa chạy test gameplay/WebGL. Các PASS của mốc 2 không tự động áp dụng cho thay đổi v20.

Nguồn định hướng chính: `.zcode/plans/plan-sess_1689aa5d-3564-4fc9-b71b-7510c9f40b55.md`.
`Val-Strike HTML — Full ZCode Prompt.md` là tài liệu gốc bổ sung. Các mục trong plan chưa được thực hiện hết.

## Chạy dự án

```powershell
Set-Location C:\Users\Admin\Downloads\valorant
node --max-old-space-size=256 server/server.cjs
```

- Map low-poly của dự án (mặc định): http://127.0.0.1:8455/game/game.html?map=abyss
- Shooting Range: http://127.0.0.1:8455/game/game.html?map=range
- Trang khảo sát map: http://127.0.0.1:8455/game/test.html?map=abyss
- Trang chính: http://127.0.0.1:8455/

Mở trang chỉ tải config/script. Bấm **Tải map đã chọn** mới tạo WebGL. Bấm overlay để khóa chuột hoặc chọn **Chơi không khóa chuột**. Khi không khóa chuột, giữ chuột giữa để nhìn quanh. ESC tạm dừng; chọn súng thử khi đang tạm dừng.

## Các sửa đổi đã thực hiện

- Controller dùng vị trí bàn chân, physics substep, va chạm tường/sàn/trần, leo bậc, ngồi dưới trần thấp, nhảy theo lần nhấn và tốc độ chéo chuẩn hóa.
- Một đồng hồ gameplay cho equip/reload/fire; pause đóng băng thời gian và xóa input giữ, ADS. Đổi súng hủy reload đúng cách.
- Bắn dùng `pointerdown`/`pointerup`: Babylon ngăn các mouse event tương thích nên listener `mousedown` cũ không nhận cú bấm trong trình duyệt thật.
- Input v16 so sánh bitmask `buttons` ở `pointerdown`/`pointermove`/`pointerup`. Nhấn thêm nút chuột trong khi giữ nút khác được browser gửi dưới dạng `pointermove`; code chỉ nghe `pointerdown` đã bỏ sót bắn trái khi giữ ADS. Hai nút được nhả độc lập, nhả ngoài canvas vẫn dừng bắn, pause/cancel xóa hành động giữ.
- Classic chuột phải là chế độ shotgun ba viên tức thì, semi-auto, tốc độ 2.22 loạt/giây ([VALORANT Wiki](https://wiki.playvalorant.com/en-us/Classic)); Riot cũng xác nhận Classic có alternate right-click burst trong [patch 2.0](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-2-0/). Đã sửa trừ 3 viên cho 3 projectile, băng còn 1–2 viên chỉ tạo 1–2 projectile, không lặp khi giữ phải. Cooldown theo chế độ vừa bắn; shotgun thật vẫn dùng một shell cho nhiều pellet. Spread/bloom tổng thể vẫn chưa mô phỏng đầy đủ mọi đường cong của game gốc.
- Recoil hướng lên, bloom hồi phục, burst theo config, Classic chuột phải, melee không truy cập ammo, hitbox mục tiêu tương đối, mục tiêu chết/hồi sinh.
- Raycast world dùng BVH; không raycast toàn bộ mesh map mỗi bước. Decal có giới hạn số lượng/thời gian và dùng chung material.
- Render tối đa 30 FPS, 960 × 600, không nhân theo DPR, không antialias. Pause/tab ẩn dừng render scene. Không tự mở preview agent; đổi route hủy tài nguyên preview cũ.
- Runtime Babylon 8.32.0 được lưu cục bộ; route `/game` mở trang gameplay.
- Devserver tăng hàng đợi kết nối lên 64 để tránh bỏ sót request khi browser/jsdom tải nhiều script/config cùng lúc.

## Bộ nhớ map

`abyss_tex_opt.glb` cũ có 487 ảnh: ước tính khoảng **972.5 MiB** RGBA + mipmaps sau giải nén, chưa gồm geometry, bản sao CPU/driver và trình duyệt. Đây là tải bộ nhớ đáng kể; chưa chứng minh được nguyên nhân duy nhất của lần máy freeze/crash.

Theo yêu cầu mới của người dùng, **đã bỏ Lite khỏi đường tải gameplay và quay lại `abyss_lowpoly.glb` do dự án đã làm trước đó**. File gốc không sửa: ~5.3 MiB Draco, 784,708 tam giác phần chơi được, palette PNG 1024 × 4. Không dùng bản texture gốc.

`tools/build-map-stream.cjs` giải nén Draco offline, giữ geometry/normals/UV/COLOR_0/palette/material; không decimate. Sau sửa đơn vị (mục dưới), gói thành **895 cụm**, ô kiến trúc 32 m và ô cảnh quan đá/vách 128 m, tổng geometry giải nén ~71.71 MiB. Ô cảnh quan lớn hơn giảm số draw call. Runtime fetch từng cụm gần camera hoặc trong frustum mở rộng; Babylon cull phần ngoài frustum vẽ. Tải đón thêm 0.6 rad, giữ cụm vừa nhìn 6 giây, ngân sách geometry cư trú 80 MiB, một request hình học đang tải. Cụm cũ được dispose cả buffer khi hết hạn/rời ngân sách. Ngân sách này tính dữ liệu geometry, chưa gồm bản sao GPU, collision và bộ nhớ browser. Đây là streaming theo hướng nhìn, chưa có portal/occlusion culling sau tường.

Physics dùng BVH đóng gói offline **35.77 MiB**, typed arrays, không tạo mesh GPU va chạm và không phụ thuộc cụm hình ảnh đang tải. Chuyển hệ tọa độ bằng phản chiếu X đúng như root của Babylon glTF importer, áp dụng cả positions/normals/collision/anchor. Spawn ưu tiên sàn gần anchor nguồn và kiểm tra headroom/khoảng trống. Map nguồn có nhiều tầng và cảnh quan nên điểm spawn vẫn cần kiểm tra bằng mắt.

Đổi cách đóng gói làm tổng dữ liệu trên đĩa lớn hơn file Draco 5.3 MiB, nhưng browser chỉ tải hình ảnh theo vùng và không giải nén toàn bộ GLB cùng lúc. Quay nhanh sang vùng chưa có có thể thấy cụm xuất hiện sau một khoảng tải; prefetch/cache giảm hiện tượng này. Bản Lite cũ được giữ làm artifact, không còn được game chọn.

### Sửa tỉ lệ người chơi so với map

Pipeline `blend_to_glb.py` cũ dùng `100 / max(horizontal span)` để thu toàn bộ map và cảnh quan về 100 đơn vị, nhưng controller vẫn cao 1.8 m, mắt 1.7 m và súng được đổi từ cm sang m. Đây là nguyên nhân người chơi khổng lồ tương đối với phòng/cửa.

`tools/audit-map-scale.py` chỉ đọc một vài object từ `.blend`, không tải cả scene hoặc render. Skydome nguồn có chiều ngang 16,384 đơn vị; cùng skydome trong low-poly là 1,686.092285, suy ra geometry bị nhân 0.102910906. Đã khôi phục bằng **9.7171430913**, ghi bằng chứng và cấu hình trong `tools/map-scale.json`. Áp dụng vào vertex local trước khi cộng translation của node; translation nguồn vốn chưa bị thu nhỏ nên không nhân lại. Normal không đổi vì đây là scale đồng nhất. Collision, bounds, floor candidates dùng cùng phép đổi. File low-poly nguồn không sửa.

Marker cũ chưa có `coordinateSpace` được đổi quanh cùng pivot; marker mới mang `abyss-meters-v1`, không bị đổi hai lần. Runtime kiểm tra sàn/headroom trước khi dùng marker làm spawn. Exporter nguồn đã bỏ bước ép chiều ngang về 100 để tránh tái tạo lỗi khi export sau này.

### Sửa timeout khởi tạo streaming (v15)

Lỗi cũ: `prime()` chờ tất cả cụm trong frustum mở rộng, có hàng trăm cụm sau khi chia lại map, với deadline 15 giây. Nếu tab ẩn, `pump()` dừng nhưng deadline vẫn chạy và hàng đợi không có render observer để tự khởi động lại. Log lượt người dùng lỗi chỉ ghi nhận một request chunk trước timeout.

Bản mới chỉ chờ geometry trong bán kính 12 m quanh spawn và palette (spawn hiện tại: 8 cụm, ~7.97 MiB). Các cụm xa vẫn được chọn theo hướng nhìn, tải tiếp khi bắt đầu chơi. `prime()` tự khởi động lại hàng đợi khi tab hiện; thời gian tab ẩn không tính vào deadline khởi tạo. UI hiển thị số cụm gần đã tải. Request treo bị abort sau 10 giây; khởi tạo thử tối đa 3 lần mỗi cụm, có thời gian chờ giữa các lần. Lỗi trả về tên asset và tiến độ thay vì thông báo timeout chung. Hàng đợi nhường event loop giữa các cụm.

Các giá trị ở `game/config/performance.json`: `mapInitialRadius`, `mapInitialTimeout` (30 giây hoạt động), `mapInitialRetries`, `mapRequestTimeout`, `mapRetryDelay`.

## Model súng

Đã chuyển 18 súng và dao S0 từ `model/valorant-model-animations-gun`. Mỗi súng có Fire/Reload/Equip/Inspect từ nguồn; dao có ba nhát chém, đâm, Equip/Inspect; Outlaw có riêng ReloadEmpty. Không có Reload cho dao.

- v18: asset khoảng 3.2–5.5 MiB, gồm một súng/dao và tay Reyna 1P; bảy map texture tối đa 512 px. MRS/MRAE R chuyển sang metallic, G sang roughness; NM đảo green từ Unreal/DirectX sang glTF/OpenGL; AEM R làm AO. S0 súng báo HasTopEmissive=false, không biến channel mask thành vùng phát sáng. Đây là ánh xạ suy ra từ tên channel/MI; shader AresFirstPerson gốc không có trong extract, độ giống material vẫn cần đối chiếu WebGL.
- GN giữ articulation/magazine trong skinned mesh, FP điều khiển attachment R_WeaponMaster tương đối với Camera và đúng IdlePose. v18 dùng attachment tuyệt đối, bù bind orientation của Skeleton; không bỏ pose cầm nguồn để trả về bind pose. Chọn chính xác tên hip IdlePose, tránh cả AltIdlePose lẫn ADSIdlePose. Tất cả model giữ kích thước nguồn (scale=1), bỏ scale=0.6 làm Odin quá nhỏ. Không nhân đôi magazine rời lên magazine có sẵn trong mesh.
- Runtime đồng bộ animation với gameplay clock; load trễ lấy đúng tiến độ equip/reload, pause giữ pose. Chỉ giữ một viewmodel và một load đang chạy.
- Đã sửa kết luận audit cũ: extract agents có tay `Vampire/S0/1P` (Reyna), 6,461 vertex/106 bone; 104 bone khớp tên và parent của FP PSA. Dùng một skin tay riêng cùng GLB súng, giữ inverse bind nguồn và animate full local pose; inverse Camera chung bảo đảm tay và attachment khớp. Cắt mặt vai/cánh tay trên có trọng số thuần proximal để tránh che camera, giữ bàn tay/cẳng tay/elbow blend. Tay Reyna đang là mặc định cho mọi súng, chưa chọn theo agent. Locomotion/layered animation nhân vật 3P thuộc mốc 3.
- Holding loop IdleAdd/IdlePose, WalkAdd/RunAdd và ADS/AltIdle theo clip có sẵn; blend chuyển loop 120 ms. Các súng thiếu clip walk/run giữ idle nguồn. FP có full pose, không cộng Add lên bind. Tay sample tối đa 30 Hz offline và nội suy runtime. Bắn ADS có clip chuyển hệ pose hip sang ADS cho cả tay và súng; reload/equip/inspect hoàn tất trở về holding loop, pause giữ nguyên pose.
- Texture swap load theo yêu cầu, khôi phục S0 và hủy texture skin cũ. Exporter chỉ cho dùng skin có positions/wedge UV/indexed face/material slots giống S0: Stinger Glitter, Judge Flush, Bulldog Glitter, Guardian Candyland, Phantom Pets. 788 mesh khác bị loại khỏi đường swap. Chưa có bằng chứng cho giả định 85%/748 skin trong plan; không lấy texture của mesh khác áp bừa lên S0.
- Vỏ đạn lấy geometry PSKX S0 nguồn, bảy loại caliber; pool tối đa tám mesh chia sẻ geometry/material. Sheriff/Shorty/Outlaw giữ vỏ đến reload. Chuyển động vỏ là mô phỏng đơn giản, không có rigid-body riêng.

## Shooting Range — mốc 2

Người dùng đã tự test v17 và báo gameplay/map/hiệu năng PASS, console không lỗi; camera “maybe p”. Hai lỗi hình ảnh dao/Odin được sửa ở v18; cần test lại hình ảnh/material/hiệu năng sau thêm tay. Xem checklist tại `MILESTONE-2.md`.

- ESC mở bảng chọn súng/skin, giáp None/Light/Heavy/Regen, cự ly 5/10/20/30/50 m, vật cản gỗ/kính/kim loại/bê tông và độ dày 15/50/100 cm; có reset mục tiêu/đạn và đạn vô hạn. Bảng kết quả hiện hitzone, distance, damage, HP/armor, headshot/kill; mục tiêu hồi sinh theo game clock. HUD giả round/minimap/abilities được ẩn trong range.
- Armor Light/Heavy hấp thụ 66%, giới hạn 25/50; Regen hấp thụ 100%, shield 25 + pool 50, chờ 3 giây rồi hồi trong 3 giây, ngừng khi chết/hết pool. [Riot 9.10](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-9-10/), [Armor and Shield](https://wiki.playvalorant.com/en-us/Shields).
- BVH trả các mặt vào/ra, loại hit trùng ở cạnh tam giác; damage xuyên vật cản phụ thuộc độ dày/material/tier. Map stream có thêm 292 khoảng triangle/material nguồn, không tăng geometry hoặc BVH. Geometry mở/không rõ vật liệu được chặn bảo thủ. Hệ số resistance/energy là mô phỏng chỉnh được, không phải thuật toán server Riot đã được công bố hoặc trích xuất.
- Spectre ADS 1.15×/12 viên giây; Odin ADS bắt đầu ở 15.6; Bulldog ba viên/75 ms, chu kỳ 475 ms; Stinger bốn viên/55.56 ms, chu kỳ 472.22 ms. Bucky airburst tách một canister gần/5 pellet sau 7.5 m, tốn một shell. Bucky/Marshal nạp từng viên và có thể ngắt; Outlaw nạp một viên 2.3 s, từ rỗng 3.8 s. Operator zoom 2.5×/5× bằng Z trong khi giữ ADS; scope ẩn viewmodel. [Spectre](https://wiki.playvalorant.com/en-us/Spectre), [Odin](https://wiki.playvalorant.com/en-us/Odin), [Bulldog](https://wiki.playvalorant.com/en-us/Bulldog), [Stinger](https://wiki.playvalorant.com/en-us/Stinger), [Bucky](https://valorant.fandom.com/wiki/Bucky), [Outlaw](https://wiki.playvalorant.com/en-us/Outlaw).
- Recoil có pitch/yaw và hồi phục, crosshair mở theo spread. Giữ auto sử dụng lịch cooldown tích lũy, không bị giảm fire rate theo bước render 30 FPS. Recoil/spread curves vẫn là mô phỏng local, không khẳng định khớp 100% game thương mại; bộ stats bám phạm vi v9.10+ của plan, chưa cập nhật toàn bộ balance của các patch về sau.
- Dao chém/đâm 50/75, gấp đôi khi đánh lưng; ưu tiên mục tiêu giữa vùng quét, không xuyên tường. [Melee](https://wiki.playvalorant.com/en-us/Melee).
- Bots, round/economy/spike và HUD texture nguyên bản thuộc các mốc sau.

## Công cụ và kiểm tra

Từ thư mục gốc:

```powershell
npm --prefix tools ci
python tools/gun_to_glb.py --all
python tools/build-weapon-extras.py
npm --prefix tools run map:stream
npm --prefix tools run test:controls
npm --prefix tools run test:assets
npm --prefix tools run test:viewmodels
npm --prefix tools run test:range
npm --prefix tools run test:extras
npm --prefix tools run test:framing
npm --prefix tools run test:map
npm --prefix tools run test:map:startup
npm --prefix tools run test:startup
npm --prefix tools run test:fly
```

Python exporter cần Pillow. Các test trên dùng NullEngine/jsdom, không tạo GPU context. `test:startup` cần devserver đang chạy.

Test WebGL thật (devserver phải đang chạy):

```powershell
npm --prefix tools run test:browser
npm --prefix tools run test:browser:guns
npm --prefix tools run test:browser:abyss
```

Script browser hiện dùng Chrome cài trên máy và Playwright trong bundled Codex runtime (đường dẫn ghi ở đầu script). Mỗi lượt mở một tab headless 640 × 400, kiểm tra tối thiểu 1.5 GiB RAM trước khi mở, đóng nếu RAM xuống dưới 1 GiB, có deadline 60 giây và đóng browser trong `finally`. Không chạy nhiều lượt GPU song song. Screenshot/stats lưu trong `tools/.artifacts`.

### Bằng chứng kiểm tra

- 26 kiểm tra logic controls qua, gồm Classic ammo/projectile/decal/hold/cooldown/băng thiếu đạn, Vandal/Odin vừa ADS vừa bắn, nhả trái vẫn ADS, nhả phải vẫn bắn trái, nhả ngoài canvas và pause khi giữ cả hai nút. Harness gửi chording đúng như browser (`pointermove` khi nhấn/nhả thêm nút), thay vì giả lập hai `pointerdown`.
- Cả 18 GLB import được bằng Babylon, các sample animation có quaternion chuẩn hóa/matrix hữu hạn.
- Reload đổi pose, pause giữ pose; đổi Classic/Vandal nhiều lần giữ nguyên số mesh/node/skeleton/material.
- BVH khớp picking Babylon ở 80 vị trí trên Abyss Lite và các ray trong khu test.
- Bản low-poly streaming sau sửa đơn vị: kiểm tra multiset đủ 784,708 tam giác khớp dữ liệu collision và một lượt decode trực tiếp nguồn độc lập theo scale đo được; PNG palette và material khớp file low-poly gốc, vertex colors chuẩn hóa. Kiểm tra layout position/normal/UV/color ở mesh runtime, tỉ lệ so với skydome nguồn và migration marker đúng một lần. NullEngine tải 292 cụm khi nhìn trước, 382 cụm khi quay sau; hủy cụm cũ, tuân thủ ngân sách, va chạm không đổi khi hủy hình ảnh.
- Khởi tạo streaming v15: 5 regression qua với NullEngine, không dùng GPU: trì hoãn cụm xa, tab ẩn từ đầu, tab ẩn sau request đầu, retry lỗi mạng tạm thời, abort/retry giới hạn với request treo. Bài kiểm tra map đầy đủ cũng qua sau đổi điều kiện readiness. Lượt browser v15 bị RAM guard chặn trước khi mở Chrome; chưa xác nhận WebGL sau sửa.
- Trang game/map test/menu mở mà không tạo WebGL; đổi route menu không tích lũy preview.
- Trang khảo sát map chờ config rồi mới cho load, khôi phục marker sau khi scene tồn tại, pause xóa phím giữ. Flow và marker đã kiểm tra với NullEngine; lượt WebGL riêng cho viewer bị RAM guard chặn trước khi mở browser.
- **Kết quả browser ở lượt trước** trên Intel UHD 620: khu test và Abyss Lite chạy khoảng 28–30 FPS ở 640 × 360. Lượt thử 18 khẩu đã render và mỗi cú bấm giảm đạn; giữ một skeleton, 3 textures cuối lượt, RAM khả dụng thấp nhất ~2.1 GiB. Không ghi nhận lỗi JavaScript trong lượt thử.
- **Low-poly streaming, lượt WebGL ngắn trước sửa hệ tọa độ**: khoảng 30 FPS ở 640 × 360, geometry cư trú 50.88 MiB/123 cụm, 4 textures cả súng, RAM khả dụng thấp nhất 1,181 MiB; các thao tác bắn/reload/ADS/pause qua, không ghi nhận lỗi. Đã sửa phản chiếu tọa độ Z thành X để khớp importer và kiểm tra lại bằng decode nguồn độc lập. Lượt browser sau sửa đang bị guard chặn vì RAM khả dụng dưới 1.5 GiB; chưa xác nhận hình ảnh sau sửa bằng mắt hoặc lượt xoay camera WebGL mới. Script browser đã bổ sung kiểm tra xoay, tải/hủy cụm và giữ collision để chạy khi đủ RAM.
- Sau sửa tỉ lệ 9.717143 và chia lại thành 895 cụm, lượt WebGL vẫn bị RAM guard chặn trước khi mở Chrome. Các số FPS/geometry cư trú ở lượt cũ không đại diện cho bản này; chưa kiểm tra hình ảnh hoặc hiệu năng WebGL sau sửa tỉ lệ.
- Script WebGL đã bổ sung Classic right-click tốn ba viên và thao tác giữ phải → nhấn/nhả trái trên Vandal/Odin bằng Playwright mouse thật. Lượt v16 vẫn bị guard chặn vì RAM khả dụng dưới 1.5 GiB; chưa xác nhận thực tế browser cho bản input mới. Cơ chế pointer được đối chiếu [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerdown_event).

### Kiểm tra mốc 2 mới

- 26 regression controls và 14 regression range qua: armor/regen, xuyên vật liệu/độ dày, reload từng viên/ngắt, Outlaw hai thời gian, ADS/burst cadence, rate độc lập 30/60/120 FPS, Bucky canister/pellets, recoil pause/recovery, dao đánh lưng và chặn bởi tường. Giữ bắn trong reload không phát lại các phát bị lỡ thành loạt bắn dồn.
- 19 GLB qua import và sample từng animation; quaternion/matrix hữu hạn; kiểm tra tham chiếu đúng IdlePose. CPU projection của cả 19 viewmodel có geometry trong khung nhìn; Vandal Fire không còn lệch mạnh sau sửa AltIdlePose. `tools/.artifacts/viewmodel-projection.png` chỉ là hình học chiếu bằng CPU, không xác nhận shader/material WebGL.
- Kiểm tra skin swap/S0 restore/stale-load disposal, pool vỏ đạn tám mesh chia sẻ geometry, đổi wall range 15 lần không tăng mesh/material đều qua.
- Startup production và năm regression streaming initialization qua. Server localhost được khởi động lại, không tự mở browser.
- Lượt `test:browser` mới bị guard chặn trước khi khởi tạo Chrome vì RAM trống dưới 1.5 GiB. Chưa nghiệm thu render/material và chơi lâu của bản mốc 2 mới; không dùng kết quả browser cũ để thay thế.

### Phản hồi người dùng và sửa v18 (2026-10-09)

- Test thủ công v17: Shooting Range/Abyss PASS; Classic trái/phải/ammo/reload PASS; Vandal/Odin ADS + bắn/reload/đổi súng PASS; tỉ lệ model/map và FPS/RAM/crash PASS; console N (không lỗi). Camera “maybe p”. Người dùng báo dao chưa đúng pose cầm và Odin nhỏ, thiếu animation cầm trên mọi súng. Chưa ghi nhận thời lượng phiên chơi.
- v18 thêm tay Reyna và camera-space holding, bỏ thu nhỏ model, thêm loop nguồn và ADS fire. Kiểm tra không GPU: controls 26, range 14, skin/shell/disposal qua; viewmodel kiểm tra tay dao idle/run/walk, pause, Odin scale/ADS fire, reload và đổi súng giữ số mesh/node/skeleton/material ổn định.
- Asset validator chạy mỗi khẩu trong một process tuần tự với heap 192 MiB để tránh tích lũy garbage của 19 lượt loader/NullEngine trong cùng process. Không tăng heap để né giới hạn RAM.
- Hình chiếu `tools/.artifacts/viewmodel-holding-v18.png` chỉ là geometry CPU; chưa đại diện shader/material WebGL. Không khởi tạo WebGL mới trong lượt sửa này; người dùng đang tự test, RAM khả dụng đo được khoảng 1.25 GiB dưới guard 1.5 GiB.

### Input browser v19 — Ctrl+W đóng tab (2026-10-09)

- Tab thường dùng giữ **C** để cúi (`movement.crouchKeys`). Ctrl chỉ được dùng để cúi sau khi trang đã vào Fullscreen API và `navigator.keyboard.lock()` thành công (`lockedCrouchKeys`). `preventDefault()` vốn đã có ở WASD không đủ để bảo đảm browser chuyển shortcut dành riêng đến trang.
- Nút **Chơi toàn màn hình (Ctrl)** xin fullscreen và Keyboard Lock cho các phím gameplay (gồm WASD/R/F/Z/1/2/3). Chrome có thể hiện permission prompt; nếu không hỗ trợ/từ chối, giữ C vẫn hoạt động. Nút F11 riêng không đáp ứng điều kiện JS fullscreen. [Tài liệu Chrome](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock), [MDN lock](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock).
- Escape hiện được khóa để mở menu pause mà không thoát fullscreen; pause/blur/tab ẩn/thoát fullscreen/pagehide/dispose nhả khóa và xóa input. Permission trả về sau pause không được tự resume. Nếu pointer lock bị từ chối sau gesture fullscreen, click canvas lần nữa hoặc dùng chuột giữa để nhìn.
- 28 regression controls qua; thêm ba ca lifecycle với API giả lập: Ctrl+W/Ctrl+R được cancel khi sự kiện tới trang và lock được cấp, Escape/exit nhả khóa; từ chối quyền giữ fallback C; permission đến trễ sau pause không resume. Đây là kiểm tra logic, chưa xác nhận browser thật chặn shortcut Ctrl+W. Giới hạn render/FPS hiện hữu vẫn áp dụng khi fullscreen.

Đây là kiểm tra logic/asset cùng các lượt smoke test ngắn trong lịch sử, chưa chứng minh mọi cấu hình đều hết crash. Phần triển khai mốc 2 đã sẵn sàng để kiểm tra thực tế; chưa đánh dấu nghiệm thu hoàn tất hoặc chuyển sang mốc 3.
