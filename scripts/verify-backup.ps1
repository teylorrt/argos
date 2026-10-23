param([Parameter(Mandatory=$true)][string]$BackupDirectory, [string]$ProjectName = 'argos-restore-check')
$ErrorActionPreference = 'Stop'
if ($ProjectName -notmatch '^argos-restore-[a-z0-9-]+$') { throw 'Use um projeto isolado chamado argos-restore-...' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$backupPath = [IO.Path]::GetFullPath($BackupDirectory)
if (-not (Test-Path -LiteralPath (Join-Path $backupPath 'database.dump')) -or -not (Test-Path -LiteralPath (Join-Path $backupPath 'keys.tar.gz'))) { throw 'Backup incompleto' }
$composeArguments = @('compose','--project-name',$ProjectName,'--env-file',(Join-Path $projectRoot 'infra/.env'),'-f',(Join-Path $projectRoot 'infra/compose.yaml'))
# Never replaces the live database or keys. Re-running requires a new isolated project name.
& docker @composeArguments up -d --wait db
if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar banco isolado' }
$databaseContainer = & docker @composeArguments ps -q db
$tables = & docker @composeArguments exec -T db psql -U argos -d argos -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
if ($tables.Trim() -ne '0') { throw 'Destino não está vazio; escolha outro ProjectName. Nenhum dado foi sobrescrito.' }
docker cp (Join-Path $backupPath 'database.dump') "${databaseContainer}:/tmp/restore.dump"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao copiar backup' }
& docker @composeArguments exec -T db pg_restore -U argos -d argos --exit-on-error /tmp/restore.dump
if ($LASTEXITCODE -ne 0) { throw 'Falha ao restaurar banco' }
& docker @composeArguments run --rm --no-deps --user root -v "${backupPath}:/backup:ro" api sh -c 'tar -xzf /backup/keys.tar.gz -C /app/data && chown -R node:node /app/data/keys'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao restaurar chaves' }
& docker @composeArguments run --rm --no-deps api node dist/verify-restore.js
if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler amostras restauradas' }
Write-Host "Restauração validada no projeto isolado $ProjectName. Banco/chaves originais não foram alterados."
