"""Publish native source VFX pixels/alpha and an evidence-based inventory."""
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
CONTENT=ROOT/'model/valorant-model-animations-agents/Content'
OUT=ROOT/'val-strike-html/assets/playable/vfx'
TEXTURES={
 'smoke-noise':'VFX/Textures/NoiseDissolve/Smoke_Dissolve_Grayscale.png',
 'clove-ripple':'Characters/Smonk/S0/VFX/E/Textures/SMO_E_TelegraphRipples_TFX.png',
 'clove-butterfly':'Characters/Smonk/S0/VFX/E/WIP/Butterflies/SMO_Butterfly_TFX.png',
 'clove-essence':'Characters/Smonk/S0/Ability_Q/1P/Materials/AB_Smonk_S0_Q_Butterfly_BaseTiling.png',
 'clove-glow':'Characters/Smonk/S0/Ability_Q/1P/Materials/AB_Smonk_S0_Q_Butterfly_GlowMask.png',
 'jett-wind':'Characters/Wushu/S0/CharSelect/VFX/Textures/wind_wrap.png',
 'jett-air':'Characters/Wushu/S0/CharSelect/VFX/Textures/air_pan.png',
 'sage-crystal':'VFX/Textures/Old/CrystalPattern_TEX.png',
 'sage-flow':'Characters/Thorne/S0/VFX/Textures/energy_flow_top.png',
 'sage-noise':'Characters/Thorne/S0/VFX/Textures/Thorne_noise.png',
 'sage-orb':'Characters/Thorne/S0/Ability_4/1P/Models/AB_Thorne_4_CombinedSphere.png',
 'sage-energy':'Characters/Thorne/S0/CharSelect/VFX/Textures/Energy_Wrap.png',
 'sage-energy-mask':'Characters/Thorne/S0/CharSelect/VFX/Textures/energy_wrap_mask.png',
 'sage-res-body':'Characters/Thorne/S0/Ability_X/3P/Models/AB_Thorne_S0_X_Body_DF.png',
 'clove-generic':'Characters/Smonk/S0/VFX/E/Textures/SMO_Generic_TFX.png',
 'jett-swipe':'Characters/Wushu/S0/CharSelect/VFX/Textures/air_swipe_anim.png',
 'jett-dome':'Characters/Wushu/S0/CharSelect/VFX/Textures/dome_tearaway.png',
 'alpha-scroll-b':'VFX/Textures/AlphaGradient/AlphaGrad_ScrollB.png',
 'alpha-scroll-c':'VFX/Textures/AlphaGradient/AlphaGrad_ScrollC.png',
}
ICONS={
 'smonk':dict(zip('CQEX',['TX_UI_Smonk_C','TX_UI_Smonk_Q','TX_UI_Smonk_E','TX_UI_Smonk_X'])),
 'wushu':dict(zip('CQEX',['TX_Wushu_Smoke','TX_Wushu_Boost','TX_Wushu_Dash','TX_Wushu_Daggers'])),
 'thorne':dict(zip('CQEX',['TX_Thorne_Wall','TX_Thorne_SlowField','TX_Thorne_Heal','TX_Thorne_Ressurect'])),
}

def main():
 OUT.mkdir(parents=True,exist_ok=True)
 published={}
 for key,relative in TEXTURES.items():
  source=CONTENT/relative
  with Image.open(source) as src:
   image=src.convert('RGBA')
   image.save(OUT/(key+'.png'),optimize=True)
  published[key]={'source':str(source.relative_to(ROOT)).replace('\\','/'),'file':'/assets/playable/vfx/'+key+'.png','size':image.size}
 ui=ROOT/'model/valorant-model-animations-gun/ShooterGame/Content/UI'
 index={p.stem:p for p in ui.rglob('*.png')}
 for code,slots in ICONS.items():
  for slot,stem in slots.items():
   source=index[stem];key=code+'-'+slot
   with Image.open(source) as src:
    image=src.convert('RGBA');image.thumbnail((64,64),Image.Resampling.LANCZOS);image.save(OUT/(key+'.png'),optimize=True)
   published[key]={'source':str(source.relative_to(ROOT)).replace('\\','/'),'file':'/assets/playable/vfx/'+key+'.png','size':image.size}
 materials={}
 for name,code in [('Clove','Smonk'),('Jett','Wushu'),('Sage','Thorne')]:
  refs={}
  for source in (CONTENT/'Characters'/code/'S0').rglob('*.json'):
   try:doc=json.loads(source.read_text(encoding='utf-8-sig'))
   except (ValueError,UnicodeError):continue
   for parameter,reference in doc.get('Textures',{}).items():
    raw=reference.get('ObjectPath') or reference.get('AssetPathName')
    if not raw or not raw.startswith('/Game/'):continue
    relative=raw.removeprefix('/Game/').rsplit('.',1)[0]+'.png'
    variants=[p for p in (CONTENT/relative).parent.glob(Path(relative).stem+'.*') if p.suffix.lower() in ('.png','.hdr','.exr','.tga','.dds')]
    record=refs.setdefault(relative,{'exists':bool(variants),'formats':[p.suffix for p in variants],'sourceFiles':[str(p.relative_to(ROOT)).replace('\\','/') for p in variants],'materials':[],'publishedAs':[]})
    record['materials'].append({'file':str(source.relative_to(ROOT)).replace('\\','/'),'parameter':parameter})
    record['publishedAs']=[key for key,item in published.items() if item['source']==str((CONTENT/relative).relative_to(ROOT)).replace('\\','/')]
  materials[name]=refs
 manifest={'published':published,'references':materials,'note':'Reference presence does not include UE shader graphs or Niagara systems. CharSelect/WIP references are included for transparency.'}
 (OUT/'texture-inventory.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 for name,refs in materials.items():print(name,{'references':len(refs),'missing':[p for p,v in refs.items() if not v['exists']]})

if __name__=='__main__':main()
