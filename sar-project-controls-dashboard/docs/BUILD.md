# Build Instructions

## Requirements

* Windows 10/11 64-bit build machine
* Python 3.12 (64-bit) - `py -3.12`
* Inno Setup 6 (for the installer) - https://jrsoftware.org/isinfo.php

End users need **nothing** installed: the output bundles Python, Qt and all libraries.

## One command

```powershell
cd sar-project-controls-dashboard
.\build\build_windows.ps1
```

This creates a virtual environment, installs `requirements.txt` + `requirements-build.txt`, runs the
test suite, writes the demo XERs to `samples\`, freezes the application with PyInstaller, smoke-tests
the frozen CLI and compiles the installer.

Outputs:

| File | Purpose |
|---|---|
| `dist\SAR_Project_Controls_Dashboard\SAR_Project_Controls_Dashboard.exe` | Desktop application (portable folder) |
| `dist\SAR_Project_Controls_Dashboard\SAR_PCD_CLI.exe` | Console tool (`analyze`, `demo`) |
| `dist\installer\SAR_Project_Controls_Dashboard_Setup_1.0.0.exe` | Installer: Start-menu + desktop shortcuts, `.sarpcd` file association, uninstaller |

## Manual steps

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt -r requirements-build.txt
.\.venv\Scripts\python -m pytest -q                    # set QT_QPA_PLATFORM=offscreen on headless machines
.\.venv\Scripts\python -m sar_pcd                       # run from source
.\.venv\Scripts\pyinstaller build\sar_pcd.spec --noconfirm --distpath dist --workpath build\out
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" build\installer.iss
```

## Continuous integration

`.github/workflows/sar-pcd-windows.yml` (repository root) runs the same steps on `windows-latest` for
every push touching `sar-project-controls-dashboard/` and uploads two artifacts: the portable folder
and the installer.

## Versioning

Update the version in `sar_pcd/__init__.py`, `pyproject.toml`, `build/version_info.txt` and
`build/installer.iss` (`AppVersion`).

## Code signing (recommended for distribution)

Sign both EXEs and the installer with your organisation's certificate, e.g.
`signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a <file>`,
to avoid SmartScreen warnings.
