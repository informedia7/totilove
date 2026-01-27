/**
 * Migration Script: MS SQL Server to PostgreSQL
 * 
 * This script migrates data from MS SQL Server to PostgreSQL (lavadataDb)
 * 
 * Usage:
 *   node database/migrate-mssql-to-postgres.js
 * 
 * Environment Variables Required:
 *   # MS SQL Server
 *   MSSQL_HOST=your-mssql-host
 *   MSSQL_PORT=1433
 *   MSSQL_DATABASE=your-mssql-database
 *   MSSQL_USER=your-mssql-user
 *   MSSQL_PASSWORD=your-mssql-password
 *   MSSQL_ENCRYPT=true
 *   
 *   # PostgreSQL (lavadataDb)
 *   DB_HOST=localhost
 *   DB_PORT=5432
 *   DB_NAME=lavadataDb
 *   DB_USER=your-postgres-user
 *   DB_PASSWORD=your-postgres-password
 */

const sql = require('mssql');
const { Pool } = require('pg');
require('dotenv').config();

// MS SQL Server Configuration
const mssqlConfig = {
    server: process.env.MSSQL_HOST || 'localhost',
    port: parseInt(process.env.MSSQL_PORT) || 1433,
    database: process.env.MSSQL_DATABASE || '',
    user: process.env.MSSQL_USER || '',
    password: process.env.MSSQL_PASSWORD || '',
    options: {
        encrypt: process.env.MSSQL_ENCRYPT === 'true',
        trustServerCertificate: process.env.MSSQL_TRUST_CERT === 'true' || false,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30010
    }
};

// PostgreSQL Configuration
const pgPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'lavadataDb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    max: 20,
    idleTimeoutMillis: 30010,
    connectionTimeoutMillis: 2000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Table mapping configuration
// Map MS SQL table names to PostgreSQL table names
// If table names are the same, just list them
const tableMappings = [
    // Add your table mappings here
    // Example: { mssql: 'Users', postgres: 'users' }
    // If names are the same, just use string: 'users'
];

// Column type mappings
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

/**
 * Convert MS SQL data type to PostgreSQL
 */
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

/**
 * Get list of tables from MS SQL Server
 */
async function getMSSQLTables(mssqlPool) {
    try {
        const result = await mssqlPool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_SCHEMA = 'dbo'
            ORDER BY TABLE_NAME
        `);
        return result.recordset.map(row => row.TABLE_NAME);
    } catch (error) {
        console.error('Error getting MS SQL tables:', error);
        throw error;
    }
}

/**
 * Get table schema from MS SQL Server
 */
async function getMSSQLTableSchema(mssqlPool, tableName) {
    try {
        const result = await mssqlPool.request().query(`
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
        return result.recordset;
    } catch (error) {
        console.error(`Error getting schema for ${tableName}:`, error);
        throw error;
    }
}

/**
 * Check if PostgreSQL table exists
 */
async function tableExists(pgPool, tableName) {
    try {
        const result = await pgPool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = $1
            )
        `, [tableName.toLowerCase()]);
        return result.rows[0].exists;
    } catch (error) {
        console.error(`Error checking if table ${tableName} exists:`, error);
        return false;
    }
}

/**
 * Create PostgreSQL table based on MS SQL schema
 */
async function createPostgreSQLTable(pgPool, tableName, schema) {
    try {
        const columns = schema.map(col => {
            const pgType = convertDataType(col.DATA_TYPE);
            const nullable = col.IS_NULLABLE === 'YES' ? '' : 'NOT NULL';
            const defaultVal = col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : '';
            return `"${col.COLUMN_NAME}" ${pgType} ${nullable} ${defaultVal}`.trim();
        }).join(',\n            ');

        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS "${tableName.toLowerCase()}" (
                ${columns}
            )
        `;

        await pgPool.query(createTableSQL);
        console.log(`✅ Created table: ${tableName}`);
    } catch (error) {
        console.error(`❌ Error creating table ${tableName}:`, error);
        throw error;
    }
}

/**
 * Migrate data from MS SQL to PostgreSQL
 */
async function migrateTableData(mssqlPool, pgPool, tableName, batchSize = 1000) {
    try {
        console.log(`\n📦 Migrating table: ${tableName}`);
        
        // Get total count
        const countResult = await mssqlPool.request().query(`SELECT COUNT(*) as total FROM [${tableName}]`);
        const totalRows = countResult.recordset[0].total;
        console.log(`   Total rows: ${totalRows}`);

        if (totalRows === 0) {
            console.log(`   ⚠️  Table is empty, skipping...`);
            return { table: tableName, rows: 0, errors: 0 };
        }

        let offset = 0;
        let totalMigrated = 0;
        let errors = 0;

        // Get column names
        const schemaResult = await getMSSQLTableSchema(mssqlPool, tableName);
        const columns = schemaResult.map(col => col.COLUMN_NAME);
        const columnList = columns.map(col => `[${col}]`).join(', ');
        const pgColumnList = columns.map(col => `"${col}"`).join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        while (offset < totalRows) {
            // Fetch batch from MS SQL
            const dataResult = await mssqlPool.request().query(`
                SELECT ${columnList}
                FROM [${tableName}]
                ORDER BY (SELECT NULL)
                OFFSET ${offset} ROWS
                FETCH NEXT ${batchSize} ROWS ONLY
            `);

            if (dataResult.recordset.length === 0) break;

            // Insert batch into PostgreSQL
            const client = await pgPool.connect();
            try {
                await client.query('BEGIN');

                for (const row of dataResult.recordset) {
                    try {
                        const values = columns.map(col => {
                            let value = row[col];
                            // Handle NULL
                            if (value === null || value === undefined) {
                                return null;
                            }
                            // Handle dates
                            if (value instanceof Date) {
                                return value;
                            }
                            // Handle boolean (bit type)
                            if (typeof value === 'boolean') {
                                return value;
                            }
                            // Handle Buffer (binary data)
                            if (Buffer.isBuffer(value)) {
                                return value;
                            }
                            return value;
                        });

                        // Try INSERT first, if conflict then skip
                        try {
                            await client.query(`
                                INSERT INTO "${tableName.toLowerCase()}" (${pgColumnList})
                                VALUES (${placeholders})
                            `, values);
                        } catch (insertError) {
                            // If duplicate key error, skip (ON CONFLICT not always available)
                            if (insertError.code === '23505') { // Unique violation
                                // Skip duplicate
                            } else {
                                throw insertError;
                            }
                        }

                        totalMigrated++;
                    } catch (rowError) {
                        errors++;
                        if (errors <= 5) { // Only log first 5 errors per table
                            console.error(`   ⚠️  Error inserting row:`, rowError.message);
                        }
                    }
                }

                await client.query('COMMIT');
                console.log(`   ✅ Migrated ${totalMigrated}/${totalRows} rows (${errors} errors)`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

            offset += batchSize;
        }

        return { table: tableName, rows: totalMigrated, errors };
    } catch (error) {
        console.error(`❌ Error migrating table ${tableName}:`, error);
        return { table: tableName, rows: 0, errors: 1 };
    }
}

/**
 * Main migration function
 */
async function migrate() {
    let mssqlPool = null;
    let pgClient = null;

    try {
        console.log('🚀 Starting MS SQL to PostgreSQL Migration\n');

        // Validate environment variables
        if (!process.env.MSSQL_HOST || !process.env.MSSQL_DATABASE) {
            console.error('❌ MS SQL Server configuration missing!');
            console.error('   Please set MSSQL_HOST, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD');
            process.exit(1);
        }

        // Connect to MS SQL Server
        console.log('📡 Connecting to MS SQL Server...');
        mssqlPool = await sql.connect(mssqlConfig);
        console.log('✅ Connected to MS SQL Server\n');

        // Test PostgreSQL connection
        console.log('📡 Testing PostgreSQL connection...');
        pgClient = await pgPool.connect();
        await pgClient.query('SELECT NOW()');
        pgClient.release();
        console.log('✅ Connected to PostgreSQL\n');

        // Get list of tables
        console.log('📋 Getting list of tables from MS SQL Server...');
        const tables = await getMSSQLTables(mssqlPool);
        console.log(`✅ Found ${tables.length} tables: ${tables.join(', ')}\n`);

        if (tables.length === 0) {
            console.log('⚠️  No tables found in MS SQL Server');
            return;
        }

        // Migrate all tables (or filter specific tables)
        // To migrate only specific tables, uncomment and modify:
        // const tablesToMigrate = ['Users', 'Orders', 'Products'];
        const tablesToMigrate = tables;

        const results = [];

        // Migrate each table
        for (const tableName of tablesToMigrate) {
            try {
                // Get schema
                const schema = await getMSSQLTableSchema(mssqlPool, tableName);
                
                // Check if table exists in PostgreSQL
                const exists = await tableExists(pgPool, tableName);
                
                if (!exists) {
                    // Create table
                    await createPostgreSQLTable(pgPool, tableName, schema);
                } else {
                    console.log(`ℹ️  Table ${tableName} already exists in PostgreSQL, skipping creation`);
                }

                // Migrate data
                const result = await migrateTableData(mssqlPool, pgPool, tableName);
                results.push(result);

            } catch (error) {
                console.error(`❌ Failed to migrate table ${tableName}:`, error);
                results.push({ table: tableName, rows: 0, errors: 1 });
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Migration Summary');
        console.log('='.repeat(60));
        const totalRows = results.reduce((sum, r) => sum + r.rows, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
        console.log(`Total Tables: ${results.length}`);
        console.log(`Total Rows Migrated: ${totalRows}`);
        console.log(`Total Errors: ${totalErrors}`);
        console.log('\nPer Table Results:');
        results.forEach(r => {
            console.log(`  ${r.table}: ${r.rows} rows, ${r.errors} errors`);
        });
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        // Cleanup
        if (mssqlPool) {
            await mssqlPool.close();
            console.log('\n✅ MS SQL connection closed');
        }
        if (pgPool) {
            await pgPool.end();
            console.log('✅ PostgreSQL connection closed');
        }
    }
}

// Run migration
if (require.main === module) {
    migrate().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { migrate };



















































