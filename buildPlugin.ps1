$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& npm.cmd run typecheck
if ($LASTEXITCODE) { throw 'Typecheck failed' }
& npm.cmd test -- --runInBand
if ($LASTEXITCODE) { throw 'Tests failed' }
& node scripts/preview.cjs
if ($LASTEXITCODE) { throw 'Preview generation failed' }
& npx.cmd react-native bundle --platform android --dev false --entry-file index.js --bundle-output build/generated/supernote_math_llm.bundle --assets-dest build/generated --max-workers 2
if ($LASTEXITCODE) { throw 'JS bundle failed' }
Push-Location android
try {
  & .\gradlew.bat buildCustomApkDebug '-PreactNativeArchitectures=arm64-v8a' --no-daemon --max-workers=4 --console=plain
  if ($LASTEXITCODE) { throw 'Native build failed' }
} finally { Pop-Location }
& "$PSScriptRoot/scripts/package.ps1"

