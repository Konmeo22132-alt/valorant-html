"""Export Clove's matching Q skeletal model/clips and missing E/Q mesh layers."""
import importlib.util
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('playable_export',Path(__file__).with_name('export-playable-agents.py'))
exporter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
BASE,OUT,export_mesh=exporter.BASE,exporter.OUT,exporter.export_mesh

def main():
    base=BASE/'Smonk/S0'
    manifest_path=OUT/'manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    arms_patterns={'C_cast':'FP_*_4_Fast_Cast.psa','Q_equip':'FP_*_Q_Butterfly_Equip.psa',
        'Q_idle':'FP_*_Q_Butterfly_IdlePose.psa','Q_cast':'FP_*_Q_Butterfly_Toss.psa',
        'E_equip':'FP_*_E_Equip.psa','E_idle':'FP_*_E_Idle_Pose.psa','E_cast':'FP_*_E_Cast.psa',
        'E_set':'FP_*_E_SmokeSet.psa','X_cast':'FP_*_X_Revive.psa'}
    arms_clips={label:next(base.rglob(pattern)) for label,pattern in arms_patterns.items()}
    manifest['Clove']['arms']=export_mesh(base/'1P/Models/FP_Smonk_S0_Skelmesh.psk',OUT/'smonk-arms.glb',arms_clips)
    animations=base/'Ability_Q/1P/Anims'
    clips={
        'equip':animations/'AB_Smonk_S0_Q_Spikeball_Butterfly_A_Equip_Butterfly.psa',
        'idle':animations/'AB_Smonk_S0_Q_Butterfly_A_Idle_Butterfly.psa',
        'toss':animations/'AB_Smonk_S0_Q_Butterfly_Toss.psa',
    }
    report=export_mesh(base/'Ability_Q/1P/Models/AB_Smonk_S0_Q_Spikeball_Butterfly_Skelmesh.psk',
                       OUT/'smonk-meddle-view.glb',clips)
    manifest['Clove']['effects']['meddle-view']=report
    layers={
        'minimap-ring':'VFX/E/Meshes/SMO_E_Minimap-Ring_3p_SM.pskx',
        'meddle-core':'VFX/Q/Meshes/SMO_Orb_Inner_SM.pskx',
        'meddle-ribbon-inverse':'VFX/Q/Meshes/SMO_Q_FormationRibbon01-Inverted_SM.pskx',
        'meddle-ribbon-secondary':'VFX/Q/Meshes/SMO_Q_FormationRibbon02_SM.pskx',
        'meddle-cast-ring':'VFX/Q/Meshes/SMO_Q_CastRing_SM.pskx',
    }
    for label,relative in layers.items():
        manifest['Clove']['effects'][label]=export_mesh(base/relative,OUT/('smonk-'+label+'.glb'))
    manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps({'model':'meddle-view','clips':report['clips'],'bones':report['bones'],
                      'bytes':report['bytes'],'layers':list(layers)}))

if __name__=='__main__':main()
