# Phân tích mẫu Site C Haven

Ngày 15/10/2026. Phạm vi theo trao đổi mới nhất: xem và phân tích file mẫu trước, chờ tài nguyên nguồn toàn bộ Haven.

## Nguồn và cách xem

File: `site_c_haven_valorant_low_poly.glb`.

Metadata trong GLB ghi tác giả **Suhigaray / Arthur Tiberghien**, tên **Site C Haven (Valorant Low Poly)**, giấy phép **CC BY 4.0** và đường dẫn nguồn `https://sketchfab.com/3d-models/site-c-haven-valorant-low-poly-06f7449b2a0c409691487ae21444c747`.

Đã đọc GLB trực tiếp, import bằng Blender 4.2 và render geometry/vật liệu thật trên CPU. Các ảnh `tools/art-review/haven-reference/` là ảnh dựng từ file này. Ánh sáng/camera do lượt xem đặt thêm, nên độ sáng và bóng không trùng tuyệt đối với viewer Sketchfab. Không thay geometry, màu hay tỉ lệ của file gốc.

## Cấu trúc thực tế

| Thuộc tính | Kết quả |
| --- | ---: |
| Kích thước file | 8.596.448 byte, khoảng 8,20 MiB |
| Mesh / primitive trong GLB | 309 / 309 |
| Node trong GLB | 651 |
| Tam giác theo index buffer GLB | 143.252 |
| Tam giác còn lại sau import Blender | 143.084 |
| Vertex trong các mesh | 205.104 |
| Vật liệu | 67 |
| Bộ tham số PBR khác nhau, so sánh chính xác | 54 |
| Ảnh texture | 0 |
| Vertex tối đa trong một primitive | 50.258 |

Chênh 168 tam giác giữa GLB và Blender được ghi nhận riêng; chưa kết luận nguyên nhân. Không có tam giác lặp index trong file gốc. Thống kê diện tích và phân bố geometry bên dưới lấy từ mesh đã import.

Kích thước bao gồm cả vách đá sân khấu: khoảng 113 × 85 × 135 đơn vị. Không dùng bounding box này để suy ra mét trong gameplay. Khi làm map đầy đủ phải xác nhận scale bằng cửa, chiều cao nhân vật, bậc và khoảng cách đường đi.

## Vì sao mẫu này đẹp

**Phân lớp lớn rõ ràng.** Mảng nền tối, mái nâu, tường kem và sàn xám tạo cấu trúc dễ đọc ngay từ xa. Khung gỗ sẫm tách mái/tường, thay vì để cả công trình thành một mảng màu.

**Chi tiết nằm đúng chỗ.** Các mặt tường kem chỉ chiếm khoảng 172 tam giác, nhưng mái có gờ/ngói, viền gỗ, cột, cửa và phần mái gãy được tạo bằng geometry. Độ đơn giản thay đổi theo công dụng của từng bộ phận; không phải tất cả mesh cùng được decimate một tỉ lệ.

**Silhouette tạo nhận diện.** Mái có độ dày và độ nhô; cạnh mái hỏng tạo đường viền riêng. Thân/cành cây có phân nhánh. Tán hoa là các cụm đa diện với những mặt lớn, thay vì mặt phẳng lá có alpha.

**Màu nhấn dùng ít nhưng hiệu quả.** Thùng/radianite xanh, các panel xanh nhạt và hoa hồng đứng rõ trên nền nâu/xám. Chúng giúp nhận diện vật thể mà không cần noise bề mặt hay texture lớn.

**Giữ cách đổ bóng có chọn lọc.** Mẫu có cả mặt phẳng và mặt smooth; khoảng 54.814/143.084 face được đánh dấu smooth sau import. Tuy nhiên split normals cũng ảnh hưởng kết quả. Không nên ép toàn map sang flat shading, đặc biệt ở dây, thân cây, ống và các bộ phận cong.

**Có chiều sâu thật.** Khung cửa, xà gỗ, viền mái, dây và props tạo bóng tiếp xúc. Vì vậy chỉ bỏ texture rồi lấy màu trung bình cho map nguồn sẽ chưa tạo được chất lượng tương tự.

## Phân bố chi phí

- Vật liệu vách đá nền `fond`: 44.914 tam giác, khoảng **31,4%**. Đây là cảnh nền có nhiều cột đá, không phải phần đường đi. Một mesh nền lớn chiếm 43.706 tam giác.
- Hai nhóm mái cùng màu `toiture_crame` và `aiStandardSurface16`: 26.388 tam giác, khoảng **18,4%**. Bên cạnh hình dáng mái, chi phí đến từ các dải/gờ ngói.
- Thân/cành dùng `arbre`: 10.016 tam giác, khoảng **7,0%**.
- Toàn bộ cụm hoa màu hồng `feuille`: chỉ **432 tam giác**, khoảng **0,3%**, nhưng là một điểm nhấn thị giác mạnh.

Đây là ngân sách riêng một Site C có cảnh nền. Không nhân tỉ lệ file này để hứa trước kích thước toàn bộ Haven hay FPS trong game.

## Bảng màu lấy trực tiếp từ file

Màu dưới đây được chuyển từ Base Color tuyến tính sang sRGB; không lấy trung bình ảnh chụp.

| Bộ phận | Màu sRGB |
| --- | --- |
| Tường kem | `#FCDCA9` |
| Khung gỗ | `#7E4E21` |
| Gỗ tối | `#3E2B1B` |
| Mái nâu | `#846548` |
| Sàn xám | `#575454` |
| Radianite xanh | `#5AEB8B` |
| Panel xanh nhạt | `#CAEBF8` |
| Hoa hồng | `#F5B0EA` |

## Những điểm có thể tối ưu khi xuất runtime

File hiện dùng FLOAT32 cho position/normal/UV và UINT32 cho mọi index. Không có texture ảnh nhưng vẫn mang 1.640.832 byte UV. Cả 309 primitive đều dưới giới hạn vertex của index 16 bit.

Nếu xác nhận không shader nào cần UV, bỏ UV và đổi các index sang 16 bit có thể tiết kiệm khoảng **2.500.344 byte**, tương đương **29% file hiện tại**, trước khi tính đóng gói lại/metadata. Đây là ước tính theo buffer, chưa phải file tối ưu đã xuất, và không cần giảm tam giác để có khoản tiết kiệm này.

67 material có 54 bộ PBR khác nhau chính xác. Có cơ hội gộp các material trùng, sau khi đối chiếu cả trạng thái alpha/culling và normal. Gộp hình học theo từng khu vực thay vì gom tất cả thành một mesh khổng lồ để vẫn culling được phần ngoài camera. Số draw call thật còn phụ thuộc engine và các pass; số mesh không phải một phép đo FPS.

Vách đá xa, dây tròn và gờ ngói lặp là các ứng viên LOD. Giữ silhouette mái và các props chính khi nhìn từ vị trí người chơi. Cụm hoa đã rất ít tam giác, nên giảm tiếp ở đó mang lại ít lợi ích.

## Quy trình áp dụng cho Haven đầy đủ

1. Import và phân loại A/B/C, các đường nối, spawn, kiến trúc và scenery; lưu bản nguồn bất biến. Xác nhận tỉ lệ trước khi tối ưu.
2. Dựng palette theo từng loại vật liệu: giữ ranh giới tường/gỗ/mái/kim loại, màu xanh của radianite và các điểm nhận diện lớn.
3. Xử lý geometry theo nhóm. Dissolve phần phẳng với biên vật liệu được bảo vệ; giảm các chi tiết lặp nhỏ; giữ độ dày mái, cửa, chân tường, props và mép che người.
4. Dựng lại foliage thành cụm có silhouette rõ nếu nguồn dùng alpha card. Chọn mật độ theo vai trò trong cảnh và góc nhìn, không thay mọi cây bằng cùng một khối.
5. Làm collision riêng cho sàn, bậc, cửa, cạnh hộp và vật chắn. Render low-poly không được làm thủng cầu thang hay mở khe bắn mới; geometry cảnh xa không tự trở thành collision.
6. Gộp batch theo vật liệu/khu vực, dùng index 16 bit khi phù hợp; đóng gói/stream theo khu, rồi đo dung lượng, draw call và bộ nhớ thực tế.
7. Đối chiếu bản nguồn và bản low-poly từ góc ngang ở các choke point, site và đường nối; ảnh nhìn từ trên chỉ phục vụ kiểm tra bố cục.

Hiện chưa có nguồn toàn Haven trong workspace nên chưa chạy quy trình này lên map đầy đủ. File mẫu được giữ nguyên; chưa thêm map hoặc deploy bản game trong lượt phân tích này.

## Dựng lại ảnh và số liệu

```powershell
.\blender-portable\blender-4.2.0-windows-x64\blender.exe --background --threads 4 --python tools/inspect-haven-reference.py
.\blender-portable\blender-4.2.0-windows-x64\blender.exe --background --threads 4 --python tools/inspect-haven-reference.py -- --site-only
.\blender-portable\blender-4.2.0-windows-x64\blender.exe --background --threads 4 --python tools/inspect-haven-reference.py -- --reference-angle
```

Số liệu chi tiết: `tools/art-review/haven-reference/inspection.json`.
