"""Curate native UI PNGs without altering source pixels; make a review sheet."""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / 'model/valorant-model-animations-gun/ShooterGame/Content/UI'
OUT = ROOT / 'val-strike-html/assets/ui'
OUT.mkdir(parents=True, exist_ok=True)
FILES = {
    'abyss': 'InGame/Minimap/Maps/Infinity/TX_Map_Infinity_Revealed.png',
    'minimap-bg': 'InGame/HUD/Minimap/TX_HUD_minimap_background_512x512.png',
    'ability-frame': 'InGame/HUD/assets/TX_MainHud_AbilityBar_Frame.png',
    'ability-bg': 'InGame/HUD/assets/TX_MainHud_AbilityBar_DarkBG.png',
    'charge-full': 'InGame/HUD/assets/TX_MainHud_AbilityChargeFull.png',
    'charge-empty': 'InGame/HUD/assets/TX_MainHud_AbilityChargeEmpty.png',
    'hud-bottom': 'InGame/HUD/Shared/Textures/TX_hud_bottom_backing.png',
    'hud-separator': 'InGame/HUD/Shared/Textures/TX_bottomhud_seperator.png',
    'scoreboard': 'InGame/HUD/Shared/Textures/UI_ScoreboardBacker2.png',
    'ammo': 'InGame/HUD/assets/TX_icon_ammo.png',
    'damage-direction': 'InGame/HUD/Shared/Textures/TX_HUD_DmgIndicator2.png',
    'damage-sides': 'InGame/HUD/Shared/Textures/TX_ScreenHit_sides.png',
    'damage-top': 'InGame/HUD/Shared/Textures/TX_ScreenHit_topBottom.png',
    'attacker': 'InGame/HUD/GameInfoHUD/assets/TX_Symbol_Attackers_2.png',
    'defender': 'InGame/HUD/GameInfoHUD/assets/TX_Symbol_Defenders_2.png',
    'team-back': 'InGame/HUD/GameInfoHUD/assets/TX_HUD_GameInfo_Character_BG_multy.png',
    'announcement': 'InGame/HUD/AnnouncementHUD/assets/TX_Hud_Announcements_bg.png',
    'spike-carrier': 'InGame/HUD/AnnouncementHUD/assets/TX_UI_SpikeOutlineIcon.png',
    'spike': 'InGame/Minimap/Textures/BombTextures/Minimap_BombIcon.png',
    'spike-planted': 'InGame/Minimap/Textures/BombTextures/Minimap_BombPlanted.png',
    'shop-frame': 'InGame/Shop/assets/TX_IngameShop_Box_Frame.png',
    'shop-ornament': 'InGame/Shop/assets/Textures/TX_UI_InGameShop_ScreenFrameOrnaments.png',
    'shop-detail': 'InGame/Shop/assets/Textures/TX_UI_Shop_ItemDetailOrnament.png',
    'armor': 'Screens/Shared/Icons/Armor/TX_armor_icons_outline.png',
    'armor-light': 'Screens/Shared/Icons/Armor/TX_Icon_Armor_Light.png',
    'armor-heavy': 'Screens/Shared/Icons/Armor/TX_Icon_Armor_Heavy.png',
    'armor-regen': 'Screens/Shared/Icons/Armor/TX_Icon_Armor_Regen.png',
    'kill-emblem': 'InGame/KillBanner/Base/Assets/Base_Emblem.png',
    'kill-ring': 'InGame/KillBanner/Base/Assets/Base_RingBG.png',
    'kill-frame': 'InGame/KillBanner/Base/Assets/Base_FrameBG.png',
    'kill-pip': 'InGame/KillBanner/Base/Assets/Base_KillPip_Up.png',
    'headshot': 'InGame/KillBanner/Base/Assets/Base_headshot.png',
    'paper-head': 'InGame/CombatReport/Textures/TX_UI_CombatReport_PaperDoll_Head.png',
    'paper-body': 'InGame/CombatReport/Textures/TX_UI_CombatReport_PaperDoll_Body.png',
    'paper-leg': 'InGame/CombatReport/Textures/TX_UI_CombatReport_PaperDoll_Legs.png',
    'ping-danger': 'InGame/QuickComms/Pings/assets/TX_Caution_Ping.png',
    'ping-going': 'InGame/QuickComms/Pings/assets/TX_OnTheWay_Ping.png',
    'ping-watch': 'InGame/QuickComms/Pings/assets/TX_WatchingArea_Ping.png',
    'ping-help': 'InGame/QuickComms/Pings/assets/TX_NeedsSupport_Ping.png',
}
for name in ['Clove', 'Jett', 'Sage']:
    FILES['portrait-' + name] = f'Shared/Icons/Character/Minimap_Thumbnails/TX_MinimapPortrait_{name}.png'
weapons = {
    'Melee': 'Knife_Standard', 'Classic': 'Pistol_Classic', 'Shorty': 'Pistol_Compact',
    'Frenzy': 'Pistol_AutoPistol', 'Ghost': 'Pistol_Luger', 'Sheriff': 'Pistol_Sheriff',
    'Stinger': 'SMGs_Ninja', 'Spectre': 'SMGs_Vector', 'Bucky': 'Shotguns_Pump',
    'Judge': 'Shotguns_Persuader', 'Bulldog': 'Rifles_Burst', 'Guardian': 'Rifles_DMR',
    'Phantom': 'Rifles_Ghost', 'Vandal': 'Rifles_Volcano', 'Marshal': 'Sniper_Bolt',
    'Outlaw': 'Sniper_DoubleSniper', 'Operator': 'Sniper_Operater', 'Ares': 'LMG', 'Odin': 'HMG',
}
for name, file in weapons.items():
    FILES['weapon-' + name] = f'Screens/Shared/Icons/Weapons/icons/TX_Hud_{file}.png'

manifest = {'version': 32, 'assets': {}}
thumbs = []
for key, relative in FILES.items():
    source = UI / relative
    target = OUT / (key + '.png')
    shutil.copyfile(source, target)
    with Image.open(source) as original:
        rgba = original.convert('RGBA')
        manifest['assets'][key] = {'url': '/assets/ui/' + target.name, 'source': source.relative_to(ROOT).as_posix(),
            'size': list(original.size), 'bytes': source.stat().st_size, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        preview = rgba.copy()
        preview.thumbnail((168, 95))
        thumbs.append((key, original.size, preview))
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
sheet = Image.new('RGB', (190 * 6, 132 * ((len(thumbs) + 5) // 6)), '#24323d')
draw = ImageDraw.Draw(sheet)
for index, (name, size, thumb) in enumerate(thumbs):
    x, y = index % 6 * 190, index // 6 * 132
    sheet.paste(thumb, (x + (190 - thumb.width)//2, y + 4), thumb)
    draw.text((x + 6, y + 103), name, fill='white')
    draw.text((x + 6, y + 117), str(size), fill='#a6bcc8')
review = ROOT / 'tools/art-review/ui-source-sheet.png'
review.parent.mkdir(parents=True, exist_ok=True)
sheet.save(review)
print(f'UI: {len(FILES)} native PNGs, {sum(v["bytes"] for v in manifest["assets"].values())/1024:.0f} KiB; {review}')
