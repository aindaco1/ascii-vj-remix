$ErrorActionPreference = "Stop"

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Path
)

function Require-Env {
    param([string]$Name)
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Name is required for Windows Artifact Signing."
    }
    return $value
}

$resolvedPath = Resolve-Path -LiteralPath $Path -ErrorAction Stop
$endpoint = Require-Env "AZURE_ARTIFACT_SIGNING_ENDPOINT"
$account = Require-Env "AZURE_ARTIFACT_SIGNING_ACCOUNT"
$profile = Require-Env "AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE"
$description = [Environment]::GetEnvironmentVariable("AZURE_ARTIFACT_SIGNING_DESCRIPTION")
if ([string]::IsNullOrWhiteSpace($description)) {
    $description = "ASCII VJ Remix"
}

$tool = Get-Command "trusted-signing-cli" -ErrorAction Stop
Write-Host "Authenticode signing $resolvedPath"
& $tool.Source `
    -e $endpoint `
    -a $account `
    -c $profile `
    -d $description `
    $resolvedPath

if ($LASTEXITCODE -ne 0) {
    throw "trusted-signing-cli failed with exit code $LASTEXITCODE"
}
