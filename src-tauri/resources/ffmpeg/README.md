# Bundled FFmpeg Resources

Packaged desktop builds should include reviewed FFmpeg and ffprobe binaries here so stream mode does not depend on a system install or network download.

Preferred layout:

```text
resources/ffmpeg/macos-aarch64/bin/ffmpeg
resources/ffmpeg/macos-aarch64/bin/ffprobe
resources/ffmpeg/macos-x86_64/bin/ffmpeg
resources/ffmpeg/macos-x86_64/bin/ffprobe
resources/ffmpeg/windows-x86_64/bin/ffmpeg.exe
resources/ffmpeg/windows-x86_64/bin/ffprobe.exe
resources/ffmpeg/linux-x86_64/bin/ffmpeg
resources/ffmpeg/linux-x86_64/bin/ffprobe
```

The desktop bridge also accepts flatter fallback layouts under `resources/ffmpeg/`, `resources/ffmpeg/bin/`, and `bin/` inside the packaged Tauri resource directory. `ASCILINE_FFMPEG` and `ASCILINE_FFPROBE` still override these paths for local development and CI.

Use the staging script so packaged sidecars are traceable:

```bash
npm run ffmpeg:stage -- --ffmpeg /path/to/ffmpeg --ffprobe /path/to/ffprobe --license LGPL-2.1-or-later --source "reviewed reproducible build notes"
npm run check:ffmpeg-resources
```

Each staged platform directory should contain `manifest.json` and `NOTICE.md` beside the `bin/` directory. Release packaging should run `npm run check:ffmpeg-release` for the current platform before shipping stream mode as standalone.
