$ErrorActionPreference = "Continue"

Write-Host "SkillForge Docs - Cloudflare publish" -ForegroundColor Cyan

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Node.js/npx not found. Install Node.js first."
}

Write-Host "1/5 Cloudflare login..."
cmd /c "npx wrangler@latest whoami >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Opening Cloudflare login in your browser..." -ForegroundColor Yellow
  cmd /c "npx wrangler@latest login"
  if ($LASTEXITCODE -ne 0) {
    throw "Cloudflare login failed. Run: npx wrangler@latest login"
  }
}

cmd /c "npx wrangler@latest whoami"
if ($LASTEXITCODE -ne 0) {
  throw "Cloudflare is still not authenticated."
}

Write-Host "2/5 Creating D1..."
$d1 = cmd /c "npx wrangler@latest d1 create skillforge-docs" 2>&1 | Out-String
Write-Host $d1

$match = [regex]::Match($d1, 'database_id\s*=\s*"([^"]+)"')
if (-not $match.Success) {
  $match = [regex]::Match($d1, '([0-9a-fA-F]{8}-[0-9a-fA-F-]{27,})')
}

if (-not $match.Success) {
  Write-Host "D1 may already exist. Looking it up..." -ForegroundColor Yellow
  $list = cmd /c "npx wrangler@latest d1 list --json" 2>&1 | Out-String
  try {
    $rows = $list | ConvertFrom-Json
    $db = $rows | Where-Object { $_.name -eq "skillforge-docs" } | Select-Object -First 1
    if ($db) { $dbid = $db.uuid }
  } catch {}
} else {
  $dbid = $match.Groups[1].Value
}

if (-not $dbid) {
  throw "Could not determine the D1 database id. Run: npx wrangler@latest d1 list"
}

$wrangler = Get-Content wrangler.toml -Raw
$wrangler = [regex]::Replace($wrangler, 'database_id\s*=\s*"[^"]+"', ('database_id = "' + $dbid + '"'))
Set-Content -Path wrangler.toml -Value $wrangler -Encoding utf8

Write-Host "3/5 Creating R2 bucket..."
cmd /c "npx wrangler@latest r2 bucket create skillforge-skills"
if ($LASTEXITCODE -ne 0) {
  Write-Host "R2 bucket may already exist; continuing." -ForegroundColor Yellow
}

Write-Host "4/5 Applying D1 schema..."
cmd /c "npx wrangler@latest d1 execute skillforge-docs --remote --file=schema.sql"
if ($LASTEXITCODE -ne 0) {
  throw "Failed applying D1 schema."
}

Write-Host "5/5 Deploying Python Worker..."
cmd /c "npx wrangler@latest deploy"
if ($LASTEXITCODE -ne 0) {
  throw "Cloudflare deploy failed."
}

Write-Host ""
Write-Host "Published successfully. Use the workers.dev URL shown above." -ForegroundColor Green
