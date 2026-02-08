const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Store = require('electron-store');

const repoRoot = path.resolve(__dirname, '..', '..');
const historyStore = new Store({ name: 'upload-history', defaults: { entries: [] } });

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 720,
        minWidth: 860,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function sendProgress(target, payload) {
    if (!target.isDestroyed()) {
        target.send('upload-progress', payload);
    }
}

function readHistory(limit = 25) {
    const entries = historyStore.get('entries', []);
    return entries.slice(-limit).reverse();
}

function appendHistory(entry) {
    const entries = historyStore.get('entries', []);
    entries.push(entry);
    historyStore.set('entries', entries.slice(-50));
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('history-updated', readHistory());
    }
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: repoRoot,
            shell: process.platform === 'win32',
            ...options
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString();
            options.onStdout?.(chunk.toString());
        });

        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString();
            options.onStderr?.(chunk.toString());
        });

        child.on('error', (error) => {
            reject(error);
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                const err = new Error(stderr.trim() || `Command failed with exit code ${code}`);
                err.code = code;
                reject(err);
            }
        });
    });
}

async function uploadSqlFile(filePath, service, target) {
    if (!service) {
        throw new Error('Railway service name is required to upload SQL files.');
    }

    sendProgress(target, { file: filePath, status: 'working', message: 'Uploading SQL via railway script...' });

    const scriptPath = path.join(repoRoot, 'scripts', 'upload-sql-to-railway.js');
    const args = ['node', scriptPath, '--file', filePath, '--service', service];

    await runCommand(args.shift(), args, {
        onStdout: (msg) => sendProgress(target, { file: filePath, status: 'info', message: msg.trim() }),
        onStderr: (msg) => sendProgress(target, { file: filePath, status: 'info', message: msg.trim() })
    });

    sendProgress(target, { file: filePath, status: 'success', message: 'SQL upload completed.' });
}

function ensureRepoPath(filePath) {
    const normalisedRoot = repoRoot.toLowerCase();
    const normalisedFile = filePath.toLowerCase();

    if (normalisedFile.startsWith(normalisedRoot)) {
        return filePath;
    }

    const incomingDir = path.join(repoRoot, 'uploads', 'from-ui');
    fs.mkdirSync(incomingDir, { recursive: true });
    const destination = path.join(incomingDir, `${Date.now()}-${path.basename(filePath)}`);
    fs.copyFileSync(filePath, destination);
    return destination;
}

async function deployCodeFiles(files, commitMessage, target) {
    if (!files.length) {
        return;
    }

    sendProgress(target, { status: 'working', message: 'Preparing files for git commit...' });

    const repoFiles = files.map((filePath) => ensureRepoPath(filePath));

    const relativePaths = repoFiles.map((absPath) => path.relative(repoRoot, absPath));

    await runCommand('git', ['add', ...relativePaths], {
        onStdout: (msg) => sendProgress(target, { status: 'info', message: msg.trim() }),
        onStderr: (msg) => sendProgress(target, { status: 'info', message: msg.trim() })
    });

    const message = commitMessage || 'Upload files via Railway UI';

    await runCommand('git', ['commit', '-m', message], {
        onStdout: (msg) => sendProgress(target, { status: 'info', message: msg.trim() }),
        onStderr: (msg) => sendProgress(target, { status: 'info', message: msg.trim() })
    });

    await runCommand('git', ['push', 'origin', 'main'], {
        onStdout: (msg) => sendProgress(target, { status: 'info', message: msg.trim() }),
        onStderr: (msg) => sendProgress(target, { status: 'info', message: msg.trim() })
    });

    sendProgress(target, { status: 'success', message: 'Code files pushed to Railway (via GitHub).' });
}

ipcMain.handle('upload-files', async (event, payload) => {
    const { files, service, commitMessage } = payload;
    const target = event.sender;
    const timestamp = new Date().toISOString();
    const results = files.map((file) => ({ file, timestamp, status: 'pending', message: '' }));

    const sqlFiles = [];
    const codeFiles = [];

    files.forEach((file, index) => {
        const extension = path.extname(file).toLowerCase();
        if (extension === '.sql') {
            sqlFiles.push({ file, index });
        } else if (['.js', '.css', '.html'].includes(extension)) {
            codeFiles.push({ file, index });
        } else {
            results[index].status = 'error';
            results[index].message = 'Unsupported file type';
        }
    });

    if (codeFiles.length) {
        try {
            await deployCodeFiles(codeFiles.map((item) => item.file), commitMessage, target);
            codeFiles.forEach(({ index }) => {
                results[index].status = 'success';
                results[index].message = 'Code file committed & pushed.';
            });
        } catch (error) {
            codeFiles.forEach(({ file, index }) => {
                results[index].status = 'error';
                results[index].message = error.message;
                sendProgress(target, { file, status: 'error', message: error.message });
            });
        }
    }

    for (const { file, index } of sqlFiles) {
        try {
            await uploadSqlFile(file, service, target);
            results[index].status = 'success';
            results[index].message = 'SQL uploaded successfully';
        } catch (error) {
            results[index].status = 'error';
            results[index].message = error.message;
            sendProgress(target, { file, status: 'error', message: error.message });
        }
    }

    appendHistory({
        id: Date.now(),
        files: results,
        service: service || null,
        commitMessage: commitMessage || null,
        timestamp
    });

    return results;
});

ipcMain.handle('get-history', () => {
    return readHistory();
});
