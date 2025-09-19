param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OutFile = "backup_$(Get-Date -Format yyyyMMdd_HHmmss).sql"
)
if (-not $DatabaseUrl) { Write-Error 'DATABASE_URL required'; exit 1 }
& pg_dump $DatabaseUrl | Out-File -Encoding ascii $OutFile
Write-Output "Backup written to $OutFile"


