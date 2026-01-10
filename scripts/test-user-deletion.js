#!/usr/bin/env node

/**
 * Standalone utility to test user deletion
 * 
 * Usage:
 *   node scripts/test-user-deletion.js <user_id>
 *   node scripts/test-user-deletion.js --email <email>
 *   node scripts/test-user-deletion.js --dry-run <user_id>
 * 
 * This script tests the user deletion process without modifying the app code.
 */

const path = require('path');
const readline = require('readline');

// Add project root to path
const projectRoot = path.join(__dirname, '..');

// Import required modules
const UserManagementService = require(path.join(projectRoot, 'services', 'userManagementService'));
const databaseManager = require(path.join(projectRoot, 'config', 'database'));
const redisManager = require(path.join(projectRoot, 'config', 'redis'));

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    log('\n' + '='.repeat(60), 'cyan');
    log(title, 'bright');
    log('='.repeat(60), 'cyan');
}

async function getUserByEmail(email) {
    const pool = databaseManager.getPool();
    const result = await pool.query(
        'SELECT id, real_name, email, date_joined FROM users WHERE email = $1',
        [email]
    );
    return result.rows[0] || null;
}

async function getUserById(userId) {
    const pool = databaseManager.getPool();
    const result = await pool.query(
        'SELECT id, real_name, email, date_joined FROM users WHERE id = $1',
        [userId]
    );
    return result.rows[0] || null;
}

async function getUserStats(userId) {
    const pool = databaseManager.getPool();
    
    const stats = {
        messages: 0,
        likes: 0,
        images: 0,
        matches: 0,
        sessions: 0,
        reports: 0,
    };
    
    try {
        const messages = await pool.query(
            'SELECT COUNT(*) as count FROM user_messages WHERE sender_id = $1 OR receiver_id = $1',
            [userId]
        );
        stats.messages = parseInt(messages.rows[0].count) || 0;
    } catch (e) {
        // Ignore
    }
    
    try {
        const likes = await pool.query(
            'SELECT COUNT(*) as count FROM users_likes WHERE liked_by = $1 OR liked_user_id = $1',
            [userId]
        );
        stats.likes = parseInt(likes.rows[0].count) || 0;
    } catch (e) {
        // Ignore
    }
    
    try {
        const images = await pool.query(
            'SELECT COUNT(*) as count FROM user_images WHERE user_id = $1',
            [userId]
        );
        stats.images = parseInt(images.rows[0].count) || 0;
    } catch (e) {
        // Ignore
    }
    
    try {
        const matches = await pool.query(
            'SELECT COUNT(*) as count FROM user_matches WHERE user1_id = $1 OR user2_id = $1',
            [userId]
        );
        stats.matches = parseInt(matches.rows[0].count) || 0;
    } catch (e) {
        // Ignore
    }
    
    try {
        const sessions = await pool.query(
            'SELECT COUNT(*) as count FROM user_sessions WHERE user_id = $1',
            [userId]
        );
        stats.sessions = parseInt(sessions.rows[0].count) || 0;
    } catch (e) {
        // Ignore
    }
    
    try {
        const reports = await pool.query(
            'SELECT COUNT(*) as count FROM user_reports WHERE reporter_id = $1 OR reported_user_id = $1',
            [userId]
        );
        stats.reports = parseInt(reports.rows[0].count) || 0;
    } catch (e) {
        // Ignore
    }
    
    return stats;
}

async function checkDeletedUserRecord(userId) {
    const pool = databaseManager.getPool();
    try {
        const result = await pool.query(
            'SELECT * FROM users_deleted WHERE deleted_user_id = $1',
            [userId]
        );
        return result.rows[0] || null;
    } catch (e) {
        return null;
    }
}

function printUserInfo(user) {
    logSection('User Information');
    log(`ID: ${user.id}`, 'cyan');
    log(`Name: ${user.real_name}`, 'cyan');
    log(`Email: ${user.email}`, 'cyan');
    log(`Date Joined: ${user.date_joined}`, 'cyan');
}

function printUserStats(stats) {
    logSection('User Data Statistics');
    log(`Messages: ${stats.messages}`, 'yellow');
    log(`Likes: ${stats.likes}`, 'yellow');
    log(`Profile Images: ${stats.images}`, 'yellow');
    log(`Matches: ${stats.matches}`, 'yellow');
    log(`Active Sessions: ${stats.sessions}`, 'yellow');
    log(`Reports: ${stats.reports}`, 'yellow');
}

function printDeletedUserRecord(record) {
    if (record) {
        logSection('Deleted User Record (users_deleted table)');
        log(`Deleted User ID: ${record.deleted_user_id}`, 'cyan');
        log(`Name: ${record.real_name}`, 'cyan');
        log(`Email: ${record.email}`, 'cyan');
        log(`Deleted By: ${record.deleted_by}`, 'cyan');
        log(`Created At: ${record.created_at}`, 'cyan');
    } else {
        log('No deleted user record found', 'yellow');
    }
}

function askConfirmation(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase().trim() === 'yes' || answer.toLowerCase().trim() === 'y');
        });
    });
}

async function main() {
    const args = process.argv.slice(2);
    let userId = null;
    let email = null;
    let dryRun = false;
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--email' && args[i + 1]) {
            email = args[i + 1];
            i++;
        } else if (args[i] === '--dry-run') {
            dryRun = true;
            if (args[i + 1]) {
                userId = parseInt(args[i + 1]);
                i++;
            }
        } else if (!isNaN(parseInt(args[i]))) {
            userId = parseInt(args[i]);
        }
    }
    
    logSection('User Deletion Test Utility');
    
    try {
        // Connect to database
        log('Connecting to database...', 'blue');
        await databaseManager.connect();
        log('✅ Database connected', 'green');
        
        // Connect to Redis (optional, continue if it fails)
        log('Connecting to Redis...', 'blue');
        try {
            await redisManager.connect();
            log('✅ Redis connected', 'green');
        } catch (redisError) {
            log('⚠️  Redis connection failed (continuing without cache)', 'yellow');
            log(`   Error: ${redisError.message}`, 'yellow');
        }
        
        // Get user
        let user = null;
        if (email) {
            log(`\nLooking up user by email: ${email}`, 'blue');
            user = await getUserByEmail(email);
            if (user) {
                userId = user.id;
            }
        } else if (userId) {
            log(`\nLooking up user by ID: ${userId}`, 'blue');
            user = await getUserById(userId);
        } else {
            log('❌ Error: Please provide either a user ID or email', 'red');
            log('Usage: node scripts/test-user-deletion.js <user_id>', 'yellow');
            log('   or: node scripts/test-user-deletion.js --email <email>', 'yellow');
            log('   or: node scripts/test-user-deletion.js --dry-run <user_id>', 'yellow');
            process.exit(1);
        }
        
        if (!user) {
            log('❌ User not found', 'red');
            process.exit(1);
        }
        
        // Display user information
        printUserInfo(user);
        
        // Get user statistics
        log('\nGathering user statistics...', 'blue');
        const stats = await getUserStats(userId);
        printUserStats(stats);
        
        // Check if user is already deleted
        const deletedRecord = await checkDeletedUserRecord(userId);
        if (deletedRecord) {
            log('\n⚠️  WARNING: This user already has a deleted record!', 'yellow');
            printDeletedUserRecord(deletedRecord);
        }
        
        // Dry run mode
        if (dryRun) {
            logSection('DRY RUN MODE - No changes will be made');
            log('This would delete:', 'yellow');
            log(`  - User account (ID: ${userId})`, 'yellow');
            log(`  - ${stats.messages} messages`, 'yellow');
            log(`  - ${stats.likes} likes`, 'yellow');
            log(`  - ${stats.images} profile images`, 'yellow');
            log(`  - ${stats.matches} matches`, 'yellow');
            log(`  - ${stats.sessions} sessions`, 'yellow');
            log(`  - ${stats.reports} reports`, 'yellow');
            log('\n✅ Dry run completed - no changes made', 'green');
            process.exit(0);
        }
        
        // Confirm deletion
        logSection('⚠️  WARNING: This will PERMANENTLY DELETE the user account!');
        const confirmed = await askConfirmation('Are you sure you want to proceed? (yes/no): ');
        
        if (!confirmed) {
            log('Deletion cancelled', 'yellow');
            process.exit(0);
        }
        
        // Perform deletion
        logSection('Starting User Deletion');
        const pool = databaseManager.getPool();
        const userManagementService = new UserManagementService(pool, redisManager);
        
        log('Calling deleteUser()...', 'blue');
        const startTime = Date.now();
        
        try {
            const result = await userManagementService.deleteUser(userId);
            const duration = Date.now() - startTime;
            
            logSection('✅ Deletion Successful');
            log(`Duration: ${duration}ms`, 'green');
            log(`Message: ${result.message}`, 'green');
            log(`Receivers Notified: ${result.receiversNotified}`, 'green');
            
            // Verify deletion
            log('\nVerifying deletion...', 'blue');
            const verifyUser = await getUserById(userId);
            if (verifyUser) {
                log('⚠️  WARNING: User still exists in database!', 'yellow');
            } else {
                log('✅ User successfully removed from users table', 'green');
            }
            
            // Check deleted user record
            const newDeletedRecord = await checkDeletedUserRecord(userId);
            if (newDeletedRecord) {
                log('\n✅ Deleted user record created:', 'green');
                printDeletedUserRecord(newDeletedRecord);
            } else {
                log('⚠️  No deleted user record found (this may be expected)', 'yellow');
            }
            
        } catch (error) {
            const duration = Date.now() - startTime;
            logSection('❌ Deletion Failed');
            log(`Duration: ${duration}ms`, 'red');
            log(`Error: ${error.message}`, 'red');
            if (error.stack) {
                log('\nStack trace:', 'red');
                log(error.stack, 'red');
            }
            process.exit(1);
        }
        
    } catch (error) {
        logSection('❌ Fatal Error');
        log(`Error: ${error.message}`, 'red');
        if (error.stack) {
            log('\nStack trace:', 'red');
            log(error.stack, 'red');
        }
        process.exit(1);
    } finally {
        // Cleanup
        try {
            await databaseManager.disconnect();
            log('\n✅ Database disconnected', 'green');
        } catch (e) {
            // Ignore
        }
        
        try {
            await redisManager.disconnect();
            log('✅ Redis disconnected', 'green');
        } catch (e) {
            // Ignore
        }
    }
}

// Run the script
if (require.main === module) {
    main().catch((error) => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { main };

























