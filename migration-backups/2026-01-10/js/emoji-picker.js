// Shared Emoji Picker Utility
// This file contains emoji picker functionality that can be used across multiple pages

// Emoji data array
const EMOJI_LIST = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', 
    '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', 
    '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', 
    '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', 
    '😶', '😐', '😑', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', 
    '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '😺', '😸', 
    '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', 
    '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '👍', '👎', '👌', '✌️', '🤞', '🤟', 
    '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏'
];

// Show emoji picker
function showEmojiPicker(targetInputId = null) {
    console.log('Opening emoji picker...');
    
    // Remove existing picker if any
    const existingPicker = document.getElementById('emojiPickerModal');
    if (existingPicker) {
        existingPicker.remove();
    }
    
    // Create emoji picker modal
    const pickerModal = document.createElement('div');
    pickerModal.id = 'emojiPickerModal';
    pickerModal.className = 'emoji-picker-modal';
    pickerModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    // Create picker content
    const pickerContent = document.createElement('div');
    pickerContent.className = 'emoji-picker-content';
    pickerContent.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 20px;
        max-width: 400px;
        max-height: 500px;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;
    
    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
    `;
    
    const title = document.createElement('h3');
    title.textContent = 'Select Emoji';
    title.style.margin = '0';
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #666;
        padding: 5px 10px;
        border-radius: 50%;
    `;
    closeBtn.onclick = hideEmojiPicker;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create emoji grid
    const emojiGrid = document.createElement('div');
    emojiGrid.id = 'emojiGrid';
    emojiGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 8px;
        max-height: 400px;
        overflow-y: auto;
    `;
    
    // Add emojis to grid
    EMOJI_LIST.forEach(emoji => {
        const emojiDiv = document.createElement('div');
        emojiDiv.className = 'emoji-item';
        emojiDiv.textContent = emoji;
        emojiDiv.style.cssText = `
            font-size: 33.6px; /* Increased by 40% from 24px */
            padding: 8px;
            text-align: center;
            cursor: pointer;
            border-radius: 8px;
            transition: background-color 0.2s;
            user-select: none;
        `;
        
        emojiDiv.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f0f0f0';
        });
        
        emojiDiv.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'transparent';
        });
        
        emojiDiv.addEventListener('click', function() {
            insertEmoji(emoji, targetInputId);
            hideEmojiPicker();
        });
        
        emojiGrid.appendChild(emojiDiv);
    });
    
    // Assemble picker
    pickerContent.appendChild(header);
    pickerContent.appendChild(emojiGrid);
    pickerModal.appendChild(pickerContent);
    
    // Add to page
    document.body.appendChild(pickerModal);
    
    // Close on outside click
    pickerModal.addEventListener('click', function(e) {
        if (e.target === pickerModal) {
            hideEmojiPicker();
        }
    });
    
    // Close on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideEmojiPicker();
        }
    });
    
    console.log('Emoji picker opened successfully');
}

// Hide emoji picker
function hideEmojiPicker() {
    const pickerModal = document.getElementById('emojiPickerModal');
    if (pickerModal) {
        pickerModal.remove();
    }
}

// Insert emoji into target input
function insertEmoji(emoji, targetInputId = null) {
    let targetElement = null;
    
    if (targetInputId) {
        // Use specified target
        targetElement = document.getElementById(targetInputId);
    } else {
        // Try to find common input elements
        targetElement = document.querySelector('input[type="text"]:focus, textarea:focus, [contenteditable="true"]:focus') ||
                       document.querySelector('input[type="text"], textarea, [contenteditable="true"]');
    }
    
    if (!targetElement) {
        console.warn('No target element found for emoji insertion');
        return;
    }
    
    // Focus the target element
    targetElement.focus();
    
    if (targetElement.hasAttribute('contenteditable')) {
        // Handle contenteditable elements
        const selection = window.getSelection();
        
        if (selection.rangeCount > 0) {
            // Insert at cursor position
            const range = selection.getRangeAt(0);
            const textNode = document.createTextNode(emoji);
            range.deleteContents();
            range.insertNode(textNode);
            range.collapse(false);
            range.selectNodeContents(textNode);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // Insert at end if no selection
            const textNode = document.createTextNode(emoji);
            targetElement.appendChild(textNode);
            
            // Set cursor after the emoji
            const range = document.createRange();
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } else {
        // Handle regular input/textarea elements
        const start = targetElement.selectionStart;
        const end = targetElement.selectionEnd;
        const value = targetElement.value;
        
        // Insert emoji at cursor position
        const newValue = value.substring(0, start) + emoji + value.substring(end);
        targetElement.value = newValue;
        
        // Set cursor position after emoji
        targetElement.selectionStart = targetElement.selectionEnd = start + emoji.length;
    }
    
    // Trigger input event to update any listeners
    const inputEvent = new Event('input', { bubbles: true });
    targetElement.dispatchEvent(inputEvent);
    
    console.log('Emoji inserted successfully:', emoji);
}

// Global functions for easy access
window.showEmojiPicker = showEmojiPicker;
window.hideEmojiPicker = hideEmojiPicker;
window.insertEmoji = insertEmoji;
