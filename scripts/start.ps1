$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $projectRoot 'infra/.env'
if (-not (Test-Path -LiteralPath $environmentFile)) {
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    function New-ArgosSecret {
        $bytes = New-Object byte[] 32
        $generator.GetBytes($bytes)
        return ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_'))
    }
    $password = New-ArgosSecret
    $ownerToken = New-ArgosSecret
    [IO.File]::WriteAllText($environmentFile, "POSTGRES_PASSWORD=$password`nOWNER_TOKEN=$ownerToken`nRETENTION_DAYS=90`nCOOKIE_SECURE=false`n")
    $generator.Dispose()
}
docker compose --project-name argos --env-file $environmentFile -f (Join-Path $projectRoot 'infra/compose.yaml') up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose falhou' }
Write-Host 'Argos: http://localhost:3000'
Write-Host 'A chave de login OWNER_TOKEN fica em infra/.env (arquivo ignorado pelo Git).'
Write-Host 'Android via USB: adb reverse tcp:3000 tcp:3000; configure http://127.0.0.1:3000 no APK debug.'
