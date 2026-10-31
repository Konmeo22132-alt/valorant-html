# Nghiên cứu giảm giật hình sau cập nhật map

Ngày: 2026-10-17. Người chơi xác nhận: tụt FPS, xoay camera và mọi chuyển động
đều khựng. Đây là dấu hiệu cần ưu tiên chi phí render/CPU trên client.

Phạm vi lượt này: đọc code/assets, đọc nguồn kỹ thuật gốc và kiểm kê phần cứng.
Không mở browser/game, không chạy benchmark hay test; chưa có số đo frame time
trực tiếp. Các ưu tiên dưới đây là kết luận từ cấu trúc code, không phải kết quả
đo tốc độ tăng FPS. Chưa triển khai thay đổi runtime trong lượt nghiên cứu này.

## 1. Các thay đổi có thể giải thích hồi quy

| Quan sát từ workspace | Hệ quả kỹ thuật |
|---|---|
| Trần render trước 960×600; hiện 1920×1080 | Tại trần, số pixel tăng từ 576.000 lên 2.073.600, gấp 3,6 lần. Đây không phải hệ số chậm FPS cố định; kích thước canvas thực tế còn phụ thuộc màn hình. |
| Haven bật SSAO2: 16 samples, `ssaoRatio=.75`, `blurRatio=1`, `expensiveBlur=true` | Có geometry pass, lấy mẫu AO, hai chiều blur và combine. Geometry buffer mặc định vẫn ở tỉ lệ 1 vì `enableGeometryBufferRenderer()` được gọi không truyền tỉ lệ. |
| G-buffer có `renderList` gồm toàn bộ `streamedWorld`, streamer tiếp tục thêm mỗi chunk mới | Pass này nhận toàn bộ chunk được giữ lại. Babylon 8.32.0 không tự frustum-cull danh sách explicit này trước khi dispatch submesh. |
| Haven giữ toàn bộ 194 chunk, 1.717.141 tam giác | Trong trạng thái đã nạp xong, G-buffer có thể gửi toàn bộ geometry Haven qua bước xử lý đỉnh mỗi frame, kể cả phần ngoài camera. Pass chính vẫn có cơ chế frustum của scene. |
| Mọi frame animation tạo nhiều `Map`, pose object, `Vector3.clone()`, `Quaternion.clone()` | Có ứng viên gây CPU/garbage-collection spike, nhất là nhiều người/bot và FPS cao. Cần heap/frame trace để định lượng. |
| Map vật liệu PBR, hai mặt, PCF shadow lookup, FXAA; context WebGL cũng yêu cầu antialias | Có nhiều chi phí ngoài số tam giác. Tác động thực tế của context AA cần kiểm tra vì postprocess dùng framebuffer riêng. |

Map resident memory: Haven khoảng 77,95 MiB; Abyss khoảng 67,44 MiB. Đây là ước
lượng geometry, chưa gồm toàn bộ texture, render target và dữ liệu nhân vật.
Việc nằm trong budget 80 MiB chỉ đáp ứng điều kiện giữ geometry của streamer.

Máy hiện tại báo i3-8145U, Intel UHD Graphics 620 và khoảng 7,88 GiB RAM. Tại
thời điểm kiểm kê còn khoảng 720 MiB RAM vật lý trống. Đây là ảnh chụp một thời
điểm, không chứng minh paging hoặc mức sử dụng GPU lúc người chơi gặp giật.

### Điểm nên sửa trước: G-buffer visibility

Chuỗi code:

1. `game/map-presentation.js`: tạo SSAO2 với `forceGeometryBuffer=true`, đặt
   `geometry.renderList` thành các mesh map.
2. `game/map-streamer.js`: giữ toàn Haven và push từng mesh vào danh sách trên.
3. Babylon `GeometryBufferRenderer.renderList` chuyển danh sách thẳng sang MRT.
4. `ObjectRenderer._prepareRenderingManager()` lấy explicit list và dispatch
   các mesh enabled/visible; nhánh này không gọi kiểm tra frustum.

Nguồn đúng phiên bản đang dùng:
[GeometryBufferRenderer 8.32.0](https://github.com/BabylonJS/Babylon.js/blob/8.32.0/packages/dev/core/src/Rendering/geometryBufferRenderer.ts#L262),
[ObjectRenderer 8.32.0](https://github.com/BabylonJS/Babylon.js/blob/8.32.0/packages/dev/core/src/Rendering/objectRenderer.ts#L761).

Hướng sửa: giữ danh sách caster tĩnh cho shadow cache, đồng thời cung cấp danh
sách map thực sự trong frustum cho G-buffer qua callback riêng của render target.
Dùng mảng scratch tái sử dụng; lọc riêng map, không kéo tay/agent/VFX vào pass AO.
Ưu tiên nguồn active meshes nếu callback chạy sau scene evaluation; nếu thứ tự
không phù hợp thì kiểm tra bounding volumes bằng frustum hiện tại của camera.

SSAO dùng dữ liệu màn hình, nên các chunk hoàn toàn ngoài frustum không cần
tham gia pass này. Không tắt mesh map chung chỉ để tối ưu AO, vì shadow caster
có thể vẫn cần geometry ngoài camera.

## 2. Những cách game/engine khác dùng và cách áp dụng

### A. Bake ánh sáng và AO cho map tĩnh

Riot mô tả VALORANT dùng lightmap tính offline cho môi trường và shader được
đơn giản hóa theo mức chất lượng; tính dễ đọc của nhân vật và VFX gameplay được
giữ khi giảm chất lượng.
[Nguồn Riot: VALORANT Shaders and Gameplay Clarity](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity).

Áp dụng: bake ánh sáng, bóng tĩnh và AO của Haven vào lightmap; shader map đọc
kết quả đã tính sẵn. Đây là hướng giữ độ sâu/màu của preview khi giảm nhu cầu
SSAO và shadow lookup lúc chơi. Agent, súng và skill vẫn có shader riêng.

Atlas hiện tại dùng chung ô màu giữa nhiều mặt; bake theo từng vị trí cần UV2
không chồng lấn hoặc dữ liệu bake tương đương. Không thể ghi AO theo vị trí vào
atlas màu hiện tại rồi mong các mặt dùng chung ô màu nhận kết quả khác nhau.
Nên chia lightmap theo vùng, kiểm tra seam/gamma và nén texture phù hợp thiết bị.

### B. Culling, visibility cells và LOD

Unreal kết hợp distance, frustum, precomputed visibility và dynamic occlusion.
Precomputed visibility đổi một phần bộ nhớ lấy ít công việc hơn lúc chơi.
[Nguồn Epic](https://dev.epicgames.com/documentation/en-us/unreal-engine/visibility-and-occlusion-culling-in-unreal-engine).

Áp dụng theo thứ tự:

- Sửa G-buffer frustum trước, vì không cần đổi asset hoặc giảm chi tiết thấy được.
- Chia visibility theo khu vực/cửa nối, dùng dữ liệu conservative để tránh mất
  tường hoặc nhìn xuyên khi đổi góc nhanh. Giữ các occluder lớn đáng tin cậy.
- Làm LOD cho cây, đồ trang trí và mái xa; bảo toàn silhouette và các mép cover.
- Collision/BVH tiếp tục dùng dữ liệu riêng. LOD hình ảnh không thay collision
  cầu thang, mặt sàn, raycast bắn hoặc vị trí vật cản gameplay.

Không gộp toàn bản đồ thành một mesh khổng lồ: draw calls có thể giảm nhưng
frustum/visibility sẽ mất độ chi tiết. Gộp theo vùng và vật liệu, instance đồ
lặp khi asset phù hợp.
[Nguồn Babylon về draw calls và static scene](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/scene/optimize_your_scene.md).

### C. Dynamic resolution có phân biệt GPU và CPU

Unity mô tả dynamic resolution giảm kích thước render target để giảm tải GPU.
[Nguồn Unity](https://docs.unity.com/en-us/engine/6000.0/manual/cameras/resolution-scale/dynamic-resolution).

Áp dụng: render scale cho thế giới 3D, HUD giữ độ nét theo màn hình. Thay đổi
chậm với hysteresis để tránh liên tục nét/mờ. Chỉ dùng khi bằng chứng cho thấy
GPU thiếu budget; CPU animation/GC bị chậm sẽ cần cách xử lý khác. Giữ lựa chọn
FPS đến 240 hiện có. Không đồng nhất FPS cap với khả năng phần cứng đạt FPS đó.

### D. Giảm cấp phát CPU và chia ngân sách cập nhật

Tái sử dụng pose buffers, vector, quaternion và danh sách tạm; cache ánh xạ bone,
duration clip và nhóm upper/lower. Bỏ snapshot khi kết quả blend không được dùng.
Các thao tác này có thể giữ nguyên kết quả animation.

Nếu tiếp tục cần giảm chi phí nhân vật xa: cập nhật pose theo budget rồi nội suy
ở nhịp render. Sự kiện bắn/chém/skill và chuyển trạng thái vẫn cần đúng thời điểm.
Giữ tay/ngắm của người chơi cập nhật nhanh; không biến mọi animation thành 30 FPS
cứng hoặc bỏ animation chỉ vì nhân vật ở xa.

## 3. Thứ tự công việc đề xuất

| Ưu tiên | Công việc | Điều cần xác nhận |
|---|---|---|
| P0 | Thêm đo CPU/GPU/frame-time ở chế độ chẩn đoán kín, không thêm nút test vào HUD công khai | CPU submit, GPU time, p50/p95/p99 frame interval, long frame, draw calls từng pass, render resolution, heap/GC nếu có |
| P1 | Lọc G-buffer theo camera, giữ shadow cache riêng | AO không mất chi tiết ở mép màn hình; theo dõi cả camera thường, góc 3, spectator và Spycam |
| P1 | Profile SSAO vừa phải: ít samples hơn, AO/blur tỉ lệ thấp hơn; một lựa chọn AA phù hợp | Kiểm tra banding, viền sáng, mất độ sâu và hiệu năng trên GPU yếu |
| P2 | Tái sử dụng animation buffers, giảm tính lại/clone mỗi frame | Hành động FP/TP giữ đúng pose và đúng thời điểm; p99 tốt hơn |
| P2 | Render scale và các mức đồ họa được lưu trong SQLite | Thích ứng GPU hợp lý, HUD rõ, không dao động chất lượng liên tục |
| P3 | Bake lightmap/AO, LOD và visibility cells | Giữ style preview, tránh pop-in và lỗi cover/collision |

SSAO2 hiện tại dùng buffer, lấy mẫu, blur và combine; giảm mỗi tham số cần đo
riêng để biết hiệu quả.
[Nguồn SSAO2 đúng phiên bản](https://github.com/BabylonJS/Babylon.js/blob/8.32.0/packages/dev/core/src/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.ts).

Shadow map tĩnh đã được cache sau warmup trong code hiện tại. Cần xác nhận cache
không bị vô hiệu hóa thường xuyên; không coi shadow map là đang redraw mãi khi
chưa có số đo. Material và world matrix của map cũng đã freeze sẵn.

## 4. Cách xác nhận hiệu quả khi thực hiện tối ưu

Chọn cùng điểm A/B/C/Mid, cùng độ phân giải, cùng số người và cùng cảnh skill.
Ghi riêng sau warmup và khi lần đầu dùng skill để tách compile/upload khỏi tải
ổn định. So từng thay đổi AO, culling, resolution và animation; báo cả số đo và
ảnh trước/sau. Với WebGL, GPU timer có thể không được hỗ trợ hoặc bị disjoint;
phải đánh dấu số đo thiếu/hỏng, không suy GPU time từ CPU submission time.

Mốc ngân sách lý thuyết: 60 FPS = 16,67 ms; 120 = 8,33 ms; 144 = 6,94 ms;
240 = 4,17 ms. Báo p95/p99 và độ ổn định cùng FPS trung bình để phản ánh khựng.
Đây là đề cương kiểm tra, chưa phải một benchmark đã được chạy.

## Đợt triển khai tiếp theo

Đã triển khai bản tối ưu `v42-20261017-125407`; chi tiết và bằng chứng deploy
trong `FPS-OPTIMIZATION-IMPLEMENTATION.md`. Các nhận xét chưa triển khai ở đầu
tài liệu mô tả tình trạng tại thời điểm research, trước lượt triển khai này.
