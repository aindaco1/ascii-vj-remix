[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$UbuntuIso,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$FedoraIso,

    [string]$VmRoot = "C:\Hyper-V\ASCII-VJ-Remix",
    [string]$SwitchName = "Default Switch",
    [ValidateRange(2, 32)]
    [int]$ProcessorCount = 4,
    [ValidateRange(4, 64)]
    [int]$StartupMemoryGb = 8,
    [ValidateRange(32, 512)]
    [int]$DiskSizeGb = 80,
    [switch]$StartAfterCreation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $isAdministrator = $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if (-not $isAdministrator) {
        throw "Run this script from an Administrator PowerShell session."
    }
}

function New-AsciiVjLinuxVm {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$IsoPath
    )

    $existing = Get-VM -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Warning "VM '$Name' already exists; leaving it unchanged."
        return $existing
    }

    $vmDirectory = Join-Path $VmRoot $Name
    $diskPath = Join-Path $vmDirectory "$Name.vhdx"
    if ((Test-Path -LiteralPath $diskPath) -or (Test-Path -LiteralPath $vmDirectory)) {
        throw "Refusing to reuse existing VM storage: $vmDirectory"
    }

    if (-not $PSCmdlet.ShouldProcess($Name, "Create Hyper-V Linux QA VM")) {
        return
    }

    New-Item -ItemType Directory -Path $vmDirectory | Out-Null
    New-VHD -Path $diskPath -Dynamic -SizeBytes ($DiskSizeGb * 1GB) | Out-Null

    $vm = New-VM `
        -Name $Name `
        -Generation 2 `
        -MemoryStartupBytes ($StartupMemoryGb * 1GB) `
        -VHDPath $diskPath `
        -Path $VmRoot `
        -SwitchName $SwitchName

    Set-VMProcessor -VM $vm -Count $ProcessorCount
    Set-VMMemory `
        -VM $vm `
        -DynamicMemoryEnabled $true `
        -MinimumBytes 4GB `
        -StartupBytes ($StartupMemoryGb * 1GB) `
        -MaximumBytes 16GB
    Set-VM `
        -VM $vm `
        -AutomaticCheckpointsEnabled $true `
        -CheckpointType Production `
        -AutomaticStopAction ShutDown

    $dvd = Add-VMDvdDrive -VM $vm -Path $IsoPath -Passthru
    Set-VMFirmware `
        -VM $vm `
        -EnableSecureBoot On `
        -SecureBootTemplate MicrosoftUEFICertificateAuthority `
        -FirstBootDevice $dvd

    if ($StartAfterCreation) {
        Start-VM -VM $vm | Out-Null
    }

    return $vm
}

Assert-Administrator

if (-not (Get-Command New-VM -ErrorAction SilentlyContinue)) {
    throw "Hyper-V PowerShell is unavailable. Enable Hyper-V, restart Windows, and retry."
}
if (-not (Get-VMSwitch -Name $SwitchName -ErrorAction SilentlyContinue)) {
    throw "Hyper-V switch '$SwitchName' was not found. Pass -SwitchName with an existing switch."
}

$ubuntu = New-AsciiVjLinuxVm `
    -Name "ASCII-VJ-Ubuntu-26.04.1" `
    -IsoPath (Resolve-Path -LiteralPath $UbuntuIso)
$fedora = New-AsciiVjLinuxVm `
    -Name "ASCII-VJ-Fedora-44" `
    -IsoPath (Resolve-Path -LiteralPath $FedoraIso)

@($ubuntu, $fedora) |
    Where-Object { $null -ne $_ } |
    Select-Object Name, State, Generation, ProcessorCount, MemoryStartup |
    Format-Table -AutoSize

Write-Host "Next: open Hyper-V Manager, install Ubuntu 26.04.1 and Fedora 44, apply updates, then create a 'clean-updated' checkpoint before installing ASCII VJ Remix."
