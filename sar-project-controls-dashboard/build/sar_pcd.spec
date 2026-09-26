# PyInstaller spec - builds a one-folder Windows distribution containing
#   SAR_Project_Controls_Dashboard.exe  (desktop application, no console)
#   SAR_PCD_CLI.exe                     (command-line analyze / demo, console)
# Run from the project root:  pyinstaller build/sar_pcd.spec --noconfirm
import os

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
ICON = os.path.join(ROOT, "sar_pcd", "resources", "app.ico")
VERSION = os.path.join(ROOT, "build", "version_info.txt")

datas = [
    (os.path.join(ROOT, "sar_pcd", "resources"), "resources"),
    (os.path.join(ROOT, "sar_pcd", "config"), "config"),
    (os.path.join(ROOT, "docs"), "docs"),
    (os.path.join(ROOT, "samples"), "samples"),
]
excludes = ["tkinter", "PySide6.QtWebEngineCore", "PySide6.QtWebEngineWidgets", "PySide6.Qt3DCore",
            "PySide6.QtQuick", "PySide6.QtQml", "PySide6.QtMultimedia", "PySide6.QtBluetooth",
            "PySide6.QtPositioning", "PySide6.QtSql", "PySide6.QtCharts", "PySide6.QtDataVisualization",
            "matplotlib.backends.backend_tkagg", "IPython", "pytest"]

a = Analysis([os.path.join(ROOT, "build", "launcher.py")], pathex=[ROOT], datas=datas,
             hiddenimports=["matplotlib.backends.backend_qtagg", "rapidfuzz.fuzz", "openpyxl", "reportlab"],
             excludes=excludes, noarchive=False)
pyz = PYZ(a.pure)

gui = EXE(pyz, a.scripts, [], exclude_binaries=True, name="SAR_Project_Controls_Dashboard",
          icon=ICON, version=VERSION, console=False, upx=False)
cli = EXE(pyz, a.scripts, [], exclude_binaries=True, name="SAR_PCD_CLI",
          icon=ICON, version=VERSION, console=True, upx=False)
coll = COLLECT(gui, cli, a.binaries, a.datas, strip=False, upx=False, name="SAR_Project_Controls_Dashboard")
