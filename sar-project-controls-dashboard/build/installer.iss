; Inno Setup 6 script - builds SAR_Project_Controls_Dashboard_Setup_<version>.exe
; Compile after PyInstaller:  iscc build\installer.iss
#define AppName "SAR Project Controls Dashboard"
#define AppVersion "1.0.0"
#define AppExe "SAR_Project_Controls_Dashboard.exe"

[Setup]
AppId={{8C1B7E0B-6C1E-4E0B-9A3E-5A0C7B2F1D11}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=SAR Project Controls
DefaultDirName={autopf}\SAR Project Controls Dashboard
DefaultGroupName=SAR Project Controls Dashboard
OutputDir=..\dist\installer
OutputBaseFilename=SAR_Project_Controls_Dashboard_Setup_{#AppVersion}
SetupIconFile=..\sar_pcd\resources\app.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
PrivilegesRequiredOverridesAllowed=dialog
WizardStyle=modern
ChangesAssociations=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "assoc"; Description: "Open .sarpcd project files with {#AppName}"; GroupDescription: "File association:"

[Files]
Source: "..\dist\SAR_Project_Controls_Dashboard\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\{#AppName} (Demo Project)"; Filename: "{app}\{#AppExe}"; Parameters: "--demo"
Name: "{group}\User Guide"; Filename: "{app}\_internal\docs\USER_GUIDE.md"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
Root: HKA; Subkey: "Software\Classes\.sarpcd"; ValueType: string; ValueName: ""; ValueData: "SARPCD.Project"; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\SARPCD.Project"; ValueType: string; ValueName: ""; ValueData: "SAR Project Controls Project"; Flags: uninsdeletekey; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\SARPCD.Project\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExe},0"; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\SARPCD.Project\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExe}"" ""%1"""; Tasks: assoc

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
