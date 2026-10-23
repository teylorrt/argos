param([switch]$Release)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.tools/gradle-home'
$target = ':app:assembleDebug'
if ($Release) {
    $signingDirectory = Join-Path $projectRoot '.tools/signing'
    New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
    $env:ARGOS_KEYSTORE = Join-Path $signingDirectory 'argos-release.p12'
    $passwordFile = Join-Path $signingDirectory 'password'
    if (-not (Test-Path -LiteralPath $env:ARGOS_KEYSTORE)) {
        if (Test-Path -LiteralPath $passwordFile) { throw 'Senha existe mas keystore está ausente: restaure o backup da chave.' }
        $bytes = New-Object byte[] 32
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        $generator.GetBytes($bytes); $generator.Dispose()
        $env:ARGOS_STORE_PASSWORD = [Convert]::ToBase64String($bytes)
        [IO.File]::WriteAllText($passwordFile, $env:ARGOS_STORE_PASSWORD)
        & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $env:ARGOS_KEYSTORE -storetype PKCS12 -storepass:env ARGOS_STORE_PASSWORD -alias argos -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Argos Personal'
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar assinatura' }
    }
    $env:ARGOS_STORE_PASSWORD = [IO.File]::ReadAllText($passwordFile)
    $target = ':app:assembleRelease'
}
try {
    & (Join-Path $projectRoot 'android/gradlew.bat') -p (Join-Path $projectRoot 'android') $target
    if ($LASTEXITCODE -ne 0) { throw 'Build Android falhou' }
} finally { $env:ARGOS_STORE_PASSWORD = $null; $env:ARGOS_KEYSTORE = $null }
Write-Host 'APKs em android/app/build/outputs/apk/. Faça backup de .tools/signing para preservar atualizações release.'
