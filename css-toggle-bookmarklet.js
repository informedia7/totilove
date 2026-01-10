/**
 * CSS Toggle Bookmarklet
 * 
 * To use:
 * 1. Copy the code below (starting with javascript:)
 * 2. Create a new bookmark in your browser
 * 3. Paste the code as the URL
 * 4. Click the bookmark on any page to toggle between old/new CSS
 * 
 * Or run directly in console on any page
 */

javascript:(function(){
    // Toggle between old and new CSS
    const newCSS = document.querySelectorAll('link[href*="/assets/css/0"]');
    const oldCSS = document.querySelectorAll('link[href]:not([href*="/assets/css/0"])');
    
    if (newCSS.length === 0) {
        alert('No new CSS files found. Make sure new CSS files are loaded in the page.');
        return;
    }
    
    const isNewEnabled = newCSS.length > 0 && !newCSS[0].disabled;
    
    if (isNewEnabled) {
        // Switch to OLD CSS (disable new, enable old)
        newCSS.forEach(link => link.disabled = true);
        oldCSS.forEach(link => link.disabled = false);
        console.log('🔴 Switched to OLD CSS');
        alert('Switched to OLD CSS');
    } else {
        // Switch to NEW CSS (enable new, disable old)
        newCSS.forEach(link => link.disabled = false);
        oldCSS.forEach(link => {
            // Only disable old CSS files, not all links
            if (link.href.includes('/assets/css/') && !link.href.includes('/assets/css/0')) {
                link.disabled = true;
            }
        });
        console.log('🟢 Switched to NEW CSS');
        alert('Switched to NEW CSS');
        
        // Run quick analysis
        setTimeout(() => {
            const issues = [];
            document.querySelectorAll('button, .btn, .button, a.button').forEach((btn, i) => {
                const rect = btn.getBoundingClientRect();
                if (rect.height < 44) {
                    issues.push(`Button #${i}: ${rect.height.toFixed(1)}px tall (needs 44px)`);
                }
            });
            
            if (issues.length > 0) {
                console.warn('⚠️ Touch target issues:', issues);
            } else {
                console.log('✅ All buttons have proper touch targets');
            }
            
            // Check CSS variables
            const computed = getComputedStyle(document.documentElement);
            const tokens = ['--primary', '--md', '--touch', '--r-md'];
            const missingTokens = [];
            
            tokens.forEach(token => {
                const value = computed.getPropertyValue(token);
                if (!value || value.trim() === '') {
                    missingTokens.push(token);
                }
            });
            
            if (missingTokens.length > 0) {
                console.warn('⚠️ Missing CSS tokens:', missingTokens);
            } else {
                console.log('✅ All CSS tokens are defined');
            }
            
            // Check for #app-root
            const appRoot = document.getElementById('app-root');
            if (!appRoot) {
                console.warn('⚠️ Missing #app-root wrapper');
            } else {
                console.log('✅ #app-root wrapper found');
            }
        }, 500);
    }
})();



