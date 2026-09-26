# Local Windows build: produces dist\SAR_Project_Controls_Dashboard\SAR_Project_Controls_Dashboard.exe
# and (if Inno Setup 6 is installed) dist\installer\SAR_Project_Controls_Dashboard_Setup_1.0.0.exe
# Usage (PowerShell, from the project folder):  .\build\build_windows.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt -r requirements-build.txt
$env:QT_QPA_PLATFORM = "offscreen"
.\.venv\Scripts\python -m pytest -q
Remove-Item Env:\QT_QPA_PLATFORM
.\.venv\Scripts\python -m sar_pcd demo --out samples
.\.venv\Scripts\pyinstaller build\sar_pcd.spec --noconfirm --distpath dist --workpath build\out
# smoke test of the frozen build
.\dist\SAR_Project_Controls_Dashboard\SAR_PCD_CLI.exe analyze --baseline samples\Demo_Baseline_Rev0.xer --current samples\Demo_Update_2025-11.xer --pdf dist\smoke.pdf
$iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
if (Test-Path $iscc) { & $iscc build\installer.iss } else { Write-Warning "Inno Setup 6 not found - installer skipped (https://jrsoftware.org/isinfo.php)" }
Write-Host "Done. Application: dist\SAR_Project_Controls_Dashboard\SAR_Project_Controls_Dashboard.exe"
