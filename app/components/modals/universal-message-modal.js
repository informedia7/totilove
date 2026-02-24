// Universal Message Modal JavaScript
// This script provides message modal functionality that can be used across different pages

// Include shared emoji picker utility
// <script src="/assets/js/new/components/emoji-picker.js"></script>

// Global variables for the modal
let currentReplyMessageId = null;
let currentReceiverId = null;
let currentReceiverName = null;
let isReplyMode = false;

let verificationScriptPromise = null;

function ensureComposeVerificationScriptLoaded() {
    if (typeof window.checkEmailVerificationStatus === 'function') {
        return Promise.resolve();
    }

    if (verificationScriptPromise) {
        return verificationScriptPromise;
    }

    verificationScriptPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = '/assets/js/new/shared/email-verification-check.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => resolve();
        document.head.appendChild(script);
    }).finally(() => {
        verificationScriptPromise = null;
    });

    return verificationScriptPromise;
}

async function ensureEmailVerifiedBeforeCompose() {
    try {
        await ensureComposeVerificationScriptLoaded();

        if (typeof window.checkEmailVerificationStatus === 'function') {
            const isVerified = await window.checkEmailVerificationStatus();
            if (!isVerified) {
                if (typeof window.showVerificationMessage === 'function') {
                    window.showVerificationMessage();
                } else if (typeof showToast === 'function') {
                    showToast('Please verify your email address before sending messages.', 'warning');
                } else {
                    alert('Please verify your email address before sending messages.');
                }
                return false;
            }
        }
    } catch (error) {
        console.warn('Email verification pre-check failed:', error);
    }

    return true;
}



// Initialize the universal message modal
function initUniversalMessageModal() {
    console.log('🔧 Initializing Universal Message Modal...');
    
    // Set up event listeners
    setupModalEventListeners();
    
    // Emoji picker is now provided by the shared emoji-picker.js utility
    
    // Set up character counter
    setupCharacterCounter();
    
    console.log('✅ Universal Message Modal initialized successfully');
}

// Set up modal event listeners
function setupModalEventListeners() {
    // Compose modal outside click
    const composeModal = document.getElementById('composeModal');
    if (composeModal) {
        composeModal.addEventListener('click', function(e) {
            if (e.target === composeModal) {
                closeCompose();
            }
        });
    }
    

    
    // Message confirmation modal outside click
    const confirmationModal = document.getElementById('messageConfirmationModal');
    if (confirmationModal) {
        confirmationModal.addEventListener('click', function(e) {
            if (e.target === confirmationModal) {
                hideMessageConfirmation();
            }
        });
    }
    
    // Close modals with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (composeModal && composeModal.style.display === 'flex') {
                closeCompose();
            }
            if (emojiModal && emojiModal.style.display === 'flex') {
                hideEmojiPicker();
            }
            if (confirmationModal && confirmationModal.style.display === 'flex') {
                hideMessageConfirmation();
            }
        }
    });
}



// Set up character counter
function setupCharacterCounter() {
    const editor = document.getElementById('richTextEditor');
    const counter = document.getElementById('charCount');
    
    if (!editor || !counter) return;
    
    editor.addEventListener('input', function() {
        const text = editor.textContent || editor.innerText;
        const count = text.length;
        counter.textContent = `${count}/1000`;
        
        // Change color based on character count
        if (count > 900) {
            counter.style.color = '#e74c3c';
        } else if (count > 800) {
            counter.style.color = '#f39c12';
        } else {
            counter.style.color = '#888';
        }
    });
}

// Open compose modal
function openComposeModal(receiverId = null, receiverName = null, messageId = null) {
    console.log('📝 Opening compose modal...');
    
    // Set global variables
    currentReceiverId = receiverId;
    currentReceiverName = receiverName;
    currentReplyMessageId = messageId;
    isReplyMode = messageId !== null;
    
    // Get modal elements
    const modal = document.getElementById('composeModal');
    const composeTitle = document.getElementById('composeTitle');
    const recipientSpan = document.getElementById('composeRecipient');
    const sendBtnText = document.getElementById('send-btn-text');
    const editor = document.getElementById('richTextEditor');
    
    if (!modal || !composeTitle || !recipientSpan || !sendBtnText || !editor) {
        console.error('❌ Required modal elements not found');
        return;
    }
    
    // Update modal title and button text based on whether it's a reply or new message
    if (isReplyMode) {
        composeTitle.textContent = 'Reply to Message';
        sendBtnText.textContent = 'Send Reply';
    } else {
        composeTitle.textContent = 'Send New Message';
        sendBtnText.textContent = 'Send Message';
    }
    
    // Set recipient name
    recipientSpan.textContent = receiverName || 'Unknown User';
    
    // Clear previous content
    editor.innerHTML = '';
    editor.focus();
    
    // Show modal
    modal.style.display = 'flex';
    
    console.log(`📝 Compose modal opened for ${receiverName} (ID: ${receiverId})`);
}

// Close compose modal
function closeCompose() {
    const modal = document.getElementById('composeModal');
    if (modal) {
        modal.style.display = 'none';
        
        // Reset global variables
        currentReplyMessageId = null;
        currentReceiverId = null;
        currentReceiverName = null;
        isReplyMode = false;
        
        console.log('📝 Compose modal closed');
    }
}

// Send message function
async function sendMessage() {
    const editor = document.getElementById('richTextEditor');
    const content = editor.textContent || editor.innerText;
    
    if (!content.trim()) {
        showToast('Please enter a message', 'error');
        return;
    }
    
    if (content.length > 1000) {
        showToast('Message too long (max 1000 characters)', 'error');
        return;
    }
    
    if (!currentReceiverId) {
        showToast('No recipient selected', 'error');
        return;
    }
    
    // Get current user from session manager
    const currentUser = window.sessionManager?.getCurrentUser();
    if (!currentUser || !currentUser.id) {
        showToast('Please log in to send messages', 'error');
        return;
    }

    const emailVerified = await ensureEmailVerifiedBeforeCompose();
    if (!emailVerified) {
        return;
    }
    
    // Prepare request data
    const requestData = {
        receiverId: currentReceiverId,
        content: content.trim()
    };
    
    console.log('📤 Sending message with data:', requestData);
    
    try {
        // Disable send button
        const sendBtn = document.querySelector('.send-btn');
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span>📤 Sending...</span>';
        
        // Send message via API
        const response = await window.sessionManager.apiRequest('/api/messages/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': currentUser.id
            },
            body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success) {
                const messageId = data.message?.id || data.message?.messageId || 'unknown';
                const isReply = currentReplyMessageId !== null;
                
                showToast(`✅ ${isReply ? 'Reply' : 'Message'} sent successfully to ${currentReceiverName}! (ID: ${messageId})`, 'success');
                
                // Show confirmation modal
                showMessageConfirmation(currentReceiverName, isReply);
                
                // Close compose modal
                closeCompose();
            } else {
                // Check for email verification error
                if (data.requiresEmailVerification || data.code === 'EMAIL_VERIFICATION_REQUIRED') {
                    showToast('📧 Please verify your email address to send messages. Check your inbox for the verification email.', 'warning');
                    return;
                }
                throw new Error(data.message || data.error || 'Failed to send message');
            }
        } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            
            // Check for email verification error
            if (errorData.requiresEmailVerification || errorData.code === 'EMAIL_VERIFICATION_REQUIRED') {
                showToast('📧 Please verify your email address to send messages. Check your inbox for the verification email.', 'warning');
                return;
            }
            
            throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: Failed to send message`);
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        
        // Check if error message contains email verification info
        if (error.message && (error.message.includes('verification') || error.message.includes('EMAIL_VERIFICATION'))) {
            showToast('📧 Please verify your email address to send messages. Check your inbox for the verification email.', 'warning');
        } else {
            showToast('Failed to send message. Please try again.', 'error');
        }
    } finally {
        // Re-enable send button
        const sendBtn = document.querySelector('.send-btn');
        const isReply = currentReplyMessageId !== null;
        sendBtn.disabled = false;
        sendBtn.innerHTML = `<span>📤 <span id="send-btn-text">${isReply ? 'Send Reply' : 'Send Message'}</span></span>`;
    }
}

// Text formatting functions
function formatText(command) {
    const editor = document.getElementById('richTextEditor');
    if (!editor) return;
    
    document.execCommand(command, false, null);
    editor.focus();
}



// Show message confirmation
function showMessageConfirmation(receiverName, isReply = false) {
    const modal = document.getElementById('messageConfirmationModal');
    const confirmationTitle = document.getElementById('confirmation-title');
    const confirmationReceiver = document.getElementById('confirmation-receiver');
    const confirmationTimestamp = document.getElementById('confirmation-timestamp');
    const viewSentBtn = document.getElementById('viewSentBtn');
    
    if (!modal || !confirmationTitle || !confirmationReceiver || !confirmationTimestamp) {
        console.error('❌ Confirmation modal elements not found');
        return;
    }
    
    // Update modal content
    confirmationTitle.textContent = isReply ? 'Reply Sent Successfully!' : 'Message Sent Successfully!';
    confirmationReceiver.textContent = receiverName || 'Unknown User';
    confirmationTimestamp.textContent = new Date().toLocaleString();
    
    // Show/hide "View Sent Messages" button based on current page
    if (viewSentBtn) {
        const isMessagesPage = window.location.pathname.includes('/messages');
        viewSentBtn.style.display = isMessagesPage ? 'inline-flex' : 'none';
    }
    
    // Show modal with animation
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

// Hide message confirmation
function hideMessageConfirmation() {
    const modal = document.getElementById('messageConfirmationModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// View sent messages (only available on messages page)
function viewSentMessages() {
    // This function should be implemented on the messages page
    // For now, we'll just close the confirmation modal
    hideMessageConfirmation();
    
    // If we're on the messages page, switch to sent tab
    if (window.location.pathname.includes('/messages') && typeof showMessageTab === 'function') {
        showMessageTab('sent');
    }
}

// Toast notification function (fallback if not provided by the page)
function showToast(message, type = 'info', actionText = null, actionCallback = null) {
    // Check if the page has its own toast function
    if (typeof window.showToast === 'function') {
        window.showToast(message, type, actionText, actionCallback);
        return;
    }
    
    // Fallback toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#00b894' : '#667eea'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        max-width: 300px;
        word-wrap: break-word;
        animation: slideIn 0.3s ease-out;
    `;
    
    toast.innerHTML = `
        <span>${message}</span>
        ${actionText ? `<button onclick="this.parentElement.remove(); ${actionCallback}()" style="margin-left: 10px; background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">${actionText}</button>` : ''}
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

// Add CSS for fallback toast
if (!document.querySelector('#universal-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'universal-toast-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// Export functions for use in other scripts
window.UniversalMessageModal = {
    init: initUniversalMessageModal,
    openCompose: openComposeModal,
    closeCompose: closeCompose,
    sendMessage: sendMessage,
    showConfirmation: showMessageConfirmation,
    hideConfirmation: hideMessageConfirmation,
    showToast: showToast
};

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUniversalMessageModal);
} else {
    initUniversalMessageModal();
} 