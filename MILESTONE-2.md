# Mốc 2 — M1 / Shooting Range

Cập nhật 2026-10-09. Plan chính: `.zcode/plans/plan-sess_1689aa5d-3564-4fc9-b71b-7510c9f40b55.md`.

**Trạng thái: đã được người dùng nghiệm thu sau v18/v19 (“đạt cả rồi”). Mốc 2 chốt PASS theo kết quả test của người dùng. Nhánh tiếp theo: animation và Clove/Jett/Sage, ghi riêng trong AGENTS-IMPLEMENTATION.md.**

## Deliverable

- [x] 18 súng + dao S0 thật, skinning và magazine trong model nguồn.
- [x] Fire/Reload/Equip/Inspect từ GN + FP; dao có combo ba chém/đâm; Outlaw có ReloadEmpty.
- [x] v18: pose cầm đúng FP IdlePose; tay 1P Reyna nguồn, animation tay và súng cùng camera; idle/run/walk nơi có clip nguồn; Odin dùng kích thước nguồn, ADS fire giữ pose ngắm.
- [x] Đồng hồ equip/reload/fire/animation dừng cùng gameplay khi pause; đổi súng hủy input/reload.
- [x] DF/NM/MRS/AEM được ánh xạ sang PBR, texture giới hạn 512; một súng active, một load đang chạy.
- [x] Kiến trúc texture swap theo yêu cầu; năm skin đã xác minh geometry/UV; khôi phục S0 và hủy texture cũ.
- [x] Bảy geometry vỏ đạn nguồn, pool tối đa tám mesh, chia sẻ buffer/material.
- [x] Ammo, semi/auto/burst/shotgun/airburst/melee, ADS/scope, reload từng viên và hai chế độ reload Outlaw.
- [x] Damage theo distance/hitzone; Light/Heavy/Regen armor và pool hồi hữu hạn.
- [x] Xuyên vật liệu theo tier, chiều dày vào/ra và resistance config; BVH độc lập geometry đang stream.
- [x] Spread/bloom/recoil/recovery và crosshair; fire rate không phụ thuộc FPS.
- [x] Range có cự ly 5–50 m, chọn giáp/vật cản/độ dày, reset/refill, đạn vô hạn, mục tiêu hồi sinh và kết quả hit.
- [x] Kiểm tra không dùng GPU cho logic, asset, frame projection, skin/shell/disposal và startup.
- [ ] Đối chiếu shader/PBR/FP attachment với hình ảnh ingame trên WebGL.
- [x] Người dùng test v17: Shooting Range/Abyss, Classic bắn/đạn/reload, Vandal/Odin ADS + bắn/reload/đổi súng, tỉ lệ map/model và hiệu năng đều PASS; console không lỗi. Camera được báo “maybe p”, chưa chốt; chưa ghi nhận thời lượng phiên chơi.
- [x] Người dùng xác nhận đạt sau sửa pose cầm v18 và phím cúi v19; không có số đo/thời lượng phiên chơi bổ sung.

## Giới hạn được ghi nhận

- Đã sửa kết luận audit cũ “không có tay 1P”: tìm thấy `Characters/Vampire/S0/1P/Models/FP_Vampire_S0_Skelmesh.psk`. Dùng tay Reyna làm viewmodel mặc định; chưa chọn tay theo agent. 104 bone khớp tên/cha với FP PSA; hai bone VFX giữ bind pose. Lược bỏ mặt vai/cánh tay trên có trọng số thuần proximal để tránh che camera; giữ bàn tay/cẳng tay/elbow blend.
- Không công bố giả định 85%/748 skin là kết quả thực tế: 788 mesh được audit khác S0 nên bị loại khỏi texture swap.
- Channel MRS/AEM suy ra từ tên/MI; shader AresFirstPerson gốc chưa có để xác nhận hoàn toàn. Không tự bật emissive từ mask S0.
- Recoil/spread và resistance/energy xuyên vật liệu là mô phỏng config, không phải code/đường cong server Riot. Geometry mở/không biết surface được coi là chặn đạn.
- Phạm vi dữ liệu vũ khí theo plan v9.10+, chưa hứa khớp mọi balance patch mới.
- Các milestone locomotion, bots/rounds, agent abilities, HUD gốc, multiplayer/audio chưa thuộc mốc này.

## Test lại bản v18

- Reload trang đang mở rồi tải map. Phím 3 chọn dao: kiểm tra cách nắm cán, đứng yên/đi/chạy, chém trái/đâm phải/inspect F.
- Chọn Odin: kiểm tra kích thước/cảm giác cồng kềnh, hai tay cầm, ADS + bắn không bật sang pose hip, reload/inspect rồi trở lại pose cầm.
- Classic/Vandal và các súng còn lại: tay không xuyên súng, không T-pose, reload/equip/inspect khớp; ngắm vẫn bắn được.
- Đổi súng nhiều lần và chơi 10–15 phút: theo dõi FPS/RAM/crash/console. Kết quả v17 không thay cho lượt v18 này.
- Input v19: tab thường giữ C+W để đi cúi. Muốn Ctrl+W: bấm **Chơi toàn màn hình (Ctrl)**, cấp Keyboard Lock nếu browser hỏi rồi kiểm tra không đóng tab; Ctrl+R nạp đạn không reload trang. ESC phải pause/nhả khóa, thoát fullscreen không giữ phím. Browser không hỗ trợ/từ chối quyền dùng C.

## Mở bản hiện tại

```powershell
Set-Location C:\Users\Admin\Downloads\valorant
python tools/dev-server.py
```

URL: http://127.0.0.1:8455/game/game.html?map=range. Chỉ bấm tải mới tạo WebGL; ESC mở điều khiển khu tập. Các lệnh và bằng chứng kiểm tra nằm trong `DEVELOPMENT.md`.
