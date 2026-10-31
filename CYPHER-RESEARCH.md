# Cypher — nghiên cứu kỹ năng và tài nguyên native

**Đã ngừng phát triển theo yêu cầu người dùng.** Cypher được gỡ khỏi bản chạy
`v42-20261017-195308`. Tài liệu này chỉ giữ làm tư liệu; tiến độ mới nằm trong
`NEON-DEVELOPMENT.md`.

Ngày đối chiếu: **17/10/2026**. Không mở browser/game hoặc Blender. Video được tải
trực tiếp từ CDN Riot và đọc qua các khung hình nhỏ bằng ffmpeg, từng video một.
Đây là tài liệu cho bước convert/tích hợp; chưa phải xác nhận Cypher đã chơi được.

## 1. Nguồn và điểm dễ làm sai

- [Trang Cypher tiếng Việt](https://playvalorant.com/vi-vn/agents/cypher/) chứa đủ
  bốn MP4. Đã tải và xem timeline toàn bộ, cùng chuỗi khung hình 8 fps ở đoạn
  thao tác tay. URL, SHA-256, thời lượng và kích thước nằm trong
  `tools/art-review/cypher/riot-videos.json`.
- Video và mô tả trang agent là tư liệu cũ. Dùng chúng làm mẫu hình ảnh, không
  lấy nguyên luật/timing cũ vào game.
- Cage đã bỏ làm chậm từ [0.50](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-0-50/).
- [11.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-08/)
  đổi Trapwire từ choáng sang làm chậm/lộ vị trí; đồng thời đổi stealth/audio và
  cooldown của Spycam. Vì vậy không chép hiệu ứng choáng xám ở cuối video Trapwire.
- [13.00](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-00/)
  giảm windup Trapwire PC từ 0,9 xuống **0,7 giây**. Đây là thời gian từ lúc mắc
  bẫy tới zap, không phải độ dài animation đặt dây.
- Đã xem [13.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-08/)
  là bản gần ngày đối chiếu; không có mục đổi Cypher. Các số chưa có nguồn Riot
  xác nhận trong lần nghiên cứu này được để trống trong spec, không tự coi là đã
  xác minh (ví dụ giá mua, HP thiết bị, cooldown phi tiêu, góc quay camera).

## 2. Ánh xạ phím — tên thư mục native không phải phím hiện tại

| Phím trong Val-Strike | Kỹ năng | Tên Việt trên trang Riot | Thư mục nguồn |
|---|---|---|---|
| C | Trapwire | Bẫy Công Nghệ | `Gumshoe/S0/Ability_E` |
| Q | Cyber Cage | Lồng Công Nghệ | `Gumshoe/S0/Ability_4` |
| E | Spycam | Máy Quay Do Thám | `Gumshoe/S0/Ability_Q` |
| X | Neural Theft | Đánh Cắp Tâm Trí | `Gumshoe/S0/Ability_X` |

Mã nội bộ của Cypher là **Gumshoe**. Không gán nhầm E nguồn thành Spycam.

## 3. C — Trapwire

### Luồng sử dụng và luật

Trang bị puck bằng tay, xem trước hai điểm neo, rồi bắn để đặt trên bề mặt hợp
lệ. Dây nối tới bề mặt đối diện, có thể thu hồi/đặt lại khi chưa mắc mục tiêu và
có thể bị phá. Cần xử lý cả độ cao dây: nhảy qua/cúi dưới khác với đi xuyên dây.
Raycast preview và raycast xác nhận phía server phải dùng cùng collider map.

Các thay đổi đã có nguồn Riot:

- Chiều dài tối đa được nâng lên 1500 đơn vị native, tương ứng **15 m** theo
  thang centimet của bộ asset: [5.10](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-5-10/).
- Khi mắc dây: bị tag/làm chậm **50%**; đi quá **4 m** ra ngoài dây sẽ kích zap
  ngay. Zap hiện làm chậm/lộ vị trí **1 giây**, không concuss: [11.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-08/).
- Windup PC đã kiểm tra: **700 ms** theo 13.00.
- Bẫy có thể tái hoạt động thay vì tự hủy sau một lần bắt; thời gian re-arm
  được đổi thành **2 giây** trong [8.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-8-08/).
- Chủ chết thì dây bị vô hiệu và hiện ra: [1.11](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-1-11/).
  [13.06](https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-13-06/)
  cũng ghi nhận sửa lỗi dây trông còn active khi chủ chết/bị suppress đúng lúc re-arm.

### Quan sát video

Đầu neo nhỏ với vòng cyan; tay xoay/đẩy puck, sau đó trở lại súng. Dây mảnh có
ánh sáng chạy; lúc bắt mục tiêu xuất hiện liên kết tới người mắc và dấu lộ vị
trí. Khi xem từ đối thủ, dấu/thiết bị có sắc đỏ. Khung đỏ quanh nửa sau video
là khung trình bày POV trong clip, không phải một HUD debuff để chép vào game.

### Yêu cầu khi tích hợp

Server quyết định giao cắt dây bằng chuyển động capsule có quét đường đi,
không chỉ kiểm tra điểm feet cuối tick. Không kéo/teleport feet về dây để giả
tether: luật hiện tại dùng slow và zap khi vượt ngưỡng, tránh tạo rubber-band
cho client prediction. Phải replicate cả đặt, thu hồi, đứt, mắc, re-arm và inactive.

## 4. Q — Cyber Cage

### Luồng sử dụng

Là quick-throw khi đang cầm vũ khí; không dựng thêm một bước chọn vị trí kiểu
smoke của Clove. Puck bay và nằm trong world, sau đó người sở hữu kích hoạt
thiết bị được nhắm. Cage chặn tầm nhìn qua thành; không làm tường collision
ngăn người hoặc đạn. Không áp slow theo mô tả cũ trên trang agent.

### Quan sát video

- Từ puck dưới đất, thành lồng vươn lên nhanh; viền chân cyan/trắng sáng rõ.
- Hình **trụ mở**, không phải quả cầu smoke. Thành trắng/xám bán trong với dải
  quét, họa tiết mạch và điểm nhấn vàng nhạt/xanh tím.
- POV bên trong thấy mặt trong của thành lồng, không phải màn sương phủ toàn
  màn hình. Kết thúc thì các dải thành biến mất.
- Toàn đoạn active trong video xấp xỉ 7 giây; đây chỉ là quan sát clip cũ,
  chưa dùng làm giá trị duration chính xác cho luật server.

### Yêu cầu khi tích hợp

Tách puck/world shell/inside shell. Không đổ bóng đặc như vật rắn; depth test
phải cắt lồng theo tường/sàn. LOS phải phân biệt hai người cùng ở trong lồng
với ray đi xuyên thành. VFX/audio khi đối thủ đi qua là một sự kiện world,
không chỉ hiệu ứng tay của người chơi local. Thời lượng/radius/activation range
cần xác minh thêm trước khi mở khóa gameplay.

## 5. E — Spycam

### Luồng sử dụng

Trang bị camera, đặt lên mặt hợp lệ, dùng lại E để xem qua camera. Trong chế
độ xem, chuột xoay camera và bắn phóng phi tiêu đánh dấu. Trúng thì mục tiêu
phải có trạng thái bị đánh dấu và thao tác gỡ dart; chuyển về góc nhìn người
chơi phải khôi phục điều khiển/súng đúng trạng thái.

Theo [11.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-08/):

- Camera không active bị kẻ địch thấy/nghe khi ở gần trong **8 m**.
- Camera active có tiếng lặp rõ hơn, phạm vi nghe **12 m**.
- Bị phá: cooldown **60 giây**.

Chủ chết thì camera bị vô hiệu và hiện ra theo 1.11. Các MP4 được cung cấp chỉ
có video stream; không thể lấy âm thanh gốc từ các clip này.

### Quan sát video và native animation

Tay đặt/triệu hồi thiết bị, chuyển cảnh glitch ngắn sang hình camera. Khung
quan sát có các đường cong và dấu ngắm mảnh, rồi bắn dart; mục tiêu xuất hiện
silhouette vàng theo nhịp. Thoát camera có animation tay trước khi súng trở lại.
Có clip native riêng cho equip/loop/camera-look và bốn pha gỡ dart
intro/loop/outro/cancel.

### Yêu cầu khi tích hợp

Tách **active render camera** khỏi **feet/body camera dùng cho movement**.
Không cập nhật vị trí nhân vật theo Spycam, không teleport body lên thiết bị.
Body vẫn ở vị trí cũ, có thể bị bắn và phải thể hiện pose camera-look ở góc
nhìn thứ ba. Server xác nhận hit của dart bằng raycast; client không tự khai
mục tiêu. Dấu reveal chỉ cấp thông tin cho đúng đội và warning cho người trúng.
Chủ chết, thiết bị bị phá, đổi round hoặc mất quyền điều khiển đều phải thoát
view camera và dọn input.

## 6. X — Neural Theft

Nhắm xác **đối thủ đã chết** trong khoảng hợp lệ rồi ném mũ để quét vị trí
các đối thủ còn sống. Theo [5.10](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-5-10/),
không còn giới hạn tuổi xác, khoảng cast tối đa là 1800 native units (**18 m**),
và có **hai lần reveal cách nhau 4 giây**. Chi phí ult là **7 điểm** theo
[9.10](https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-9-10/).

Video cho thấy tay chạm/ném mũ, hiệu ứng công nghệ ở xác và silhouette vàng
của người sống. Clip cũ không chứng minh được quy tắc hai lần reveal mới.
Phải dùng snapshot vị trí mỗi pulse, không biến nó thành wallhack bám liên tục.

Mũ ở body TP được tách thành mesh `geometry_hat`, vẫn dùng skeleton chung.
Khi thi triển phải có prop mũ trong world, animation FP/TP và trạng thái body
không đội mũ; không chỉ xóa mũ trong viewmodel. Khôi phục ở vòng mới. Các thời
điểm pulse đầu, thời gian hiện silhouette và điều kiện LOS tới xác còn cần
đối chiếu thêm, không lấy số từ độ dài PSA.

## 7. Tài nguyên và gói convert

Đã kiểm kê **312** PSK/PSKX/PSA và **10** PNG native. `native-inventory.json`
chứa header, bone count, thời lượng và khả năng bù camera FP. Nguồn có đủ:

- CS rig 286 bones, 41.033 tam giác; intro/idle/fidget.
- TP rig 119 bones, 16.711 tam giác; chuyển động, pose súng và thao tác skill.
- FP rig 110 bones; bù chuyển động camera gốc để tay không trượt theo rig.
- Puck Cage, puck/đầu neo Trapwire, Spycam gấp/mở/world, dart, coat và prop mũ.
- Bảy mesh VFX cylinder/circuit/icon nhưng chúng không chứa material hiệu ứng
  hoàn chỉnh; nhiều slot là `None`/`WorldGridMaterial`. Không coi các mesh trắng
  đó là VFX đã hoàn thiện hoặc đưa chúng lên production như placeholder.

Gói nháp: `tools/converted/cypher/`, cấu trúc `assets/agents`, `assets/playable`,
`assets/match`. Texture 2048 giữ nguyên độ phân giải, dùng file dùng chung có
hash; kênh normal/MRAE đổi sang glTF, và material thiết bị giữ alpha mask native.
Track hằng chỉ giữ hai key trùng ở đầu/cuối để giảm dung lượng mà không đổi
pose/thời lượng. Animation chia thành bank nhỏ, chạy từng process CPU dưới
normal priority. Không mở game/Blender để xem render trong lần convert này.

Đã hoàn tất gói tài nguyên gồm **23 GLB + 10 texture dùng chung + 15 ảnh UI**,
tổng **50,68 MiB**. Trong đó có 13 model (menu/body/tay và 10 thiết bị), còn lại
là bank animation. Năm mảnh HUD camera native và icon minimap cũng đã được lấy
nguyên bản, không cần thay bằng UI giả. Chi tiết nằm trong README/manifest của
gói; không có file production hay cờ playable nào được thay đổi.

## 8. Việc còn lại trước khi playable

1. Dựng shader Cage, dây/đầu neo, reveal và camera overlay theo video đã đọc.
2. Tích hợp placement/physics/LOS, Spycam view và corpse targeting trên server.
3. Nối animation/props cho local, third person và remote; xử lý mũ sau X.
4. Bổ sung các số còn chưa xác minh và nguồn âm thanh phù hợp.
5. Kiểm tra trực quan animation/VFX khi có đủ RAM, rồi mới mở khóa Cypher và
   đưa gói asset vào preload/deploy. Omen chưa bắt đầu ở bước này.

## 9. Cập nhật tích hợp runtime — 2026-10-17

Đã nối gói native vào bản local, có luật dùng chung server/bot, đầy đủ luồng
C/Q/E/X, HUD, prop FP/TP, snapshot reveal và thao tác gỡ phi tiêu. Tình trạng
chi tiết trong `CYPHER-IMPLEMENTATION.md`; chưa deploy, chưa mở game/browser
để xác nhận hình ảnh hay multiplayer. Âm thanh hiện là tín hiệu điện tử tổng
hợp, không phải SFX Riot gốc. Phần 8 ở trên là danh sách công việc tại thời
điểm mới hoàn tất convert; không dùng nó làm trạng thái runtime hiện tại.
