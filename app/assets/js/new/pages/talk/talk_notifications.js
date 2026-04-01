(function (window, document) {
    'use strict';

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
    window.playNotificationSound = playNotificationSound;
    window.updateConnectionStatus = updateConnectionStatus;
})(window, document);
