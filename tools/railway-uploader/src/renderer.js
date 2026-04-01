const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const uploadBtn = document.getElementById('uploadBtn');
const pendingList = document.getElementById('pendingList');
const logList = document.getElementById('logList');
const historyList = document.getElementById('historyList');
const serviceInput = document.getElementById('serviceInput');
const commitMessageInput = document.getElementById('commitMessageInput');

const CODE_EXTENSIONS = ['.js', '.css', '.html'];
const SQL_EXTENSION = '.sql';
const SUPPORTED_EXTENSIONS = [...CODE_EXTENSIONS, SQL_EXTENSION];
const pendingFiles = new Map();

function addPendingFile(file) {
    if (!file.path) {
        addLogEntry(`Unable to read a file path for ${file.name}. Try dragging directly from Explorer.`, 'error');
        return;
    }

    const lowerName = file.name.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
        addLogEntry(`${file.name} is not a supported file type.`, 'error');
        return;
    }

    if (pendingFiles.has(file.path)) {
        return;
    }

    const li = document.createElement('li');
    li.dataset.path = file.path;
    li.innerHTML = `
        <span class="file-path">${file.name}</span>
        <span class="badge info">Pending</span>
    `;
    pendingList.appendChild(li);
    pendingFiles.set(file.path, { element: li });
}

function handleFiles(files) {
    Array.from(files).forEach((file) => addPendingFile(file));
    uploadBtn.disabled = pendingFiles.size === 0;
}

dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(event.dataTransfer.files);
});

browseBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (event) => {
    handleFiles(event.target.files);
});

function addLogEntry(message, status = 'info') {
    const li = document.createElement('li');
    li.innerHTML = `
        <span>${message}</span>
        <span class="badge ${status}">${status.toUpperCase()}</span>
    `;
    logList.prepend(li);
}

function requiresCommit(files) {
    return files.some((filePath) => CODE_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext)));
}

function requiresService(files) {
    return files.some((filePath) => filePath.toLowerCase().endsWith(SQL_EXTENSION));
}

function renderHistory(entries) {
    historyList.innerHTML = '';
    entries.forEach((entry) => {
        const li = document.createElement('li');
        const fileSummary = entry.files.map((f) => `${pathBasename(f.file)} (${f.status})`).join(', ');
        li.innerHTML = `
            <div class="history-details">
                <strong>${new Date(entry.timestamp).toLocaleString()}</strong>
                <span>${fileSummary}</span>
                ${entry.service ? `<span>Service: ${entry.service}</span>` : ''}
                ${entry.commitMessage ? `<span>Commit: ${entry.commitMessage}</span>` : ''}
            </div>
        `;
        historyList.appendChild(li);
    });
}

function pathBasename(fullPath) {
    return fullPath.split(/[\\/]/).pop();
}

uploadBtn.addEventListener('click', async () => {
    if (pendingFiles.size === 0) {
        return;
    }

    uploadBtn.disabled = true;
    const files = Array.from(pendingFiles.keys());
    const commitMessage = commitMessageInput.value.trim();
    const serviceName = serviceInput.value.trim();

    if (requiresCommit(files) && !commitMessage) {
        addLogEntry('Commit message is required when uploading JS/CSS/HTML files.', 'error');
        uploadBtn.disabled = false;
        return;
    }

    if (requiresService(files) && !serviceName) {
        addLogEntry('Railway service name is required when uploading SQL files.', 'error');
        uploadBtn.disabled = false;
        return;
    }

    addLogEntry(`Starting upload for ${files.length} file(s)...`, 'info');

    try {
        await window.electronAPI.uploadFiles({
            files,
            service: serviceName,
            commitMessage
        });
        addLogEntry('Upload sequence completed.', 'success');
        pendingList.innerHTML = '';
        pendingFiles.clear();
    } catch (error) {
        addLogEntry(error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
    }
});

window.electronAPI.onProgress((payload) => {
    const { file, status, message } = payload;
    if (file && pendingFiles.has(file)) {
        const { element } = pendingFiles.get(file);
        const badge = element.querySelector('.badge');
        badge.textContent = status.toUpperCase();
        badge.className = `badge ${status}`;
        const detail = message ? `${pathBasename(file)} — ${message}` : pathBasename(file);
        element.querySelector('.file-path').textContent = detail;
    }
    if (message) {
        addLogEntry(`${pathBasename(file || 'Task')}: ${message}`, status || 'info');
    }
});

window.electronAPI.getHistory().then(renderHistory);
window.electronAPI.onHistoryUpdated(renderHistory);
