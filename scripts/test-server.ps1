$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$existing = docker ps -a --filter name=^argos-integration-db$ --format '{{.Names}}'
if (-not $existing) {
    docker run --name argos-integration-db -e POSTGRES_USER=argos -e POSTGRES_PASSWORD=argos-test-only -e POSTGRES_DB=argos_test -p 127.0.0.1:55432:5432 -d postgres:17.6-alpine
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar banco de teste' }
} else { docker start argos-integration-db | Out-Null }
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec argos-integration-db pg_isready -U argos -d argos_test 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'Banco de teste não ficou disponível' }
$env:TEST_DATABASE_URL = 'postgres://argos:argos-test-only@127.0.0.1:55432/argos_test'
Push-Location (Join-Path $projectRoot 'server')
$previousPath = $env:Path
$localNode = Join-Path $projectRoot '.tools/node/node_modules/node/bin'
if (Test-Path -LiteralPath (Join-Path $localNode 'node.exe')) { $env:Path = "$localNode;$env:Path" }
try {
    $nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) { throw 'Instale Node 24 LTS antes de executar os testes locais.' }
    $npmCli = Join-Path (Split-Path -Parent (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js'
    & node $npmCli ci
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências' }
    & node $npmCli run build
    if ($LASTEXITCODE -ne 0) { throw 'Falha de compilação' }
    & node $npmCli test
    if ($LASTEXITCODE -ne 0) { throw 'Testes falharam' }
} finally { Pop-Location; $env:TEST_DATABASE_URL = $null; $env:Path = $previousPath }
