/**
 * Helper script to find PostgreSQL installation on Windows
 * Run: node admin-server/scripts/find-postgresql.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findPostgreSQL() {
    console.log('🔍 Searching for PostgreSQL installation...\n');

    const foundPaths = [];

    // Check if in PATH
    console.log('1. Checking system PATH...');
    try {
        if (os.platform() === 'win32') {
            const result = execSync('where pg_dump', { encoding: 'utf8', stdio: 'pipe' });
            if (result.trim()) {
                const pgDumpPath = result.trim().split('\n')[0];
                const binPath = path.dirname(pgDumpPath);
                console.log(`   ✅ Found in PATH: ${binPath}`);
                foundPaths.push(binPath);
            }
        } else {
            const result = execSync('which pg_dump', { encoding: 'utf8', stdio: 'pipe' });
            if (result.trim()) {
                const pgDumpPath = result.trim();
                const binPath = path.dirname(pgDumpPath);
                console.log(`   ✅ Found in PATH: ${binPath}`);
                foundPaths.push(binPath);
            }
        }
    } catch (e) {
        console.log('   ❌ Not found in PATH');
    }

    // Check common Windows paths
    console.log('\n2. Checking common installation paths...');
    const commonPaths = [];
    
    // Program Files paths
    for (let version = 20; version >= 10; version--) {
        commonPaths.push(`C:\\Program Files\\PostgreSQL\\${version}\\bin`);
        commonPaths.push(`C:\\Program Files (x86)\\PostgreSQL\\${version}\\bin`);
    }

    // ProgramData paths
    const programDataPath = process.env.PROGRAMDATA || 'C:\\ProgramData';
    for (let version = 20; version >= 10; version--) {
        commonPaths.push(path.join(programDataPath, 'PostgreSQL', version.toString(), 'bin'));
    }

    // Check all drives
    const drives = ['C:', 'D:', 'E:', 'F:'];
    for (const drive of drives) {
        for (let version = 20; version >= 10; version--) {
            commonPaths.push(`${drive}\\PostgreSQL\\${version}\\bin`);
            commonPaths.push(`${drive}\\Program Files\\PostgreSQL\\${version}\\bin`);
            commonPaths.push(`${drive}\\Program Files (x86)\\PostgreSQL\\${version}\\bin`);
        }
    }

    for (const pgPath of commonPaths) {
        const pgDumpPath = path.join(pgPath, 'pg_dump.exe');
        if (fs.existsSync(pgDumpPath)) {
            console.log(`   ✅ Found: ${pgPath}`);
            if (!foundPaths.includes(pgPath)) {
                foundPaths.push(pgPath);
            }
        }
    }

    // Search in common installation directories
    console.log('\n3. Searching in common directories...');
    const searchDirs = [
        'C:\\Program Files',
        'C:\\Program Files (x86)',
        process.env.PROGRAMDATA || 'C:\\ProgramData',
        'C:\\',
        'D:\\',
        'E:\\'
    ];

    function searchDirectory(dir, depth = 0) {
        if (depth > 3) return; // Limit depth to avoid long searches
        
        try {
            if (!fs.existsSync(dir)) return;
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const fullPath = path.join(dir, entry.name);
                    
                    // Check if this looks like a PostgreSQL bin directory
                    if (entry.name.toLowerCase() === 'postgresql' || entry.name.toLowerCase().includes('postgres')) {
                        try {
                            const subDirs = fs.readdirSync(fullPath, { withFileTypes: true });
                            for (const subDir of subDirs) {
                                if (subDir.isDirectory()) {
                                    const binPath = path.join(fullPath, subDir.name, 'bin');
                                    const pgDumpPath = path.join(binPath, 'pg_dump.exe');
                                    if (fs.existsSync(pgDumpPath)) {
                                        console.log(`   ✅ Found: ${binPath}`);
                                        if (!foundPaths.includes(binPath)) {
                                            foundPaths.push(binPath);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                    
                    // Recursively search (limited depth)
                    if (depth < 2) {
                        searchDirectory(fullPath, depth + 1);
                    }
                }
            }
        } catch (e) {
            // Ignore permission errors
        }
    }

    // Only do deep search if nothing found yet
    if (foundPaths.length === 0) {
        for (const searchDir of searchDirs) {
            if (fs.existsSync(searchDir)) {
                searchDirectory(searchDir);
            }
        }
    }

    // Results
    console.log('\n' + '='.repeat(60));
    if (foundPaths.length > 0) {
        console.log('\n✅ PostgreSQL found! Use one of these paths:\n');
        foundPaths.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p}`);
        });
        console.log('\n📝 Add to your .env file:');
        console.log(`   PG_BIN_PATH="${foundPaths[0]}"`);
        console.log('\n   Or set as environment variable:');
        console.log(`   set PG_BIN_PATH=${foundPaths[0]}`);
    } else {
        console.log('\n❌ PostgreSQL not found automatically.');
        console.log('\nPlease:');
        console.log('1. Find your PostgreSQL installation manually');
        console.log('2. Look for pg_dump.exe in the bin folder');
        console.log('3. Set PG_BIN_PATH environment variable to that folder');
        console.log('\nExample:');
        console.log('   PG_BIN_PATH="C:\\Program Files\\PostgreSQL\\16\\bin"');
    }
    console.log('\n' + '='.repeat(60));
}

if (require.main === module) {
    findPostgreSQL();
}

module.exports = { findPostgreSQL };
















































































































































































































































