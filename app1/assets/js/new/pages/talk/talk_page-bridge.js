(function (window, document) {
    'use strict';

    if (window.__talkBridgeInitialized) {
        return;
    }
    window.__talkBridgeInitialized = true;

    function enforceAuthentication() {
        if (typeof window.isAuthenticated !== 'undefined' && !window.isAuthenticated) {
            window.location.href = '/login';
        }
    }

    function setTalkStateUserId() {
        if (window.TalkState && typeof window.TalkState.setCurrentUserId === 'function' && window.currentUser?.id) {
            window.TalkState.setCurrentUserId(window.currentUser.id);
        }
    }

    function ensureLegacyGlobals() {
        if (!window.selectedImages) {
            window.selectedImages = [];
        }
        if (typeof window.currentReply === 'undefined') {
            window.currentReply = null;
        }
    }

    function applyNavigationToken() {
        if (typeof window.updateNavigationLinks === 'function') {
            window.updateNavigationLinks();
        }
    }

    function initNavStateBridge() {
        const bridgeEl = document.getElementById('navStateBridge');
        if (!bridgeEl || !document.body) {
            return;
        }

        const applyState = (nextState) => {
            const state = nextState === 'NAV_CHAT' ? 'NAV_CHAT' : 'NAV_CONVERSATIONS_LIST';
            document.body.dataset.navState = state;
            document.body.classList.toggle('nav-chat', state === 'NAV_CHAT');
            document.body.classList.toggle('nav-conversations', state !== 'NAV_CHAT');
        };

        const syncFromAttribute = () => {
            applyState(bridgeEl.getAttribute('data-nav-state'));
        };

        syncFromAttribute();

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-nav-state') {
                    syncFromAttribute();
                    break;
                }
            }
        });

        observer.observe(bridgeEl, {
            attributes: true,
            attributeFilter: ['data-nav-state']
        });

        window.TalkNavigationState = {
            setState(nextState) {
                bridgeEl.setAttribute('data-nav-state', nextState || 'NAV_CONVERSATIONS_LIST');
            },
            getState() {
                return bridgeEl.getAttribute('data-nav-state') || 'NAV_CONVERSATIONS_LIST';
            }
        };
    }

    function initMobileManagers() {
        if (window.__talkMobileManagersInitialized) {
            return;
        }

        const appContainer = document.getElementById('appContainer');
        if (!appContainer) {
            return;
        }

        const managers = {};

        const scheduleFrame = typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame.bind(window)
            : (callback) => setTimeout(callback, 16);

        const safeShowContainer = () => {
            scheduleFrame(() => {
                appContainer.classList.add('loaded');
            });
        };

        if (typeof window.OrientationManager === 'function') {
            try {
                managers.orientation = new window.OrientationManager({
                    classTarget: appContainer,
                    dataTarget: document.body
                });
            } catch (error) {
                console.error('[Talk] OrientationManager failed to initialize', error);
            }
        }

        if (typeof window.KeyboardManager === 'function') {
            try {
                managers.keyboard = new window.KeyboardManager({
                    root: document.documentElement,
                    attributeTarget: document.body,
                    scrollContainer: document.getElementById('messagesArea'),
                    focusSelectors: ['#messageInput', '.search-messages-input', 'textarea', 'input', '[contenteditable="true"]']
                });
            } catch (error) {
                console.error('[Talk] KeyboardManager failed to initialize', error);
            }
        }

        if (typeof window.SwipeManager === 'function') {
            try {
                const resolveNavState = (state) => {
                    if (window.TalkNavigationState && typeof window.TalkNavigationState.setState === 'function') {
                        window.TalkNavigationState.setState(state);
                    } else {
                        document.body.dataset.navState = state;
                        document.body.classList.toggle('nav-chat', state === 'NAV_CHAT');
                        document.body.classList.toggle('nav-conversations', state !== 'NAV_CHAT');
                    }
                };

                managers.swipe = new window.SwipeManager({
                    container: appContainer.querySelector('.main-content') || appContainer,
                    hasActiveConversation: () => Boolean(window.TalkState?.getCurrentConversation?.()),
                    onShowChat: () => {
                        if (typeof window.showChatViewOnMobile === 'function') {
                            window.showChatViewOnMobile();
                        } else {
                            resolveNavState('NAV_CHAT');
                        }
                    },
                    onShowList: () => {
                        if (typeof window.showConversationListOnMobile === 'function') {
                            window.showConversationListOnMobile();
                        } else {
                            resolveNavState('NAV_CONVERSATIONS_LIST');
                        }
                    }
                });
            } catch (error) {
                console.error('[Talk] SwipeManager failed to initialize', error);
            }
        }

        window.TalkMobileManagers = managers;
        window.__talkMobileManagersInitialized = true;
        safeShowContainer();
    }

    function initAppWithRetry(retryCount = 0) {
        if (window.__talkAppInitRequested) {
            return;
        }

        if (typeof window.requestTalkAppInit === 'function') {
            window.requestTalkAppInit({ delay: 0 });
            return;
        }

        if (typeof window.initApp === 'function') {
            window.__talkAppInitRequested = true;
            const result = window.initApp();
            if (result && typeof result.catch === 'function') {
                result.catch(() => {
                    window.__talkAppInitRequested = false;
                });
            }
            return;
        }

        if (retryCount < 20) {
            setTimeout(() => initAppWithRetry(retryCount + 1), 100);
        } else {
            console.error('initApp function not found. Make sure talk_app-init.js is loaded.');
        }
    }

    function handleTargetConversationParam() {
        const urlParams = new URLSearchParams(window.location.search);
        const targetUserId = urlParams.get('user');
        if (!targetUserId) {
            return;
        }

        let attempts = 0;
        const maxAttempts = 20;
        const selectConversationByUserId = () => {
            attempts += 1;
            if (window.TalkState && typeof window.TalkState.getConversations === 'function') {
                const conversations = window.TalkState.getConversations();
                if (conversations && Object.keys(conversations).length > 0) {
                    const targetConversation = Object.values(conversations).find((conversation) =>
                        conversation.partnerId && parseInt(conversation.partnerId, 10) === parseInt(targetUserId, 10)
                    );
                    if (targetConversation && typeof window.selectConversation === 'function') {
                        window.selectConversation(targetConversation.id, null);
                        const newUrl = window.location.pathname + (urlParams.get('token') ? `?token=${urlParams.get('token')}` : '');
                        window.history.replaceState({}, '', newUrl);
                        return;
                    }
                }
            }
            if (attempts < maxAttempts) {
                setTimeout(selectConversationByUserId, 500);
            }
        };
        setTimeout(selectConversationByUserId, 1000);
    }

    function attachKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                history.back();
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
                event.preventDefault();
                history.back();
            }
        });
    }

    function attachBackButtons() {
        const backToPreviousBtn = document.getElementById('backToPreviousBtn');
        if (backToPreviousBtn) {
            backToPreviousBtn.addEventListener('click', (event) => {
                event.preventDefault();
                history.back();
            });
        }

        document.querySelectorAll('#chatBackBtn').forEach((button) => {
            if (button && typeof window.goBackToConversations === 'function') {
                button.addEventListener('click', window.goBackToConversations);
            }
        });
    }

    function attachAvatarFallback() {
        const avatar = document.getElementById('userAvatarImg');
        if (!avatar) {
            return;
        }
        avatar.addEventListener('error', function handleAvatarError() {
            const gender = window.currentUser?.gender || '';
            const defaultImg = gender && gender.toString().toLowerCase() === 'f'
                ? '/assets/images/default_profile_female.svg'
                : '/assets/images/default_profile_male.svg';
            if (!this.src.includes('default_profile_')) {
                this.src = defaultImg;
            }
        });
    }

    function callSearchPanel(methodName) {
        if (typeof window[methodName] === 'function') {
            window[methodName]();
            return true;
        }
        if (typeof window.openSearchPanel === 'function' && methodName === 'openSearchPanel') {
            window.openSearchPanel();
            return true;
        }
        if (typeof window.closeSearchPanel === 'function' && methodName === 'closeSearchPanel') {
            window.closeSearchPanel();
            return true;
        }
        return false;
    }

    function attachSearchPanelHandlers() {
        const searchPanelBtn = document.getElementById('searchPanelBtn');
        if (searchPanelBtn) {
            searchPanelBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!callSearchPanel('openSearchPanel')) {
                    const searchPanel = document.getElementById('searchPanel');
                    if (searchPanel) {
                        searchPanel.classList.add('show');
                        searchPanelBtn.classList.add('active');
                    }
                }
            });
        }

        const closeBtn = document.getElementById('closeSearchPanelBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (event) => {
                event.preventDefault();
                if (!callSearchPanel('closeSearchPanel')) {
                    const searchPanel = document.getElementById('searchPanel');
                    if (searchPanel) {
                        searchPanel.classList.remove('show');
                    }
                    if (searchPanelBtn) {
                        searchPanelBtn.classList.remove('active');
                    }
                }
            });
        }

        if (!window.__talkSearchOutsideHandlerAttached) {
            window.__talkSearchOutsideHandlerAttached = true;
            document.addEventListener('click', (event) => {
                const searchPanel = document.getElementById('searchPanel');
                const button = document.getElementById('searchPanelBtn');
                if (!searchPanel || !button) {
                    return;
                }
                if (!searchPanel.contains(event.target) && !button.contains(event.target)) {
                    callSearchPanel('closeSearchPanel');
                }
            });
        }

        const searchMessagesInput = document.getElementById('searchMessagesInput');
        if (searchMessagesInput) {
            let filterDebounceTimeout = null;
            const triggerFilter = () => {
                if (typeof window.filterDisplayedMessages === 'function') {
                    window.filterDisplayedMessages();
                }
            };
            searchMessagesInput.addEventListener('input', () => {
                clearTimeout(filterDebounceTimeout);
                filterDebounceTimeout = setTimeout(triggerFilter, 200);
            });
            searchMessagesInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    clearTimeout(filterDebounceTimeout);
                    triggerFilter();
                }
            });
        }

        const clearMessagesBtn = document.getElementById('clearMessagesBtn');
        if (clearMessagesBtn) {
            clearMessagesBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.clearCurrentMessages === 'function') {
                    window.clearCurrentMessages();
                }
            });
        }
    }

    function attachChatMenuListeners() {
        const chatMoreBtn = document.getElementById('chatMoreBtn');
        if (chatMoreBtn && typeof window.showChatMoreMenu === 'function') {
            chatMoreBtn.addEventListener('click', window.showChatMoreMenu);
        }

        const blockButton = document.getElementById('blockUserButton');
        if (blockButton && typeof window.blockCurrentUser === 'function') {
            blockButton.addEventListener('click', window.blockCurrentUser);
        }

        const removeButton = document.getElementById('removeUserButton');
        if (removeButton && typeof window.removeUserFromConversation === 'function') {
            removeButton.addEventListener('click', window.removeUserFromConversation);
        }

        const inlineBlockCancel = document.getElementById('inlineBlockCancelBtn');
        if (inlineBlockCancel && typeof window.closeBlockConfirm === 'function') {
            inlineBlockCancel.addEventListener('click', window.closeBlockConfirm);
        }

        const inlineBlockConfirm = document.getElementById('inlineBlockYesBtn');
        if (inlineBlockConfirm && typeof window.confirmBlock === 'function') {
            inlineBlockConfirm.addEventListener('click', window.confirmBlock);
        }

        const inlineRemoveCancel = document.getElementById('inlineRemoveCancelBtn');
        if (inlineRemoveCancel && typeof window.closeRemoveUserConfirm === 'function') {
            inlineRemoveCancel.addEventListener('click', window.closeRemoveUserConfirm);
        }

        const inlineRemoveConfirm = document.getElementById('inlineRemoveYesBtn');
        if (inlineRemoveConfirm && typeof window.confirmRemoveUser === 'function') {
            inlineRemoveConfirm.addEventListener('click', window.confirmRemoveUser);
        }
    }

    function attachComposerControls() {
        const clearPreviewsBtn = document.getElementById('clearImagePreviewsBtn');
        if (clearPreviewsBtn && typeof window.clearImagePreviews === 'function') {
            clearPreviewsBtn.addEventListener('click', window.clearImagePreviews);
        }

        const sendImagesBtn = document.getElementById('sendImagesWithPreviewsBtn');
        if (sendImagesBtn && typeof window.sendImagesWithPreviews === 'function') {
            sendImagesBtn.addEventListener('click', window.sendImagesWithPreviews);
        }

        const selectImageBtn = document.getElementById('selectImageBtn');
        if (selectImageBtn && typeof window.selectImage === 'function') {
            selectImageBtn.addEventListener('click', window.selectImage);
        }

        const emojiBtn = document.getElementById('showEmojiPickerBtn');
        if (emojiBtn && typeof window.showEmojiPicker === 'function') {
            emojiBtn.addEventListener('click', () => window.showEmojiPicker('messageInput'));
        }

        const sendMessageBtn = document.getElementById('sendMessageBtn');
        if (sendMessageBtn && typeof window.sendMessage === 'function') {
            sendMessageBtn.addEventListener('click', window.sendMessage);
        }

        const imageInput = document.getElementById('imageInput');
        if (imageInput && typeof window.handleImageSelect === 'function') {
            imageInput.addEventListener('change', window.handleImageSelect);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        enforceAuthentication();
        setTalkStateUserId();
        ensureLegacyGlobals();
        applyNavigationToken();
        initNavStateBridge();
        initMobileManagers();
        initAppWithRetry();
        handleTargetConversationParam();
        attachKeyboardShortcuts();
        attachBackButtons();
        attachAvatarFallback();
        attachSearchPanelHandlers();
        attachChatMenuListeners();
        attachComposerControls();
    });
})(window, document);
