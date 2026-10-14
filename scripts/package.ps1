$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$generated = Join-Path $root 'build/generated'
$apk = Join-Path $root 'android/app/build/outputs/apk/debug/app-debug-custom.apk'
$config = Get-Content (Join-Path $root 'PluginConfig.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.pluginID -ne 'snmllm4e9a6c2f8b' -or $config.pluginKey -ne 'supernote_math_llm') { throw 'Unexpected plugin identity' }
if (-not (Test-Path $apk) -or -not (Test-Path (Join-Path $generated 'supernote_math_llm.bundle'))) { throw 'Run native build and JS bundle first' }
$autolinking = Get-Content (Join-Path $root 'android/build/generated/autolinking/autolinking.json') -Raw | ConvertFrom-Json
$packages = @($autolinking.dependencies.PSObject.Properties | Where-Object {$_.Name -ne 'sn-plugin-lib'} | ForEach-Object {
  $import = $_.Value.platforms.android.packageImportPath
  if ($import -notmatch '^import ([\w.]+);$') { throw "Unexpected native import: $import" }
  $Matches[1]
} | Sort-Object -Unique)
$packages += 'com.supernote_math_llm.MathKeyPackage'
if ('com.horcrux.svg.SvgPackage' -notin $packages) { throw 'Native SVG renderer missing' }
Copy-Item $apk (Join-Path $generated 'app.npk') -Force
Copy-Item (Join-Path $root 'assets/math.png') (Join-Path $generated 'math.png') -Force
$config.iconPath = '/math.png'
$config | Add-Member nativeCodePackage '/app.npk' -Force
$config | Add-Member reactPackages $packages -Force
[IO.File]::WriteAllText((Join-Path $generated 'PluginConfig.json'), ($config | ConvertTo-Json -Depth 10))
$outputDir = Join-Path $root 'build/outputs'
New-Item -ItemType Directory -Force $outputDir | Out-Null
$output = Join-Path $outputDir "supernote_math_llm_$($config.versionName).snplg"
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $output) { Remove-Item -LiteralPath $output }
[IO.Compression.ZipFile]::CreateFromDirectory($generated, $output, [IO.Compression.CompressionLevel]::Optimal, $false)
Write-Output $output


