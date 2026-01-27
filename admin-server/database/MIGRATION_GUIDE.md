# MS SQL Server to PostgreSQL Migration Guide

This guide explains how to migrate data from MS SQL Server to PostgreSQL (lavadataDb).

## Prerequisites

1. **Install dependencies:**
   ```bash
   cd admin-server
   npm install
   ```

2. **MS SQL Server access:**
   - Host, port, database name
   - Username and password
   - Network access to MS SQL Server

3. **PostgreSQL access:**
   - Database `lavadataDb` must exist
   - User with CREATE TABLE and INSERT permissions

## Setup

1. **Create the target database in PostgreSQL:**
   ```sql
   CREATE DATABASE lavadataDb;
   ```

2. **Configure environment variables:**
   
   Create a `.env` file in `admin-server/` directory or set environment variables:
   
   ```env
   # MS SQL Server (Source)
   MSSQL_HOST=your-mssql-server.com
   MSSQL_PORT=1433
   MSSQL_DATABASE=SourceDatabase
   MSSQL_USER=sa
   MSSQL_PASSWORD=your-password
   MSSQL_ENCRYPT=true
   MSSQL_TRUST_CERT=false
   
   # PostgreSQL (Target - lavadataDb)
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=lavadataDb
   DB_USER=postgres
   DB_PASSWORD=your-postgres-password
   DB_SSL=false
   ```

## Running the Migration

### Basic Migration (All Tables)

```bash
cd admin-server
node database/migrate-mssql-to-postgres.js
```

### Migration Process

1. **Connection:** Script connects to both MS SQL Server and PostgreSQL
2. **Table Discovery:** Automatically discovers all tables in MS SQL Server
3. **Schema Creation:** Creates PostgreSQL tables based on MS SQL schema
4. **Data Migration:** Migrates data in batches (1000 rows at a time)
5. **Error Handling:** Continues even if some rows fail, logs errors

## Features

- ✅ **Automatic Schema Conversion:** Converts MS SQL data types to PostgreSQL
- ✅ **Batch Processing:** Migrates data in configurable batches (default: 1000 rows)
- ✅ **Error Recovery:** Continues migration even if individual rows fail
- ✅ **Progress Tracking:** Shows progress for each table
- ✅ **Conflict Handling:** Uses `ON CONFLICT DO NOTHING` to skip duplicates
- ✅ **Type Mapping:** Handles common data type conversions

## Data Type Mappings

| MS SQL Server | PostgreSQL |
|--------------|------------|
| nvarchar(n) | VARCHAR(n) |
| nvarchar(MAX) | TEXT |
| varchar(n) | VARCHAR(n) |
| int | INTEGER |
| bigint | BIGINT |
| bit | BOOLEAN |
| datetime | TIMESTAMP |
| datetime2 | TIMESTAMP |
| decimal(p,s) | NUMERIC(p,s) |
| uniqueidentifier | UUID |
| varbinary | BYTEA |
| image | BYTEA |

## Customization

### Migrate Specific Tables Only

Edit `migrate-mssql-to-postgres.js` and modify the `tablesToMigrate` array:

```javascript
const tablesToMigrate = ['Users', 'Orders', 'Products']; // Only these tables
```

### Change Batch Size

Modify the `batchSize` parameter in the `migrateTableData` function call:

```javascript
const result = await migrateTableData(mssqlPool, pgPool, tableName, 500); // 500 rows per batch
```

### Custom Table Name Mapping

If table names differ between MS SQL and PostgreSQL, add mappings:

```javascript
const tableMappings = [
    { mssql: 'Users', postgres: 'users' },
    { mssql: 'OrderDetails', postgres: 'order_details' }
];
```

## Troubleshooting

### Connection Issues

**MS SQL Server:**
- Verify host, port, and credentials
- Check firewall rules
- Ensure SQL Server allows remote connections
- Try `MSSQL_TRUST_CERT=true` if using self-signed certificates

**PostgreSQL:**
- Verify database `lavadataDb` exists
- Check user permissions
- Verify `pg_hba.conf` allows connections

### Data Type Errors

If you encounter data type conversion errors:
1. Check the error message for the specific column
2. Manually adjust the `convertDataType` function
3. Or pre-create tables in PostgreSQL with correct types

### Performance

For large tables:
- Increase batch size (but watch memory usage)
- Run migration during off-peak hours
- Consider using `pg_dump` and `pg_restore` for very large datasets

## Example Output

```
🚀 Starting MS SQL to PostgreSQL Migration

📡 Connecting to MS SQL Server...
✅ Connected to MS SQL Server

📡 Testing PostgreSQL connection...
✅ Connected to PostgreSQL

📋 Getting list of tables from MS SQL Server...
✅ Found 5 tables: Users, Orders, Products, Categories, Reviews

📦 Migrating table: Users
   Total rows: 15000
   ✅ Migrated 15000/15000 rows (0 errors)

📦 Migrating table: Orders
   Total rows: 50000
   ✅ Migrated 50000/50000 rows (0 errors)

============================================================
📊 Migration Summary
============================================================
Total Tables: 5
Total Rows Migrated: 125000
Total Errors: 0

Per Table Results:
  Users: 15000 rows, 0 errors
  Orders: 50000 rows, 0 errors
  Products: 30010 rows, 0 errors
  Categories: 500 rows, 0 errors
  Reviews: 29500 rows, 0 errors
============================================================
```

## Post-Migration Steps

1. **Verify Data:**
   ```sql
   -- Check row counts
   SELECT 'Users' as table_name, COUNT(*) FROM users
   UNION ALL
   SELECT 'Orders', COUNT(*) FROM orders;
   ```

2. **Create Indexes:**
   ```sql
   CREATE INDEX idx_users_email ON users(email);
   CREATE INDEX idx_orders_user_id ON orders(user_id);
   ```

3. **Set Primary Keys:**
   ```sql
   ALTER TABLE users ADD PRIMARY KEY (id);
   ALTER TABLE orders ADD PRIMARY KEY (id);
   ```

4. **Add Foreign Keys:**
   ```sql
   ALTER TABLE orders 
   ADD CONSTRAINT fk_orders_user 
   FOREIGN KEY (user_id) REFERENCES users(id);
   ```

## Notes

- The script uses `ON CONFLICT DO NOTHING` to handle duplicates
- Large binary columns (images, files) are migrated as BYTEA
- Date/time values are preserved as-is
- NULL values are handled correctly
- The script is idempotent - safe to run multiple times

## Support

If you encounter issues:
1. Check the error messages in the console
2. Verify both database connections
3. Check table schemas match expectations
4. Review the migration summary for specific table errors



















































