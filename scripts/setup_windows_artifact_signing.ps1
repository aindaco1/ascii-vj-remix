$ErrorActionPreference = "Stop"

function Has-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Has-Command "cargo")) {
    throw "cargo is required to install artifact-signing-cli for Windows public release signing."
}

if (-not (Has-Command "trusted-signing-cli")) {
    cargo install artifact-signing-cli --locked
}

$tool = Get-Command "trusted-signing-cli" -ErrorAction Stop
Write-Host "Using trusted-signing-cli at $($tool.Source)"
