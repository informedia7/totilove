const { query } = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');

class PaymentManagementService {
    constructor() {
        this.cacheExpiry = 300; // 5 minutes
    }

    /**
     * Get payments with filters and pagination
     */
    async getPayments(options = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            userId = null,
            status = '',
            paymentMethod = '',
            dateFrom = null,
            dateTo = null,
            amountMin = null,
            amountMax = null,
            sortBy = 'payment_date',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;
        const cacheKey = `admin:payments:${JSON.stringify(options)}`;

        try {
            // Try cache
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Build WHERE clause
            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            // Search filter
            if (search) {
                whereConditions.push(`(CAST(p.id AS TEXT) = $${paramIndex} OR CAST(p.user_id AS TEXT) = $${paramIndex})`);
                params.push(search);
                paramIndex++;
            }

            // User ID filter
            if (userId) {
                whereConditions.push(`p.user_id = $${paramIndex}`);
                params.push(userId);
                paramIndex++;
            }

            // Status filter
            if (status) {
                whereConditions.push(`p.payment_status = $${paramIndex}`);
                params.push(status);
                paramIndex++;
            }

            // Payment method filter
            if (paymentMethod) {
                whereConditions.push(`p.payment_method = $${paramIndex}`);
                params.push(paymentMethod);
                paramIndex++;
            }

            // Date filters
            if (dateFrom) {
                whereConditions.push(`p.payment_date >= $${paramIndex}`);
                params.push(dateFrom);
                paramIndex++;
            }
            if (dateTo) {
                whereConditions.push(`p.payment_date <= $${paramIndex}`);
                params.push(dateTo);
                paramIndex++;
            }

            // Amount filters
            if (amountMin !== null) {
                whereConditions.push(`p.amount >= $${paramIndex}`);
                params.push(amountMin);
                paramIndex++;
            }
            if (amountMax !== null) {
                whereConditions.push(`p.amount <= $${paramIndex}`);
                params.push(amountMax);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM payments p
                WHERE ${whereClause}
            `;
            const countResult = await query(countQuery, params);
            const total = parseInt(countResult.rows[0]?.total || 0);

            // Get payments with user info
            const allowedSortFields = ['id', 'payment_date', 'amount', 'payment_status', 'payment_method'];
            const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'payment_date';
            const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            const paymentsQuery = `
                SELECT 
                    p.*,
                    u.real_name as username,
                    u.email
                FROM payments p
                LEFT JOIN users u ON p.user_id = u.id
                WHERE ${whereClause}
                ORDER BY p.${safeSortBy} ${safeSortOrder}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            params.push(limit, offset);

            const paymentsResult = await query(paymentsQuery, params);

            const result = {
                payments: paymentsResult.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            };

            // Cache result
            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(result), this.cacheExpiry);
            }

            return result;
        } catch (error) {
            logger.error('Error fetching payments:', error);
            throw error;
        }
    }

    /**
     * Get payment by ID
     */
    async getPaymentById(paymentId) {
        const cacheKey = `admin:payment:${paymentId}`;

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            const result = await query(
                `SELECT 
                    p.*,
                    u.real_name as username,
                    u.email,
                    u.id as user_id
                FROM payments p
                LEFT JOIN users u ON p.user_id = u.id
                WHERE p.id = $1`,
                [paymentId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const payment = result.rows[0];

            // Cache result
            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(payment), this.cacheExpiry);
            }

            return payment;
        } catch (error) {
            logger.error('Error fetching payment by ID:', error);
            throw error;
        }
    }

    /**
     * Update payment
     */
    async updatePayment(paymentId, updateData) {
        try {
            const allowedFields = ['payment_status', 'payment_method', 'amount'];
            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    updateFields.push(`${key} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }

            if (updateFields.length === 0) {
                return { success: false, message: 'No valid fields to update' };
            }

            values.push(paymentId);
            const queryText = `
                UPDATE payments 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await query(queryText, values);

            if (result.rows.length === 0) {
                return { success: false, message: 'Payment not found' };
            }

            // Clear cache
            if (redis.enabled) {
                await redis.del(`admin:payment:${paymentId}`);
                await redis.del('admin:payments:*');
            }

            return {
                success: true,
                message: 'Payment updated successfully',
                payment: result.rows[0]
            };
        } catch (error) {
            logger.error('Error updating payment:', error);
            throw error;
        }
    }

    /**
     * Get subscriptions with filters
     */
    async getSubscriptions(options = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            userId = null,
            subscriptionType = '',
            paymentStatus = '',
            isActive = null,
            dateFrom = null,
            dateTo = null,
            sortBy = 'start_date',
            sortOrder = 'DESC'
        } = options;

        const offset = (page - 1) * limit;
        const cacheKey = `admin:subscriptions:${JSON.stringify(options)}`;

        try {
            if (redis.enabled) {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            }

            // Build WHERE clause
            let whereConditions = ['1=1'];
            const params = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`(CAST(s.id AS TEXT) = $${paramIndex} OR CAST(s.user_id AS TEXT) = $${paramIndex})`);
                params.push(search);
                paramIndex++;
            }

            if (userId) {
                whereConditions.push(`s.user_id = $${paramIndex}`);
                params.push(userId);
                paramIndex++;
            }

            if (subscriptionType) {
                whereConditions.push(`s.subscription_type = $${paramIndex}`);
                params.push(subscriptionType);
                paramIndex++;
            }

            if (paymentStatus) {
                whereConditions.push(`s.payment_status = $${paramIndex}`);
                params.push(paymentStatus);
                paramIndex++;
            }

            // Active/expired filter
            if (isActive !== null) {
                if (isActive) {
                    whereConditions.push(`(s.end_date IS NULL OR s.end_date > NOW())`);
                } else {
                    whereConditions.push(`(s.end_date IS NOT NULL AND s.end_date <= NOW())`);
                }
            }

            if (dateFrom) {
                whereConditions.push(`s.start_date >= $${paramIndex}`);
                params.push(dateFrom);
                paramIndex++;
            }
            if (dateTo) {
                whereConditions.push(`s.start_date <= $${paramIndex}`);
                params.push(dateTo);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Get total count
            const countResult = await query(
                `SELECT COUNT(*) as total FROM subscriptions s WHERE ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0]?.total || 0);

            // Get subscriptions
            const allowedSortFields = ['id', 'start_date', 'end_date', 'subscription_type', 'payment_status'];
            const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'start_date';
            const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            const subscriptionsQuery = `
                SELECT 
                    s.*,
                    u.real_name as username,
                    u.email,
                    CASE 
                        WHEN s.end_date IS NULL OR s.end_date > NOW() THEN true
                        ELSE false
                    END as is_active
                FROM subscriptions s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE ${whereClause}
                ORDER BY s.${safeSortBy} ${safeSortOrder}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            params.push(limit, offset);

            const subscriptionsResult = await query(subscriptionsQuery, params);

            const result = {
                subscriptions: subscriptionsResult.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            };

            if (redis.enabled) {
                await redis.set(cacheKey, JSON.stringify(result), this.cacheExpiry);
            }

            return result;
        } catch (error) {
            logger.error('Error fetching subscriptions:', error);
            throw error;
        }
    }

    /**
     * Get subscription by ID
     */
    async getSubscriptionById(subscriptionId) {
        try {
            const result = await query(
                `SELECT 
                    s.*,
                    u.real_name as username,
                    u.email
                FROM subscriptions s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.id = $1`,
                [subscriptionId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            const subscription = result.rows[0];
            subscription.is_active = !subscription.end_date || new Date(subscription.end_date) > new Date();

            return subscription;
        } catch (error) {
            logger.error('Error fetching subscription by ID:', error);
            throw error;
        }
    }

    /**
     * Update subscription
     */
    async updateSubscription(subscriptionId, updateData) {
        try {
            const allowedFields = ['subscription_type', 'payment_status', 'start_date', 'end_date'];
            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    updateFields.push(`${key} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }

            if (updateFields.length === 0) {
                return { success: false, message: 'No valid fields to update' };
            }

            values.push(subscriptionId);
            const queryText = `
                UPDATE subscriptions 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await query(queryText, values);

            if (result.rows.length === 0) {
                return { success: false, message: 'Subscription not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:subscription:${subscriptionId}`);
                await redis.del('admin:subscriptions:*');
            }

            return {
                success: true,
                message: 'Subscription updated successfully',
                subscription: result.rows[0]
            };
        } catch (error) {
            logger.error('Error updating subscription:', error);
            throw error;
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(subscriptionId) {
        try {
            const result = await query(
                `UPDATE subscriptions 
                 SET end_date = NOW(),
                     payment_status = 'cancelled'
                 WHERE id = $1
                 RETURNING *`,
                [subscriptionId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'Subscription not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:subscription:${subscriptionId}`);
                await redis.del('admin:subscriptions:*');
            }

            return {
                success: true,
                message: 'Subscription cancelled successfully',
                subscription: result.rows[0]
            };
        } catch (error) {
            logger.error('Error cancelling subscription:', error);
            throw error;
        }
    }

    /**
     * Extend subscription
     */
    async extendSubscription(subscriptionId, days) {
        try {
            const result = await query(
                `UPDATE subscriptions 
                 SET end_date = COALESCE(end_date, NOW()) + INTERVAL '${parseInt(days)} days'
                 WHERE id = $1
                 RETURNING *`,
                [subscriptionId]
            );

            if (result.rows.length === 0) {
                return { success: false, message: 'Subscription not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:subscription:${subscriptionId}`);
                await redis.del('admin:subscriptions:*');
            }

            return {
                success: true,
                message: `Subscription extended by ${days} days`,
                subscription: result.rows[0]
            };
        } catch (error) {
            logger.error('Error extending subscription:', error);
            throw error;
        }
    }

    /**
     * Get payment statistics
     */
    async getPaymentStats(dateFrom = null, dateTo = null) {
        try {
            let dateFilter = '';
            const params = [];

            if (dateFrom && dateTo) {
                dateFilter = 'WHERE payment_date >= $1 AND payment_date <= $2';
                params.push(dateFrom, dateTo);
            } else if (dateFrom) {
                dateFilter = 'WHERE payment_date >= $1';
                params.push(dateFrom);
            } else if (dateTo) {
                dateFilter = 'WHERE payment_date <= $1';
                params.push(dateTo);
            }

            const statsQuery = `
                SELECT 
                    COUNT(*) as total_payments,
                    COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as completed_payments,
                    COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_payments,
                    COUNT(CASE WHEN payment_status = 'failed' THEN 1 END) as failed_payments,
                    COUNT(CASE WHEN payment_status = 'refunded' THEN 1 END) as refunded_payments,
                    SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END) as total_revenue,
                    AVG(CASE WHEN payment_status = 'completed' THEN amount ELSE NULL END) as avg_transaction_value,
                    COUNT(DISTINCT user_id) as unique_payers,
                    COUNT(DISTINCT payment_method) as payment_methods_count
                FROM payments
                ${dateFilter}
            `;

            const result = await query(statsQuery, params);
            return result.rows[0];
        } catch (error) {
            logger.error('Error fetching payment stats:', error);
            throw error;
        }
    }

    /**
     * Get subscription statistics
     */
    async getSubscriptionStats() {
        try {
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_subscriptions,
                    COUNT(CASE WHEN end_date IS NULL OR end_date > NOW() THEN 1 END) as active_subscriptions,
                    COUNT(CASE WHEN end_date IS NOT NULL AND end_date <= NOW() THEN 1 END) as expired_subscriptions,
                    COUNT(DISTINCT subscription_type) as subscription_types_count,
                    COUNT(DISTINCT user_id) as unique_subscribers
                FROM subscriptions
            `;

            const result = await query(statsQuery);
            return result.rows[0];
        } catch (error) {
            logger.error('Error fetching subscription stats:', error);
            throw error;
        }
    }

    /**
     * Get all billing plans
     */
    async getBillingPlans() {
        try {
            const result = await query(`
                SELECT * FROM billing_plans 
                ORDER BY display_order ASC, id ASC
            `);
            return result.rows;
        } catch (error) {
            logger.error('Error fetching billing plans:', error);
            throw error;
        }
    }

    /**
     * Create billing plan
     */
    async createBillingPlan(planData) {
        try {
            const {
                name,
                description,
                plan_type,
                price_monthly,
                price_yearly,
                currency = 'USD',
                duration_days,
                features,
                is_active = true,
                display_order = 0
            } = planData;

            if (!name || !plan_type || price_monthly === undefined || price_yearly === undefined) {
                return { success: false, message: 'Missing required fields' };
            }

            const result = await query(`
                INSERT INTO billing_plans 
                (name, description, plan_type, price_monthly, price_yearly, currency, duration_days, features, is_active, display_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
            `, [
                name,
                description || null,
                plan_type,
                parseFloat(price_monthly),
                parseFloat(price_yearly),
                currency,
                duration_days || null,
                features ? JSON.stringify(features) : null,
                is_active,
                parseInt(display_order) || 0
            ]);

            if (redis.enabled) {
                await redis.del('admin:billing_plans:*');
            }

            return {
                success: true,
                message: 'Billing plan created successfully',
                plan: result.rows[0]
            };
        } catch (error) {
            logger.error('Error creating billing plan:', error);
            throw error;
        }
    }

    /**
     * Update billing plan
     */
    async updateBillingPlan(planId, updateData) {
        try {
            const allowedFields = ['name', 'description', 'plan_type', 'price_monthly', 'price_yearly', 
                                  'currency', 'duration_days', 'features', 'is_active', 'display_order'];
            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    if (key === 'features' && typeof value === 'object') {
                        updateFields.push(`${key} = $${paramIndex}`);
                        values.push(JSON.stringify(value));
                    } else {
                        updateFields.push(`${key} = $${paramIndex}`);
                        values.push(value);
                    }
                    paramIndex++;
                }
            }

            if (updateFields.length === 0) {
                return { success: false, message: 'No valid fields to update' };
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(planId);
            const queryText = `
                UPDATE billing_plans 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await query(queryText, values);

            if (result.rows.length === 0) {
                return { success: false, message: 'Plan not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:billing_plan:${planId}`);
                await redis.del('admin:billing_plans:*');
            }

            return {
                success: true,
                message: 'Billing plan updated successfully',
                plan: result.rows[0]
            };
        } catch (error) {
            logger.error('Error updating billing plan:', error);
            throw error;
        }
    }

    /**
     * Delete billing plan
     */
    async deleteBillingPlan(planId) {
        try {
            const result = await query(`
                DELETE FROM billing_plans 
                WHERE id = $1
                RETURNING *
            `, [planId]);

            if (result.rows.length === 0) {
                return { success: false, message: 'Plan not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:billing_plan:${planId}`);
                await redis.del('admin:billing_plans:*');
            }

            return {
                success: true,
                message: 'Billing plan deleted successfully'
            };
        } catch (error) {
            logger.error('Error deleting billing plan:', error);
            throw error;
        }
    }

    /**
     * Get all discount codes
     */
    async getDiscountCodes() {
        try {
            const result = await query(`
                SELECT * FROM discount_codes 
                ORDER BY created_at DESC
            `);
            return result.rows;
        } catch (error) {
            logger.error('Error fetching discount codes:', error);
            throw error;
        }
    }

    /**
     * Create discount code
     */
    async createDiscountCode(discountData) {
        try {
            const {
                code,
                description,
                discount_type,
                discount_value,
                min_purchase_amount = 0,
                max_discount_amount,
                valid_from,
                valid_until,
                usage_limit,
                is_active = true,
                applicable_plans
            } = discountData;

            if (!code || !discount_type || discount_value === undefined || !valid_from) {
                return { success: false, message: 'Missing required fields' };
            }

            const result = await query(`
                INSERT INTO discount_codes 
                (code, description, discount_type, discount_value, min_purchase_amount, max_discount_amount, 
                 valid_from, valid_until, usage_limit, is_active, applicable_plans)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
            `, [
                code.toUpperCase(),
                description || null,
                discount_type,
                parseFloat(discount_value),
                parseFloat(min_purchase_amount) || 0,
                max_discount_amount ? parseFloat(max_discount_amount) : null,
                valid_from,
                valid_until || null,
                usage_limit ? parseInt(usage_limit) : null,
                is_active,
                applicable_plans ? JSON.stringify(applicable_plans) : null
            ]);

            if (redis.enabled) {
                await redis.del('admin:discount_codes:*');
            }

            return {
                success: true,
                message: 'Discount code created successfully',
                discount: result.rows[0]
            };
        } catch (error) {
            if (error.code === '23505') { // Unique constraint violation
                return { success: false, message: 'Discount code already exists' };
            }
            logger.error('Error creating discount code:', error);
            throw error;
        }
    }

    /**
     * Update discount code
     */
    async updateDiscountCode(discountId, updateData) {
        try {
            const allowedFields = ['code', 'description', 'discount_type', 'discount_value', 
                                  'min_purchase_amount', 'max_discount_amount', 'valid_from', 
                                  'valid_until', 'usage_limit', 'is_active', 'applicable_plans'];
            const updateFields = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    if (key === 'code') {
                        updateFields.push(`${key} = UPPER($${paramIndex})`);
                        values.push(value);
                    } else if (key === 'applicable_plans' && typeof value === 'object') {
                        updateFields.push(`${key} = $${paramIndex}`);
                        values.push(JSON.stringify(value));
                    } else {
                        updateFields.push(`${key} = $${paramIndex}`);
                        values.push(value);
                    }
                    paramIndex++;
                }
            }

            if (updateFields.length === 0) {
                return { success: false, message: 'No valid fields to update' };
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(discountId);
            const queryText = `
                UPDATE discount_codes 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const result = await query(queryText, values);

            if (result.rows.length === 0) {
                return { success: false, message: 'Discount code not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:discount_code:${discountId}`);
                await redis.del('admin:discount_codes:*');
            }

            return {
                success: true,
                message: 'Discount code updated successfully',
                discount: result.rows[0]
            };
        } catch (error) {
            logger.error('Error updating discount code:', error);
            throw error;
        }
    }

    /**
     * Delete discount code
     */
    async deleteDiscountCode(discountId) {
        try {
            const result = await query(`
                DELETE FROM discount_codes 
                WHERE id = $1
                RETURNING *
            `, [discountId]);

            if (result.rows.length === 0) {
                return { success: false, message: 'Discount code not found' };
            }

            if (redis.enabled) {
                await redis.del(`admin:discount_code:${discountId}`);
                await redis.del('admin:discount_codes:*');
            }

            return {
                success: true,
                message: 'Discount code deleted successfully'
            };
        } catch (error) {
            logger.error('Error deleting discount code:', error);
            throw error;
        }
    }
}

module.exports = new PaymentManagementService();




















































