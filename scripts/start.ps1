$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (!(Test-Path -LiteralPath node_modules)) { npm ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npm run dev
