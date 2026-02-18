(function (window, document) {
    'use strict';

    function safeGetSessionToken() {
        if (typeof window.getSessionToken === 'function') {
            return window.getSessionToken();
        }
        const params = new URLSearchParams(window.location.search);
        return params.get('token') || '';
    }

    function safeGetCurrentUserId() {
        if (window.TalkState && typeof window.TalkState.getCurrentUserId === 'function') {
            return window.TalkState.getCurrentUserId();
        }
        return window.currentUser?.id || null;
    }

    function ensureCloseProfileModalFallback() {
        if (typeof window.closeProfileModal !== 'function') {
            window.closeProfileModal = function closeProfileModal() {
                const modal = document.getElementById('userProfileModal');
                if (modal) {
                    modal.style.display = 'none';
                }
            };
        }
    }

    function configureModalForTalk(retryCount = 0) {
        if (window.UserProfileModal) {
            window.UserProfileModal.setGetCurrentUserId(safeGetCurrentUserId);
            window.UserProfileModal.setGetSessionToken(safeGetSessionToken);
            return;
        }
        if (retryCount < 20) {
            setTimeout(() => configureModalForTalk(retryCount + 1), 100);
        }
    }

    function initProfileModalActions(retryCount = 0) {
        if (window.ProfileModalActions) {
            window.ProfileModalActions.init({
                getCurrentUserId: safeGetCurrentUserId,
                getCurrentProfileUserId: () => (typeof window.getCurrentProfileUserId === 'function' ? window.getCurrentProfileUserId() : null),
                getSessionToken: safeGetSessionToken,
                showNotification: (message, type) => {
                    if (typeof window.showNotification === 'function') {
                        window.showNotification(message, type);
                    }
                }
            });
            return;
        }
        if (retryCount < 20) {
            setTimeout(() => initProfileModalActions(retryCount + 1), 100);
        }
    }

    function ensureEmailVerificationScript() {
        if (!window.checkEmailVerificationStatus) {
            const script = document.createElement('script');
            script.src = '/assets/js/new/shared/email-verification-check.js';
            document.head.appendChild(script);
        }
    }

    function likeProfileInModal() {
        if (window.ProfileModalActions?.likeProfileInModal) {
            window.ProfileModalActions.likeProfileInModal();
        }
    }

    function favouriteProfileInModal() {
        if (window.ProfileModalActions?.favouriteProfileInModal) {
            window.ProfileModalActions.favouriteProfileInModal();
        }
    }

    function blockProfileInModal() {
        const targetUserId = typeof window.getCurrentProfileUserId === 'function' ? window.getCurrentProfileUserId() : null;
        if (!targetUserId) {
            return;
        }

        const realNameElement = document.getElementById('modal-profile-real_name');
        const realName = realNameElement ? realNameElement.textContent.trim().split(' ')[0] : 'this user';
        const blockConfirmModal = document.querySelector('.block-confirm-modal');
        if (blockConfirmModal) {
            const blockUsernameEl = blockConfirmModal.querySelector('#blockUsername');
            if (blockUsernameEl) {
                blockUsernameEl.textContent = realName;
            }
            blockConfirmModal.style.display = 'flex';
        }
        window.pendingBlockUserId = targetUserId;
        window.pendingBlockContext = 'talk';
    }

    function reportProfileInModal() {
        const targetUserId = typeof window.getCurrentProfileUserId === 'function' ? window.getCurrentProfileUserId() : null;
        if (!targetUserId) {
            return;
        }

        const realNameElement = document.getElementById('modal-profile-real_name');
        const realName = realNameElement ? realNameElement.textContent.trim() : '';
        if (typeof window.openReportModal === 'function') {
            window.openReportModal(targetUserId, realName);
        } else if (typeof window.showNotification === 'function') {
            window.showNotification('Report functionality is not available. Please refresh the page.', 'error');
        }
    }

    function wireModalButtons() {
        document.addEventListener('click', (event) => {
            if (event.target.closest('.modal-like-btn')) {
                event.preventDefault();
                likeProfileInModal();
            } else if (event.target.closest('.modal-favourite-btn')) {
                event.preventDefault();
                favouriteProfileInModal();
            } else if (event.target.closest('.modal-block-btn')) {
                event.preventDefault();
                blockProfileInModal();
            } else if (event.target.closest('.modal-report-btn')) {
                event.preventDefault();
                reportProfileInModal();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        ensureCloseProfileModalFallback();
        ensureEmailVerificationScript();
        configureModalForTalk();
        initProfileModalActions();
        wireModalButtons();
    });

    window.likeProfileInModal = likeProfileInModal;
    window.favouriteProfileInModal = favouriteProfileInModal;
    window.blockProfileInModal = blockProfileInModal;
    window.reportProfileInModal = reportProfileInModal;
})(window, document);
