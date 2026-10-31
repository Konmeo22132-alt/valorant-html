# Mobile Mode — phase 1

Mobile Mode is enabled with:

```text
/game/game.html?mode=mobile
```

Desktop input and UI stay unchanged. The touch layer feeds the existing player,
weapon and agent APIs.

## Current controls

- Left joystick: analog movement.
- Drag on the right side: camera look.
- Two fire buttons: left and right fire.
- ADS, reload, jump, crouch and walk.
- Primary, secondary and melee weapon buttons.
- C/Q/E/X ability buttons with one-tap equip/cast behavior.
- Ping button aimed at the current ground point.

Mobile Mode bypasses the desktop fullscreen and Keyboard Lock requirement. The
browser page still remains landscape-only for the first version.

## HUD editor

The `LAYOUT` button opens the mobile editor. Groups can be dragged, scaled with
the slider, reset, and selected from 2-finger, 3-finger and 4-finger presets.
`LƯU VÀO TÀI KHOẢN` sends the sanitized layout through `/api/data`; SQLite stores
it under `profiles.data.mobile`.

The server accepts only bounded preset, scale and control coordinates. Unknown
keys, oversized values and extra control entries are discarded.

## Remaining device validation

The implementation is ready for device testing, but this workspace has not run a
real mobile browser session. Remaining validation is visual/touch QA on phones
and tablets: safe-area insets, multi-touch cancellation, thumb reach, aim
sensitivity, ability targeting and 30/60/90 FPS profiles.
