# Texture cho Clove / Jett / Sage — kiểm kê v24

Ngày: 2026-10-10. Bản soát mới: [SKILL-VFX-AUDIT.md](SKILL-VFX-AUDIT.md). V24 giữ native texture/alpha, xuất mọi frame animation nguồn; 19 VFX kiểm tra pixel RGBA đúng nguồn, 34 GLB/43 ảnh nhúng kiểm tra kích thước native. Bảng v21 dưới đây là lịch sử, các dòng “chưa nối” không còn mô tả đầy đủ runtime v24.

## Kết luận

- Tay Jett trắng do exporter bỏ qua `OverlayMaterialInstance_FP_Wushu_S0_MI`. File `FP_Wushu_S0_DF.png` **đã có**. v21 đọc ObjectPath trong material và nhúng diffuse, normal, MRAE vào GLB tay Jett.
- Smoke Clove trắng do mesh nguồn dùng `WorldGridMaterial`, không chứa shader smoke Riot. v21 dùng shell kín, màu tím/hồng và texture noise chuyển động. Không cần tìm một file diffuse mới để sửa lỗi trắng này.
- Material JSON của ba agent tham chiếu **25 / 29 / 29** texture khác nhau theo từng agent, gồm texture chung, agent select và WIP. Tất cả có file nguồn trong pack. Không đồng nghĩa đã tái tạo toàn bộ shader/hiệu ứng của Riot.
- Riêng VAT bướm Clove có file **HDR**, không phải PNG. Cần decoder/VAT shader và thông số animation để dùng đúng; không được giảm xuống ảnh màu 8 bit.

Gốc đường dẫn bảng dưới: `model/valorant-model-animations-agents/Content/`. Ký hiệu `{DF,NM,MRAE}` là ba file `.png`: màu, normal, mask vật liệu. V24 giữ kích thước nguồn của agent/VFX; icon UI 64.

## Danh sách cần dùng cho từng kỹ năng

| Agent / phần | Texture nguồn đã có | Tích hợp v21 / việc còn lại |
|---|---|---|
| Clove — tay | `Characters/Smonk/S0/1P/Materials/FP_Smonk_S0_{DF,NM,MRAE}.png` | Nhúng trong GLB tay |
| Clove C — Pick-me-up | `Characters/Smonk/S0/VFX/E/Textures/SMO_E_TelegraphRipples_TFX.png` | Dùng cho vòng cue tím; đây là tái sử dụng texture sẵn, không phải khẳng định shader C gốc dùng texture E |
| Clove Q — Meddle | `Characters/Smonk/S0/Ability_Q/1P/Materials/AB_Smonk_S0_Q_Butterfly_BaseTiling.png`, `AB_Smonk_S0_Q_Butterfly_GlowMask.png` | BaseTiling gắn model bướm cầm tay và essence projectile; GlowMask đã xuất, chưa nối lớp glow riêng |
| Clove E — Ruse | `VFX/Textures/NoiseDissolve/Smoke_Dissolve_Grayscale.png`; `Characters/Smonk/S0/VFX/E/Textures/SMO_Generic_TFX.png`; `Characters/Smonk/S0/VFX/E/WIP/Butterflies/SMO_Butterfly_TFX.png` | Noise dùng cho shell tím/hồng; Butterfly dùng cho sáu bướm chuyển động ngoài shell. Generic chưa nối; không dùng VAT/Niagara gốc |
| Clove E — VAT bướm | `Characters/Smonk/S0/VFX/E/WIP/VAT_Test/SMO_ButterflyV2_ChaoticFlight_VAT_TFX.hdr` | **Có nguồn HDR**, chưa tích hợp VAT; đây là asset WIP, không coi là yêu cầu bắt buộc cho gameplay smoke |
| Clove X — Not Dead Yet | `Characters/Smonk/S0/Ability_X/1P/Materials/FP_Smonk_S0_Resurrection_{DF,NM,MRAE}.png`; bộ `TP_Smonk_S0_Resurrection_{DF,NM,MRAE}.png` ở `Ability_X/3P/Materials/` | Tay resurrection riêng có texture và animation X, tải khi dùng ult; cue intangible. Chưa đổi mesh/skin body 3P trong ult |
| Jett — tay | `Characters/Wushu/S0/1P/Models/Materials/FP_Wushu_S0_{DF,NM,MRAE}.png` | Đã sửa tên material overlay và nhúng cả ba vào GLB |
| Jett C — Cloudburst | `VFX/Textures/NoiseDissolve/Smoke_Dissolve_Grayscale.png` | Dùng shell xanh/trắng với noise chuyển động; shader mô phỏng |
| Jett Q/E — Updraft/Tailwind | `Characters/Wushu/S0/CharSelect/VFX/Textures/wind_wrap.png`, `wind_wrap_blur.png`, `air_pan.png`, `air_swipe_anim.png` | wind_wrap dùng cho cue gió, camera có cue viền. Đây là texture CharSelect tái sử dụng; không coi là hiệu ứng Q/E gốc đã khớp |
| Jett X — Blade Storm | `Characters/Wushu/S0/Ability_X/1P/Materials/Wushu_1P_X_Knives_DF_02.png`, `Wushu_1P_X_Knives_NM.png`, `Wushu_1P_X_Knives_MRAE.png` | Cả ba nhúng vào GLB dao; tên diffuse khác tên material đã được xử lý |
| Sage — tay | `Characters/Thorne/S0/1P/Materials/Crystal/FP_Thorne_S0_Crystal_{DF,NM,MRAE}.png`; bộ `TP_Thorne_S0_Crystal_*` ở `3P/Models/Materials/Crystal/` | Nhúng theo material reference; không tự gắn texture TP vào toàn bộ tay |
| Sage C — Barrier Orb | `VFX/Textures/Old/CrystalPattern_TEX.png` | Dùng shader vân tinh thể, đổi vết nứt theo HP. Material `Ability_E/3P/Materials/AB_Thorne_E_Wall_Styled_Inst.json` không có texture reference: màu và beam của nó cần code shader |
| Sage Q — Slow Orb | `Characters/Thorne/S0/Ability_4/1P/Materials/AB_Thorne_4_{DF,NM,MRAE}.png`; `Characters/Thorne/S0/VFX/Textures/Thorne_noise.png`; `VFX/Textures/Old/CrystalPattern_TEX.png` | Orb có texture nguồn; projectile/vùng slow có pattern. Chưa dựng đầy đủ lớp đá vụn Niagara |
| Sage E — Healing Orb | Bộ `AB_Thorne_4_*` ở trên; `Characters/Thorne/S0/VFX/Textures/energy_flow_top.png` | Orb + vòng heal có source texture, cue viền khi tự heal; chưa tái tạo beam gốc |
| Sage X — Resurrection | `Characters/Thorne/S0/Ability_X/3P/Models/AB_Thorne_S0_X_Body_DF.png`; `Characters/Thorne/S0/Ability_4/1P/Models/AB_Thorne_4_CombinedSphere.png`; `VFX/Textures/AlphaGradient/AlphaGrad_ScrollB.png`, `AlphaGrad_ScrollC.png`; `Characters/Thorne/S0/VFX/Textures/Thorne_noise.png` | Có nguồn; runtime hiện vòng revive theo channel. Chưa dùng lớp silhouette/body effect của Riot |

## File chi tiết và phần chưa thể gọi là hoàn thiện

- [Inventory JSON](val-strike-html/assets/playable/vfx/texture-inventory.json): mọi reference, material sử dụng, định dạng thật và đường dẫn file nguồn.
- [Manifest GLB](val-strike-html/assets/playable/manifest.json): texture thực sự nhúng trong từng model; phân biệt material chỉ có tint.
- [Exporter VFX](tools/export-agent-vfx.py) xuất lại texture/icon và inventory; [exporter model](tools/export-playable-agents.py) đọc reference material.
- Chưa có shader graph/Niagara đầy đủ trong runtime, voice/audio và các lớp cinematic. Texture tồn tại không tự mang theo những phần này.
- v21 đã kiểm tra cú pháp và cấu trúc/material GLB; **chưa nghiệm thu hình ảnh/WebGL ingame**. Không đánh dấu ba agent hoàn thiện chỉ vì đã có đủ nút kỹ năng.
