# Nghiên cứu multiplayer và kế hoạch cải thiện Val‑Strike

Ngày: 15/10/2026. Nghiên cứu thực hiện sau khi phát hành `v42-20261015-195250`.

## 1. Điều người chơi cần cảm nhận

Di chuyển, nhìn quanh, animation bắn/chém, recoil và hiển thị đạn phải phản hồi trên máy người chơi mà không đợi một vòng gửi/nhận mạng. Tính đúng của vị trí chung, sát thương, tài nguyên và kết quả trận vẫn do server quyết định. Khi không có dữ liệu từ bên kia, không thể biết chính xác người khác đang làm gì; chỉ có thể dự đoán có giới hạn, rồi đồng bộ lại.

“Hình ảnh vẫn mượt” có ba phần cần đo riêng:

| Phần | Cách đo | Không nên đánh đồng với |
| --- | --- | --- |
| Nhịp render local | thời gian frame p50/p95/p99, khung hình dài >50 ms | Ping |
| Phản hồi điều khiển local | thời gian từ input đến lần thay đổi camera/animation | thời gian xác nhận sát thương |
| Độ mới của thế giới chung | tuổi snapshot, jitter, thời gian hàng đợi, độ lớn correction | FPS hiển thị |

## 2. Tài liệu gốc và kết luận có thể xác nhận

### Riot: prediction, physics tick và giải quyết sai lệch

Riot mô tả client gửi các bước di chuyển theo tick; server chạy mô phỏng và đối chiếu, đồng thời buffer input để tránh thiếu dữ liệu. Client của người chơi cần được sửa khi mô phỏng bất đồng. Các nhân vật từ xa có bộ đệm hiển thị để giảm nhảy hình do gói đến không đều. Đây là cơ sở cho việc tách physics local, correction và interpolation trong Val‑Strike.

Nguồn: [Peeking into VALORANT’s Netcode](https://www.riotgames.com/en/news/peeking-valorants-netcode).

### Riot: hàng đợi quá dài làm ping cảm nhận tăng

Riot ghi nhận ping spike và thay đổi FPS có thể khiến hàng đợi tích tụ. Họ tăng tốc đưa buffer về mục tiêu; trong trường hợp nghiêm trọng, bỏ các move cũ để trở về dữ liệu mới nhất, chấp nhận một correction. Do đó chỉ tăng buffer mãi để “mượt” sẽ làm mất phản hồi. Cần đo tuổi hàng đợi và có chính sách phục hồi sau burst.

Nguồn: [VALORANT Gameplay Consistency Update 2](https://playvalorant.com/en-us/news/game-updates/valorant-gameplay-consistency-update-2/).

### Valve: mô phỏng lại input và bù trễ khi bắn

Valve trình bày client-side prediction dùng trạng thái server đã xác nhận cộng các lệnh chưa được xác nhận. Interpolation giữ một khoảng lịch sử để hiển thị các entity từ xa. Lag compensation trên server dùng lịch sử để đánh giá cảnh mà người bắn đã thấy. Vì thế animation bắn chạy ngay không đồng nghĩa hit registration đã được bù trễ.

Nguồn: [Latency Compensating Methods in Client/Server In-game Protocol Design and Optimization](https://developer.valvesoftware.com/w/index.php?title=Latency_Compensating_Methods_in_Client%2FServer_In-game_Protocol_Design_and_Optimization&uselang=en). Trang được tìm qua bản lập chỉ mục; truy cập trực tiếp trả 403 trong lượt nghiên cứu này.

### Riot: CPU budget và hitbox history

Riot công khai cách họ đặt ngân sách thời gian mỗi server frame, đo các hệ thống và tối ưu theo dữ liệu. Họ lưu vị trí và trạng thái animation để rewind khi xét phát bắn. Điều áp dụng ở đây là đo thời gian tick thực tế và chi phí collision trước khi nâng tick rate; không lấy số 128 làm bảo đảm chất lượng.

Nguồn: [VALORANT’s 128-Tick Servers](https://www.riotgames.com/en/news/valorants-128-tick-servers).

### Tencent/TiMi và HOK

Level Infinite xác nhận HOK có mạng server toàn cầu. Tencent GCloud có sản phẩm LockStep cho mạng yếu, hỗ trợ TCP/UDP/RUDP, tách logic khỏi phần thể hiện và có cơ chế điều chỉnh tốc độ phát frame khi đuổi kịp. Đây là các kỹ thuật liên quan đáng tham khảo. Trang sản phẩm nêu ví dụ triển khai cho một game khác; nó không xác nhận HOK đang dùng chính sản phẩm đó hay các tham số cụ thể nào.

Không có bằng chứng công khai đủ trong lượt tìm này để kết luận HOK dùng một cấu hình rollback, prediction, FEC hoặc tick rate cụ thể. Tài liệu GVoice/EdgeOne/database của HOK cũng không chứng minh cách mô phỏng combat trong trận.

Nguồn: [HOK global server network — Level Infinite](https://www.levelinfinite.com/news/behind-the-worlds-biggest-mobile-moba-exclusive-dev-interview/), [Tencent GCloud LockStep](https://gcloud.tencent.com/pages/products/lockstep.html). Nội dung GCloud được đọc qua kết quả lập chỉ mục; mở trang trực tiếp bị timeout.

### W3C: hạn chế vận chuyển của WebSocket

W3C mô tả WebSocket là một luồng tin cậy, có thứ tự. Khi mất dữ liệu, thông điệp mới có thể phải chờ thông điệp trước. WebTransport bổ sung datagram và các stream độc lập. Đổi transport có thể giảm ảnh hưởng hàng đợi do mất gói, nhưng không thay thế prediction, collision, clock synchronization hay quyền quyết định của server.

Nguồn: [W3C WebTransport Explainer](https://github.com/w3c/webtransport/blob/main/explainer.md), [WebTransport specification](https://www.w3.org/TR/webtransport/).

## 3. Đã sửa và phát hành trong bản này

Các mục dưới đây dựa vào mã và phép đo của dự án, không phải số đo của Riot/Tencent.

- Dùng chung `actorNetworkStep` giữa server và client, bước logic 1/30 giây độc lập FPS.
- Client mô phỏng input ngay, server xác nhận bằng số thứ tự **đã xử lý**, không chỉ số đã nhận.
- Reconciliation khôi phục trạng thái server rồi replay các lệnh mới hơn ack; không cộng sai số cũ lên vị trí mới.
- Physics feet và render offset được tách riêng. Camera nội suy hai trạng thái đã giải collision, offset giảm theo thời gian frame.
- Remote players dùng snapshot buffer và đồng hồ render riêng; góc quay nội suy qua biên ±π, respawn/teleport không kéo model xuyên map.
- Mất socket không tự pause gameplay. Client tiếp tục prediction local và hiệu ứng tấn công; đánh dấu chờ đồng bộ. Khi nối lại, dùng snapshot mới và xóa replay cũ.
- Replay local giữ tối đa 120 tick; pending shot tối đa 256. Không lưu vô hạn lịch sử khi mạng ngắt.
- Bắn/chém, recoil và tracer phản hồi local. Snapshot trừ lại các phát đã bắn nhưng chưa được server xác nhận. ACK của đổi súng/nạp đạn tránh snapshot cũ hủy thao tác đang chờ.
- Không gửi lại các phát bắn phát sinh sau khi socket đã đóng. Các thông điệp đã vào TCP trước lúc mạng gián đoạn vẫn có thể tới trễ; bản này chưa có deadline cho mọi action.
- Giảm tin tương tác giữ phím từ gửi mỗi tick xuống gửi khi đổi trạng thái và refresh 250 ms.
- Raycast collision dùng lexical Math intrinsics thay vì truy cập global trong VM ở inner loop. Giảm floor probes ở vùng có mặt đỡ tại tâm; vẫn dùng footprint probes khi cạnh hoặc thiếu mặt sàn.
- Luồng vào trận mới: selector có model CharSelect thật → lock → đợi hết timer → hiện hai đội 4 giây → ảnh map và thanh tải → gameplay. Chuẩn bị view spawn thực của người chơi mạng trước khi bỏ màn tải.

### Đo kiểm đã thực hiện

| Kiểm tra | Phạm vi và kết quả |
| --- | --- |
| Prediction/replay | Host và guest, RTT mô phỏng 0/90/280/1000/3000 ms, jitter, render 60/144/240 FPS; không tăng tốc vô hạn; hội tụ sau khi nhả phím |
| Mất mạng | 30 giây không snapshot; input local vẫn chạy, replay không vượt 120 tick; reset snapshot mới xóa lịch sử cũ |
| Combat UI | Thao tác bắn được gọi khi socket offline; không gửi lệnh bắn offline; snapshot cũ không hoàn lại pending ammo; ACK không trừ đạn hai lần |
| Entry bot | Chọn agent khóa/mở, bot chọn dần, giới hạn 2/team, hết timer, reveal, loading và gameplay handoff |
| Entry network | Hai tài khoản/socket thật trên server local dùng SQLite in-memory: ẩn agent địch khi chọn, lock, reveal theo giờ server, đợi đủ người load, input ACK và reconnect |
| Browser | Đã xem selector model thật, khóa Clove, chuyển tới gameplay và prompt fullscreen gọn; server preview chỉ bind loopback |
| VPS | 180 tick với 10 người mô phỏng đi ngang ở buy phase trong một room tách khỏi server đang phục vụ: mean 5,32 ms, p95 7,20 ms, max 39,28 ms |

Phép đo VPS là một tình huống có kiểm soát, chưa phải trận 5v5 có đầy đủ giao tranh/skill hoặc nhiều room cùng tải. RTT 3000 ms là mô phỏng gửi/nhận trễ có jitter, chưa phải thử nghiệm gói rớt/retransmission trên tuyến Internet thật. Chưa có hai thiết bị vật lý xác nhận cảm giác chơi qua production.

## 4. Thuật toán đối soát đang dùng

Gọi `F` là cùng hàm vật lý client/server và `h = 1/30`:

```text
Khi có input n:
    predicted = F(predicted, input[n], h)
    lưu input[n] vào replay ring
    gửi input[n] nếu transport sẵn sàng

Khi nhận snapshot ack=k:
    bỏ input có sequence <= k
    predicted = snapshot.authoritativeState
    replay từng input còn lại qua F
    renderOffset = hình đang thấy - trạng thái mới

Mỗi render frame:
    renderOffset *= exp(-18 * frameDT)
    camera = lerp(previousPhysics, currentPhysics, tickFraction) + renderOffset
```

Phải lưu toàn bộ state ảnh hưởng F: velocity, crouch, grounded, jump-held, tốc độ bị giảm/tăng, biên spawn, hướng/duration dash. Chỉ đồng bộ tọa độ rồi giữ vận tốc local cũ có thể làm sai lệch tiếp tục phát triển. State thay đổi bởi ability hoặc collision động vẫn cần theo dõi kỹ trong lượt thử thực tế.

## 5. Thứ tự cải thiện tiếp dựa trên nghiên cứu

Đây là thiết kế đề xuất, **chưa phát hành** trong bản 19:52.

### A. Telemetry đủ để giải thích “lag”

Thu thập ring buffer 10–30 giây: RTT/jitter, snapshot age, input queue depth/age, tick p95/p99, replay count/time, correction cm/frame, buffered bytes, frame time. Cho người chơi bật overlay nhỏ trong settings. Không gửi lịch sử tự động khi chưa có cơ chế thông báo/thu thập rõ ràng.

Ngân sách đề xuất ban đầu: server tick p95 dưới 16 ms ở 10 người để còn dư trong tick 33,3 ms; frame 60 FPS dưới 16,7 ms. Báo riêng spike p99/max, không chỉ báo trung bình.

### B. Clock và jitter buffer tự điều chỉnh

Lấy timestamp bằng monotonic clock. Dùng các gói heartbeat để ước lượng RTT và clock offset; lọc median hoặc EWMA để tránh nhảy đồng hồ theo từng gói. Không dùng giờ hệ thống của client để xác nhận combat.

Với snapshot interval S, theo dõi độ lệch `arrivalDelta - serverDelta`. Thử mục tiêu buffer `clamp(2*S + jitterP95, 75 ms, 200 ms)`. Tăng khi thiếu snapshot, giảm chậm khi ổn định; render clock chạy liên tục và điều chỉnh tốc độ một lượng nhỏ. Các giá trị này là tham số thử nghiệm của dự án, không phải giá trị được HOK/Riot xác nhận.

### C. Hàng đợi input có timeline, không phát lại một chuỗi lệnh lỗi thời

Map sequence client vào server simulation tick. Bình thường duy trì hàng đợi ngắn đủ che jitter; không bỏ toàn bộ bảo vệ chỉ vì RTT cao ổn định. Khi burst làm queue quá già, bỏ move cũ theo một ngưỡng được đo, gửi marker hard-resync và state đầy đủ. Nếu đuổi kịp nhiều move trong một tick thì chia đúng ngân sách thời gian, không thực thi mỗi move như một tick mới để tăng tốc nhân vật.

Bản hiện tại đã có queue tối đa 12 input và chống sequence lặp; chưa có thuật toán timeline/buffer thích nghi hoàn chỉnh.

### D. Bù trễ hit registration trên server

Giữ lịch sử hitbox theo tick và cắt lịch sử khi respawn/teleport. Ước lượng thời điểm cảnh người bắn đã thấy bằng clock offset, RTT và interpolation delay. Clamp rewind window, xác nhận weapon/ammo/cadence/alive trước khi raycast hitbox lịch sử. Không dùng tọa độ hoặc mục tiêu hit do client tự khai.

Đề xuất thử window 150–200 ms rồi đánh giá công bằng cả phía bắn và phía né; **không** cho rewind vô hạn theo ping 3 giây. Phải xét wall động và phase/life ID để tránh bắn xuyên tường Sage mới dựng hoặc gây sát thương cho một mạng sống khác. Không thay vị trí physics đang sống bằng pose rewind; dùng hitbox lịch sử riêng.

### E. Transport cho input/snapshot

Đánh giá WebRTC unordered datagrams hoặc WebTransport datagrams cho input/snapshot; giữ WebSocket tin cậy cho lobby, tài khoản, mua đồ và kết quả. Spike cần xác minh browser hỗ trợ, TLS, UDP, proxy/CDN, fallback và cookie/session authorization. Không giả định bật HTTP/3 trên domain là tự có WebTransport tới Node.

Dữ liệu movement mới có thể thay dữ liệu cũ; event giao dịch cần idempotency/ACK. Có thể gửi dư vài input gần nhất khi dùng datagram, bỏ sequence trùng ở server. Giữ giới hạn bytes/memory; không xếp hàng vô hạn khi băng thông thấp. Thử packet loss 1/3/5/10%, burst loss, đảo thứ tự và blackout trước khi đổi transport production.

### F. Snapshot và tải server

Tách dữ liệu chuyển động tần suất cao khỏi inventory/shop ít thay đổi, tránh gửi toàn bộ cùng JSON mỗi snapshot. Đo bytes/player/s; quantize position/angles với sai số định trước, gửi delta và periodic baseline để reconnect. Chỉ nâng physics/snapshot tick sau khi đo budget dưới tải thực; không dùng tick rate cao để che lỗi hàng đợi.

## 6. Kết luận áp dụng cho yêu cầu HOK

Quan sát của người chơi là tiêu chí trải nghiệm cần hướng tới: lag mạng không được làm đứng input hoặc animation local. Bản đã phát hành xử lý lớp này và giảm chi phí tick. Để cảm giác bắn trúng và theo dõi đối thủ tốt hơn nữa khi mạng xấu, phần tiếp theo cần ưu tiên đo queue/jitter và server-side lag compensation. Transport datagram là bước sau khi những dữ liệu đo đó cho thấy head-of-line blocking đang gây thiệt hại thực tế.

Khi đứt kết nối dài, bản local có thể khác trận thật đang tiếp tục trên server. Khi nối lại sẽ có lúc cần correction; không có thuật toán nào vừa biết chính xác thế giới bị mất liên lạc vừa đảm bảo không bao giờ sửa vị trí.
