$ErrorActionPreference = "Stop"

Write-Host "SkillForge Docs - publicação Cloudflare" -ForegroundColor Cyan

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Node.js/npx não encontrado. Instale Node.js primeiro."
}

Write-Host "1/5 Autenticando no Cloudflare..."
npx wrangler@latest whoami
if ($LASTEXITCODE -ne 0) {
  npx wrangler@latest login
}

Write-Host "2/5 Criando D1..."
$d1 = npx wrangler@latest d1 create skillforge-docs 2>&1 | Out-String
Write-Host $d1
$match = [regex]::Match($d1, 'database_id\s*=\s*"([^"]+)"')
if (-not $match.Success) {
  $match = [regex]::Match($d1, '([0-9a-fA-F]{8}-[0-9a-fA-F-]{27,})')
}
if (-not $match.Success) {
  throw "Não consegui identificar o database_id. Se o banco já existir, rode: npx wrangler d1 list"
}
$dbid = $match.Groups[1].Value

(Get-Content wrangler.toml -Raw).Replace("REPLACE_WITH_D1_DATABASE_ID", $dbid) | Set-Content wrangler.toml

Write-Host "3/5 Criando bucket R2..."
npx wrangler@latest r2 bucket create skillforge-skills
if ($LASTEXITCODE -ne 0) { Write-Host "Bucket pode já existir; continuando." -ForegroundColor Yellow }

Write-Host "4/5 Aplicando schema D1..."
npx wrangler@latest d1 execute skillforge-docs --remote --file=schema.sql

Write-Host "5/5 Publicando Worker Python..."
npx wrangler@latest deploy

Write-Host ""
Write-Host "Publicado. Copie a URL workers.dev exibida acima." -ForegroundColor Green
