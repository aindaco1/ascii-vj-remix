# Linux VM QA

The release-candidate Linux matrix uses two x86_64 Hyper-V guests on the
Windows 11 Pro test machine:

- Ubuntu 26.04.1 for AppImage and deb acceptance.
- Fedora 44 Workstation for AppImage and rpm acceptance.

The VMs complement the pinned Ubuntu 24.04 CI build by exercising the packages
on Ubuntu 26.04.1 and Fedora 44. They do not establish physical Linux camera,
audio, or GPU acceptance; Hyper-V exposes virtualized display and input
hardware.

## Create the VMs

1. In **Turn Windows features on or off**, enable Hyper-V, including its
   Management Tools and Platform, then restart Windows.
2. Download the x86_64 desktop ISOs from the official Ubuntu and Fedora
   download pages.
3. Open PowerShell as Administrator from the repository checkout and run:

```powershell
.\scripts\windows\New-AsciiVjLinuxTestVms.ps1 `
  -UbuntuIso "C:\Users\you\Downloads\ubuntu-26.04.1-desktop-amd64.iso" `
  -FedoraIso "C:\Users\you\Downloads\Fedora-Workstation-Live-x86_64-44.iso" `
  -StartAfterCreation
```

The script creates `ASCII-VJ-Ubuntu-26.04.1` and `ASCII-VJ-Fedora-44` with four
virtual processors, 8 GB startup memory, an 80 GB dynamic disk, Secure Boot,
and production checkpoints. It refuses to replace an existing VM or storage
directory.

If the Ubuntu guest was created with the earlier helper while already pointing
at an Ubuntu 26.04.1 ISO, rename its Hyper-V display name before installation:

```powershell
Rename-VM `
  -Name "ASCII-VJ-Ubuntu-24.04" `
  -NewName "ASCII-VJ-Ubuntu-26.04.1"
```

Renaming the VM does not move or replace its virtual disk.

Complete each graphical installer, confirm Ubuntu reports version 26.04.1 and
Fedora reports version 44, apply operating-system updates, install the Hyper-V
integration packages offered by the distro, and take a checkpoint named
`clean-updated` before installing ASCII VJ Remix.

## Retrieve test packages

Every same-repository pull request builds an updater-disabled `ASCII VJ Remix
Dev` package set from the exact commit under test. Download the
`ascii-vj-remix-linux-test-<commit>` workflow artifact. It contains AppImage,
deb, and rpm packages and installs separately from the production identity.

For Ubuntu, install the deb and also exercise the AppImage:

```bash
sudo apt install ./ascii-vj-remix-dev_*.deb
chmod +x ./ASCII-VJ-Remix-Dev_*.AppImage
./ASCII-VJ-Remix-Dev_*.AppImage
```

For Fedora, install the rpm and also exercise the AppImage:

```bash
sudo dnf install ./ascii-vj-remix-dev-*.rpm
chmod +x ./ASCII-VJ-Remix-Dev_*.AppImage
./ASCII-VJ-Remix-Dev_*.AppImage
```

Use the actual artifact filenames if Tauri's package naming differs. Preserve
the downloaded workflow artifact and commit SHA in the QA record.

## Acceptance pass

For each VM/package combination, record the OS version, desktop session
(Wayland or X11), package name, commit SHA, and active renderer. Verify:

1. Install, first launch, normal relaunch, and clean uninstall.
2. Classic Camera ASCII is the clean-profile default and Demo Image is visible.
3. Preset search filters live; Built-in and My Presets are independently
   alphabetical; Dense Color ASCII is present.
4. The bundled VP8/WebM Demo Video and a user-selected MP4 play without network
   access. The selected MP4 may retry through bundled FFmpeg when the webview
   lacks an H.264 codec.
5. The first window opens centered at 1000x680. Palette, Dither, Glyph,
   Advanced Density warning, and all visible select controls remain aligned and
   usable after resizing to 900x600, 1024x720, and 1440x920.
6. Stats Overlay reports the resolved backend and no persistent blank frame.
   WebGL2 is an accepted Hyper-V fallback when WebGPU is unavailable, provided
   animation remains visible, responsive, and stable.
7. Pop Out opens, remains responsive, mirrors preset changes, and closes cleanly.
8. Reports remains reachable and contains no selected-media path or arbitrary
   application log.
9. The development build does not offer production updater installation.

Starting microphone reactivity without an attached virtual microphone should
show an unavailable-device status and must not queue a diagnostic report. This
is error-handling acceptance only; it does not establish microphone capture.

Revert to `clean-updated` between package formats. Treat virtual camera,
microphone, system audio, discrete-GPU performance, and projector behavior as
not tested unless those devices are explicitly passed through and exercised.
