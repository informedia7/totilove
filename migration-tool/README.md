# MS SQL to PostgreSQL Migration Tool

Standalone web-based tool for migrating data from MS SQL Server to PostgreSQL (pgAdmin).

## Files

- `migrate-mssql-to-postgres.html` - Standalone HTML page with embedded CSS and JavaScript

## Usage

### Option 1: Open Directly in Browser

1. Open `migrate-mssql-to-postgres.html` directly in your web browser
2. Make sure the backend API server is running (see Backend Setup below)
3. Configure your MS SQL and PostgreSQL connections
4. Start migration

### Option 2: Serve via HTTP Server

```bash
# Using Python
python -m http.server 8080

# Using Node.js http-server
npx http-server -p 8080

# Then open: http://localhost:8080/migrate-mssql-to-postgres.html
```

## Backend API Setup

This tool requires a backend API server. You have three options:

### Option A: Use Standalone Migration Server (Recommended)

1. Install dependencies:
   ```bash
   cd migration-tool
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open in browser: `http://localhost:3004`

The server will automatically serve the HTML page and provide all API endpoints.

### Option B: Use Admin Server

1. Make sure `admin-server` has migration API endpoints
2. Start admin server: `cd admin-server && npm start`
3. Open the HTML file and change `API_BASE` to `http://localhost:3003`

### Option C: Use Command-Line Script

If you don't want to set up the API server, use the command-line script instead:

```bash
cd admin-server
node database/migrate-mssql-to-postgres.js
```

## Configuration

The HTML file uses `http://localhost:3003` as the default API base URL. To change it:

1. Open `migrate-mssql-to-postgres.html` in a text editor
2. Find: `const API_BASE = 'http://localhost:3003';`
3. Change to your API server URL

## Features

- ✅ Test MS SQL Server connection
- ✅ Test PostgreSQL connection
- ✅ Discover tables from MS SQL Server
- ✅ Select specific tables to migrate
- ✅ Configure batch size and migration options
- ✅ Real-time progress tracking
- ✅ Table-by-table status details
- ✅ Cancel migration option

## Requirements

- Backend API server with migration endpoints (or use command-line script)
- Modern web browser with JavaScript enabled
- Network access to both MS SQL Server and PostgreSQL databases



















































