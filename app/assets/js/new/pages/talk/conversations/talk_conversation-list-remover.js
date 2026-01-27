/**
 * TALK CONVERSATION REMOVER
 * Handles removing users from conversations
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - Global functions: getSessionToken, showNotification, loadConversations
 */

/**
 * Update remove user button visibility in chat more menu
 */
function updateRemoveUserButtonVisibility() {
    const removeButton = document.getElementById('removeUserButton');
    if (!removeButton) return;
    
    const currentConversation = TalkState.getCurrentConversation();
    if (currentConversation) {
        const conversations = TalkState.getConversations();
        const conversation = conversations[currentConversation];
        
        if (conversation && conversation.partnerId) {
            // Show remove button for all active conversations (not deleted users)
            const isDeleted = conversation.isDeleted || conversation.name === 'Deleted User' || conversation.name === 'Account Deactivated';
            if (!isDeleted) {
                removeButton.style.display = 'block';
                removeButton.style.visibility = 'visible';
            } else {
                removeButton.style.display = 'none';
                removeButton.style.visibility = 'hidden';
            }
        } else {
            removeButton.style.display = 'none';
            removeButton.style.visibility = 'hidden';
        }
    } else {
        removeButton.style.display = 'none';
        removeButton.style.visibility = 'hidden';
    }
}

/**
 * Show remove user confirmation modal
 */
function showRemoveUserConfirm() {
    const currentConversation = TalkState.getCurrentConversation();
    if (!currentConversation) {
        if (typeof showNotification === 'function') {
            showNotification('No conversation selected', 'error');
        }
        return;
    }
    
    const conversations = TalkState.getConversations();
    const conversation = conversations[currentConversation];
    
    if (!conversation || !conversation.partnerId) {
        if (typeof showNotification === 'function') {
            showNotification('Invalid conversation', 'error');
        }
        return;
    }
    
    const partnerName = conversation.name || 'this user';
    
    // Update modal content
    const usernameElement = document.getElementById('removeUsername');
    if (usernameElement) {
        usernameElement.textContent = partnerName;
    }
    
    // Show modal positioned above the remove button
    const modal = document.getElementById('removeUserConfirmModal');
    const removeButton = document.getElementById('removeUserButton');
    
    if (modal && removeButton) {
        // Get button position
        const buttonRect = removeButton.getBoundingClientRect();
        const modalContent = modal.querySelector('.remove-user-content');
        
        if (modalContent) {
            // Position modal above the button
            const modalHeight = 120; // Approximate height
            const spacing = 8; // Space between button and modal
            
            modal.style.display = 'block';
            modal.style.top = (buttonRect.top - modalHeight - spacing) + 'px';
            modal.style.left = (buttonRect.left + (buttonRect.width / 2)) + 'px';
            modal.style.transform = 'translateX(-50%)';
            
            // Adjust if modal goes off screen
            setTimeout(() => {
                const modalRect = modalContent.getBoundingClientRect();
                if (modalRect.top < 10) {
                    // Position below button if not enough space above
                    modal.style.top = (buttonRect.bottom + spacing) + 'px';
                }
                if (modalRect.left < 10) {
                    modal.style.left = '10px';
                    modal.style.transform = 'none';
                } else if (modalRect.right > window.innerWidth - 10) {
                    modal.style.left = (window.innerWidth - modalRect.width - 10) + 'px';
                    modal.style.transform = 'none';
                }
            }, 0);
        }
        
        // Close modal when clicking outside
        const closeOnOutsideClick = (e) => {
            if (!modal.contains(e.target) && !removeButton.contains(e.target)) {
                closeRemoveUserConfirm();
                document.removeEventListener('click', closeOnOutsideClick);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeOnOutsideClick);
        }, 0);
    }
}

/**
 * Close remove user confirmation modal
 */
function closeRemoveUserConfirm() {
    const modal = document.getElementById('removeUserConfirmModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Remove any event listeners
    const removeButton = document.getElementById('removeUserButton');
    if (removeButton) {
        // Event listener is removed automatically when modal closes
    }
}

/**
 * Confirm and remove user from conversation
 */
async function confirmRemoveUser() {
    const currentConversation = TalkState.getCurrentConversation();
    if (!currentConversation) {
        closeRemoveUserConfirm();
        return;
    }
    
    const conversations = TalkState.getConversations();
    const conversation = conversations[currentConversation];
    
    if (!conversation || !conversation.partnerId) {
        closeRemoveUserConfirm();
        return;
    }
    
    const partnerId = conversation.partnerId;
    const partnerName = conversation.name || 'this user';
    
    // Close modal
    closeRemoveUserConfirm();
    
    // Perform removal
    await performRemoveUser(partnerId, partnerName, currentConversation);
}

/**
 * Remove user from conversation (actual removal logic)
 */
async function performRemoveUser(partnerId, partnerName, currentConversation) {
    try {
        const currentUserId = TalkState.getCurrentUserId();
        const token = typeof getSessionToken === 'function' ? getSessionToken() : null;
        
        const response = await fetch('/api/messages/remove-user-from-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            credentials: 'include',
            body: JSON.stringify({
                token: token,
                userId: currentUserId,
                partnerId: partnerId
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            if (typeof showNotification === 'function') {
                showNotification(`${partnerName} removed from conversation`, 'success');
            }
            
            // Hide message input form
            const messageInputArea = document.getElementById('messageInputArea');
            if (messageInputArea) {
                messageInputArea.style.display = 'none';
            }
            
            // Clear messages area
            const messagesArea = document.getElementById('messagesArea');
            if (messagesArea) {
                messagesArea.innerHTML = '<div class="empty-state" id="emptyState"><div class="empty-state-icon">💬</div><div class="empty-state-title">User removed</div><div class="empty-state-text">This user has been removed from the conversation. Their messages are no longer visible.</div></div>';
            }
            
            // Remove conversation from list
            const conversationItem = document.querySelector(`[data-conversation-id="${currentConversation}"]`);
            if (conversationItem) {
                conversationItem.remove();
            }
            
            // Remove from TalkState
            if (TalkState && TalkState.removeConversation) {
                TalkState.removeConversation(currentConversation);
            } else {
                const convs = TalkState.getConversations();
                delete convs[currentConversation];
                TalkState.setConversations(convs);
            }
            
            // Clear current conversation
            TalkState.setCurrentConversation(null);
            
            // Hide chat header
            const chatHeader = document.getElementById('chatHeader');
            if (chatHeader) {
                chatHeader.style.display = 'none';
            }
            
            // Reload conversations list
            if (typeof loadConversations === 'function') {
                loadConversations();
            }
            
            // Close menu
            const menu = document.getElementById('chatMoreMenu');
            if (menu) {
                menu.style.display = 'none';
            }
        } else {
            throw new Error(data.error || 'Failed to remove user');
        }
    } catch (error) {
        console.error('Error removing user from conversation:', error);
        if (typeof showNotification === 'function') {
            showNotification('Failed to remove user: ' + error.message, 'error');
        }
    }
}

/**
 * Clear a conversation with a deleted or deactivated user
 * Removes the placeholder thread and refreshes the UI state
 * @param {number|string} deletedUserId - ID of the deleted user
 */
async function clearConversationWithDeletedUser(deletedUserId) {
    const targetId = parseInt(deletedUserId, 10);
    if (!targetId) {
        if (typeof showNotification === 'function') {
            showNotification('Invalid deleted user reference.', 'error');
        }
        return;
    }

    const clearBtn = document.querySelector(`[data-clear-user-id="${targetId}"]`);
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Clearing...';
    }

    try {
        let userId = TalkState?.getCurrentUserId ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
        if (!userId) {
            const urlParams = new URLSearchParams(window.location.search);
            const fallbackId = urlParams.get('userId') || urlParams.get('currentUser');
            userId = fallbackId ? parseInt(fallbackId, 10) : null;
        }

        if (!userId) {
            throw new Error('Could not determine your user ID. Please refresh and try again.');
        }

        const token = typeof getSessionToken === 'function' ? getSessionToken() : '';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('/api/messages/clear-deleted-user-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            signal: controller.signal,
            body: JSON.stringify({
                token,
                deletedUserId: targetId,
                userId: parseInt(userId, 10)
            })
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await response.json() : null;

        if (!response.ok || !data?.success) {
            const message = data?.error || `Server error: ${response.status}`;
            throw new Error(message);
        }

        if (typeof showNotification === 'function') {
            showNotification('Deactivated account removed from conversation list', 'success');
        }

        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.innerHTML = '<i class="fas fa-trash"></i> Clear';
        }

        if (typeof loadConversations === 'function') {
            await loadConversations();
        }

        if (TalkState && typeof TalkState.loadConversations === 'function') {
            TalkState.loadConversations();
        }

        const messagesArea = document.getElementById('messagesArea');
        if (messagesArea) {
            messagesArea.innerHTML = '<div class="empty-state" id="emptyState"><div class="empty-state-icon">💬</div><div class="empty-state-title">Select a conversation</div><div class="empty-state-text">Choose a conversation from the list to start messaging</div></div>';
        }

        const conversationItem = document.querySelector(`[data-conversation-id="${targetId}"]`);
        if (conversationItem) {
            conversationItem.remove();
        }
    } catch (error) {
        console.error('Error clearing conversation with deleted user:', error);
        if (typeof showNotification === 'function') {
            showNotification(`Failed to clear conversation: ${error.message}`, 'error');
        }
    } finally {
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.innerHTML = '<i class="fas fa-trash"></i> Clear';
        }
    }
}

// Make functions globally available
window.updateRemoveUserButtonVisibility = updateRemoveUserButtonVisibility;
window.removeUserFromConversation = showRemoveUserConfirm;
window.closeRemoveUserConfirm = closeRemoveUserConfirm;
window.confirmRemoveUser = confirmRemoveUser;
window.clearConversationWithDeletedUser = clearConversationWithDeletedUser;


