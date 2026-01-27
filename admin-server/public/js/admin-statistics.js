// Admin Statistics JavaScript

let currentDateRange = '30d';
let charts = {};
let refreshInterval = null;

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats();
    setupEventListeners();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    cleanup();
});

// Setup event listeners
function setupEventListeners() {
    // Auto-refresh every 5 minutes
    refreshInterval = setInterval(() => {
        if (currentTab === 'overview') {
            loadDashboardStats();
        }
    }, 300100);
}

// Cleanup function
function cleanup() {
    // Clear interval
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    // Destroy all charts
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    charts = {};
}

// Change date range
function changeDateRange(range, event) {
    currentDateRange = range;
    
    // Update active button
    document.querySelectorAll('.date-range-selector button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Use event parameter if provided, otherwise find the button
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: find button with matching onclick
        const buttons = document.querySelectorAll('.date-range-selector button');
        buttons.forEach(btn => {
            if (btn.onclick && btn.onclick.toString().includes(`changeDateRange('${range}'`)) {
                btn.classList.add('active');
            }
        });
    }
    
    // Reload current tab
    const activeTabElement = document.querySelector('.tab-content.active');
    if (activeTabElement) {
        const activeTab = activeTabElement.id.replace('Tab', '');
        loadTabData(activeTab);
    }
}

// Switch tabs
let currentTab = 'overview';
function switchTab(tab, event) {
    currentTab = tab;
    
    // Validate tab exists
    const tabContent = document.getElementById(tab + 'Tab');
    if (!tabContent) {
        console.error(`Tab ${tab} not found`);
        return;
    }
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Use event parameter if provided, otherwise find the button
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: find button with matching onclick
        const buttons = document.querySelectorAll('.tab-btn');
        buttons.forEach(btn => {
            if (btn.onclick && btn.onclick.toString().includes(`switchTab('${tab}'`)) {
                btn.classList.add('active');
            }
        });
    }
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    tabContent.classList.add('active');
    
    // Clean up charts before switching
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    charts = {};
    
    loadTabData(tab);
}

// Load tab data
function loadTabData(tab) {
    switch(tab) {
        case 'overview':
            loadDashboardStats();
            break;
        case 'users':
            loadUserStats();
            break;
        case 'activity':
            loadActivityStats();
            break;
        case 'growth':
            loadGrowthMetrics();
            break;
        case 'quality':
            loadQualityMetrics();
            break;
    }
}

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        const response = await fetch(`/api/stats/dashboard?range=${currentDateRange}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load dashboard stats');
        }

        const stats = data.statistics;

        // Update stat boxes
        renderDashboardStats(stats);

        // Render charts with null checks
        if (stats.users) {
            renderGenderChart(stats.users);
        }
        if (stats.ageDistribution && Array.isArray(stats.ageDistribution)) {
            renderAgeChart(stats.ageDistribution);
        }
        if (stats.geographic && Array.isArray(stats.geographic)) {
            renderCountriesChart(stats.geographic);
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// Render dashboard stat boxes
function renderDashboardStats(stats) {
    const container = document.getElementById('dashboardStats');
    const users = stats.users || {};
    
    container.innerHTML = `
        <div class="stat-box">
            <h4>Total Users</h4>
            <div class="value">${formatNumber(users.total_users || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>New Users (Period)</h4>
            <div class="value">${formatNumber(users.new_users_period || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>Active (24h)</h4>
            <div class="value">${formatNumber(users.active_24h || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>Active (7d)</h4>
            <div class="value">${formatNumber(users.active_7d || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>Active (30d)</h4>
            <div class="value">${formatNumber(users.active_30d || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>Verified Users</h4>
            <div class="value">${formatNumber(users.verified_users || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>Banned Users</h4>
            <div class="value">${formatNumber(users.banned_users || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>Messages (24h)</h4>
            <div class="value">${formatNumber(stats.activity?.messages_24h || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>Likes (24h)</h4>
            <div class="value">${formatNumber(stats.activity?.likes_24h || 0)}</div>
        </div>
        <div class="stat-box">
            <h4>Views (24h)</h4>
            <div class="value">${formatNumber(stats.activity?.views_24h || 0)}</div>
        </div>
    `;
}

// Render gender chart
function renderGenderChart(userStats) {
    const canvas = document.getElementById('genderChart');
    if (!canvas) {
        console.error('Gender chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for gender chart');
        return;
    }
    
    if (charts.gender) {
        charts.gender.destroy();
    }
    
    if (!userStats) {
        console.warn('No user stats provided for gender chart');
        return;
    }
    
    charts.gender = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Male', 'Female', 'Other'],
            datasets: [{
                data: [
                    userStats.male_users || 0,
                    userStats.female_users || 0,
                    userStats.other_users || 0
                ],
                backgroundColor: ['#667eea', '#f093fb', '#4facfe']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true
        }
    });
}

// Render age chart
function renderAgeChart(ageDistribution) {
    const canvas = document.getElementById('ageChart');
    if (!canvas) {
        console.error('Age chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for age chart');
        return;
    }
    
    if (charts.age) {
        charts.age.destroy();
    }
    
    if (!ageDistribution || !Array.isArray(ageDistribution) || ageDistribution.length === 0) {
        // Silently handle empty data - this is normal if there are no users or no users with birthdate
        return;
    }
    
    const labels = (ageDistribution || []).map(a => a.age_group || 'Unknown');
    const data = (ageDistribution || []).map(a => parseInt(a.count || 0));
    
    charts.age = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Users',
                data: data,
                backgroundColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render countries chart
function renderCountriesChart(geographic) {
    const canvas = document.getElementById('countriesChart');
    if (!canvas) {
        console.error('Countries chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for countries chart');
        return;
    }
    
    if (charts.countries) {
        charts.countries.destroy();
    }
    
    if (!geographic || !Array.isArray(geographic) || geographic.length === 0) {
        console.warn('No geographic data provided');
        return;
    }
    
    const labels = (geographic || []).map(g => g.country || 'Unknown');
    const data = (geographic || []).map(g => parseInt(g.user_count || 0));
    
    charts.countries = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Users',
                data: data,
                backgroundColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Load user statistics
async function loadUserStats() {
    try {
        const response = await fetch('/api/stats/users');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load user stats');
        }

        const stats = data.statistics;

        // Render growth chart
        if (stats.growth && Array.isArray(stats.growth)) {
            renderUserGrowthChart(stats.growth);
        }
        
        // Render activity distribution
        if (stats.activityDistribution && Array.isArray(stats.activityDistribution)) {
            renderActivityDistributionChart(stats.activityDistribution);
        }
        
        // Render completeness chart
        if (stats.completeness && Array.isArray(stats.completeness)) {
            renderCompletenessChart(stats.completeness);
        }
    } catch (error) {
        console.error('Error loading user stats:', error);
    }
}

// Render user growth chart
function renderUserGrowthChart(growth) {
    const canvas = document.getElementById('userGrowthTimeChart');
    if (!canvas) {
        console.error('User growth chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for user growth chart');
        return;
    }
    
    if (charts.userGrowth) {
        charts.userGrowth.destroy();
    }
    
    if (!growth || !Array.isArray(growth) || growth.length === 0) {
        console.warn('No growth data provided');
        return;
    }
    
    const labels = (growth || []).map(g => formatDate(g.date));
    const data = (growth || []).map(g => parseInt(g.new_users || 0));
    
    charts.userGrowth = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'New Users',
                data: data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render activity distribution chart
function renderActivityDistributionChart(distribution) {
    const canvas = document.getElementById('activityDistributionChart');
    if (!canvas) {
        console.error('Activity distribution chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for activity distribution chart');
        return;
    }
    
    if (charts.activityDist) {
        charts.activityDist.destroy();
    }
    
    if (!distribution || !Array.isArray(distribution) || distribution.length === 0) {
        console.warn('No activity distribution data provided');
        return;
    }
    
    const labels = (distribution || []).map(d => d.activity_level || 'Unknown');
    const data = (distribution || []).map(d => parseInt(d.count || 0));
    
    charts.activityDist = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#28a745', '#ffc107', '#17a2b8', '#6c757d', '#dc3545']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true
        }
    });
}

// Render completeness chart
function renderCompletenessChart(completeness) {
    const canvas = document.getElementById('completenessChart');
    if (!canvas) {
        console.error('Completeness chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for completeness chart');
        return;
    }
    
    if (charts.completeness) {
        charts.completeness.destroy();
    }
    
    if (!completeness || !Array.isArray(completeness) || completeness.length === 0) {
        console.warn('No completeness data provided');
        return;
    }
    
    const labels = (completeness || []).map(c => c.completeness || 'Unknown');
    const data = (completeness || []).map(c => parseInt(c.count || 0));
    
    charts.completeness = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#28a745', '#ffc107', '#dc3545']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true
        }
    });
}

// Load activity statistics
async function loadActivityStats() {
    try {
        const response = await fetch(`/api/stats/activity?range=${currentDateRange}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load activity stats');
        }

        const stats = data.statistics;

        // Render daily activity chart
        if (stats.dailyMessages || stats.dailyLikes || stats.dailyViews) {
            renderDailyActivityChart(
                stats.dailyMessages || [],
                stats.dailyLikes || [],
                stats.dailyViews || []
            );
        }
        
        // Render individual charts
        if (stats.dailyMessages && Array.isArray(stats.dailyMessages)) {
            renderMessagesChart(stats.dailyMessages);
        }
        if (stats.dailyLikes && Array.isArray(stats.dailyLikes)) {
            renderLikesChart(stats.dailyLikes);
        }
    } catch (error) {
        console.error('Error loading activity stats:', error);
    }
}

// Render daily activity chart
function renderDailyActivityChart(messages, likes, views) {
    const canvas = document.getElementById('dailyActivityChart');
    if (!canvas) {
        console.error('Daily activity chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for daily activity chart');
        return;
    }
    
    if (charts.dailyActivity) {
        charts.dailyActivity.destroy();
    }
    
    // Validate data
    if ((!messages || !Array.isArray(messages)) && 
        (!likes || !Array.isArray(likes)) && 
        (!views || !Array.isArray(views))) {
        console.warn('No activity data provided');
        return;
    }
    
    // Get all unique dates
    const allDates = new Set();
    (messages || []).forEach(m => m.date && allDates.add(m.date));
    (likes || []).forEach(l => l.date && allDates.add(l.date));
    (views || []).forEach(v => v.date && allDates.add(v.date));
    const sortedDates = Array.from(allDates).sort();
    
    const messageData = sortedDates.map(date => {
        const msg = messages.find(m => m.date === date);
        return msg ? parseInt(msg.message_count) : 0;
    });
    
    const likeData = sortedDates.map(date => {
        const like = likes.find(l => l.date === date);
        return like ? parseInt(like.like_count) : 0;
    });
    
    const viewData = sortedDates.map(date => {
        const view = views.find(v => v.date === date);
        return view ? parseInt(view.view_count) : 0;
    });
    
    charts.dailyActivity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDates.map(d => formatDate(d)),
            datasets: [
                {
                    label: 'Messages',
                    data: messageData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)'
                },
                {
                    label: 'Likes',
                    data: likeData,
                    borderColor: '#f093fb',
                    backgroundColor: 'rgba(240, 147, 251, 0.1)'
                },
                {
                    label: 'Views',
                    data: viewData,
                    borderColor: '#4facfe',
                    backgroundColor: 'rgba(79, 172, 254, 0.1)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render messages chart
function renderMessagesChart(messages) {
    const canvas = document.getElementById('messagesChart');
    if (!canvas) {
        console.error('Messages chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for messages chart');
        return;
    }
    
    if (charts.messages) {
        charts.messages.destroy();
    }
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        console.warn('No messages data provided');
        return;
    }
    
    const labels = (messages || []).map(m => formatDate(m.date));
    const data = (messages || []).map(m => parseInt(m.message_count || 0));
    
    charts.messages = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Messages',
                data: data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render likes chart
function renderLikesChart(likes) {
    const canvas = document.getElementById('likesChart');
    if (!canvas) {
        console.error('Likes chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for likes chart');
        return;
    }
    
    if (charts.likes) {
        charts.likes.destroy();
    }
    
    if (!likes || !Array.isArray(likes) || likes.length === 0) {
        console.warn('No likes data provided');
        return;
    }
    
    const labels = (likes || []).map(l => formatDate(l.date));
    const data = (likes || []).map(l => parseInt(l.like_count || 0));
    
    charts.likes = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Likes',
                data: data,
                borderColor: '#f093fb',
                backgroundColor: 'rgba(240, 147, 251, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Load growth metrics
async function loadGrowthMetrics() {
    try {
        const response = await fetch('/api/stats/growth');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load growth metrics');
        }

        const stats = data.statistics;

        if (stats.daily && Array.isArray(stats.daily)) {
            renderDailyGrowthChart(stats.daily);
        }
        if (stats.weekly && Array.isArray(stats.weekly)) {
            renderWeeklyGrowthChart(stats.weekly);
        }
        if (stats.monthly && Array.isArray(stats.monthly)) {
            renderMonthlyGrowthChart(stats.monthly);
        }
    } catch (error) {
        console.error('Error loading growth metrics:', error);
    }
}

// Render daily growth chart
function renderDailyGrowthChart(daily) {
    const canvas = document.getElementById('dailyGrowthChart');
    if (!canvas) {
        console.error('Daily growth chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for daily growth chart');
        return;
    }
    
    if (charts.dailyGrowth) {
        charts.dailyGrowth.destroy();
    }
    
    if (!daily || !Array.isArray(daily) || daily.length === 0) {
        console.warn('No daily growth data provided');
        return;
    }
    
    const labels = (daily || []).map(d => formatDate(d.period));
    const data = (daily || []).map(d => parseInt(d.new_users || 0));
    
    charts.dailyGrowth = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'New Users',
                data: data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render weekly growth chart
function renderWeeklyGrowthChart(weekly) {
    const canvas = document.getElementById('weeklyGrowthChart');
    if (!canvas) {
        console.error('Weekly growth chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for weekly growth chart');
        return;
    }
    
    if (charts.weeklyGrowth) {
        charts.weeklyGrowth.destroy();
    }
    
    if (!weekly || !Array.isArray(weekly) || weekly.length === 0) {
        console.warn('No weekly growth data provided');
        return;
    }
    
    const labels = (weekly || []).map(w => formatDate(w.period));
    const data = (weekly || []).map(w => parseInt(w.new_users || 0));
    
    charts.weeklyGrowth = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'New Users',
                data: data,
                backgroundColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render monthly growth chart
function renderMonthlyGrowthChart(monthly) {
    const canvas = document.getElementById('monthlyGrowthChart');
    if (!canvas) {
        console.error('Monthly growth chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for monthly growth chart');
        return;
    }
    
    if (charts.monthlyGrowth) {
        charts.monthlyGrowth.destroy();
    }
    
    if (!monthly || !Array.isArray(monthly) || monthly.length === 0) {
        console.warn('No monthly growth data provided');
        return;
    }
    
    const labels = (monthly || []).map(m => formatDate(m.period));
    const data = (monthly || []).map(m => parseInt(m.new_users || 0));
    
    charts.monthlyGrowth = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'New Users',
                data: data,
                backgroundColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Load quality metrics
async function loadQualityMetrics() {
    try {
        const response = await fetch('/api/stats/quality');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load quality metrics');
        }

        const stats = data.statistics;

        renderQualityStats(stats);
        renderQualityMetricsChart(stats);
    } catch (error) {
        console.error('Error loading quality metrics:', error);
    }
}

// Render quality stats
function renderQualityStats(stats) {
    const container = document.getElementById('qualityStats');
    if (!container) {
        console.error('Quality stats container not found');
        return;
    }
    
    if (!stats) {
        console.warn('No quality stats provided');
        return;
    }
    
    container.innerHTML = `
        <div class="stat-box">
            <h4>Avg Profile Completeness</h4>
            <div class="value">${(stats.avgCompleteness || 0).toFixed(1)}%</div>
        </div>
        <div class="stat-box">
            <h4>Users with Photos</h4>
            <div class="value">${(stats.photoPercentage || 0).toFixed(1)}%</div>
        </div>
        <div class="stat-box">
            <h4>Verified Users</h4>
            <div class="value">${(stats.verifiedPercentage || 0).toFixed(1)}%</div>
        </div>
        <div class="stat-box">
            <h4>Active Users (30d)</h4>
            <div class="value">${(stats.activeRatio || 0).toFixed(1)}%</div>
        </div>
    `;
}

// Render quality metrics chart
function renderQualityMetricsChart(stats) {
    const canvas = document.getElementById('qualityMetricsChart');
    if (!canvas) {
        console.error('Quality metrics chart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for quality metrics chart');
        return;
    }
    
    if (charts.quality) {
        charts.quality.destroy();
    }
    
    if (!stats) {
        console.warn('No quality stats provided');
        return;
    }
    
    charts.quality = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Completeness', 'With Photos', 'Verified', 'Active (30d)'],
            datasets: [{
                label: 'Percentage',
                data: [
                    stats.avgCompleteness || 0,
                    stats.photoPercentage || 0,
                    stats.verifiedPercentage || 0,
                    stats.activeRatio || 0
                ],
                backgroundColor: '#667eea'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

// Utility functions
function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}




















































