#!/bin/bash
# Batch convert tất cả agents: mỗi agent lấy skin đầu tiên (S0 ưu tiên) + idle anim
CONTENT="C:/Users/Admin/Downloads/valorant/valorant-model-animations/Content"
OUT="C:/Users/Admin/Downloads/valorant/val-strike-html/assets/agents"
BLENDER="C:/Users/Admin/Downloads/valorant/blender-portable/blender-4.2.0-windows-x64/blender.exe"
mkdir -p "$OUT"
for dir in "$CONTENT/Characters"/*/; do
  AGENT=$(basename "$dir")
  [[ "$AGENT" == _* ]] && continue          # bỏ _Core/_Prototypes
  [[ "$AGENT" == Global ]] && continue
  [[ -f "$OUT/${AGENT,,}.glb" ]] && continue
  # chọn skin: S0 nếu có, không thì skin đầu tiên
  SKIN=""
  for s in S0 S1 S2 S3; do
    [[ -f "$dir$s/3P/Models/TP_${AGENT}_${s}_Skelmesh.psk" ]] && SKIN="$s" && break
  done
  if [[ -z "$SKIN" ]]; then
    SKIN=$(ls "$dir" | grep -E '^S[0-9]$' | head -1)
  fi
  [[ -z "$SKIN" ]] && { echo "VS_SKIP $AGENT (không có skin)"; continue; }
  echo "VS_CONVERT $AGENT $SKIN"
  "$BLENDER" --background --python tools/agent_to_glb.py -- "$AGENT" "$SKIN" "$OUT/${AGENT,,}.glb" 2>&1 | grep -E "VS_GLB_DONE|VS_DIMS|VS_ANIM|Error" | head -3
done
echo "VS_BATCH_DONE"
