$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ToolchainRoot = Join-Path $RepoRoot "data\toolchains\windows"
$DownloadsDir = Join-Path $ToolchainRoot "downloads"
$JdkRoot = Join-Path $ToolchainRoot "jdk"
$AndroidHome = Join-Path $ToolchainRoot "android-sdk"
$CmdlineToolsRoot = Join-Path $AndroidHome "cmdline-tools"
$CmdlineToolsLatest = Join-Path $CmdlineToolsRoot "latest"

$JdkZip = Join-Path $DownloadsDir "temurin-jdk17.zip"
$AndroidToolsZip = Join-Path $DownloadsDir "android-commandlinetools-win.zip"
$JdkUrl = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"
$AndroidToolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"

function Convert-ToEnvPath {
  param([string] $Value)
  return $Value.Replace("\", "/")
}

function Set-DotEnvValue {
  param(
    [string] $Path,
    [string] $Name,
    [string] $Value
  )

  $line = "$Name=`"$Value`""
  if (!(Test-Path $Path)) {
    New-Item -ItemType File -Path $Path -Force | Out-Null
  }

  $content = Get-Content $Path -ErrorAction SilentlyContinue
  $pattern = "^$([regex]::Escape($Name))="

  if ($content | Where-Object { $_ -match $pattern }) {
    $content = $content | ForEach-Object {
      if ($_ -match $pattern) {
        $line
      } else {
        $_
      }
    }
  } else {
    $content = @($content) + $line
  }

  Set-Content -Path $Path -Value $content
}

New-Item -ItemType Directory -Force -Path $ToolchainRoot, $DownloadsDir, $JdkRoot, $AndroidHome, $CmdlineToolsRoot | Out-Null

if (!(Test-Path (Join-Path $JdkRoot "bin\java.exe"))) {
  if (!(Test-Path $JdkZip)) {
    Write-Host "Downloading Temurin JDK 17..."
    Invoke-WebRequest -Uri $JdkUrl -OutFile $JdkZip
  }

  Write-Host "Extracting JDK 17..."
  $JdkExtractTemp = Join-Path $ToolchainRoot "jdk-extract"
  Remove-Item -Recurse -Force -Path $JdkExtractTemp -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $JdkExtractTemp | Out-Null
  Expand-Archive -Path $JdkZip -DestinationPath $JdkExtractTemp -Force
  $ExtractedJdk = Get-ChildItem $JdkExtractTemp -Directory | Where-Object { $_.Name -like "jdk-*" } | Select-Object -First 1

  if (!$ExtractedJdk) {
    throw "Could not find extracted JDK directory"
  }

  Remove-Item -Recurse -Force -Path $JdkRoot -ErrorAction SilentlyContinue
  Move-Item -Path $ExtractedJdk.FullName -Destination $JdkRoot
  Remove-Item -Recurse -Force -Path $JdkExtractTemp
}

if (!(Test-Path (Join-Path $CmdlineToolsLatest "bin\sdkmanager.bat"))) {
  if (!(Test-Path $AndroidToolsZip)) {
    Write-Host "Downloading Android command line tools..."
    Invoke-WebRequest -Uri $AndroidToolsUrl -OutFile $AndroidToolsZip
  }

  Write-Host "Extracting Android command line tools..."
  $AndroidExtractTemp = Join-Path $ToolchainRoot "android-tools-extract"
  Remove-Item -Recurse -Force -Path $AndroidExtractTemp -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $AndroidExtractTemp | Out-Null
  Expand-Archive -Path $AndroidToolsZip -DestinationPath $AndroidExtractTemp -Force
  New-Item -ItemType Directory -Force -Path $CmdlineToolsRoot | Out-Null
  Remove-Item -Recurse -Force -Path $CmdlineToolsLatest -ErrorAction SilentlyContinue
  Move-Item -Path (Join-Path $AndroidExtractTemp "cmdline-tools") -Destination $CmdlineToolsLatest
  Remove-Item -Recurse -Force -Path $AndroidExtractTemp
}

$JavaHome = Convert-ToEnvPath $JdkRoot
$AndroidHomeEnv = Convert-ToEnvPath $AndroidHome
$SdkManager = Join-Path $CmdlineToolsLatest "bin\sdkmanager.bat"
$GitBash = "C:\Program Files\Git\bin\bash.exe"

$env:JAVA_HOME = $JdkRoot
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_SDK_ROOT = $AndroidHome
$env:PATH = "$JdkRoot\bin;$CmdlineToolsLatest\bin;$AndroidHome\platform-tools;$AndroidHome\build-tools\35.0.0;$env:PATH"

Write-Host "Accepting Android SDK licenses..."
$licenseAnswers = "y`n" * 200
$licenseAnswers | & $SdkManager "--sdk_root=$AndroidHome" --licenses

Write-Host "Installing Android SDK packages..."
& $SdkManager "--sdk_root=$AndroidHome" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

Write-Host "Re-checking Android SDK licenses..."
$licenseAnswers | & $SdkManager "--sdk_root=$AndroidHome" --licenses

$EnvPath = Join-Path $RepoRoot ".env"
if (!(Test-Path $EnvPath) -and (Test-Path (Join-Path $RepoRoot ".env.example"))) {
  Copy-Item -Path (Join-Path $RepoRoot ".env.example") -Destination $EnvPath
}

Set-DotEnvValue -Path $EnvPath -Name "QUEUE_MODE" -Value "sqlite"
Set-DotEnvValue -Path $EnvPath -Name "RUNNER_MODE" -Value "local"
Set-DotEnvValue -Path $EnvPath -Name "LOCAL_JAVA_HOME" -Value $JavaHome
Set-DotEnvValue -Path $EnvPath -Name "LOCAL_ANDROID_HOME" -Value $AndroidHomeEnv

if (Test-Path $GitBash) {
  Set-DotEnvValue -Path $EnvPath -Name "LOCAL_BASH_PATH" -Value (Convert-ToEnvPath $GitBash)
}

Write-Host ""
Write-Host "Windows local toolchain is ready."
Write-Host "Updated .env with QUEUE_MODE=sqlite and RUNNER_MODE=local."
Write-Host "Run: pnpm db:init"
