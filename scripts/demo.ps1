$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
docker compose --project-name argos --env-file (Join-Path $projectRoot 'infra/.env') -f (Join-Path $projectRoot 'infra/compose.yaml') exec -T api node dist/demo.js
if ($LASTEXITCODE -ne 0) { throw 'Simulação falhou' }
