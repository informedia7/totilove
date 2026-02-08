#!/usr/bin/env node

/**
 * Simple helper to push a local .sql file to a Railway Postgres instance.
 *
 * Usage examples:
 *   node scripts/upload-sql-to-railway.js --file 27_01_2026.sql --url "postgres://user:pass@host:port/db"
 *   DATABASE_URL=postgres://user:pass@host:port/db node scripts/upload-sql-to-railway.js --file backups/latest.sql
 *   node scripts/upload-sql-to-railway.js --file data.sql --service totilove
 *
 * Notes:
 * - Requires the Railway CLI (`railway`) and/or the `psql` binary to be installed locally.
 * - When --service is provided, the script fetches credentials via `railway variables`.
 * - For large files this is faster than copy/pasting into the Railway SQL console because
 *   it streams the file directly through `psql`.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    const args = {
        file: null,
        url: process.env.DATABASE_URL || process.env.RAILWAY_DATABASE_URL || null,
        service: null,
        psql: process.env.PSQL_PATH || 'psql'
    };

    for (let i = 2; i < argv.length; i += 1) {
        const current = argv[i];
        const next = argv[i + 1];

        switch (current) {
            case '--file':
            case '-f':
                args.file = next;
                i += 1;
                break;
            case '--url':
            case '-u':
                args.url = next;
                i += 1;
                break;
            case '--service':
            case '-s':
                args.service = next;
                i += 1;
                break;
            case '--psql':
                args.psql = next;
                i += 1;
                break;
            case '--help':
            case '-h':
                args.help = true;
                break;
            default:
                console.warn(`Unknown argument: ${current}`);
        }
    }

    return args;
}

function printHelpAndExit() {
    console.log(`Usage: node scripts/upload-sql-to-railway.js --file <path> [--url <postgres-url> | --service <railway-service>] [--psql <psql-path>]

Options:
  --file, -f      Path to the .sql file you want to upload (required)
  --url, -u       Postgres connection string (e.g. postgres://user:pass@host:port/db)
  --service, -s   Railway service name to pull DATABASE_URL via \`railway variables\`
  --psql          Path to the psql binary (defaults to "psql")
  --help, -h      Show this help message
`);
    process.exit(0);
}

function resolveRailwayUrl(service) {
    const result = spawnSync('railway', ['variables', '--json', '--service', service], {
        encoding: 'utf-8'
    });

    if (result.error) {
        throw new Error(`Failed to invoke Railway CLI: ${result.error.message}`);
    }

    if (result.status !== 0) {
        throw new Error(`Railway CLI returned exit code ${result.status}: ${result.stderr || result.stdout}`);
    }

    const vars = JSON.parse(result.stdout);
    const url = vars.DATABASE_URL || vars.POSTGRES_URL || vars.DATABASE_URL_PUBLIC;

    if (!url) {
        throw new Error('Railway environment does not expose DATABASE_URL/POSTGRES_URL. Set --url manually.');
    }

    return url;
}

function main() {
    const args = parseArgs(process.argv);

    if (args.help) {
        printHelpAndExit();
    }

    if (!args.file) {
        console.error('Error: --file <path> is required.');
        printHelpAndExit();
    }

    const filePath = path.resolve(process.cwd(), args.file);
    if (!fs.existsSync(filePath)) {
        console.error(`Error: SQL file not found at ${filePath}`);
        process.exit(1);
    }

    let connectionUrl = args.url;
    if (!connectionUrl && args.service) {
        try {
            connectionUrl = resolveRailwayUrl(args.service);
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
    }

    if (!connectionUrl) {
        console.error('Error: No Postgres connection URL provided. Use --url, set DATABASE_URL, or pass --service.');
        process.exit(1);
    }

    console.log(`Uploading ${filePath} to ${connectionUrl.replace(/:[^:@/]+@/, '://***:***@')} ...`);

    const child = spawnSync(
        args.psql,
        ['-v', 'ON_ERROR_STOP=1', '-f', filePath, connectionUrl],
        { stdio: 'inherit' }
    );

    if (child.error) {
        console.error(`Failed to execute psql: ${child.error.message}`);
        process.exit(child.status || 1);
    }

    if (child.status !== 0) {
        console.error(`psql exited with code ${child.status}`);
        process.exit(child.status);
    }

    console.log('✅ SQL upload completed successfully');
}

main();
