(function (window, document) {
    'use strict';

    function resolveTalkAvailabilityMessage(payload) {
        const codeRaw = payload?.code || payload?.errorCode || payload?.reason || '';
        const code = String(codeRaw || '').toUpperCase();
        const errorText = String(payload?.error || payload?.message || '').toLowerCase();

        const isPaused =
            code.includes('PAUSED') ||
            code === 'RECEIVER_PAUSED' ||
            code === 'USER_PAUSED' ||
            errorText.includes('paused');

        if (isPaused) {
            return 'User account is paused';
        }

        const isSuspended =
            code.includes('SUSPEND') ||
            code === 'RECEIVER_SUSPENDED' ||
            code === 'USER_SUSPENDED' ||
            code === 'ACCOUNT_SUSPENDED' ||
            errorText.includes('suspend') ||
            errorText.includes('suspended');

        if (isSuspended) {
            return 'User currently not available';
        }

        return null;
    }

    function showNotification(message, type = 'info') {
        if (!document) {
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = [
            'position: fixed',
            'top: 8px',
            'right: 20px',
            'background: ' + (type === 'success' ? '#00b894' : type === 'error' ? '#e74c3c' : type === 'warning' ? '#ffc107' : '#667eea'),
            'color: white',
            'padding: 1rem 1.5rem',
            'border-radius: 8px',
            'box-shadow: 0 4px 12px rgba(0,0,0,0.15)',
            'z-index: 10000',
            'max-width: 300px',
            'animation: slideInRight 0.3s ease-out',
            'display: flex',
            'align-items: center',
            'gap: 0.5rem'
        ].join(';');

        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle';
        toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;

        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
    }

    // Single sticky toast that shows upload progress as a smooth bar.
    // Reuses one DOM node across calls so we don't stack/jump multiple toasts.
    const UPLOAD_TOAST_ID = 'talk-upload-progress-toast';

    function ensureUploadProgressToast() {
        let toast = document.getElementById(UPLOAD_TOAST_ID);
        if (toast) {
            return toast;
        }

        toast = document.createElement('div');
        toast.id = UPLOAD_TOAST_ID;
        toast.className = 'toast toast-info toast-upload-progress';
        toast.style.cssText = [
            'position: fixed',
            'top: 8px',
            'right: 20px',
            'background: #667eea',
            'color: white',
            'padding: 0.75rem 1rem',
            'border-radius: 8px',
            'box-shadow: 0 4px 12px rgba(0,0,0,0.15)',
            'z-index: 10000',
            'min-width: 240px',
            'max-width: 320px',
            'animation: slideInRight 0.3s ease-out',
            'display: flex',
            'flex-direction: column',
            'gap: 0.4rem'
        ].join(';');

        toast.innerHTML = `
            <div class="toast-upload-progress__row" style="display:flex;align-items:center;gap:0.5rem;">
                <i class="fas fa-cloud-upload-alt"></i>
                <span class="toast-upload-progress__label" style="flex:1;">Uploading…</span>
                <span class="toast-upload-progress__percent" style="font-variant-numeric: tabular-nums;font-weight:600;">0%</span>
            </div>
            <div class="toast-upload-progress__track" style="height:4px;background:rgba(255,255,255,0.25);border-radius:999px;overflow:hidden;">
                <div class="toast-upload-progress__fill" style="height:100%;width:0%;background:#fff;border-radius:999px;transition:width 0.2s ease-out;"></div>
            </div>
        `;

        document.body.appendChild(toast);
        return toast;
    }

    function showUploadProgress(progress, label) {
        if (!document) {
            return;
        }
        const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
        const toast = ensureUploadProgressToast();
        const fill = toast.querySelector('.toast-upload-progress__fill');
        const percent = toast.querySelector('.toast-upload-progress__percent');
        const labelEl = toast.querySelector('.toast-upload-progress__label');
        if (fill) fill.style.width = `${safeProgress}%`;
        if (percent) percent.textContent = `${safeProgress}%`;
        if (labelEl && typeof label === 'string' && label.length > 0) {
            labelEl.textContent = label;
        }
    }

    function hideUploadProgress() {
        const toast = document.getElementById(UPLOAD_TOAST_ID);
        if (toast && toast.parentNode) {
            toast.remove();
        }
    }

    function playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            // Ignore audio errors (autoplay restrictions, etc.)
        }
    }

    function updateConnectionStatus(status) {
        const indicator = document.getElementById('connectionStatus');
        if (!indicator) return;

        indicator.classList.remove('connected', 'disconnected', 'connecting');

        switch (status) {
            case 'connected':
                indicator.classList.add('connected');
                indicator.innerHTML = '🟢 Real-time ON';
                indicator.style.display = 'block';
                setTimeout(() => {
                    indicator.style.display = 'none';
                }, 3000);
                break;
            case 'disconnected':
                indicator.classList.add('disconnected');
                indicator.innerHTML = '🔴 Offline mode';
                indicator.style.display = 'block';
                break;
            case 'connecting':
                indicator.classList.add('connecting');
                indicator.innerHTML = '🟡 Connecting...';
                indicator.style.display = 'block';
                break;
        }
    }

    window.showNotification = showNotification;
    window.showUploadProgress = showUploadProgress;
    window.hideUploadProgress = hideUploadProgress;
    window.resolveTalkAvailabilityMessage = resolveTalkAvailabilityMessage;
    window.playNotificationSound = playNotificationSound;
    window.updateConnectionStatus = updateConnectionStatus;
})(window, document);
