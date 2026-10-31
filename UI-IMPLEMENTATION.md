# M6 — UI nguồn, v32

## Chỉnh giao diện tiếng Việt — v32, 2026-10-11

Người dùng xác nhận dùng bản **tiếng Việt**, đồng thời phản hồi v31 chưa giống bố cục và chữ của client. M6 vẫn chưa được nghiệm thu pixel-perfect.

- Thay Arial/Segoe UI trên HUD/shop/bảng điểm bằng DIN Next từ font-face của website Riot, kèm Inter có dấu tiếng Việt. Ba WOFF2 tải từ ổ đĩa local, khoảng 366 KiB. Nguồn và giới hạn tại `val-strike-html/assets/fonts/UI-FONTS.md`.
- DIN webfont thiếu một số ký tự tiếng Việt mở rộng. Inter bù các glyph thiếu; **đây không phải font tiếng Việt lấy từ client VALORANT**. Hai atlas BioSans SDF trong extract không có bảng tọa độ glyph/metrics để dùng như webfont.
- Tên kỹ năng lấy từ [Riot Clove tiếng Việt](https://playvalorant.com/vi-vn/agents/clove/), [Riot Jett tiếng Việt](https://playvalorant.com/vi-vn/agents/jett/), [Riot Sage tiếng Việt](https://playvalorant.com/vi-vn/agents/sage/). Áp dụng ở shop, tooltip/alt HUD, hướng dẫn khi cầm skill và mua kỹ năng trong khu luyện tập; không sửa số liệu hay logic kỹ năng.
- Shop tách bốn vùng: đồng đội, các nhóm súng, giáp, thông số. Kỹ năng nằm dưới súng/giáp; giá và tên súng ở góc dưới trái. Thông số gồm sáu ô, bảng sát thương có hàng đầu/thân/chân và cột khoảng cách, cùng chế độ bắn phụ từ config.
- Thêm ba icon giáp nguồn và nền minimap nguồn sau khi xem từng PNG. Export hiện có **61 PNG nguyên byte, 744 KiB**. Nền minimap được tint qua CSS mask; bỏ fill chữ nhật trên canvas minimap nhỏ. Bản đồ lớn giữ nền đọc rõ.
- HUD: banner “GIAI ĐOẠN MUA ĐỒ”, hướng dẫn B; tiền về góc dưới phải, nền portrait được nhân màu đội. Banner ẩn khi mở shop/bảng điểm. Bảng điểm/báo cáo giao tranh dùng nhãn tiếng Việt; bỏ chữ “ACS theo plan cũ” khỏi giao diện chơi, giữ phạm vi chỉ số đã triển khai trong plan.
- Ảnh shop tham chiếu là ảnh chụp client tiếng Anh cũ ở `tools/art-review/reference-shop-public.jpg`, nguồn [ảnh gameplay](https://api.wecoach.gg/storage/uploads/87_1705502814.jpg). Chỉ dùng để đối chiếu bố cục nhìn thấy; ảnh này chưa có Outlaw/giáp hồi phục và **không chứng minh nhãn của client tiếng Việt hiện hành**.
- Đã xem preview DOM/canvas 2D ở 1280×720 và 960×600, shop/scoreboard/report. Console preview không ghi lỗi/cảnh báo; ảnh shop lưu ở `tools/art-review/ui-shop-v32.jpg`. Không chạy bộ test tự động mới hoặc game WebGL v32; chưa có kết quả FPS/RAM mới. Các kết quả PASS bên dưới thuộc v31.

**Còn thiếu để chốt 100%:** ảnh HUD/shop/bảng điểm của đúng client tiếng Việt người dùng muốn đối chiếu, font/metrics client tiếng Việt, và đối chiếu ingame trên nền map thật. Một số nhãn nhóm súng/thông số là bản dịch hiện tại của dự án, chưa coi là chuỗi localization trích từ client. Preview không thay thế nghiệm thu người dùng.

## Lịch sử triển khai v31

Cập nhật 2026-10-11. Người dùng cho phép bắt đầu research và triển khai M6, đồng thời báo đã chơi từ v29 và gần như không có lỗi. Đây là phản hồi người dùng; không thay thế nghiệm thu render v31.

## Đối chiếu trước khi làm

| Nguồn | Điều áp dụng |
|---|---|
| [Riot 9.10](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-9-10/) | Overheal/giáp hồi phục phải đọc được. Combat report không tiết lộ utility stats trước khi round kết thúc; v31 chỉ hiện damage/hit đã xảy ra, chưa suy diễn utility stats. |
| [Riot 1.02](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-1-02/) | Ping bằng Z/wheel; chú ý tránh lộ thông tin qua minimap. |
| [Riot 12.05](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-12-05/) | Tham khảo nguyên tắc nhóm buff/debuff và phản hồi assist. v31 chưa triển khai banner assist riêng hoặc bố cục status mới đầy đủ. |
| [Riot 13.06](https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-13-06/) | Bản hiện hành đã đổi ACS sang Performance Score và thêm Warden. Plan ZCode yêu cầu ACS/19 vũ khí, nên v31 giữ phạm vi plan; chưa chuyển toàn bộ game sang cân bằng/UI 13.06. |

Texture lấy trực tiếp từ extract tại `model/valorant-model-animations-gun/ShooterGame/Content/UI`. Đã xem contact sheet và chọn theo chức năng: minimap Infinity/Abyss, portrait Clove/Jett/Sage, icon 19 vũ khí, charge, damage, kill banner, shop và scoreboard. Icon súng lấy ở `Screens/Shared/Icons/Weapons/icons`, tránh nhầm icon chroma.

`tools/export-ui-assets.py` sao chép **57 PNG nguyên byte**, khoảng **687 KiB**; không resize PNG runtime. `val-strike-html/assets/ui/manifest.json` lưu đường dẫn nguồn, kích thước, dung lượng và SHA256. Contact sheet `tools/art-review/ui-source-sheet.png` chỉ dùng để xem nguồn, có thumbnail.

## Đã triển khai

- HUD: portrait hai đội, trạng thái chết/ult ready/Spike đồng đội, điểm, timer, HP/armor/overheal/regen pool, đạn/reload và icon súng, charge kỹ năng bằng PNG nguồn.
- Abyss minimap: PNG nguồn và phép đăng ký tọa độ đã lưu ở `abyss-match.json`; đồng đội, địch được người chơi hoặc bot đồng đội thấy, vị trí cuối cùng lưu 1.5 giây. Snapshot không bám vị trí địch sau khi mất đường nhìn. Spike của đối phương đang cầm được ẩn; Spike rơi chỉ hiện cho defender sau khi thấy.
- Vòng tròn 40 m khi chạy là tham chiếu khoảng nghe, chưa phải âm thanh phát thực tế. Đi chậm/cúi không vẽ vòng này; audio thuộc M8.
- Z nhấn: ping nguy hiểm; giữ 220 ms: wheel nguy hiểm/đang tới/quan sát/hỗ trợ. Tối đa 4 ping, hết sau 6 giây. M mở bản đồ lớn, nhấp để ping sàn. Giữ Z khi đang scope có zoom phụ vẫn dùng shortcut zoom hiện hữu.
- Kill feed tối đa 5 dòng/5 giây; icon agent/súng/headshot, viền kill của người chơi. Kill banner nguồn, pips multikill, hit marker, damage vignette và hướng nhận damage.
- Tab: bảng điểm K/D/A, ult, ACS cũ, trang bị/credits đồng đội và ÉCO. Trang bị/credits địch được ẩn. Charge đồng đội nằm ở tooltip trang bị.
- Báo cáo khi chết: damage gây/nhận theo người, số hit đầu/thân/chân đã nhận. N ẩn/hiện. Không hiện HP hoặc suy diễn thông tin skill bí mật của địch.
- B: shop 6 nhóm súng, 18 súng mua được, giáp, C/Q/E, bảng giá/tốc độ/đạn/reload/xuyên/damage từ config. Mua/bán dùng authority hiện hữu; hoàn tiền chỉ món mua trong buy phase hiện tại.
- Chuột phải lên súng để xin mua hộ, chọn đồng đội đủ tiền ở cột trái. Bot thiếu primary/không đủ tiền có thể xin Vandal; người chơi mua hộ bằng tiền của mình. Bot mua hộ người chơi được các súng 1P hiện có.
- Shop không dừng clock. Mở shop xóa input bắn/cast/di chuyển và mở con trỏ; hết buy phase đóng shop. ESC vẫn pause. Blur/đổi mode/dispose dọn UI.

Minimap cập nhật 10 Hz; bảng điểm chỉ dựng lại khi mở và dữ liệu thay đổi. UI dùng DOM/canvas 2D, không tạo renderer/engine thứ hai. Lượt này không đổi shader, asset hoặc số lớp VFX kỹ năng.

## ACS và ÉCO local

ACS theo yêu cầu plan: damage thực sự trừ HP/armor/overheal của địch, bỏ overkill; kill 150/130/110/90/70 theo số địch còn sống, thêm 50 cho mỗi kill sau kill đầu trong round, chia số round đã/chưa kết thúc phù hợp. Tham khảo [phân tích dữ liệu ACS của Valosquare](https://valosquare.eu/en/blog/stats/acs-combat-score-formula-verified); đây là tái dựng độc lập, không phải công thức Riot công bố.

Chưa ghi điểm +25 cho assist utility không gây damage, chưa quy đổi mọi hiệu ứng decay thành damage ACS. ÉCO local = damage ledger / credits đã chi × 1000; bán trừ tiền đã chi, tặng súng ghi chi phí cho người trả tiền. Không coi hai chỉ số này là bản tính đầy đủ giống client Riot.

## Kiểm tra đã làm

- `npm --prefix tools run test:ui`: PASS CPU/jsdom authority, clock không pause khi mua, buy/refund một lần/gift đúng người trả tiền, chặn mua ngoài buy, useful damage/kill/multikill, ẩn credits địch, death report, đăng ký minimap, snapshot hết hạn và reset.
- Syntax checker: 12 module UI/integration đã qua.
- SHA256: toàn bộ PNG xuất khớp file nguồn và manifest.
- Preview chạy thật bằng DOM/canvas 2D: đã xem HUD, shop, scoreboard, report và kill banner; console không ghi lỗi/cảnh báo. Shop tại 960 × 600 chứa đủ súng/giáp/kỹ năng mà không cần cuộn dọc. Không tạo WebGL context, không tải map/model 3D. Ảnh tại `tools/art-review/ui-shop-v31.jpg`.
- Chưa chạy game 3D v31, chưa đo FPS/RAM mới. PASS logic/preview không chứng minh hình ảnh ingame hoặc hoạt động mọi kỹ năng.

## Giới hạn và nghiệm thu còn lại

- Bố cục/font/tint dựng bằng CSS quanh PNG nguồn. Extract không có đầy đủ widget/layout/font runtime; **chưa đạt nghiệm thu pixel-perfect** theo mục tiêu M6. Một số PNG đã curate chưa sử dụng ở runtime.
- Shooting Range dùng sơ đồ đơn giản; chưa có ảnh minimap range gốc.
- Bản đồ lớn đặt ping lên sàn đầu tiên theo ray từ trên xuống; cần kiểm tra vùng nhiều tầng của Abyss.
- Ping/xin súng là local với bots, chưa có giao thức multiplayer. Bot nhận súng được giới hạn UI xin Vandal, phù hợp 3P gun hiện có. Chưa có refund riêng cho súng được tặng.
- Enemy visibility của bots dựa trên mục tiêu AI và đường nhìn hiện tại; chưa có perception cone thống nhất với camera người chơi.
- Các giới hạn navigation/animation bot v30 vẫn ở `MATCH-IMPLEMENTATION.md`.

## Checklist chơi thử v31

- [ ] HUD đọc rõ, không chồng HP/charge/ammo ở fullscreen và cửa sổ; ba agent icon/charge/cooldown/ult đúng.
- [ ] Minimap khớp khi chạy qua A/B, lên xuống tầng; địch sau tường/smoke không bám vị trí, địch đồng đội thấy hiện đúng.
- [ ] Chạy có vòng khoảng nghe; Shift/C không có. Spike cầm/rơi/đặt và timer đúng; defender chưa thấy Spike rơi không lộ vị trí.
- [ ] Z nhấn/giữ đủ 4 kiểu; M mở/đóng, nhấp ping; scope Z vẫn đổi zoom. Đóng modal không tự bắn/cast hoặc giữ phím đi.
- [ ] B mua súng/giáp/charge, bán đúng một lần; đồng đội mua hộ trừ tiền người mua. Xin/hủy xin và mua Vandal cho bot đúng. Clock chạy, hết buy không mua được, ESC pause.
- [ ] Tab K/D/A/ult/ACS/ÉCO cập nhật; credits/trang bị địch ẩn. Kiểm tra ít nhất hai round và đổi bên.
- [ ] Kill feed/headshot/banner/multikill đúng một lần; hitmarker và vignette theo hướng đúng, không còn sau đổi mode.
- [ ] Khi chết có báo cáo damage/H/B/L, N ẩn/hiện; E/Q/V spectator vẫn đúng. Sage/Clove hồi sinh ẩn report và trả HUD.
- [ ] Skill Clove/Jett/Sage vẫn đủ texture/VFX/màu; mở shop/map không giữ prop sai. Console và FPS/RAM ổn trong phiên dài.

M6 hiện là bản triển khai để người dùng duyệt; sau nghiệm thu mới chuyển M7 multiplayer, rồi M8 audio/polish theo plan.
