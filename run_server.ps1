$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "No se encontró Node.js. Instale Node.js 22.13 o superior y vuelva a ejecutar este archivo." -ForegroundColor Red
    exit 1
}

& $node.Source (Join-Path $PSScriptRoot "server.js")
