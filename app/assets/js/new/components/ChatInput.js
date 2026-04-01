/**
 * ChatInput Component
 * 
 * Chat message input component extending BaseComponent
 * Handles message input, character counting, image attachment, and sending
 * 
 * Migration Phase 2: Week 7
 */

import { BaseComponent } from './BaseComponent.js';
import { apiClient } from '../core/api-client.js';
import { debounce } from '../core/utils.js';

export class ChatInput extends BaseComponent {
    /**
     * @param {Object} config - ChatInput configuration
     * @param {HTMLElement|string} config.input - Textarea input element
     * @param {HTMLElement|string} config.sendButton - Send button element
     * @param {HTMLElement|string} config.imageButton - Image attachment button
     * @param {HTMLElement|string} config.emojiButton - Emoji picker button
     * @param {HTMLElement|string} config.imageInput - File input for images
     * @param {HTMLElement|string} config.counter - Character counter element
     * @param {number} config.maxLength - Maximum message length
     * @param {Function} config.onSend - Callback when message is sent
     * @param {Function} config.onImageSelect - Callback when images are selected
     * @param {Function} config.onTyping - Callback for typing indicator
     * @param {Function} config.validateMessage - Custom validation function
     * @param {Function} config.notificationFunction - Function to show notifications
     */
    constructor(config = {}) {
        super({
            container: config.container || document.body,
            autoInit: false
        });
        
        this.input = typeof config.input === 'string'
            ? document.getElementById(config.input) || document.querySelector(config.input)
            : config.input;
            
        this.sendButton = typeof config.sendButton === 'string'
            ? document.getElementById(config.sendButton) || document.querySelector(config.sendButton)
            : config.sendButton;
            
        this.imageButton = typeof config.imageButton === 'string'
            ? document.getElementById(config.imageButton) || document.querySelector(config.imageButton)
            : config.imageButton;
            
        this.emojiButton = typeof config.emojiButton === 'string'
            ? document.getElementById(config.emojiButton) || document.querySelector(config.emojiButton)
            : config.emojiButton;
            
        this.imageInput = typeof config.imageInput === 'string'
            ? document.getElementById(config.imageInput) || document.querySelector(config.imageInput)
            : config.imageInput;
            
        this.counter = typeof config.counter === 'string'
            ? document.getElementById(config.counter) || document.querySelector(config.counter)
            : config.counter;
            
        this.maxLength = config.maxLength || 2000;
        this.onSend = config.onSend;
        this.onImageSelect = config.onImageSelect;
        this.onTyping = config.onTyping;
        this.validateMessage = config.validateMessage;
        this.notificationFunction = config.notificationFunction;
        
        this.selectedImages = [];
        this.currentConversation = null;
        this.currentReply = null;
        
        this.init();
    }
    
    async onInit() {
        if (!this.input) {
            this.error('Input element not found');
            return;
        }
        
        // Set up event listeners
        this.setupEvents();
        
        // Auto-resize textarea
        this.setupAutoResize();
    }
    
    setupEvents() {
        // Send button click
        if (this.sendButton) {
            this.on(this.sendButton, 'click', () => this.sendMessage());
        }
        
        // Enter key to send (Shift+Enter for new line)
        this.on(this.input, 'keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Character counter update
        this.on(this.input, 'input', debounce(() => {
            this.updateCounter();
            this.handleTyping();
        }, 100));
        
        // Image button click
        if (this.imageButton && this.imageInput) {
            this.on(this.imageButton, 'click', () => {
                this.imageInput.click();
            });
        }
        
        // Image input change
        if (this.imageInput) {
            this.on(this.imageInput, 'change', (e) => {
                this.handleImageSelect(e.target.files);
            });
        }
        
        // Emoji button click
        if (this.emojiButton) {
            this.on(this.emojiButton, 'click', () => {
                this.showEmojiPicker();
            });
        }
    }
    
    setupAutoResize() {
        // Auto-resize textarea based on content
        this.on(this.input, 'input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = `${Math.min(this.input.scrollHeight, 200)}px`;
        });
    }
    
    /**
     * Update character counter
     */
    updateCounter() {
        if (!this.counter) return;
        
        const length = this.input.value.length;
        const remaining = this.maxLength - length;
        
        this.counter.textContent = remaining;
        
        // Add warning class if approaching limit
        if (remaining < 100) {
            this.counter.classList.add('warning');
        } else {
            this.counter.classList.remove('warning');
        }
    }
    
    /**
     * Handle typing indicator
     */
    handleTyping() {
        if (this.onTyping && this.input.value.trim()) {
            this.onTyping();
        }
    }
    
    /**
     * Show notification
     * @param {string} message - Message to display
     * @param {string} type - 'success', 'error', or 'info'
     */
    showNotification(message, type = 'info') {
        if (this.notificationFunction) {
            this.notificationFunction(message, type);
        } else if (window.showNotification) {
            window.showNotification(message, type);
        }
    }
    
    /**
     * Validate message content
     * @param {string} text - Message text
     * @returns {Object} Validation result
     */
    validate(text) {
        if (!text || !text.trim()) {
            return { valid: false, error: 'Message cannot be empty' };
        }
        
        if (text.length > this.maxLength) {
            return { valid: false, error: `Message cannot exceed ${this.maxLength} characters` };
        }
        
        // Custom validation
        if (this.validateMessage) {
            const result = this.validateMessage(text);
            if (result && !result.valid) {
                return result;
            }
        }
        
        return { valid: true };
    }
    
    /**
     * Sanitize message content
     * @param {string} text - Message text
     * @returns {string} Sanitized text
     */
    sanitize(text) {
        // Remove HTML tags
        let sanitized = text.replace(/<[^>]*>/g, '');
        
        // Remove dangerous patterns
        const forbiddenPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe/gi,
            /<object/gi,
            /<embed/gi
        ];
        
        forbiddenPatterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '');
        });
        
        return sanitized.trim();
    }
    
    /**
     * Handle image selection
     * @param {FileList} files - Selected files
     */
    handleImageSelect(files) {
        if (!files || files.length === 0) return;
        
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            this.showNotification('Please select image files only', 'error');
            return;
        }
        
        this.selectedImages = imageFiles;
        
        if (this.onImageSelect) {
            this.onImageSelect(imageFiles);
        }
        
        this.emit('chatinput:imageselected', { files: imageFiles });
    }
    
    /**
     * Show emoji picker
     */
    showEmojiPicker() {
        // Emit event for emoji picker to handle
        this.emit('chatinput:emojipicker', { input: this.input });
        
        // If global emoji picker exists, use it
        if (window.showEmojiPicker && typeof window.showEmojiPicker === 'function') {
            window.showEmojiPicker(this.input);
        }
    }
    
    /**
     * Set current conversation
     * @param {Object} conversation - Conversation object
     */
    setConversation(conversation) {
        this.currentConversation = conversation;
    }
    
    /**
     * Set current reply
     * @param {Object} reply - Reply message object
     */
    setReply(reply) {
        this.currentReply = reply;
    }
    
    /**
     * Clear reply
     */
    clearReply() {
        this.currentReply = null;
    }
    
    /**
     * Send message
     */
    async sendMessage() {
        const text = this.input.value;
        
        // Check if we have images to send
        if (this.selectedImages.length > 0) {
            // Validate caption if provided
            if (text && text.trim()) {
                const validation = this.validate(text);
                if (!validation.valid) {
                    this.showNotification(validation.error, 'error');
                    return;
                }
            }
            
            // Emit event for image sending (let parent handle it)
            this.emit('chatinput:sendimages', {
                images: this.selectedImages,
                caption: text.trim()
            });
            
            // Clear input
            this.input.value = '';
            this.updateCounter();
            this.selectedImages = [];
            if (this.imageInput) this.imageInput.value = '';
            
            return;
        }
        
        // Validate text message
        const validation = this.validate(text);
        if (!validation.valid) {
            this.showNotification(validation.error, 'error');
            return;
        }
        
        if (!this.currentConversation) {
            this.showNotification('No conversation selected', 'error');
            return;
        }
        
        // Sanitize content
        const sanitizedContent = this.sanitize(text);
        
        if (!sanitizedContent) {
            this.showNotification('Message cannot be empty', 'error');
            return;
        }
        
        // Clear input immediately
        this.input.value = '';
        this.updateCounter();
        
        // Prepare message data
        const messageData = {
            receiverId: this.currentConversation.partnerId,
            content: sanitizedContent
        };
        
        // Include reply information if replying
        if (this.currentReply) {
            messageData.replyTo = {
                id: this.currentReply.id,
                text: this.currentReply.text,
                senderId: this.currentReply.sender_id,
                hasImage: this.currentReply.hasImage,
                attachments: this.currentReply.attachments || []
            };
        }
        
        try {
            // Send via API client
            const result = await apiClient.postJson('/api/messages/send', messageData);
            
            if (result.success) {
                // Call onSend callback
                if (this.onSend) {
                    this.onSend(result, sanitizedContent);
                }
                
                // Emit event
                this.emit('chatinput:messagesent', { result, content: sanitizedContent });
                
                // Clear reply after successful send
                this.clearReply();
            } else {
                throw new Error(result.error || 'Failed to send message');
            }
        } catch (error) {
            this.error('Error sending message:', error);
            this.showNotification(
                error.message || 'Failed to send message. Please try again.',
                'error'
            );
            
            // Restore input value on error
            this.input.value = text;
            this.updateCounter();
            
            this.emit('chatinput:error', { error });
        }
    }
    
    /**
     * Clear input
     */
    clear() {
        this.input.value = '';
        this.updateCounter();
        this.selectedImages = [];
        if (this.imageInput) this.imageInput.value = '';
        this.clearReply();
    }
    
    /**
     * Focus input
     */
    focus() {
        if (this.input) {
            this.input.focus();
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ChatInput = ChatInput;
}












































