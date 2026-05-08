#!/usr/bin/env node

/**
 * Create Backup Script
 * 
 * Creates backups of current CSS, JS, and HTML files
 * before starting migration.
 * 
 * Usage: node scripts/create-backup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
const backupDir = path.join(process.cwd(), 'migration-backups', timestamp);

console.log('🛡️  Creating Migration Backup...\n');
console.log(`📦 Backup location: ${backupDir}\n`);

// Create backup directory
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Backup CSS files
console.log('📄 Backing up CSS files...');
const cssSource = path.join(process.cwd(), 'app/assets/css');
const cssBackup = path.join(backupDir, 'css');

if (fs.existsSync(cssSource)) {
  fs.mkdirSync(cssBackup, { recursive: true });
  const cssFiles = fs.readdirSync(cssSource);
  cssFiles.forEach(file => {
    if (fs.statSync(path.join(cssSource, file)).isFile()) {
      fs.copyFileSync(
        path.join(cssSource, file),
        path.join(cssBackup, file)
      );
      console.log(`   ✅ Backed up: ${file}`);
    }
  });
}

// Backup JS files
console.log('\n📄 Backing up JavaScript files...');
const jsSource = path.join(process.cwd(), 'app/assets/js');
const jsBackup = path.join(backupDir, 'js');

if (fs.existsSync(jsSource)) {
  fs.mkdirSync(jsBackup, { recursive: true });
  const jsFiles = fs.readdirSync(jsSource);
  jsFiles.forEach(file => {
    const filePath = path.join(jsSource, file);
    if (fs.statSync(filePath).isFile()) {
      fs.copyFileSync(filePath, path.join(jsBackup, file));
      console.log(`   ✅ Backed up: ${file}`);
    }
  });
}

// Create git backup info
console.log('\n📝 Creating git backup info...');
try {
  const gitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  
  const backupInfo = {
    timestamp: new Date().toISOString(),
    gitHash: gitHash,
    gitBranch: gitBranch,
    backupLocation: backupDir,
    note: 'Migration backup - before architecture refactoring'
  };
  
  fs.writeFileSync(
    path.join(backupDir, 'backup-info.json'),
    JSON.stringify(backupInfo, null, 2)
  );
  
  console.log(`   ✅ Git hash: ${gitHash}`);
  console.log(`   ✅ Git branch: ${gitBranch}`);
} catch (error) {
  console.log('   ⚠️  Not a git repository or git not available');
}

console.log('\n✅ Backup complete!');
console.log(`\n📦 Backup saved to: ${backupDir}`);
console.log('\n💡 To restore:');
console.log(`   cp -r ${backupDir}/css/* app/assets/css/`);
console.log(`   cp -r ${backupDir}/js/* app/assets/js/`);













































