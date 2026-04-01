/**
 * Standalone Migration API Server
 * 
 * Simple Express server for MS SQL to PostgreSQL migration
 * 
 * Usage:
 *   node server.js
 * 
 * The server will start on port 3004 by default
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const sql = require('mssql');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Store active migrations
const activeMigrations = new Map();

// Type mappings
const typeMappings = {
    'nvarchar': 'VARCHAR',
    'varchar': 'VARCHAR',
    'nchar': 'CHAR',
    'char': 'CHAR',
    'text': 'TEXT',
    'ntext': 'TEXT',
    'int': 'INTEGER',
    'bigint': 'BIGINT',
    'smallint': 'SMALLINT',
    'tinyint': 'SMALLINT',
    'bit': 'BOOLEAN',
    'datetime': 'TIMESTAMP',
    'datetime2': 'TIMESTAMP',
    'date': 'DATE',
    'time': 'TIME',
    'decimal': 'DECIMAL',
    'numeric': 'NUMERIC',
    'float': 'REAL',
    'real': 'REAL',
    'money': 'MONEY',
    'uniqueidentifier': 'UUID',
    'image': 'BYTEA',
    'varbinary': 'BYTEA',
    'binary': 'BYTEA'
};

function convertDataType(mssqlType) {
    const type = mssqlType.toLowerCase();
    if (type.includes('nvarchar') || type.includes('varchar')) {
        const match = type.match(/\((\d+)\)/);
        const length = match ? match[1] : 'MAX';
        return length === 'MAX' ? 'TEXT' : `VARCHAR(${length})`;
    }
    if (type.includes('nchar') || type.includes('char')) {
        const match = type.match(/\((\d+)\)/);
        const length = match ? match[1] : '255';
        return `CHAR(${length})`;
    }
    if (type.includes('decimal') || type.includes('numeric')) {
        const match = type.match(/\((\d+),(\d+)\)/);
        if (match) {
            return `NUMERIC(${match[1]},${match[2]})`;
        }
        return 'NUMERIC';
    }
    return typeMappings[type] || 'TEXT';
}

// Serve HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'migrate-mssql-to-postgres.html'));
});

// Handle favicon request (prevent 404)
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content
});

// Test MS SQL connection
app.post('/api/migration/test/mssql', async (req, res) => {
    let pool = null;
    try {
        const config = req.body;
        
        // Build connection config
        const connectionConfig = {
            server: config.host,
            database: config.database,
            user: config.user,
            password: config.password,
            options: {
                encrypt: config.encrypt === true || config.encrypt === 'true',
                trustServerCertificate: config.trustCert === true || config.trustCert === 'true',
                enableArithAbort: true
            }
        };
        
        // Only add port if specified and not using instance name format
        // Instance names (hostname\instance) don't use port
        if (config.port && !config.host.includes('\\')) {
            connectionConfig.port = parseInt(config.port) || 1433;
        }
        
        pool = await sql.connect(connectionConfig);

        const result = await pool.request().query('SELECT @@VERSION as version');
        await pool.close();

        res.json({
            success: true,
            message: 'Connection successful',
            version: result.recordset[0].version
        });
    } catch (error) {
        if (pool) {
            try {
                await pool.close();
            } catch (e) {
                // Ignore close errors
            }
        }
        
        let errorMessage = error.message || 'Connection failed';
        
        // Provide more helpful error messages
        if (errorMessage.includes('Could not connect') || errorMessage.includes('sequence')) {
            errorMessage += '\n\nTroubleshooting:\n' +
                '1. Enable TCP/IP in SQL Server Configuration Manager\n' +
                '2. Restart SQL Server service after enabling TCP/IP\n' +
                '3. For named instances, use format: hostname\\instancename (leave port empty)\n' +
                '4. Try: localhost\\MSSQLSERVER2022 or BRENDAN\\MSSQLSERVER2022';
        }
        
        res.json({
            success: false,
            message: errorMessage
        });
    }
});

// Test PostgreSQL connection
app.post('/api/migration/test/postgresql', async (req, res) => {
    try {
        const config = req.body;
        const pool = new Pool({
            host: config.host,
            port: parseInt(config.port) || 5432,
            database: config.database,
            user: config.user,
            password: config.password,
            ssl: config.ssl === true || config.ssl === 'true' ? { rejectUnauthorized: false } : false
        });

        const result = await pool.query('SELECT version()');
        await pool.end();

        res.json({
            success: true,
            message: 'Connection successful',
            version: result.rows[0].version
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message || 'Connection failed'
        });
    }
});

// Get MS SQL tables
app.post('/api/migration/tables', async (req, res) => {
    let pool = null;
    try {
        const config = req.body;
        
        const connectionConfig = {
            server: config.host,
            database: config.database,
            user: config.user,
            password: config.password,
            options: {
                encrypt: config.encrypt === true || config.encrypt === 'true',
                trustServerCertificate: config.trustCert === true || config.trustCert === 'true',
                enableArithAbort: true
            }
        };
        
        // Only add port if specified and not using instance name format
        if (config.port && !config.host.includes('\\')) {
            connectionConfig.port = parseInt(config.port) || 1433;
        }
        
        pool = await sql.connect(connectionConfig);

        const result = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_SCHEMA = 'dbo'
            ORDER BY TABLE_NAME
        `);

        await pool.close();

        res.json({
            success: true,
            tables: result.recordset.map(row => row.TABLE_NAME)
        });
    } catch (error) {
        if (pool) await pool.close();
        res.json({
            success: false,
            message: error.message,
            tables: []
        });
    }
});

// Start migration
app.post('/api/migration/start', async (req, res) => {
    try {
        const { mssqlConfig, pgConfig, tables, options = {} } = req.body;

        if (!mssqlConfig || !pgConfig || !tables || tables.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required configuration or tables'
            });
        }

        const migrationId = uuidv4();
        activeMigrations.set(migrationId, {
            status: 'running',
            currentTable: null,
            progress: 0,
            totalTables: tables.length,
            completedTables: 0,
            totalRows: 0,
            migratedRows: 0,
            errors: 0,
            startTime: new Date(),
            details: []
        });

        // Run migration asynchronously
        runMigration(migrationId, mssqlConfig, pgConfig, tables, options.batchSize || 1000, options.skipExisting !== false)
            .catch(error => {
                const migration = activeMigrations.get(migrationId);
                if (migration) {
                    migration.status = 'failed';
                    migration.error = error.message;
                }
            });

        res.json({ success: true, migrationId });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get migration status
app.get('/api/migration/status/:migrationId', (req, res) => {
    const { migrationId } = req.params;
    const migration = activeMigrations.get(migrationId);
    if (!migration) {
        return res.json({ success: false, message: 'Migration not found' });
    }
    res.json({ success: true, migration });
});

// Cancel migration
app.post('/api/migration/cancel/:migrationId', (req, res) => {
    const { migrationId } = req.params;
    const migration = activeMigrations.get(migrationId);
    if (migration && migration.status === 'running') {
        migration.status = 'cancelled';
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Migration not found or not running' });
    }
});

// Migration function
async function runMigration(migrationId, mssqlConfig, pgConfig, tables, batchSize, skipExisting) {
    let mssqlPool = null;
    let pgPool = null;

    try {
        const migration = activeMigrations.get(migrationId);
        if (!migration) return;

        // Connect to MS SQL
        const mssqlConnectionConfig = {
            server: mssqlConfig.host,
            database: mssqlConfig.database,
            user: mssqlConfig.user,
            password: mssqlConfig.password,
            options: {
                encrypt: mssqlConfig.encrypt === true || mssqlConfig.encrypt === 'true',
                trustServerCertificate: mssqlConfig.trustCert === true || mssqlConfig.trustCert === 'true',
                enableArithAbort: true
            }
        };
        
        // Only add port if specified and not using instance name format
        // Instance names (hostname\instance) use SQL Server Browser, not direct port
        if (mssqlConfig.port && !mssqlConfig.host.includes('\\')) {
            mssqlConnectionConfig.port = parseInt(mssqlConfig.port) || 1433;
        }
        
        mssqlPool = await sql.connect(mssqlConnectionConfig);

        // Connect to PostgreSQL
        pgPool = new Pool({
            host: pgConfig.host,
            port: parseInt(pgConfig.port) || 5432,
            database: pgConfig.database,
            user: pgConfig.user,
            password: pgConfig.password,
            max: 20,
            ssl: pgConfig.ssl === true || pgConfig.ssl === 'true' ? { rejectUnauthorized: false } : false
        });

        // Migrate each table
        for (const tableName of tables) {
            if (migration.status === 'cancelled') break;

            migration.currentTable = tableName;
            migration.progress = Math.round((migration.completedTables / migration.totalTables) * 100);

            try {
                // Get schema
                const schemaResult = await mssqlPool.request().query(`
                    SELECT 
                        COLUMN_NAME,
                        DATA_TYPE,
                        CHARACTER_MAXIMUM_LENGTH,
                        NUMERIC_PRECISION,
                        NUMERIC_SCALE,
                        IS_NULLABLE,
                        COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = '${tableName}'
                    ORDER BY ORDINAL_POSITION
                `);

                // Create table if needed
                const exists = await pgPool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = $1
                    )
                `, [tableName.toLowerCase()]);

                if (!exists.rows[0].exists) {
                    const columns = schemaResult.recordset.map(col => {
                        const pgType = convertDataType(col.DATA_TYPE);
                        const nullable = col.IS_NULLABLE === 'YES' ? '' : 'NOT NULL';
                        const defaultVal = col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : '';
                        return `"${col.COLUMN_NAME}" ${pgType} ${nullable} ${defaultVal}`.trim();
                    }).join(',\n            ');

                    await pgPool.query(`
                        CREATE TABLE IF NOT EXISTS "${tableName.toLowerCase()}" (
                            ${columns}
                        )
                    `);
                }

                // Migrate data
                const countResult = await mssqlPool.request().query(`SELECT COUNT(*) as total FROM [${tableName}]`);
                const totalRows = parseInt(countResult.recordset[0].total);
                migration.totalRows += totalRows;

                if (totalRows > 0) {
                    const columns = schemaResult.recordset.map(col => col.COLUMN_NAME);
                    const columnList = columns.map(col => `[${col}]`).join(', ');
                    const pgColumnList = columns.map(col => `"${col}"`).join(', ');
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

                    let offset = 0;
                    let migrated = 0;
                    let errors = 0;

                    while (offset < totalRows && migration.status !== 'cancelled') {
                        const dataResult = await mssqlPool.request().query(`
                            SELECT ${columnList}
                            FROM [${tableName}]
                            ORDER BY (SELECT NULL)
                            OFFSET ${offset} ROWS
                            FETCH NEXT ${batchSize} ROWS ONLY
                        `);

                        if (dataResult.recordset.length === 0) break;

                        const client = await pgPool.connect();
                        try {
                            await client.query('BEGIN');

                            for (const row of dataResult.recordset) {
                                try {
                                    const values = columns.map(col => {
                                        let value = row[col];
                                        if (value === null || value === undefined) return null;
                                        if (value instanceof Date) return value;
                                        if (Buffer.isBuffer(value)) return value;
                                        return value;
                                    });

                                    await client.query(`
                                        INSERT INTO "${tableName.toLowerCase()}" (${pgColumnList})
                                        VALUES (${placeholders})
                                    `, values);

                                    migrated++;
                                } catch (rowError) {
                                    if (rowError.code === '23505' && skipExisting) {
                                        // Duplicate, skip
                                    } else {
                                        errors++;
                                    }
                                }
                            }

                            await client.query('COMMIT');
                        } catch (error) {
                            await client.query('ROLLBACK');
                            errors++;
                        } finally {
                            client.release();
                        }

                        offset += batchSize;
                    }

                    migration.details.push({
                        table: tableName,
                        status: 'completed',
                        rows: migrated,
                        errors: errors
                    });

                    migration.migratedRows += migrated;
                    migration.errors += errors;
                } else {
                    migration.details.push({
                        table: tableName,
                        status: 'completed',
                        rows: 0,
                        errors: 0
                    });
                }

            } catch (error) {
                migration.details.push({
                    table: tableName,
                    status: 'failed',
                    error: error.message
                });
                migration.errors++;
            }

            migration.completedTables++;
            migration.progress = Math.round((migration.completedTables / migration.totalTables) * 100);
        }

        migration.status = migration.status === 'cancelled' ? 'cancelled' : 'completed';
        migration.endTime = new Date();
        migration.duration = migration.endTime - migration.startTime;

    } catch (error) {
        const migration = activeMigrations.get(migrationId);
        if (migration) {
            migration.status = 'failed';
            migration.error = error.message;
        }
    } finally {
        if (mssqlPool) await mssqlPool.close();
        if (pgPool) await pgPool.end();
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Migration API Server running on http://localhost:${PORT}`);
    console.log(`📄 Open http://localhost:${PORT} in your browser`);
});



















































