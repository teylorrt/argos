param([string]$Destination)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Destination) { $Destination = Join-Path $projectRoot ('infra/backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$backupDirectory = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$composeArguments = @('compose','--project-name','argos','--env-file',(Join-Path $projectRoot 'infra/.env'),'-f',(Join-Path $projectRoot 'infra/compose.yaml'))
$databaseContainer = & docker @composeArguments ps -q db
$apiContainer = & docker @composeArguments ps -q api
if (-not $databaseContainer -or -not $apiContainer) { throw 'Inicie o Argos antes do backup' }
& docker @composeArguments exec -T db pg_dump -U argos -d argos -Fc -f /tmp/argos-backup.dump
if ($LASTEXITCODE -ne 0) { throw 'Falha no pg_dump' }
docker cp "${databaseContainer}:/tmp/argos-backup.dump" (Join-Path $backupDirectory 'database.dump')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao copiar dump' }
& docker @composeArguments exec -T api tar -czf /tmp/argos-keys.tar.gz -C /app/data keys
if ($LASTEXITCODE -ne 0) { throw 'Falha no backup das chaves' }
docker cp "${apiContainer}:/tmp/argos-keys.tar.gz" (Join-Path $backupDirectory 'keys.tar.gz')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao copiar chaves' }
Write-Host "Backup de banco e chaves criado em $backupDirectory. Guarde-o em local protegido."
