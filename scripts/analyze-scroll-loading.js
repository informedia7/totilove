/**
 * STANDALONE SCROLL LOADING ANALYZER
 * Run this script to analyze scroll loading issues
 * 
 * Usage:
 *   Browser: Copy and paste into browser console on talk page
 *   Node.js: node scripts/analyze-scroll-loading.js
 */

(function() {
    'use strict';
    
    // Check if running in browser or Node.js
    const isBrowser = typeof window !== 'undefined';
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    
    if (isNode) {
        console.log('❌ This script must be run in a browser console on the talk page');
        console.log('💡 Open your browser, navigate to /talk, select a conversation, then paste this script');
        return;
    }
    
    console.log('🔍 === SCROLL LOADING ANALYSIS ===');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check if we're on the talk page
    if (!document.getElementById('messagesArea')) {
        console.error('❌ messagesArea element not found');
        console.log('💡 Make sure you are on the /talk page');
        return;
    }
    
    const messagesArea = document.getElementById('messagesArea');
    const state = messagesArea._scrollLoadingState;
    
    if (!state) {
        console.error('❌ Scroll loading state not initialized');
        console.log('💡 Try scrolling up first to initialize scroll loading');
        console.log('💡 Or select a conversation if you haven\'t already');
        return;
    }
    
    // Get conversation info
    let currentConvId = null;
    let conversations = {};
    let conversation = null;
    let messageCount = 0;
    
    if (typeof TalkState !== 'undefined') {
        currentConvId = TalkState.getCurrentConversation();
        conversations = TalkState.getConversations();
        conversation = conversations[currentConvId];
        messageCount = conversation?.messages?.length || 0;
    } else {
        console.warn('⚠️ TalkState not found - some information may be missing');
    }
    
    // Get pagination info
    let currentPage = null;
    let totalPages = null;
    
    if (typeof getCurrentPage === 'function') {
        currentPage = getCurrentPage();
    }
    if (typeof getTotalPages === 'function') {
        totalPages = getTotalPages();
    }
    
    // Helper function to get sentinel position
    function getSentinelPosition(sentinel, messagesArea) {
        const sentinelRect = sentinel.getBoundingClientRect();
        const areaRect = messagesArea.getBoundingClientRect();
        return {
            relativeTop: sentinelRect.top - areaRect.top + messagesArea.scrollTop,
            absoluteTop: sentinelRect.top,
            isAboveViewport: sentinelRect.bottom < areaRect.top,
            isBelowViewport: sentinelRect.top > areaRect.bottom,
            isInViewport: sentinelRect.top >= areaRect.top && sentinelRect.bottom <= areaRect.bottom
        };
    }
    
    console.log('\n📊 STATE ANALYSIS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Conversation:', {
        id: currentConvId || 'unknown',
        messageCount: messageCount,
        hasConversation: !!conversation
    });
    
    console.log('\n📄 Pagination:', {
        currentPage: currentPage !== null ? currentPage : 'unknown',
        totalPages: totalPages !== null ? totalPages : 'unknown',
        messagesPerPage: 10,
        estimatedTotal: totalPages ? totalPages * 10 : 'unknown',
        canLoadMore: currentPage !== null && totalPages !== null ? currentPage < totalPages : 'unknown'
    });
    
    console.log('\n🔄 Scroll Loading State:', {
        conversationId: state.conversationId || 'unknown',
        isLoading: state.isLoading,
        hasMore: state.hasMore,
        lastLoadTime: state.lastLoadTime ? new Date(state.lastLoadTime).toLocaleTimeString() : 'never',
        timeSinceLastLoad: state.lastLoadTime ? (Date.now() - state.lastLoadTime) + 'ms' : 'N/A'
    });
    
    console.log('\n👁️ Observer:', {
        exists: !!state.observer,
        isObserving: state.observer?._isObserving || false,
        isConnected: state.observer ? 'Yes' : 'No',
        hasCallback: !!state.observer?._callback
    });
    
    console.log('\n📍 Sentinel:', {
        exists: !!state.sentinel,
        inDOM: state.sentinel?.parentNode ? 'Yes' : 'No',
        display: state.sentinel?.style.display || 'default',
        height: state.sentinel?.offsetHeight || 0,
        width: state.sentinel?.offsetWidth || 0
    });
    
    // Check if sentinel is visible
    if (state.sentinel) {
        const rect = state.sentinel.getBoundingClientRect();
        const areaRect = messagesArea.getBoundingClientRect();
        const isVisible = rect.top >= areaRect.top && rect.bottom <= areaRect.bottom;
        const scrollTop = messagesArea.scrollTop;
        const scrollHeight = messagesArea.scrollHeight;
        const clientHeight = messagesArea.clientHeight;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        
        console.log('\n👀 Sentinel Visibility:', {
            isVisible: isVisible,
            sentinelTop: Math.round(rect.top),
            areaTop: Math.round(areaRect.top),
            scrollTop: Math.round(scrollTop),
            scrollHeight: Math.round(scrollHeight),
            clientHeight: Math.round(clientHeight),
            isAtBottom: isAtBottom,
            distanceFromTop: Math.round(rect.top - areaRect.top)
        });
        
        console.log('\n📍 Sentinel Position Details:', getSentinelPosition(state.sentinel, messagesArea));
    }
    
    // Diagnose issues
    console.log('\n🔧 DIAGNOSIS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const issues = [];
    const recommendations = [];
    
    if (!state.hasMore) {
        issues.push('❌ hasMore is false - observer will not trigger');
        if (currentPage !== null && totalPages !== null) {
            if (currentPage >= totalPages) {
                issues.push(`   → Reason: Already on last page (${currentPage}/${totalPages})`);
            } else {
                issues.push(`   → Issue: hasMore should be true (page ${currentPage} < ${totalPages})`);
                recommendations.push('Fix: state.hasMore = true');
                recommendations.push('Fix: Check why totalPages is incorrect');
            }
        } else {
            recommendations.push('Fix: Ensure pagination is initialized');
        }
    } else {
        console.log('✅ hasMore is true - observer can trigger');
    }
    
    if (!state.observer) {
        issues.push('❌ Observer does not exist');
        recommendations.push('Fix: Observer needs to be created in setupScrollLazyLoading()');
    } else if (!state.observer._isObserving) {
        issues.push('❌ Observer is not observing sentinel');
        const scrollTop = messagesArea.scrollTop;
        const scrollHeight = messagesArea.scrollHeight;
        const clientHeight = messagesArea.clientHeight;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        if (isAtBottom) {
            issues.push('   → Reason: User is at bottom (observer disconnected to prevent triggers)');
            recommendations.push('Fix: Scroll up to reconnect observer');
        } else {
            issues.push('   → Issue: Observer should be observing when scrolled up');
            recommendations.push('Fix: state.observer.observe(state.sentinel)');
            recommendations.push('Fix: state.observer._isObserving = true');
        }
    } else {
        console.log('✅ Observer is observing sentinel');
    }
    
    if (!state.sentinel) {
        issues.push('❌ Sentinel does not exist');
        recommendations.push('Fix: Sentinel needs to be created in setupScrollLazyLoading()');
    } else if (!state.sentinel.parentNode) {
        issues.push('❌ Sentinel is not in DOM');
        recommendations.push('Fix: Sentinel was removed from DOM - needs to be recreated');
    } else if (state.sentinel.style.display === 'none') {
        issues.push('❌ Sentinel is hidden (display: none)');
        recommendations.push('Fix: state.sentinel.style.display = ""');
    } else {
        console.log('✅ Sentinel exists and is visible');
    }
    
    if (state.isLoading) {
        issues.push('⏳ Currently loading (this is normal during load)');
    }
    
    if (issues.length === 0) {
        console.log('✅ No obvious issues found');
        console.log('💡 Try scrolling up slowly to see if observer triggers');
    } else {
        console.log('\nIssues found:');
        issues.forEach(issue => console.log(issue));
    }
    
    // Recommendations
    if (recommendations.length > 0) {
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        recommendations.forEach((rec, i) => console.log(`${i + 1}. ${rec}`));
    }
    
    // Summary
    console.log('\n📋 SUMMARY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Issues found: ${issues.filter(i => i.startsWith('❌')).length}`);
    console.log(`Warnings: ${issues.filter(i => i.startsWith('⏳')).length}`);
    console.log(`Recommendations: ${recommendations.length}`);
    
    if (state.hasMore && state.observer && state.observer._isObserving && state.sentinel) {
        console.log('\n✅ All systems operational - scroll loading should work');
    } else {
        console.log('\n⚠️ Issues detected - scroll loading may not work correctly');
    }
    
    // Return analysis result
    return {
        state: state,
        conversation: conversation,
        pagination: { currentPage, totalPages },
        issues: issues,
        recommendations: recommendations,
        isHealthy: state.hasMore && state.observer && state.observer._isObserving && state.sentinel
    };
})();





































