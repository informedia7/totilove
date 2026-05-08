const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const archiver = require('archiver');
const crypto = require('crypto');

const execAsync = promisify(exec);

class BackupService {
    constructor(db) {
        this.db = db;
        this.backupDir = path.join(__dirname, '..', 'backups');
        this.maxBackups = 10; // Keep only last 10 backups
        this.ensureBackupDirectory();
    }

    async ensureBackupDirectory() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            console.error('Error creating backup directory:', error);
        }
    }

    async createBackup(options = {}) {
        const {
            type = 'full', // 'full', 'incremental', 'data_only'
            includeFiles = true,
            compression = true,
            description = ''
        } = options;

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupId = `backup_${type}_${timestamp}`;
            const backupPath = path.join(this.backupDir, backupId);

            // Create backup directory
            await fs.mkdir(backupPath, { recursive: true });

            // Create database backup
            const dbBackupResult = await this.createDatabaseBackup(backupPath, type);
            if (!dbBackupResult.success) {
                throw new Error(`Database backup failed: ${dbBackupResult.message}`);
            }

            // Create file backup if requested
            let fileBackupResult = { success: true, fileCount: 0 };
            if (includeFiles) {
                fileBackupResult = await this.createFileBackup(backupPath);
            }

            // Create backup manifest
            const manifest = {
                id: backupId,
                type,
                timestamp: new Date().toISOString(),
                description,
                database: dbBackupResult,
                files: fileBackupResult,
                compression,
                size: 0
            };

            // Save manifest
            await fs.writeFile(
                path.join(backupPath, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
            );

            // Compress backup if requested
            let finalBackupPath = backupPath;
            if (compression) {
                const compressedPath = await this.compressBackup(backupPath, backupId);
                finalBackupPath = compressedPath;
                
                // Get compressed file size
                const stats = await fs.stat(compressedPath);
                manifest.size = stats.size;
                manifest.compressed = true;
                manifest.compressedPath = compressedPath;
            }

            // Record backup in database
            await this.recordBackup(manifest);

            // Clean up old backups
            await this.cleanupOldBackups();

            console.log(`✅ Backup created successfully: ${backupId}`);
            return {
                success: true,
                backupId,
                path: finalBackupPath,
                manifest
            };
        } catch (error) {
            console.error('Backup creation failed:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async createDatabaseBackup(backupPath, type) {
        try {
            const dbConfig = this.db.getPool().options;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const dbBackupFile = path.join(backupPath, `database_${timestamp}.sql`);

            // Create pg_dump command
            const pgDumpCmd = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${dbBackupFile}"`;

            // Set password environment variable
            const env = { ...process.env, PGPASSWORD: dbConfig.password };

            // Execute pg_dump
            const { stdout, stderr } = await execAsync(pgDumpCmd, { env });

            if (stderr && !stderr.includes('WARNING')) {
                throw new Error(`pg_dump error: ${stderr}`);
            }

            // Get file size
            const stats = await fs.stat(dbBackupFile);
            const fileSize = stats.size;

            // Create checksum
            const fileBuffer = await fs.readFile(dbBackupFile);
            const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            return {
                success: true,
                file: dbBackupFile,
                size: fileSize,
                checksum,
                type
            };
        } catch (error) {
            console.error('Database backup error:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async createFileBackup(backupPath) {
        try {
            const uploadsDir = path.join(__dirname, '..', 'app', 'uploads');
            const filesBackupDir = path.join(backupPath, 'files');
            
            // Check if uploads directory exists
            try {
                await fs.access(uploadsDir);
            } catch {
                return {
                    success: true,
                    fileCount: 0,
                    message: 'Uploads directory not found'
                };
            }

            // Create files backup directory
            await fs.mkdir(filesBackupDir, { recursive: true });

            // Copy uploads directory
            await this.copyDirectory(uploadsDir, filesBackupDir);

            // Count files
            const fileCount = await this.countFiles(filesBackupDir);

            return {
                success: true,
                fileCount,
                directory: filesBackupDir
            };
        } catch (error) {
            console.error('File backup error:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async copyDirectory(src, dest) {
        const entries = await fs.readdir(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                await fs.mkdir(destPath, { recursive: true });
                await this.copyDirectory(srcPath, destPath);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }

    async countFiles(directory) {
        let count = 0;
        
        const countFilesRecursive = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    await countFilesRecursive(fullPath);
                } else {
                    count++;
                }
            }
        };

        await countFilesRecursive(directory);
        return count;
    }

    async compressBackup(backupPath, backupId) {
        return new Promise((resolve, reject) => {
            const compressedPath = path.join(this.backupDir, `${backupId}.zip`);
            const output = fs.createWriteStream(compressedPath);
            const archive = archiver('zip', {
                zlib: { level: 9 } // Maximum compression
            });

            output.on('close', () => {
                // Remove uncompressed backup directory
                fs.rm(backupPath, { recursive: true, force: true })
                    .then(() => resolve(compressedPath))
                    .catch(reject);
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);
            archive.directory(backupPath, false);
            archive.finalize();
        });
    }

    async recordBackup(manifest) {
        try {
            await this.db.query(`
                INSERT INTO backup_logs (
                    backup_id, type, description, file_path, size, checksum, 
                    status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            `, [
                manifest.id,
                manifest.type,
                manifest.description,
                manifest.compressed ? manifest.compressedPath : manifest.database.file,
                manifest.size,
                manifest.database.checksum,
                'completed'
            ]);
        } catch (error) {
            console.error('Error recording backup:', error);
        }
    }

    async listBackups() {
        try {
            // Get backups from database
            const result = await this.db.query(`
                SELECT 
                    backup_id, type, description, file_path, size, checksum,
                    status, created_at
                FROM backup_logs 
                ORDER BY created_at DESC
            `);

            // Check if backup files still exist
            const backups = [];
            for (const backup of result.rows) {
                try {
                    await fs.access(backup.file_path);
                    backups.push({
                        ...backup,
                        exists: true
                    });
                } catch {
                    backups.push({
                        ...backup,
                        exists: false
                    });
                }
            }

            return {
                success: true,
                backups
            };
        } catch (error) {
            console.error('Error listing backups:', error);
            return {
                success: false,
                message: 'Failed to list backups'
            };
        }
    }

    async restoreBackup(backupId) {
        try {
            // Get backup info from database
            const result = await this.db.query(`
                SELECT * FROM backup_logs WHERE backup_id = $1
            `, [backupId]);

            if (result.rows.length === 0) {
                return {
                    success: false,
                    message: 'Backup not found'
                };
            }

            const backup = result.rows[0];

            // Check if backup file exists
            try {
                await fs.access(backup.file_path);
            } catch {
                return {
                    success: false,
                    message: 'Backup file not found'
                };
            }

            // Extract backup if compressed
            let extractedPath = backup.file_path;
            if (backup.file_path.endsWith('.zip')) {
                extractedPath = await this.extractBackup(backup.file_path);
            }

            // Restore database
            const dbRestoreResult = await this.restoreDatabase(extractedPath);
            if (!dbRestoreResult.success) {
                throw new Error(`Database restore failed: ${dbRestoreResult.message}`);
            }

            // Restore files if they exist
            const filesDir = path.join(extractedPath, 'files');
            try {
                await fs.access(filesDir);
                await this.restoreFiles(filesDir);
            } catch {
                console.log('No files to restore');
            }

            // Log restore operation
            await this.logRestore(backupId, 'completed');

            return {
                success: true,
                message: 'Backup restored successfully'
            };
        } catch (error) {
            console.error('Backup restore failed:', error);
            await this.logRestore(backupId, 'failed', error.message);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async extractBackup(backupPath) {
        const extractPath = backupPath.replace('.zip', '_extracted');
        
        return new Promise((resolve, reject) => {
            const extract = require('extract-zip');
            
            extract(backupPath, { dir: extractPath })
                .then(() => resolve(extractPath))
                .catch(reject);
        });
    }

    async restoreDatabase(backupPath) {
        try {
            // Find database backup file
            const files = await fs.readdir(backupPath);
            const dbFile = files.find(file => file.startsWith('database_') && file.endsWith('.sql'));
            
            if (!dbFile) {
                return {
                    success: false,
                    message: 'Database backup file not found'
                };
            }

            const dbBackupFile = path.join(backupPath, dbFile);
            const dbConfig = this.db.getPool().options;

            // Create psql restore command
            const psqlCmd = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${dbBackupFile}"`;

            // Set password environment variable
            const env = { ...process.env, PGPASSWORD: dbConfig.password };

            // Execute psql restore
            const { stdout, stderr } = await execAsync(psqlCmd, { env });

            if (stderr && !stderr.includes('WARNING')) {
                throw new Error(`psql restore error: ${stderr}`);
            }

            return {
                success: true,
                message: 'Database restored successfully'
            };
        } catch (error) {
            console.error('Database restore error:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async restoreFiles(filesDir) {
        try {
            const uploadsDir = path.join(__dirname, '..', 'app', 'uploads');
            
            // Create uploads directory if it doesn't exist
            await fs.mkdir(uploadsDir, { recursive: true });

            // Copy files back
            await this.copyDirectory(filesDir, uploadsDir);

            return {
                success: true,
                message: 'Files restored successfully'
            };
        } catch (error) {
            console.error('File restore error:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    async cleanupOldBackups() {
        try {
            const result = await this.db.query(`
                SELECT backup_id, file_path, created_at
                FROM backup_logs 
                ORDER BY created_at DESC
            `);

            if (result.rows.length <= this.maxBackups) {
                return;
            }

            const backupsToDelete = result.rows.slice(this.maxBackups);

            for (const backup of backupsToDelete) {
                try {
                    // Delete backup file
                    await fs.unlink(backup.file_path);
                    
                    // Delete from database
                    await this.db.query(`
                        DELETE FROM backup_logs WHERE backup_id = $1
                    `, [backup.backup_id]);

                    console.log(`🗑️ Deleted old backup: ${backup.backup_id}`);
                } catch (error) {
                    console.error(`Error deleting backup ${backup.backup_id}:`, error);
                }
            }
        } catch (error) {
            console.error('Error cleaning up old backups:', error);
        }
    }

    async logRestore(backupId, status, errorMessage = null) {
        try {
            await this.db.query(`
                INSERT INTO restore_logs (
                    backup_id, status, error_message, created_at
                ) VALUES ($1, $2, $3, NOW())
            `, [backupId, status, errorMessage]);
        } catch (error) {
            console.error('Error logging restore:', error);
        }
    }

    async getBackupStats() {
        try {
            const result = await this.db.query(`
                SELECT 
                    COUNT(*) as total_backups,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_backups,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_backups,
                    SUM(size) as total_size,
                    AVG(size) as avg_size,
                    MAX(created_at) as last_backup
                FROM backup_logs
            `);

            return {
                success: true,
                stats: result.rows[0]
            };
        } catch (error) {
            console.error('Error fetching backup stats:', error);
            return {
                success: false,
                message: 'Failed to fetch backup stats'
            };
        }
    }

    async validateBackup(backupId) {
        try {
            const result = await this.db.query(`
                SELECT * FROM backup_logs WHERE backup_id = $1
            `, [backupId]);

            if (result.rows.length === 0) {
                return {
                    success: false,
                    message: 'Backup not found'
                };
            }

            const backup = result.rows[0];

            // Check if file exists
            try {
                await fs.access(backup.file_path);
            } catch {
                return {
                    success: false,
                    message: 'Backup file not found',
                    valid: false
                };
            }

            // Verify checksum if available
            if (backup.checksum) {
                const fileBuffer = await fs.readFile(backup.file_path);
                const currentChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
                
                if (currentChecksum !== backup.checksum) {
                    return {
                        success: false,
                        message: 'Checksum verification failed',
                        valid: false
                    };
                }
            }

            return {
                success: true,
                valid: true,
                message: 'Backup is valid'
            };
        } catch (error) {
            console.error('Error validating backup:', error);
            return {
                success: false,
                message: error.message,
                valid: false
            };
        }
    }
}

module.exports = BackupService; 