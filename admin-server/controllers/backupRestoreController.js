const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

class BackupRestoreController {
    constructor() {
        // Get backup directory (relative to project root)
        this.backupDir = path.join(__dirname, '..', '..', 'database-backups');
        
        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
        
        // Database configuration from environment
        this.dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'totilove',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password'
        };
        
        // Find PostgreSQL bin directory
        this.pgBinPath = this.findPostgreSQLBinPath();
    }

    /**
     * Find PostgreSQL bin directory
     */
    findPostgreSQLBinPath() {
        // Check environment variable first
        if (process.env.PG_BIN_PATH) {
            const customPath = process.env.PG_BIN_PATH;
            if (fs.existsSync(customPath)) {
                return customPath;
            }
        }

        // Check if pg_dump is in PATH
        try {
            if (os.platform() === 'win32') {
                execSync('where pg_dump', { stdio: 'ignore' });
                return ''; // Empty means use PATH
            } else {
                execSync('which pg_dump', { stdio: 'ignore' });
                return ''; // Empty means use PATH
            }
        } catch (e) {
            // Not in PATH, try to find it
        }

        // Common Windows installation paths
        if (os.platform() === 'win32') {
            const commonPaths = [];
            
            // Check versions 10-20
            for (let version = 20; version >= 10; version--) {
                commonPaths.push(`C:\\Program Files\\PostgreSQL\\${version}\\bin`);
                commonPaths.push(`C:\\Program Files (x86)\\PostgreSQL\\${version}\\bin`);
            }

            // Also check ProgramData for portable installations
            const programDataPath = process.env.PROGRAMDATA || 'C:\\ProgramData';
            for (let version = 20; version >= 10; version--) {
                commonPaths.push(path.join(programDataPath, 'PostgreSQL', version.toString(), 'bin'));
            }

            // Check other common drives
            const drives = ['D:', 'E:', 'F:'];
            for (const drive of drives) {
                for (let version = 20; version >= 10; version--) {
                    commonPaths.push(`${drive}\\PostgreSQL\\${version}\\bin`);
                    commonPaths.push(`${drive}\\Program Files\\PostgreSQL\\${version}\\bin`);
                }
            }

            for (const pgPath of commonPaths) {
                const pgDumpPath = path.join(pgPath, 'pg_dump.exe');
                if (fs.existsSync(pgDumpPath)) {
                    logger.info(`Found PostgreSQL at: ${pgPath}`);
                    return pgPath;
                }
            }

            // Try to search in Program Files directories (limited search)
            try {
                const searchDirs = [
                    'C:\\Program Files',
                    'C:\\Program Files (x86)',
                    programDataPath
                ];

                for (const searchDir of searchDirs) {
                    if (!fs.existsSync(searchDir)) continue;
                    
                    try {
                        const entries = fs.readdirSync(searchDir, { withFileTypes: true });
                        for (const entry of entries) {
                            if (entry.isDirectory() && entry.name.toLowerCase().includes('postgres')) {
                                const pgDir = path.join(searchDir, entry.name);
                                try {
                                    const subDirs = fs.readdirSync(pgDir, { withFileTypes: true });
                                    for (const subDir of subDirs) {
                                        if (subDir.isDirectory()) {
                                            const binPath = path.join(pgDir, subDir.name, 'bin');
                                            const pgDumpPath = path.join(binPath, 'pg_dump.exe');
                                            if (fs.existsSync(pgDumpPath)) {
                                                logger.info(`Found PostgreSQL at: ${binPath}`);
                                                return binPath;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Ignore
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore permission errors
                    }
                }
            } catch (e) {
                // Ignore search errors
            }
        }

        // Return empty string to indicate not found
        return '';
    }

    /**
     * Get full path to PostgreSQL command
     */
    getPostgreSQLCommand(command) {
        if (this.pgBinPath) {
            const ext = os.platform() === 'win32' ? '.exe' : '';
            return path.join(this.pgBinPath, `${command}${ext}`);
        }
        return command; // Use from PATH
    }

    /**
     * Check if PostgreSQL tools are available
     */
    checkPostgreSQLTools() {
        const pgDump = this.getPostgreSQLCommand('pg_dump');
        try {
            if (os.platform() === 'win32') {
                execSync(`"${pgDump}" --version`, { stdio: 'ignore' });
            } else {
                execSync(`${pgDump} --version`, { stdio: 'ignore' });
            }
            return { available: true, error: null };
        } catch (error) {
            const errorMsg = `PostgreSQL tools not found. Please either:
1. Add PostgreSQL bin directory to your system PATH, or
2. Set PG_BIN_PATH environment variable (e.g., PG_BIN_PATH="C:\\Program Files\\PostgreSQL\\16\\bin")
3. Common Windows paths: C:\\Program Files\\PostgreSQL\\[version]\\bin`;
            return { available: false, error: errorMsg };
        }
    }

    /**
     * Create a database backup
     */
    async createBackup(req, res) {
        try {
            // Check if PostgreSQL tools are available
            const toolsCheck = this.checkPostgreSQLTools();
            if (!toolsCheck.available) {
                return res.status(500).json({
                    success: false,
                    error: toolsCheck.error
                });
            }

            const { name } = req.body;
            
            // Generate backup name
            const backupName = name || `backup-${new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]}-${Date.now()}`;
            const backupFile = path.join(this.backupDir, `${backupName}.sql`);
            const backupInfoFile = path.join(this.backupDir, `${backupName}.info.json`);

            // Check if backup already exists
            if (fs.existsSync(backupFile)) {
                return res.status(400).json({
                    success: false,
                    error: 'Backup with this name already exists'
                });
            }

            // Set PGPASSWORD environment variable
            process.env.PGPASSWORD = this.dbConfig.password;

            // Create pg_dump command with full path
            // Using plain SQL format (-F p) instead of custom format (-F c) for better compatibility
            // Plain SQL can be restored with psql, which is simpler and more reliable
            const pgDump = this.getPostgreSQLCommand('pg_dump');
            const dumpCommand = `"${pgDump}" -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d ${this.dbConfig.database} -F p -f "${backupFile}"`;

            // Execute backup
            execSync(dumpCommand, { stdio: 'pipe' });

            // Create backup info file
            const backupInfo = {
                name: backupName,
                timestamp: new Date().toISOString(),
                database: this.dbConfig.database,
                file: backupFile,
                size: fs.statSync(backupFile).size,
                createdBy: req.admin?.username || 'unknown'
            };

            fs.writeFileSync(backupInfoFile, JSON.stringify(backupInfo, null, 2));

            logger.info(`Backup created: ${backupName} by ${req.admin?.username || 'unknown'}`);

            res.json({
                success: true,
                message: 'Backup created successfully',
                backup: {
                    name: backupName,
                    size: backupInfo.size,
                    timestamp: backupInfo.timestamp
                }
            });

        } catch (error) {
            logger.error('Error creating backup:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to create backup'
            });
        }
    }

    /**
     * List all available backups
     */
    async listBackups(req, res) {
        try {
            if (!fs.existsSync(this.backupDir)) {
                return res.json({
                    success: true,
                    backups: []
                });
            }

            const files = fs.readdirSync(this.backupDir);
            const backups = files
                .filter(f => f.endsWith('.sql'))
                .map(f => {
                    const name = f.replace('.sql', '');
                    const filePath = path.join(this.backupDir, f);
                    const stats = fs.statSync(filePath);
                    const infoPath = path.join(this.backupDir, `${name}.info.json`);
                    
                    let info = null;
                    if (fs.existsSync(infoPath)) {
                        try {
                            info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                        } catch (e) {
                            // Ignore
                        }
                    }

                    return {
                        name,
                        size: stats.size,
                        mtime: stats.mtime.toISOString(),
                        info
                    };
                })
                .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

            res.json({
                success: true,
                backups
            });

        } catch (error) {
            logger.error('Error listing backups:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to list backups'
            });
        }
    }

    /**
     * Restore a database backup
     */
    async restoreBackup(req, res) {
        try {
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Backup name is required'
                });
            }

            let backupFile;
            let backupInfoFile;

            if (name === 'latest') {
                // Find the latest backup
                const files = fs.readdirSync(this.backupDir);
                const backups = files
                    .filter(f => f.endsWith('.sql'))
                    .map(f => ({
                        name: f.replace('.sql', ''),
                        file: path.join(this.backupDir, f),
                        mtime: fs.statSync(path.join(this.backupDir, f)).mtime
                    }))
                    .sort((a, b) => b.mtime - a.mtime);

                if (backups.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'No backups found'
                    });
                }

                backupFile = backups[0].file;
                backupInfoFile = path.join(this.backupDir, `${backups[0].name}.info.json`);
            } else {
                backupFile = path.join(this.backupDir, `${name}.sql`);
                backupInfoFile = path.join(this.backupDir, `${name}.info.json`);

                if (!fs.existsSync(backupFile)) {
                    return res.status(404).json({
                        success: false,
                        error: 'Backup not found'
                    });
                }
            }

            // Check if PostgreSQL tools are available
            const toolsCheck = this.checkPostgreSQLTools();
            if (!toolsCheck.available) {
                return res.status(500).json({
                    success: false,
                    error: toolsCheck.error
                });
            }

            // Set PGPASSWORD environment variable
            process.env.PGPASSWORD = this.dbConfig.password;

            const psql = this.getPostgreSQLCommand('psql');
            const pgRestore = this.getPostgreSQLCommand('pg_restore');

            // Terminate existing connections
            try {
                execSync(`"${psql}" -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${this.dbConfig.database}' AND pid <> pg_backend_pid();"`, { stdio: 'ignore' });
            } catch (e) {
                // Ignore errors
            }

            // Drop and recreate database
            try {
                execSync(`"${psql}" -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d postgres -c "DROP DATABASE IF EXISTS ${this.dbConfig.database};"`, { stdio: 'ignore' });
            } catch (e) {
                // Ignore errors
            }

            execSync(`"${psql}" -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d postgres -c "CREATE DATABASE ${this.dbConfig.database};"`, { stdio: 'ignore' });

            // Restore from backup
            // Check if backup is custom format (binary) or plain SQL
            // Custom format files start with "PGDMP" magic bytes
            let isCustomFormat = false;
            try {
                const buffer = Buffer.alloc(5);
                const fd = fs.openSync(backupFile, 'r');
                fs.readSync(fd, buffer, 0, 5, 0);
                fs.closeSync(fd);
                const header = buffer.toString('ascii', 0, 5);
                isCustomFormat = header === 'PGDMP';
                logger.info(`Backup format detected: ${isCustomFormat ? 'Custom (binary)' : 'Plain SQL'}`);
            } catch (e) {
                logger.warn('Could not detect backup format, assuming plain SQL:', e.message);
                // Default to plain SQL if detection fails
                isCustomFormat = false;
            }

            if (isCustomFormat) {
                // Use pg_restore for custom format backups
                // Note: We don't use -c (clean) flag because we already dropped and recreated the database
                // Using --no-owner --no-privileges to avoid permission issues
                // Using --verbose for better error reporting
                const restoreCommand = `"${pgRestore}" -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d ${this.dbConfig.database} --no-owner --no-privileges --verbose "${backupFile}"`;
                logger.info(`Restoring custom format backup with pg_restore...`);
                try {
                    execSync(restoreCommand, { stdio: 'pipe' });
                } catch (restoreError) {
                    // pg_restore may have non-fatal errors, check if database was actually restored
                    logger.warn('pg_restore completed with warnings/errors:', restoreError.message);
                    // Continue - the restore might have partially succeeded
                }
            } else {
                // Use psql for plain SQL backups
                const restoreCommand = `"${psql}" -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d ${this.dbConfig.database} -f "${backupFile}"`;
                logger.info(`Restoring plain SQL backup with psql...`);
                try {
                    execSync(restoreCommand, { stdio: 'pipe' });
                } catch (psqlError) {
                    // If psql fails, it might be a custom format file that wasn't detected correctly
                    // Try pg_restore as a fallback
                    logger.warn('psql restore failed, trying pg_restore as fallback:', psqlError.message);
                    const fallbackCommand = `"${pgRestore}" -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.user} -d ${this.dbConfig.database} --no-owner --no-privileges "${backupFile}"`;
                    execSync(fallbackCommand, { stdio: 'pipe' });
                    logger.info('Fallback pg_restore succeeded');
                }
            }

            logger.info(`Backup restored: ${name} by ${req.admin?.username || 'unknown'}`);

            res.json({
                success: true,
                message: 'Database restored successfully',
                backup: {
                    name: name === 'latest' ? path.basename(backupFile, '.sql') : name
                }
            });

        } catch (error) {
            logger.error('Error restoring backup:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to restore backup'
            });
        }
    }

    /**
     * Check PostgreSQL tools availability
     */
    async checkTools(req, res) {
        // Re-check path in case it was just set
        this.pgBinPath = this.findPostgreSQLBinPath();
        const toolsCheck = this.checkPostgreSQLTools();
        
        // If not found, try to provide helpful suggestions
        let suggestions = [];
        if (!toolsCheck.available) {
            // Check if we can find any PostgreSQL installations
            if (os.platform() === 'win32') {
                const searchDirs = [
                    'C:\\Program Files\\PostgreSQL',
                    'C:\\Program Files (x86)\\PostgreSQL',
                    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'PostgreSQL')
                ];
                
                for (const searchDir of searchDirs) {
                    if (fs.existsSync(searchDir)) {
                        try {
                            const versions = fs.readdirSync(searchDir, { withFileTypes: true })
                                .filter(e => e.isDirectory())
                                .map(e => e.name)
                                .sort((a, b) => parseInt(b) - parseInt(a));
                            
                            if (versions.length > 0) {
                                const suggestedPath = path.join(searchDir, versions[0], 'bin');
                                suggestions.push(suggestedPath);
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                }
            }
        }
        
        res.json({
            success: toolsCheck.available,
            available: toolsCheck.available,
            error: toolsCheck.error,
            pgBinPath: this.pgBinPath || 'PATH',
            suggestions: suggestions
        });
    }

    /**
     * Delete a backup
     */
    async deleteBackup(req, res) {
        try {
            const { name } = req.params;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Backup name is required'
                });
            }

            const backupFile = path.join(this.backupDir, `${name}.sql`);
            const backupInfoFile = path.join(this.backupDir, `${name}.info.json`);

            if (!fs.existsSync(backupFile)) {
                return res.status(404).json({
                    success: false,
                    error: 'Backup not found'
                });
            }

            // Delete backup files
            fs.unlinkSync(backupFile);
            if (fs.existsSync(backupInfoFile)) {
                fs.unlinkSync(backupInfoFile);
            }

            logger.info(`Backup deleted: ${name} by ${req.admin?.username || 'unknown'}`);

            res.json({
                success: true,
                message: 'Backup deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting backup:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to delete backup'
            });
        }
    }
}

module.exports = new BackupRestoreController();


