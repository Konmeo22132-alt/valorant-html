# v41 — Tài khoản, dữ liệu và sảnh

Ngày: 2026-10-11. Server/menu hiện tại là v41; phần v40 bên dưới giữ để tra cứu lịch sử.

## Luồng sử dụng hiện tại

1. Mở `/`, đăng nhập bằng tài khoản được admin cấp. Admin ban đầu: `Konmeo22132`, mật khẩu người dùng đã cung cấp; source chỉ chứa salt/hash bootstrap, DB không lưu mật khẩu plaintext.
2. Admin vào `/settings` để tạo tài khoản player. Tài khoản player chỉ thấy cài đặt cá nhân và đăng xuất; API từ chối quyền tạo tài khoản.
3. `/play` chọn **UNRATED**, **DEATHMATCH** hoặc **CUSTOM**, bấm **TẠO PHÒNG** và chọn sức chứa. **VÀO PHÒNG** bằng mã hoặc danh sách phòng đang mở.
4. Chọn Clove/Jett/Sage và sẵn sàng. UNRATED cần đủ hai đội. CUSTOM cần hai đội bằng số người, có thể chuyển sang QUAN SÁT. Deathmatch bắt đầu với ít nhất hai người đã sẵn sàng.
5. CUSTOM quan sát: WASD/Space/Ctrl free cam, Q/E đổi người, V bỏ theo dõi. Deathmatch: B chọn súng miễn phí khi còn sống; hồi sinh sau 2,5s, kết thúc ở 40 kill hoặc 10 phút.
6. Mỗi tài khoản có một nhân vật trong phòng. Hai người trên một máy cần hai tài khoản trong hai phiên trình duyệt độc lập. Cookie đăng nhập và phiên phòng khác với cơ chế theo tab của v40.

## Lưu trữ và triển khai

- Cần Node 22.13+; môi trường hiện tại dùng Node 22.14. `node:sqlite` cung cấp DB native, không cần daemon DB riêng. Tài liệu API: [Node SQLite](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html).
- Chạy `node --max-old-space-size=256 server/server.cjs` hoặc `val-strike-html/start-server.bat`. Dependency WebSocket nằm trong `tools/node_modules`, khôi phục bằng `npm --prefix tools ci`.
- DB mặc định `data/val-strike.sqlite`; đổi bằng `DB_PATH`. Thư mục này phải nằm trên volume bền vững khi deploy. Đóng server trước khi sao chép DB để sao lưu; không xóa DB khi cập nhật phiên bản.
- Các bảng: users, profiles, sessions, results, room_sessions. Cookie HttpOnly/SameSite=Strict, hạn 14 ngày; secret session chỉ lưu dạng hash trong DB. Lịch sử online do server ghi khi trận complete, chống ghi trùng bằng match/player ID; bot results có source=bot.
- Server nhận `HOST`, `PORT`, `TLS_KEY`, `TLS_CERT`. Khi terminate HTTPS ở reverse proxy, đặt `COOKIE_SECURE=1` và chuyển tiếp WebSocket `/ws`; giữ host/origin đồng nhất. HTTP loopback chỉ dùng phát triển. Gameplay vẫn yêu cầu toàn màn hình và keyboard lock như các bản trước.
- Phòng đang chơi và mô phỏng thời gian thực nằm trong bộ nhớ server; restart kết thúc các phòng đó. Session tài khoản, cài đặt và kết quả giữ trong DB; phiên phòng cũ được xóa khi không còn room tương ứng.
- Profile/history v40 lưu trên trình duyệt không tự nhập vì chưa gắn với danh tính tài khoản. v41 không đọc/ghi chúng.
- Đã kiểm tra cú pháp và trạng thái tiến trình server. Chưa chạy regression suite v41 hoặc nghiệm thu WebGL/hai máy.

## Lịch sử v40 — Multiplayer, ping và menu

Ngày: 2026-10-11. M7 đã triển khai và qua kiểm tra CPU/HTTP/WebSocket; đang chờ nghiệm thu chơi và render thực. M8 audio là bước tiếp theo sau nghiệm thu.

## Chạy và vào trận

Server hiện phục vụ cả menu, asset và WebSocket trên cùng cổng:

```powershell
Set-Location C:\Users\Admin\Downloads\valorant
node --max-old-space-size=256 server/server.cjs
```

Hoặc mở `val-strike-html/start-server.bat`. Dependency đã cài trong `tools/node_modules`; nếu cần cài lại, dùng `npm --prefix tools ci`.

1. Mở [menu chính](http://127.0.0.1:8455/), Ctrl+F5 để tải phiên bản mới.
2. **CHƠI → MULTIPLAYER → TẠO PHÒNG**. Chọn 1v1 đến 5v5, gửi mã sáu ký tự cho người chơi khác dùng cùng server.
3. Người khác chọn **VÀO BẰNG MÃ PHÒNG** hoặc chọn phòng từ danh sách server. Chọn đội và Clove/Jett/Sage; mỗi đặc vụ tối đa hai lần/team.
4. Cần đủ người ở cả hai đội và tất cả **SẴN SÀNG**. Chủ phòng bắt đầu; server đợi tất cả tải map/model/kỹ năng trước khi mở vòng mua đồ.
5. Trong trận, nhấn nút vào toàn màn hình. B mở shop, Z ping, G giữ để plant/defuse/lấy orb, H thả súng đã mua, F nhặt súng ở gần. Sau chết: Q/E xem đồng đội, V free cam; Clove dùng C mở Ruse sau chết, X hồi sinh trong cửa sổ hợp lệ.
6. Kết thúc trận: chủ phòng có **Chơi tiếp ở phòng này** để trở về sảnh và chọn/sẵn sàng lại. **Trở về sảnh** rời phòng hiện tại.

Khi thử hai người trên một máy, dùng hai phiên trình duyệt độc lập. Session được lưu theo tab; tab sao chép cùng session sẽ thay kết nối cũ để tránh tạo hai nhân vật cho một người.

### Máy khác / HTTPS

Địa chỉ `127.0.0.1` chỉ dùng trên máy đang chạy server. Client hiện yêu cầu Fullscreen và Keyboard Lock; đường truy cập từ máy khác cần HTTPS được trình duyệt tin cậy. Server nhận certificate có sẵn qua `TLS_KEY` / `TLS_CERT` và tự dùng WSS:

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '8455'
$env:TLS_KEY = 'C:\duong-dan\server-key.pem'
$env:TLS_CERT = 'C:\duong-dan\server-cert.pem'
node --max-old-space-size=256 server/server.cjs
```

Đây là đường dẫn cấu hình ví dụ, không phải certificate đã được cài. Cũng có thể đặt server sau HTTPS reverse proxy có chuyển tiếp `/ws`. Chưa thay firewall, cài certificate/trust hoặc triển khai server công khai. Python static server cũ không hỗ trợ multiplayer.

## Server quyết định trạng thái trận

| Phần | Thực hiện |
|---|---|
| Tick / snapshot | 30 tick/s; snapshot 20/s; tối đa ba tick bù khi chậm |
| Phòng | Đội cân bằng, host, ready, loading tối đa 120 giây, chuyển host khi rời hoặc sau mất kết nối quá hạn |
| Identity | Player ID/token do server phát; reconnect giữ nguyên nhân vật, sequence và tài nguyên |
| Movement | Input có sequence, finite yaw/pitch và bitmask; server dùng collision Abyss/BVH, actor motion, gravity/jump/crouch/slow/tag/dash |
| Combat | Server origin/ray/hitbox, cadence/burst, 19 weapon configs, ammo/reload/equip, penetration simulation và giáp |
| Economy | Buy/sell/refund ledger, giáp, kỹ năng, xin/mua hộ đúng team và người trả tiền |
| Spike | Site polygon/floor validation, plant/defuse/checkpoint, explosion/end/halftime/overtime từ MatchRules |
| Kỹ năng | C/Q/E/X của Clove/Jett/Sage, charge/cooldown/ult, projectile/fuse/LOS, smoke/slow/wall, heal/overheal/revive/knives |
| Ping | World position cố định; chỉ gửi cho cùng đội |

Server bỏ qua position/HP/damage/credit do client tự khai báo. Mất input quá 300 ms ngừng di chuyển/giữ tương tác/steer; disconnect có 30 giây giữ chỗ trước khi xử lý người vắng. Nhân vật đã chết có thể resume cùng ID nếu phòng còn tồn tại. Không phát lại thao tác bắn hoặc mua khi nối lại.

WebSocket dùng JSON, giới hạn payload 8 KiB, 100 lệnh/giây/kết nối, buffer/backpressure và heartbeat. Token không có trong snapshot chung; ammo/reload deadline/last damage chỉ gửi riêng cho người sở hữu. Đây chưa phải hệ thống tài khoản hoặc anticheat hoàn chỉnh.

## Client và asset

- Remote player dùng agent GLB/body animation thật, blend locomotion nguồn, world weapon GLB đủ 19 loại, native plant/defuse props, death/revive và kỹ năng. Không cập nhật AI bot trong phòng người thật.
- Nội suy khoảng 100 ms, xử lý vòng yaw qua 0 và tiếp tục tiến giữa các snapshot. Prediction vị trí của chính mình được sửa dần từ input ack; round/revive mới teleport. Không phải full input replay hoặc hit rewind cho mạng có latency cao.
- Native shader/layer Clove/Jett/Sage được dùng lại; snapshot chỉ quyết định vị trí/tài nguyên/timer và event gọi animation/VFX. Dead Ruse giữ camera quan sát, không bật tay hoặc chuyển về xác.
- Tên thật của đồng đội là DOM text, được chiếu sau mỗi frame theo active camera. Z ping cũng dùng camera vừa render/viewport CSS; minimap vẫn có nhịp cập nhật riêng.
- Game giữ trần 30 FPS và 960×600. Menu chỉ có một preview engine, tự chạy 20 FPS, render dimension tối đa 480 px, dừng khi tab ẩn và dispose khi đổi trang.

## Menu có chức năng thực

| Trang | Nội dung / thao tác |
|---|---|
| Trang chính | Background Abyss nguồn, GLB tự hiện, đổi đặc vụ mặc định, tình trạng server và kết quả gần nhất thật |
| Chơi | Create/join/room list/ready/team/agent/start; Unrated bot, Deathmatch bot và luyện tập |
| Đặc vụ | Danh mục 29 portrait/model nguồn, lọc role, trang chi tiết riêng; ba agent có đủ kỹ năng chơi được |
| Vũ khí | 19 icon thật, thông số/damage table từ config, mở khu luyện tập đúng vũ khí |
| Lịch sử | Chỉ trận hoàn thành thực, tối đa 30 bản ghi local; chống lưu trùng kết quả khi reload |
| Cài đặt | Tên, agent, độ nhạy, FPS 20/30 và màu tâm ngắm áp dụng khi tải game |

Không tạo số liệu rank/currency/friends, shop skin hoặc nút chế độ chưa có chức năng. Trạng thái chưa có lịch sử và phòng trống phản ánh dữ liệu thực. Các agent ngoài Clove/Jett/Sage có model xem được và được ghi rõ phạm vi chơi; không chuyển danh mục sang chọn đội hình.

## Kiểm tra đã chạy

Tất cả dùng Node/JSDOM/Babylon NullEngine, không tạo WebGL:

```powershell
npm --prefix tools run test:multiplayer
npm --prefix tools run test:multiplayer:skills
npm --prefix tools run test:multiplayer:client
npm --prefix tools run test:menu
npm --prefix tools run test:ui
npm --prefix tools run test:startup
```

- Authority: collision/floor Abyss thật, bỏ qua forged position/HP/credits/damage, mua/refund, fire cadence/reload, cap 2/team, room lifecycle, actual WebSocket/snapshot/reconnect, private ammo và host transfer.
- Kỹ năng: 12 slot, wall placement/fortify, projectile/release/fuse/decay, dead smoke, hồi sinh/intangibility/kill permanence, Sage revive interrupt, Jett re-equip/knife cadence, ping team, orb giữ liên tục, round cleanup và rematch.
- Client: ping projection theo camera, ally name không chèn HTML, loading guard, interpolation giữa snapshot/yaw wrap, sequence sau reload, authoritative ammo/credits và Jett X fire reply.
- Menu: sáu trang, automatic preview requests/disposal, 29 asset/model paths, 19 thông số súng, lịch sử thật và cài đặt áp dụng, command create/ready/leave.
- Startup: script/config thật qua server cổng 8455 và đổi route nhanh. Chỉ thay renderer preview bằng stub để tránh GPU; kiểm tra này không xác nhận preview render đúng.

## Nghiệm thu còn lại

- Hai browser/máy chơi thực: chuyển động, bắn nhau, mua hộ, plant/defuse, ba agent và kết nối lại giữa trận.
- Render/model/animation/VFX, menu ở các kích thước, fullscreen/ESC, ping khi quay nhanh và spectator/Ruse sau chết. Chưa mở browser hoặc GPU trong lượt v40 vì lịch sử máy freeze/crash.
- Mạng có jitter/latency cao, đủ 10 người và tải nhiều phòng chưa được đo. Barrier mua đồ trên server hiện dùng phạm vi spawn, không phải cửa barrier chính xác client Riot; map/native collider tiếp tục dùng dữ liệu dự án đã có.

Nguồn kỹ thuật đã đối chiếu: [ws](https://github.com/websockets/ws), [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket). Logic và dữ liệu gameplay dùng source/config của dự án; không tuyên bố trích xuất thuật toán server Riot hoặc UI/render giống 100%.
