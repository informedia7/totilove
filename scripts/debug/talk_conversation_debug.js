#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function log(message) {
    console.log(`[talk-debug] ${message}`);
}

function createClassList() {
    const classes = new Set();
    return {
        add(cls) {
            classes.add(cls);
        },
        remove(cls) {
            classes.delete(cls);
        },
        contains(cls) {
            return classes.has(cls);
        }
    };
}

function createElementStub(label) {
    return {
        label,
        style: {},
        children: [],
        dataset: {},
        attributes: {},
        innerHTML: '',
        textContent: '',
        classList: createClassList(),
        scrollTop: 0,
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        insertBefore(child) {
            this.children.unshift(child);
            return child;
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        addEventListener() {
            /* noop */
        },
        removeEventListener() {
            /* noop */
        },
        remove() {
            /* noop */
        },
        querySelectorAll() {
            return [];
        },
        querySelector() {
            return null;
        },
        closest(selector) {
            if (selector === '.conversation-item') {
                return this;
            }
            return null;
        }
    };
}

function createDocumentStub() {
    const elements = new Map();
    function getOrCreate(id) {
        if (!elements.has(id)) {
            elements.set(id, createElementStub(id));
        }
        return elements.get(id);
    }

    const conversationItem = createElementStub('conversation-item');
    conversationItem.classList.add('conversation-item');
    const documentStub = {
        __conversationItems: [conversationItem],
        getElementById(id) {
            return getOrCreate(id);
        },
        querySelector(selector) {
            if (selector === '.sidebar') {
                return getOrCreate('sidebar');
            }
            if (selector === '.chat-area') {
                return getOrCreate('chatArea');
            }
            return null;
        },
        querySelectorAll(selector) {
            if (selector === '.conversation-item') {
                return this.__conversationItems;
            }
            return [];
        },
        createElement(tag) {
            return createElementStub(tag);
        },
        addEventListener() {
            /* noop */
        }
    };

    return documentStub;
}

function createTalkState(conversations, currentUserId = 1001) {
    let currentConversation = null;
    const messageCache = new Map();
    const loadingStates = new Set();
    return {
        getCurrentConversation() {
            return currentConversation;
        },
        setCurrentConversation(id) {
            currentConversation = id;
            log(`TalkState.setCurrentConversation(${id})`);
        },
        getConversations() {
            return conversations;
        },
        setConversations(updated) {
            Object.assign(conversations, updated);
        },
        getMessageCache() {
            return messageCache;
        },
        getLoadingStates() {
            return loadingStates;
        },
        getCurrentUserId() {
            return currentUserId;
        },
        setCurrentUserId(id) {
            currentUserId = id;
        }
    };
}

function createFetchStub(messages) {
    return async (url) => {
        log(`fetch(${url})`);
        return {
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                total_count: messages.length,
                messages
            })
        };
    };
}

async function main() {
    const conversationSelectorPath = path.resolve(__dirname, '..', '..', 'app', 'assets', 'js', 'new', 'pages', 'talk', 'conversations', 'talk_conversation-list-selector.js');
    if (!fs.existsSync(conversationSelectorPath)) {
        throw new Error(`Conversation selector not found at ${conversationSelectorPath}`);
    }

    const messageLoaderPath = path.resolve(__dirname, '..', '..', 'app', 'assets', 'js', 'new', 'pages', 'talk', 'messages', 'talk_message-loader.js');
    if (!fs.existsSync(messageLoaderPath)) {
        throw new Error(`Message loader not found at ${messageLoaderPath}`);
    }

    const conversations = {
        'debug-convo': {
            id: 'debug-convo',
            partnerId: 4242,
            name: 'Debug User',
            avatar: '/uploads/debug/user-avatar.png',
            status: 'online',
            is_online: true,
            isDeleted: false,
            lastActive: Date.now(),
            unread: 2,
            savedMessageCount: 0,
            messages: []
        }
    };

    const documentStub = createDocumentStub();
    const sampleMessages = [
        {
            id: 1,
            sender_id: 1001,
            receiver_id: 4242,
            content: 'Hey there',
            timestamp: Date.now() - 120000,
            attachments: [],
            recall_type: 'none'
        },
        {
            id: 2,
            sender_id: 4242,
            receiver_id: 1001,
            content: 'All good here',
            timestamp: Date.now() - 60000,
            attachments: [],
            recall_type: 'none'
        }
    ];

    const talkState = createTalkState(conversations);
    const config = {
        USERS: { SAVED_MESSAGES: [] },
        LIMITS: { CACHE_DURATION: 60000 }
    };

    const context = {
        console,
        window: {},
        document: documentStub,
        TalkState: talkState,
        CONFIG: config,
        cancelReply: () => log('cancelReply()'),
        populateSenderFilterFromConversations: () => log('populateSenderFilterFromConversations()'),
        resetPagination: () => log('resetPagination()'),
        hidePagination: () => log('hidePagination()'),
        getCurrentFilter: () => 'all',
        renderMessages: (messages) => log(`renderMessages(${messages.length})`),
        setupPagination: async (conversation) => {
            log(`setupPagination(${conversation.id})`);
        },
        markConversationAsRead: async (partnerId) => {
            log(`markConversationAsRead(${partnerId})`);
        },
        updateCurrentChatStatus: () => log('updateCurrentChatStatus()'),
        checkIfBlocked: async () => false,
        openProfileModal: (partnerId) => log(`openProfileModal(${partnerId})`),
        registerOnlineIndicators: () => log('registerOnlineIndicators()'),
        filterConversations: () => log('filterConversations()'),
        formatMessageTime: (timestamp) => new Date(timestamp).toLocaleTimeString(),
        renderConversations: () => log('renderConversations()'),
        showNotification: (msg, type) => log(`showNotification(${type || 'info'}: ${msg})`),
        isNavigatingPage: () => false,
        validateConversation: () => true,
        getUserIdFromToken: () => talkState.getCurrentUserId(),
        setTimeout,
        clearTimeout,
        URL,
        URLSearchParams,
        history: {
            back: () => log('history.back()'),
            replaceState: () => {}
        },
        navigator: {
            userAgent: 'talk-debug'
        },
        module: undefined
    };

    context.window = context;
    context.global = context;
    context.window.innerWidth = 1024;
    context.window.currentReply = null;
    context.window.selectedImages = [];
    context.document = documentStub;
    context.window.currentUser = { id: talkState.getCurrentUserId() };
    context.fetch = createFetchStub(sampleMessages);
    context.window.fetch = context.fetch;
    context.window.CONFIG = config;

    const code = fs.readFileSync(conversationSelectorPath, 'utf8');
    const loaderCode = fs.readFileSync(messageLoaderPath, 'utf8');
    vm.runInNewContext(loaderCode, context, { filename: messageLoaderPath });
    vm.runInNewContext(code, context, { filename: conversationSelectorPath });

    if (typeof context.window.selectConversation !== 'function') {
        throw new Error('selectConversation not found after loading script');
    }
    if (typeof context.window.loadMessages !== 'function') {
        throw new Error('loadMessages not found after loading script');
    }

    const conversationEventTarget = documentStub.__conversationItems[0];
    const fakeEvent = {
        target: conversationEventTarget,
        preventDefault() {},
        stopPropagation() {}
    };

    log('Invoking selectConversation("debug-convo")');
    await context.window.selectConversation('debug-convo', fakeEvent);
    log(`selectConversation finished. Current conversation: ${talkState.getCurrentConversation()}`);
}

main().catch((error) => {
    console.error('[talk-debug] Script failed', error);
    process.exit(1);
});
