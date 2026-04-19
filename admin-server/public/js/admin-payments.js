// Admin Payment Management JavaScript

let currentPaymentPage = 1;
let currentSubscriptionPage = 1;
let paymentFilters = {};
let subscriptionFilters = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadPayments();
    setupPaymentEventListeners();
});

// Setup event listeners
function setupPaymentEventListeners() {
    // Payment filters
    document.getElementById('applyPaymentFilters')?.addEventListener('click', () => {
        applyPaymentFilters();
    });

    document.getElementById('clearPaymentFilters')?.addEventListener('click', () => {
        clearPaymentFilters();
    });

    // Subscription filters
    document.getElementById('applySubscriptionFilters')?.addEventListener('click', () => {
        applySubscriptionFilters();
    });

    document.getElementById('clearSubscriptionFilters')?.addEventListener('click', () => {
        clearSubscriptionFilters();
    });

    // Search with debounce
    let searchTimeout;
    document.getElementById('paymentSearch')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            paymentFilters.search = e.target.value;
            currentPaymentPage = 1;
            loadPayments();
        }, 500);
    });
}

// Tab switching
function showTab(tabName, event) {
    // Validate tab exists
    const tabContent = document.getElementById(tabName + 'Tab');
    if (!tabContent) {
        console.error(`Tab ${tabName} not found`);
        return;
    }
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });

    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    let tabBtn = null;
    
    // Use event parameter if provided, otherwise find the button
    if (event && event.target) {
        tabBtn = event.target;
    } else {
        // Fallback: find button with matching onclick
        const buttons = document.querySelectorAll('.tab-btn');
        buttons.forEach(btn => {
            if (btn.onclick && btn.onclick.toString().includes(`showTab('${tabName}'`)) {
                tabBtn = btn;
            }
        });
    }
    
    if (tabContent) {
        tabContent.classList.add('active');
        tabContent.style.display = 'block';
        if (tabBtn) {
            tabBtn.classList.add('active');
        }

        // Load data for the tab
        if (tabName === 'payments') {
            loadPayments();
        } else if (tabName === 'subscriptions') {
            loadSubscriptions();
        } else if (tabName === 'plans') {
            loadPlans();
            loadDiscounts();
        } else if (tabName === 'stats') {
            loadPaymentStats();
        }
    }
}

// Load payments
async function loadPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading payments...</td></tr>';

    try {
        const params = new URLSearchParams({
            page: currentPaymentPage,
            limit: 20,
            ...paymentFilters
        });

        const response = await fetch(`/api/payments?${params}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load payments');
        }

        renderPayments(data.payments);
        renderPagination('paymentsPagination', data.pagination, 'payments');
    } catch (error) {
        console.error('Error loading payments:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="loading">Error: ${error.message}</td></tr>`;
    }
}

// Render payments
function renderPayments(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    
    if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No payments found</td></tr>';
        return;
    }

    tbody.innerHTML = payments.map(payment => `
        <tr>
            <td>${payment.id}</td>
            <td>${payment.username || 'N/A'} (ID: ${payment.user_id || 'N/A'})</td>
            <td>$${parseFloat(payment.amount || 0).toFixed(2)}</td>
            <td>${payment.payment_method || 'N/A'}</td>
            <td><span class="status-badge ${payment.payment_status}">${payment.payment_status || 'N/A'}</span></td>
            <td>${payment.payment_date ? new Date(payment.payment_date).toLocaleString() : 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view" onclick="viewPayment(${payment.id})">View</button>
                    <button class="action-btn edit" onclick="editPayment(${payment.id})">Edit</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Load subscriptions
async function loadSubscriptions() {
    const tbody = document.getElementById('subscriptionsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading subscriptions...</td></tr>';

    try {
        const params = new URLSearchParams({
            page: currentSubscriptionPage,
            limit: 20,
            ...subscriptionFilters
        });

        const response = await fetch(`/api/payments/subscriptions?${params}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load subscriptions');
        }

        renderSubscriptions(data.subscriptions);
        renderPagination('subscriptionsPagination', data.pagination, 'subscriptions');
    } catch (error) {
        console.error('Error loading subscriptions:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="loading">Error: ${error.message}</td></tr>`;
    }
}

// Render subscriptions
function renderSubscriptions(subscriptions) {
    const tbody = document.getElementById('subscriptionsTableBody');
    
    if (subscriptions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No subscriptions found</td></tr>';
        return;
    }

    tbody.innerHTML = subscriptions.map(sub => `
        <tr>
            <td>${sub.id}</td>
            <td>${sub.username || 'N/A'} (ID: ${sub.user_id || 'N/A'})</td>
            <td>${sub.subscription_type || 'N/A'}</td>
            <td>
                <span class="status-badge ${sub.is_active ? 'active' : 'expired'}">
                    ${sub.is_active ? 'Active' : 'Expired'}
                </span>
            </td>
            <td>${sub.start_date ? new Date(sub.start_date).toLocaleDateString() : 'N/A'}</td>
            <td>${sub.end_date ? new Date(sub.end_date).toLocaleDateString() : 'No expiry'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view" onclick="viewSubscription(${sub.id})">View</button>
                    ${sub.is_active 
                        ? `<button class="action-btn ban" onclick="cancelSubscription(${sub.id})">Cancel</button>`
                        : `<button class="action-btn" onclick="extendSubscription(${sub.id})">Extend</button>`
                    }
                </div>
            </td>
        </tr>
    `).join('');
}

// Load payment statistics
async function loadPaymentStats() {
    try {
        const [paymentStats, subscriptionStats] = await Promise.all([
            fetch('/api/payments/stats').then(r => r.json()),
            fetch('/api/payments/subscriptions/stats').then(r => r.json())
        ]);

        if (paymentStats.success) {
            document.getElementById('totalRevenue').textContent = 
                `$${parseFloat(paymentStats.stats.total_revenue || 0).toFixed(2)}`;
            document.getElementById('totalPayments').textContent = 
                paymentStats.stats.total_payments || 0;
            document.getElementById('avgTransaction').textContent = 
                `$${parseFloat(paymentStats.stats.avg_transaction_value || 0).toFixed(2)}`;
        }

        if (subscriptionStats.success) {
            document.getElementById('activeSubscriptions').textContent = 
                subscriptionStats.stats.active_subscriptions || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Apply payment filters
function applyPaymentFilters() {
    paymentFilters = {
        status: document.getElementById('paymentStatusFilter').value,
        paymentMethod: document.getElementById('paymentMethodFilter').value,
        amountMin: document.getElementById('amountMin').value || null,
        amountMax: document.getElementById('amountMax').value || null,
        dateFrom: document.getElementById('paymentDateFrom').value || null,
        dateTo: document.getElementById('paymentDateTo').value || null
    };
    currentPaymentPage = 1;
    loadPayments();
}

// Clear payment filters
function clearPaymentFilters() {
    document.getElementById('paymentSearch').value = '';
    document.getElementById('paymentStatusFilter').value = '';
    document.getElementById('paymentMethodFilter').value = '';
    document.getElementById('amountMin').value = '';
    document.getElementById('amountMax').value = '';
    document.getElementById('paymentDateFrom').value = '';
    document.getElementById('paymentDateTo').value = '';
    paymentFilters = {};
    currentPaymentPage = 1;
    loadPayments();
}

// Apply subscription filters
function applySubscriptionFilters() {
    subscriptionFilters = {
        subscriptionType: document.getElementById('subscriptionTypeFilter').value,
        paymentStatus: document.getElementById('subscriptionPaymentStatusFilter').value,
        isActive: document.getElementById('subscriptionStatusFilter').value === 'active' ? true : 
                  document.getElementById('subscriptionStatusFilter').value === 'expired' ? false : null
    };
    currentSubscriptionPage = 1;
    loadSubscriptions();
}

// Clear subscription filters
function clearSubscriptionFilters() {
    document.getElementById('subscriptionSearch').value = '';
    document.getElementById('subscriptionTypeFilter').value = '';
    document.getElementById('subscriptionStatusFilter').value = '';
    document.getElementById('subscriptionPaymentStatusFilter').value = '';
    subscriptionFilters = {};
    currentSubscriptionPage = 1;
    loadSubscriptions();
}

// Render pagination
function renderPagination(elementId, pagination, type) {
    const paginationDiv = document.getElementById(elementId);
    if (!paginationDiv || !pagination || pagination.pages <= 1) {
        if (paginationDiv) paginationDiv.innerHTML = '';
        return;
    }

    const pageVar = type === 'payments' ? 'currentPaymentPage' : 'currentSubscriptionPage';
    const loadFunc = type === 'payments' ? 'loadPayments' : 'loadSubscriptions';

    paginationDiv.innerHTML = `
        <button ${!pagination.hasPrev ? 'disabled' : ''} onclick="${pageVar} = ${pagination.page - 1}; ${loadFunc}()">Previous</button>
        <span class="page-info">Page ${pagination.page} of ${pagination.pages} (${pagination.total} total)</span>
        <button ${!pagination.hasNext ? 'disabled' : ''} onclick="${pageVar} = ${pagination.page + 1}; ${loadFunc}()">Next</button>
    `;
}

// View payment
async function viewPayment(paymentId) {
    try {
        const response = await fetch(`/api/payments/${paymentId}`);
        const data = await response.json();
        
        if (data.success) {
            const payment = data.payment;
            showInfo(`Payment Details:\nID: ${payment.id}\nUser: ${payment.username}\nAmount: $${payment.amount}\nStatus: ${payment.payment_status}\nMethod: ${payment.payment_method}\nDate: ${new Date(payment.payment_date).toLocaleString()}`);
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Edit payment
async function editPayment(paymentId) {
    try {
        const response = await fetch(`/api/payments/${paymentId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load payment');
        }

        const payment = data.payment;
        const currentStatus = payment.payment_status || payment.status || 'pending';
        const statusOptions = ['pending', 'completed', 'failed', 'refunded', 'expired'];
        
        const newStatus = prompt(`Edit Payment Status\n\nCurrent Status: ${currentStatus}\n\nAvailable options:\n${statusOptions.join(', ')}\n\nEnter new status:`, currentStatus);
        
        if (newStatus === null) return; // User cancelled
        
        if (!statusOptions.includes(newStatus.toLowerCase())) {
            showWarning('Invalid status. Must be one of: ' + statusOptions.join(', '));
            return;
        }

        const confirmed = await showConfirm(`Are you sure you want to change payment status from "${currentStatus}" to "${newStatus}"?`, 'Change Payment Status', 'Change', 'Cancel', 'warning');
        if (!confirmed) {
            return;
        }

        const updateResponse = await fetch(`/api/payments/${paymentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_status: newStatus.toLowerCase() })
        });

        const updateData = await updateResponse.json();
        
        if (updateData.success) {
            showSuccess('Payment updated successfully!');
            loadPayments();
        } else {
            showError('Error: ' + (updateData.error || 'Failed to update payment'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// View subscription
async function viewSubscription(subscriptionId) {
    try {
        const response = await fetch(`/api/payments/subscriptions/${subscriptionId}`);
        const data = await response.json();
        
        if (data.success) {
            const sub = data.subscription;
            showInfo(`Subscription Details:\nID: ${sub.id}\nUser: ${sub.username}\nType: ${sub.subscription_type}\nStatus: ${sub.is_active ? 'Active' : 'Expired'}\nStart: ${new Date(sub.start_date).toLocaleDateString()}\nEnd: ${sub.end_date ? new Date(sub.end_date).toLocaleDateString() : 'No expiry'}`);
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Cancel subscription
async function cancelSubscription(subscriptionId) {
    const confirmed = await showConfirm('Are you sure you want to cancel this subscription?', 'Cancel Subscription', 'Cancel Subscription', 'Keep Active', 'warning');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/payments/subscriptions/${subscriptionId}/cancel`, {
            method: 'POST'
        });

        const data = await response.json();
        if (data.success) {
            showSuccess('Subscription cancelled successfully');
            loadSubscriptions();
        } else {
            showError('Error: ' + (data.error || 'Failed to cancel subscription'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Extend subscription
async function extendSubscription(subscriptionId) {
    const days = prompt('Enter number of days to extend:');
    if (!days || isNaN(days) || parseInt(days) <= 0) {
        showWarning('Please enter a valid number of days');
        return;
    }

    try {
        const response = await fetch(`/api/payments/subscriptions/${subscriptionId}/extend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days: parseInt(days) })
        });

        const data = await response.json();
        if (data.success) {
            showSuccess(data.message);
            loadSubscriptions();
        } else {
            showError('Error: ' + (data.error || 'Failed to extend subscription'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// ========== Billing Plans Management ==========

// Load plans
async function loadPlans() {
    const tbody = document.getElementById('plansTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading plans...</td></tr>';

    try {
        const response = await fetch('/api/payments/plans');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load plans');
        }

        renderPlans(data.plans);
    } catch (error) {
        console.error('Error loading plans:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="loading">Error: ${error.message}</td></tr>`;
    }
}

// Render plans
function renderPlans(plans) {
    const tbody = document.getElementById('plansTableBody');
    
    if (plans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No plans found</td></tr>';
        return;
    }

    tbody.innerHTML = plans.map(plan => `
        <tr>
            <td>${plan.name || 'N/A'}</td>
            <td>${plan.plan_type || 'N/A'}</td>
            <td>$${parseFloat(plan.price_monthly || 0).toFixed(2)}</td>
            <td>$${parseFloat(plan.price_yearly || 0).toFixed(2)}</td>
            <td><span class="status-badge ${plan.is_active ? 'active' : 'inactive'}">${plan.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="editPlan(${plan.id})">Edit</button>
                    <button class="action-btn ban" onclick="deletePlan(${plan.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Show plan modal
function showPlanModal(planId = null) {
    const modal = document.getElementById('planModal');
    const form = document.getElementById('planForm');
    const title = document.getElementById('planModalTitle');
    
    if (planId) {
        title.textContent = 'Edit Plan';
        loadPlanData(planId);
    } else {
        title.textContent = 'Add New Plan';
        form.reset();
        document.getElementById('planId').value = '';
    }
    
    modal.style.display = 'flex';
}

// Load plan data for editing
async function loadPlanData(planId) {
    try {
        const response = await fetch(`/api/payments/plans`);
        const data = await response.json();
        
        if (data.success) {
            const plan = data.plans.find(p => p.id === planId);
            if (plan) {
                document.getElementById('planId').value = plan.id;
                document.getElementById('planName').value = plan.name || '';
                document.getElementById('planDescription').value = plan.description || '';
                document.getElementById('planType').value = plan.plan_type || '';
                document.getElementById('planPriceMonthly').value = plan.price_monthly || 0;
                document.getElementById('planPriceYearly').value = plan.price_yearly || 0;
                document.getElementById('planDuration').value = plan.duration_days || '';
                document.getElementById('planDisplayOrder').value = plan.display_order || 0;
                document.getElementById('planIsActive').checked = plan.is_active !== false;
            }
        }
    } catch (error) {
        showError('Error loading plan: ' + error.message);
    }
}

// Close plan modal
function closePlanModal() {
    document.getElementById('planModal').style.display = 'none';
}

// Save plan
async function savePlan(event) {
    if (!event) {
        console.error('Event parameter missing in savePlan');
        return;
    }
    
    event.preventDefault();
    
    // Validate form
    const form = event.target;
    const name = form.querySelector('#planName')?.value?.trim();
    const planType = form.querySelector('#planType')?.value?.trim();
    const priceMonthly = form.querySelector('#planPriceMonthly')?.value;
    const priceYearly = form.querySelector('#planPriceYearly')?.value;
    
    if (!name) {
        showWarning('Plan name is required');
        return;
    }
    if (!planType) {
        showWarning('Plan type is required');
        return;
    }
    if (!priceMonthly || parseFloat(priceMonthly) < 0) {
        showWarning('Valid monthly price is required');
        return;
    }
    if (!priceYearly || parseFloat(priceYearly) < 0) {
        showWarning('Valid yearly price is required');
        return;
    }
    
    const formData = new FormData(event.target);
    const planId = formData.get('id');
    const planData = {
        name: formData.get('name'),
        description: formData.get('description'),
        plan_type: formData.get('plan_type'),
        price_monthly: formData.get('price_monthly'),
        price_yearly: formData.get('price_yearly'),
        duration_days: formData.get('duration_days') || null,
        display_order: formData.get('display_order') || 0,
        is_active: formData.get('is_active') === 'on'
    };

    try {
        const url = planId ? `/api/payments/plans/${planId}` : '/api/payments/plans';
        const method = planId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(planData)
        });

        const data = await response.json();
        
        if (data.success) {
            showSuccess(data.message || 'Plan saved successfully!');
            closePlanModal();
            loadPlans();
        } else {
            showError('Error: ' + (data.error || data.message || 'Failed to save plan'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Edit plan
function editPlan(planId) {
    showPlanModal(planId);
}

// Delete plan
async function deletePlan(planId) {
    const confirmed = await showConfirm('Are you sure you want to delete this plan? This action cannot be undone.', 'Delete Plan', 'Delete', 'Cancel', 'danger');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/payments/plans/${planId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            showSuccess(data.message || 'Plan deleted successfully');
            loadPlans();
        } else {
            showError('Error: ' + (data.error || 'Failed to delete plan'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// ========== Discount Codes Management ==========

// Load discounts
async function loadDiscounts() {
    const tbody = document.getElementById('discountsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading discounts...</td></tr>';

    try {
        const response = await fetch('/api/payments/discounts');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load discounts');
        }

        renderDiscounts(data.discounts);
    } catch (error) {
        console.error('Error loading discounts:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="loading">Error: ${error.message}</td></tr>`;
    }
}

// Render discounts
function renderDiscounts(discounts) {
    const tbody = document.getElementById('discountsTableBody');
    
    if (discounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No discount codes found</td></tr>';
        return;
    }

    tbody.innerHTML = discounts.map(discount => {
        const valueDisplay = discount.discount_type === 'percentage' 
            ? `${discount.discount_value}%` 
            : `$${parseFloat(discount.discount_value).toFixed(2)}`;
        const usageDisplay = discount.usage_limit 
            ? `${discount.usage_count || 0}/${discount.usage_limit}` 
            : `${discount.usage_count || 0}/∞`;

        return `
            <tr>
                <td><strong>${discount.code}</strong></td>
                <td>${discount.discount_type}</td>
                <td>${valueDisplay}</td>
                <td>${usageDisplay}</td>
                <td><span class="status-badge ${discount.is_active ? 'active' : 'inactive'}">${discount.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="editDiscount(${discount.id})">Edit</button>
                        <button class="action-btn ban" onclick="deleteDiscount(${discount.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Show discount modal
function showDiscountModal(discountId = null) {
    const modal = document.getElementById('discountModal');
    const form = document.getElementById('discountForm');
    const title = document.getElementById('discountModalTitle');
    
    if (discountId) {
        title.textContent = 'Edit Discount Code';
        loadDiscountData(discountId);
    } else {
        title.textContent = 'Add New Discount Code';
        form.reset();
        document.getElementById('discountId').value = '';
        // Set default valid_from to now
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('discountValidFrom').value = now.toISOString().slice(0, 16);
        updateDiscountFields();
    }
    
    modal.style.display = 'flex';
}

// Update discount fields based on type
function updateDiscountFields() {
    const type = document.getElementById('discountType').value;
    const valueLabel = document.getElementById('discountValueLabel');
    const valueInput = document.getElementById('discountValue');
    
    if (type === 'percentage') {
        valueLabel.textContent = 'Discount Percentage (%) *';
        valueInput.max = 100;
        valueInput.step = 0.01;
    } else {
        valueLabel.textContent = 'Discount Amount ($) *';
        valueInput.max = null;
        valueInput.step = 0.01;
    }
}

// Load discount data for editing
async function loadDiscountData(discountId) {
    try {
        const response = await fetch(`/api/payments/discounts`);
        const data = await response.json();
        
        if (data.success) {
            const discount = data.discounts.find(d => d.id === discountId);
            if (discount) {
                document.getElementById('discountId').value = discount.id;
                document.getElementById('discountCode').value = discount.code || '';
                document.getElementById('discountDescription').value = discount.description || '';
                document.getElementById('discountType').value = discount.discount_type || 'percentage';
                document.getElementById('discountValue').value = discount.discount_value || 0;
                document.getElementById('discountMinAmount').value = discount.min_purchase_amount || 0;
                document.getElementById('discountMaxAmount').value = discount.max_discount_amount || '';
                document.getElementById('discountValidFrom').value = discount.valid_from ? new Date(discount.valid_from).toISOString().slice(0, 16) : '';
                document.getElementById('discountValidUntil').value = discount.valid_until ? new Date(discount.valid_until).toISOString().slice(0, 16) : '';
                document.getElementById('discountUsageLimit').value = discount.usage_limit || '';
                document.getElementById('discountIsActive').checked = discount.is_active !== false;
                updateDiscountFields();
            }
        }
    } catch (error) {
        showError('Error loading discount: ' + error.message);
    }
}

// Close discount modal
function closeDiscountModal() {
    document.getElementById('discountModal').style.display = 'none';
}

// Save discount
async function saveDiscount(event) {
    if (!event) {
        console.error('Event parameter missing in saveDiscount');
        return;
    }
    
    event.preventDefault();
    
    // Validate form
    const form = event.target;
    const code = form.querySelector('#discountCode')?.value?.trim();
    const discountType = form.querySelector('#discountType')?.value;
    const discountValue = form.querySelector('#discountValue')?.value;
    const validFrom = form.querySelector('#discountValidFrom')?.value;
    
    if (!code) {
        showWarning('Discount code is required');
        return;
    }
    if (!discountType) {
        showWarning('Discount type is required');
        return;
    }
    if (!discountValue || parseFloat(discountValue) <= 0) {
        showWarning('Valid discount value is required');
        return;
    }
    if (discountType === 'percentage' && parseFloat(discountValue) > 100) {
        showWarning('Percentage discount cannot exceed 100%');
        return;
    }
    if (!validFrom) {
        showWarning('Valid from date is required');
        return;
    }
    
    const formData = new FormData(event.target);
    const discountId = formData.get('id');
    const discountData = {
        code: formData.get('code'),
        description: formData.get('description'),
        discount_type: formData.get('discount_type'),
        discount_value: formData.get('discount_value'),
        min_purchase_amount: formData.get('min_purchase_amount') || 0,
        max_discount_amount: formData.get('max_discount_amount') || null,
        valid_from: formData.get('valid_from'),
        valid_until: formData.get('valid_until') || null,
        usage_limit: formData.get('usage_limit') || null,
        is_active: formData.get('is_active') === 'on'
    };

    try {
        const url = discountId ? `/api/payments/discounts/${discountId}` : '/api/payments/discounts';
        const method = discountId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discountData)
        });

        const data = await response.json();
        
        if (data.success) {
            showSuccess(data.message || 'Discount code saved successfully!');
            closeDiscountModal();
            loadDiscounts();
        } else {
            showError('Error: ' + (data.error || data.message || 'Failed to save discount code'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Edit discount
function editDiscount(discountId) {
    showDiscountModal(discountId);
}

// Delete discount
async function deleteDiscount(discountId) {
    const confirmed = await showConfirm('Are you sure you want to delete this discount code? This action cannot be undone.', 'Delete Discount Code', 'Delete', 'Cancel', 'danger');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/payments/discounts/${discountId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            showSuccess(data.message || 'Discount code deleted successfully');
            loadDiscounts();
        } else {
            showError('Error: ' + (data.error || 'Failed to delete discount code'));
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}










