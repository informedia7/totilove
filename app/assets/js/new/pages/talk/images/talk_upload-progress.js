/**
 * Image upload progress bar (Totilove1 hook pattern: showUploadProgress / hideUploadProgress).
 * Fixed strip so XHR upload percent is visible without spamming toast notifications.
 */

(function initTalkUploadProgress() {
    const ROOT_ID = 'talkImageUploadProgress';

    function ensureRoot() {
        let root = document.getElementById(ROOT_ID);
        if (root) {
            return root;
        }
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'talk-upload-progress';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML =
            '<div class="talk-upload-progress__label"></div>' +
            '<div class="talk-upload-progress__track">' +
            '<div class="talk-upload-progress__fill"></div>' +
            '</div>';
        document.body.appendChild(root);
        return root;
    }

    function showUploadProgress(percent, labelText) {
        const root = ensureRoot();
        const label = root.querySelector('.talk-upload-progress__label');
        const fill = root.querySelector('.talk-upload-progress__fill');
        const p = Math.min(100, Math.max(0, Number(percent) || 0));
        if (label) {
            label.textContent = `${labelText || 'Uploading'} ${Math.round(p)}%`;
        }
        if (fill) {
            fill.style.width = `${p}%`;
        }
        root.classList.add('talk-upload-progress--visible');
        root.setAttribute('aria-hidden', 'false');
    }

    function hideUploadProgress() {
        const root = document.getElementById(ROOT_ID);
        if (!root) {
            return;
        }
        root.classList.remove('talk-upload-progress--visible');
        root.setAttribute('aria-hidden', 'true');
        const fill = root.querySelector('.talk-upload-progress__fill');
        if (fill) {
            fill.style.width = '0%';
        }
    }

    window.showUploadProgress = showUploadProgress;
    window.hideUploadProgress = hideUploadProgress;
})();
