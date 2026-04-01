# MS SQL Server Connection Troubleshooting Guide

This guide helps you fix common MS SQL Server connection issues when using the migration tool.

## Quick Diagnostic Script

Run the PowerShell script to automatically check your SQL Server setup:

```powershell
cd C:\Totilove_split\migration-tool
.\check-mssql-connection.ps1
```

## Common Issues and Solutions

### 1. "Could not connect (sequence)" Error

**Cause:** SQL Server is not accessible or TCP/IP is not enabled.

**Solution:**
1. Open **SQL Server Configuration Manager**
2. Navigate to: `SQL Server Network Configuration` → `Protocols for [YOUR_INSTANCE]`
3. Right-click **TCP/IP** → **Enable**
4. Double-click **TCP/IP** → Go to **IP Addresses** tab
5. Scroll to **IPAll** section
6. Set **TCP Port** to `1433` (or leave blank for dynamic)
7. Click **OK**
8. **Restart SQL Server service** (important!)

### 2. SQL Server Service Not Running

**Check:**
- Open **Services** (`Win+R` → `services.msc`)
- Look for:
  - `SQL Server (MSSQLSERVER)` - Default instance
  - `SQL Server (SQLEXPRESS)` - Express edition
  - `SQL Server (INSTANCENAME)` - Named instance

**Fix:**
- Right-click the service → **Start**
- Set **Startup type** to **Automatic**

### 3. SQL Server Browser Not Running

**Why it matters:** Required for named instances (e.g., `localhost\SQLEXPRESS`)

**Fix:**
1. Open **Services**
2. Find **SQL Server Browser**
3. Right-click → **Start**
4. Set **Startup type** to **Automatic**

### 4. Port 1433 Blocked by Firewall

**Check:**
```powershell
Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*SQL*" }
```

**Fix:**
1. Open **Windows Defender Firewall**
2. **Advanced Settings** → **Inbound Rules**
3. **New Rule** → **Port** → **TCP** → **1433**
4. **Allow the connection**
5. Apply to all profiles

Or use PowerShell:
```powershell
New-NetFirewallRule -DisplayName "SQL Server" -Direction Inbound -Protocol TCP -LocalPort 1433 -Action Allow
```

### 5. Wrong Connection String Format

**For Default Instance:**
- Host: `localhost` or `127.0.0.1`
- Port: `1433`
- Database: `YourDatabaseName`

**For Named Instance (SQL Express):**
- Host: `localhost\SQLEXPRESS` or `COMPUTERNAME\SQLEXPRESS`
- Port: Leave empty or use dynamic port
- Database: `YourDatabaseName`

**For Named Instance (Custom):**
- Host: `localhost\INSTANCENAME` or `COMPUTERNAME\INSTANCENAME`
- Port: Leave empty (Browser service will find it)
- Database: `YourDatabaseName`

### 6. SQL Server Authentication Not Enabled

**Fix:**
1. Open **SQL Server Management Studio (SSMS)**
2. Connect to your server
3. Right-click server → **Properties**
4. Go to **Security** tab
5. Select **SQL Server and Windows Authentication mode**
6. Click **OK**
7. **Restart SQL Server service**

### 7. Finding Your SQL Server Instance Name

**Method 1: Services**
- Open **Services**
- Look for services starting with "SQL Server ("
- The name in parentheses is your instance name

**Method 2: SQL Server Configuration Manager**
- Open **SQL Server Configuration Manager**
- Look under **SQL Server Services**
- Instance names are shown in parentheses

**Method 3: PowerShell**
```powershell
Get-Service | Where-Object { $_.Name -like "MSSQL*" } | Select-Object Name, DisplayName
```

### 8. Testing Connection Manually

**Using PowerShell:**
```powershell
# Test TCP connection
Test-NetConnection -ComputerName localhost -Port 1433
```

**Using SQL Server Management Studio:**
- Try connecting with the same credentials
- If SSMS works, the migration tool should work too

**Using Command Line (sqlcmd):**
```cmd
sqlcmd -S localhost -U sa -P YourPassword
```

## Step-by-Step Checklist

- [ ] SQL Server service is running
- [ ] TCP/IP protocol is enabled in SQL Server Configuration Manager
- [ ] SQL Server service was restarted after enabling TCP/IP
- [ ] SQL Server Browser service is running (for named instances)
- [ ] Port 1433 is allowed in Windows Firewall
- [ ] SQL Server Authentication is enabled (not just Windows Auth)
- [ ] Using correct connection format (host, port, instance name)
- [ ] Username and password are correct
- [ ] Database name exists

## Still Having Issues?

1. **Check SQL Server Error Log:**
   - Location: `C:\Program Files\Microsoft SQL Server\[VERSION]\MSSQL\Log\`
   - Look for connection-related errors

2. **Check Windows Event Viewer:**
   - Open **Event Viewer**
   - Go to **Windows Logs** → **Application**
   - Look for SQL Server errors

3. **Try Alternative Connection Methods:**
   - Use your computer name instead of `localhost`
   - Try `127.0.0.1` instead of `localhost`
   - For named instances, ensure Browser service is running

4. **Verify Network Configuration:**
   ```powershell
   # Check if SQL Server is listening
   netstat -an | findstr 1433
   ```

## Quick Test Commands

**Test if SQL Server is listening:**
```powershell
Test-NetConnection -ComputerName localhost -Port 1433
```

**List all SQL Server services:**
```powershell
Get-Service | Where-Object { $_.DisplayName -like "*SQL*" }
```

**Check firewall rules:**
```powershell
Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*SQL*" } | Format-Table DisplayName, Enabled
```

## Need More Help?

- SQL Server Configuration Manager: Usually in Start Menu under "Microsoft SQL Server"
- SQL Server Management Studio: Download from Microsoft if not installed
- SQL Server Error Logs: Check for specific error messages















































