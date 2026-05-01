$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

pnpm db:init

$Api = Start-Process powershell `
  -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "cd '$RepoRoot'; pnpm --filter api dev" `
  -WindowStyle Hidden `
  -PassThru

$Worker = Start-Process powershell `
  -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "cd '$RepoRoot'; pnpm --filter worker dev" `
  -WindowStyle Hidden `
  -PassThru

Write-Host "API started at http://localhost:3000"
Write-Host "API PID: $($Api.Id)"
Write-Host "Worker PID: $($Worker.Id)"
Write-Host "Stop with:"
Write-Host "  Stop-Process -Id $($Api.Id),$($Worker.Id)"
