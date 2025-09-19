param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$DumpFile
)
if (-not $DatabaseUrl) { Write-Error 'DATABASE_URL required'; exit 1 }
if (-not (Test-Path $DumpFile)) { Write-Error "Dump file not found: $DumpFile"; exit 1 }
Get-Content $DumpFile | & psql $DatabaseUrl
Write-Output "Restore completed from $DumpFile"


