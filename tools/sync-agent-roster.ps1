$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$agents = (Invoke-RestMethod 'https://valorant-api.com/v1/agents?isPlayableCharacter=true').data
$path = Join-Path $root 'val-strike-html/game/config/agents.json'
$config = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
$roster = foreach ($agent in $agents) {
  $file = $agent.developerName.ToLowerInvariant() + '.glb'
  $available = Test-Path (Join-Path $root "val-strike-html/assets/agents/$file")
  $existing = $config.agents | Where-Object name -eq $agent.displayName | Select-Object -First 1
  if (!$existing) { $existing = [pscustomobject]@{ name=$agent.displayName; codename=''; file=''; role=''; ultCost=0; abilities=@{} } }
  $existing.codename=$agent.developerName; $existing.file=$file; $existing.role=$agent.role.displayName.ToLowerInvariant()
  $existing | Add-Member -NotePropertyName available -NotePropertyValue $available -Force
  $existing | Add-Member -NotePropertyName playable -NotePropertyValue ($agent.displayName -in 'Clove','Jett','Sage') -Force
  [pscustomobject]@{ name=$existing.name; codename=$existing.codename; file=$file; role=$existing.role; available=$available; playable=$existing.playable }
}
$config.agents = @($roster | ForEach-Object { $entry=$_; $old=$config.agents | Where-Object name -eq $entry.name | Select-Object -First 1; if ($old) {$old} else {$entry} })
$config | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $path -Encoding utf8
$json = ConvertTo-Json -InputObject @($roster) -Depth 4
Set-Content -LiteralPath (Join-Path $root 'val-strike-html/js/agents.js') -Value "// Canonical names and developer codenames: valorant-api.com, checked 2026-10-09.`nwindow.VS_AGENTS = $json;" -Encoding utf8
