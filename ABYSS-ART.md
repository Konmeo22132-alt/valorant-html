# Abyss art pass — v23

Ngày: 2026-10-10. Mặc định: `abyss-art-v23`.

## Sửa sau ảnh phản hồi

Cây dựng thêm chỉ giữ khi điểm gốc có bề mặt cấu trúc gần trong collision BVH: cây/lá rơi tìm sàn, vine tìm mặt bám. Cụm không có điểm bám bị bỏ và ghi trong `foliage-anchors.json`, thay vì treo trong không khí hoặc kéo xuống tầng khác. Khoảng 1.197 cụm bị bỏ; số lượng lớn phản ánh giới hạn geometry/placement của lần dựng trước, chưa phải khôi phục toàn bộ cảnh quan nguồn.

Giới hạn lại kích thước cây; cabbage/vine có viền lá bo tám cạnh, radianite sáu cạnh, cỏ giữ dáng nhọn. Vine có thân nối từ điểm bám đến các tầng lá. Các số đếm v22 bên dưới là lịch sử, số mới nằm trong manifest v23. Tán cây thuộc geometry kiến trúc nguồn chưa được dựng lại từng object.

## Nguồn và quyết định hình ảnh

Ảnh Haven C là tham chiếu về mặt phẳng sạch, màu sắc dễ đọc và silhouette; không chuyển layout Haven sang Abyss. Ngân sách một site không tương đương toàn map.

Đã xem 189 diffuse PNG gốc trong tám contact sheet có số thứ tự. Mỗi texture có màu/mode riêng trong `tools/art-review/abyss-direction.json`; `texture-index.json` đối chiếu tên file. Cũng xem riêng alpha lá/foliage để phân biệt hình lá với mặt phẳng chứa ảnh.

- Đá limestone sáng hơi lạnh; đá cũ và chân tường có sắc ấm riêng.
- Gỗ walnut/tan; kim loại xanh xám, khung tối hơn panel.
- Lab/radianite dùng jade, teal, violet; props giữ các vùng màu/symbol lớn.
- 293 material nguồn đối chiếu diffuse. Bảy material không có diffuse trong mapping được ghi trong `art-materials.json` cùng màu fallback/override.
- Không dùng trung bình ảnh để quyết định toàn bộ bảng màu.

## Geometry và foliage

Kiến trúc/UV lấy từ `raw/abyss_tex.glb`, vẫn còn giới hạn geometry bị decimate từ session cũ. Đây là lượt dựng lại vật liệu và foliage; chưa phải dựng thủ công lại từng mesh kiến trúc từ Blend.

- Phục hồi 45 object lá rơi, giữ UV và cutout theo hình lá.
- Dựng 1.438 cụm cây/cỏ/vines bằng lá bốn mặt có sống gấp, đặt theo transform nguồn. Cỏ có dáng mảnh, vine phân tầng, cây radianite có màu riêng.
- Tán cây, lily pad và foliage xa giữ silhouette nguồn với alpha, không biến cả card thành tam giác đặc.
- Loại light shaft/cone và một số wear overlay không thích hợp với material đặc.
- Raw snapshot có một số node giữ hệ số đổi đơn vị .006713867 dù vertex đã đổi đơn vị. Bỏ hệ số trùng trong nhóm này và giữ phần tỉ lệ không đều.

Kết quả: **729.639 tam giác**, **1.218 chunk**, khoảng **72,33 MiB** geometry; atlas 2048² RGBA, khoảng 224 KiB PNG trên đĩa. Toàn map gồm foliage/scenery.

## Runtime

- Hai material dùng chung atlas: opaque và alpha test; lá không dùng nhiều lớp alpha blend.
- Map matte: metallic 0, roughness 1, specular 0. Thêm ánh sáng hướng ấm nhẹ và nền sáng lạnh, không thêm shadow map.
- Giữ collision, scale, spawn đã nghiệm thu. Foliage mới là trang trí, không thêm collision chặn người chơi.
- Giữ streaming theo hướng nhìn, cache geometry 80 MiB, 30 FPS, render tối đa 960×600. Đây là giới hạn cấu hình, chưa phải số đo hiệu năng v22.

## Dựng lại

```powershell
python tools/prepare-abyss-review.py
python tools/bake-abyss-style.py
node --max-old-space-size=512 tools/build-abyss-art.cjs
python tools/render-abyss-art.py
```

Ảnh `tools/art-review/abyss-*.png` raster bằng CPU từ chunk/atlas mới; không phải screenshot Babylon và không mô phỏng chính xác ánh sáng PBR.

- Mới: http://127.0.0.1:8455/game/game.html?map=abyss
- Palette trước: http://127.0.0.1:8455/game/game.html?map=abyss&mapArt=legacy

Chưa mở WebGL trong lượt này vì lịch sử freeze/crash. Cần nghiệm thu A/B/Mid, alpha lá, silhouette cây, đường đi/collision và FPS/RAM khi quay nhanh. Không đánh dấu đồ họa hoàn tất chỉ từ export thành công.
