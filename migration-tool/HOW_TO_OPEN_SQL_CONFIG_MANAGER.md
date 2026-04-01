# How to Open SQL Server Configuration Manager

SQL Server Configuration Manager can be tricky to find. Here are several ways to open it:

## Method 1: Search in Start Menu (Easiest)

1. Press **Windows Key** or click **Start**
2. Type: `SQL Server Configuration Manager`
3. Click on the result that appears

## Method 2: Using Run Dialog

1. Press **Win + R** to open Run dialog
2. Type: `SQLServerManager16.msc` (for SQL Server 2022)
   - Or try: `SQLServerManager15.msc` (for SQL Server 2019)
   - Or try: `SQLServerManager14.msc` (for SQL Server 2017)
   - Or try: `SQLServerManager13.msc` (for SQL Server 2016)
3. Press **Enter**

## Method 3: From File Explorer

1. Open **File Explorer**
2. Navigate to: `C:\Windows\SysWOW64`
3. Look for files starting with `SQLServerManager` (e.g., `SQLServerManager16.msc`)
4. Double-click the appropriate version for your SQL Server

## Method 4: Command Prompt / PowerShell

```powershell
# For SQL Server 2022
& "C:\Windows\SysWOW64\SQLServerManager16.msc"

# Or try these if 16 doesn't work:
& "C:\Windows\SysWOW64\SQLServerManager15.msc"  # 2019
& "C:\Windows\SysWOW64\SQLServerManager14.msc"  # 2017
& "C:\Windows\SysWOW64\SQLServerManager13.msc"  # 2016
```

## Once Configuration Manager is Open:

1. In the left panel, expand: **SQL Server Network Configuration**
2. You'll see one or more entries like:
   - **Protocols for MSSQLSERVER** (Default instance)
   - **Protocols for MSSQLSERVER2022** (Named instance)
   - **Protocols for SQLEXPRESS** (Express edition)
3. Click on the instance you want to configure
4. In the right panel, you'll see protocols like:
   - **Shared Memory**
   - **Named Pipes**
   - **TCP/IP** ← This is what you need to enable
   - **VIA** (usually disabled)

## Quick PowerShell Command to Open It:

Run this in PowerShell to automatically find and open the correct version:

```powershell
$configManager = Get-ChildItem "C:\Windows\SysWOW64\SQLServerManager*.msc" | Sort-Object Name -Descending | Select-Object -First 1
if ($configManager) {
    Start-Process $configManager.FullName
    Write-Host "Opened: $($configManager.Name)"
} else {
    Write-Host "SQL Server Configuration Manager not found. Make sure SQL Server is installed."
}
```

## If You Can't Find It:

**SQL Server Configuration Manager might not be installed** if you only installed SQL Server Express or a minimal installation.

**Alternative:** You can enable TCP/IP using SQL Server Management Studio (SSMS) and T-SQL, but Configuration Manager is the recommended way.

## Visual Guide:

```
SQL Server Configuration Manager
├── SQL Server Services
│   └── (List of SQL Server services)
│
└── SQL Server Network Configuration
    ├── Protocols for MSSQLSERVER        ← Click here for default instance
    │   ├── Shared Memory
    │   ├── Named Pipes
    │   ├── TCP/IP                      ← Right-click this → Enable
    │   └── VIA
    │
    └── Protocols for MSSQLSERVER2022    ← Or click here for named instance
        ├── Shared Memory
        ├── Named Pipes
        ├── TCP/IP                      ← Right-click this → Enable
        └── VIA
```

## After Enabling TCP/IP:

1. **Right-click TCP/IP** → **Enable**
2. **Double-click TCP/IP** to open properties
3. Go to **IP Addresses** tab
4. Scroll down to **IPAll** section
5. Set **TCP Port** to `1433` (or leave blank for dynamic)
6. Click **OK**
7. **IMPORTANT:** Restart SQL Server service for changes to take effect!

## Restart SQL Server Service:

1. In Configuration Manager, go to **SQL Server Services** (left panel)
2. Find **SQL Server (MSSQLSERVER)** or **SQL Server (MSSQLSERVER2022)**
3. Right-click → **Restart**

Or use Services:
1. Press **Win + R** → Type `services.msc` → Press Enter
2. Find **SQL Server (MSSQLSERVER)** or **SQL Server (MSSQLSERVER2022)**
3. Right-click → **Restart**














































