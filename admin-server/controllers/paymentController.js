const paymentService = require('../services/paymentManagementService');
const logger = require('../utils/logger');

class PaymentController {
    /**
     * Get payments list
     */
    async getPayments(req, res) {
        try {
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search || '',
                userId: req.query.userId ? parseInt(req.query.userId) : null,
                status: req.query.status || '',
                paymentMethod: req.query.paymentMethod || '',
                dateFrom: req.query.dateFrom || null,
                dateTo: req.query.dateTo || null,
                amountMin: req.query.amountMin ? parseFloat(req.query.amountMin) : null,
                amountMax: req.query.amountMax ? parseFloat(req.query.amountMax) : null,
                sortBy: req.query.sortBy || 'payment_date',
                sortOrder: req.query.sortOrder || 'DESC'
            };

            const result = await paymentService.getPayments(options);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error('Error in getPayments controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch payments'
            });
        }
    }

    /**
     * Get payment by ID
     */
    async getPaymentById(req, res) {
        try {
            const paymentId = parseInt(req.params.id);
            if (!paymentId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid payment ID'
                });
            }

            const payment = await paymentService.getPaymentById(paymentId);
            if (!payment) {
                return res.status(404).json({
                    success: false,
                    error: 'Payment not found'
                });
            }

            res.json({
                success: true,
                payment
            });
        } catch (error) {
            logger.error('Error in getPaymentById controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch payment'
            });
        }
    }

    /**
     * Update payment
     */
    async updatePayment(req, res) {
        try {
            const paymentId = parseInt(req.params.id);
            if (!paymentId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid payment ID'
                });
            }

            const result = await paymentService.updatePayment(paymentId, req.body);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in updatePayment controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update payment'
            });
        }
    }

    /**
     * Get subscriptions list
     */
    async getSubscriptions(req, res) {
        try {
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search || '',
                userId: req.query.userId ? parseInt(req.query.userId) : null,
                subscriptionType: req.query.subscriptionType || '',
                paymentStatus: req.query.paymentStatus || '',
                isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : null,
                dateFrom: req.query.dateFrom || null,
                dateTo: req.query.dateTo || null,
                sortBy: req.query.sortBy || 'start_date',
                sortOrder: req.query.sortOrder || 'DESC'
            };

            const result = await paymentService.getSubscriptions(options);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error('Error in getSubscriptions controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch subscriptions'
            });
        }
    }

    /**
     * Get subscription by ID
     */
    async getSubscriptionById(req, res) {
        try {
            const subscriptionId = parseInt(req.params.id);
            if (!subscriptionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid subscription ID'
                });
            }

            const subscription = await paymentService.getSubscriptionById(subscriptionId);
            if (!subscription) {
                return res.status(404).json({
                    success: false,
                    error: 'Subscription not found'
                });
            }

            res.json({
                success: true,
                subscription
            });
        } catch (error) {
            logger.error('Error in getSubscriptionById controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch subscription'
            });
        }
    }

    /**
     * Update subscription
     */
    async updateSubscription(req, res) {
        try {
            const subscriptionId = parseInt(req.params.id);
            if (!subscriptionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid subscription ID'
                });
            }

            const result = await paymentService.updateSubscription(subscriptionId, req.body);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in updateSubscription controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update subscription'
            });
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(req, res) {
        try {
            const subscriptionId = parseInt(req.params.id);
            if (!subscriptionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid subscription ID'
                });
            }

            const result = await paymentService.cancelSubscription(subscriptionId);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in cancelSubscription controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to cancel subscription'
            });
        }
    }

    /**
     * Extend subscription
     */
    async extendSubscription(req, res) {
        try {
            const subscriptionId = parseInt(req.params.id);
            const days = parseInt(req.body.days);

            if (!subscriptionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid subscription ID'
                });
            }

            if (!days || days <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid number of days is required'
                });
            }

            const result = await paymentService.extendSubscription(subscriptionId, days);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in extendSubscription controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to extend subscription'
            });
        }
    }

    /**
     * Get payment statistics
     */
    async getPaymentStats(req, res) {
        try {
            const dateFrom = req.query.dateFrom || null;
            const dateTo = req.query.dateTo || null;

            const stats = await paymentService.getPaymentStats(dateFrom, dateTo);
            res.json({
                success: true,
                stats
            });
        } catch (error) {
            logger.error('Error in getPaymentStats controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch payment statistics'
            });
        }
    }

    /**
     * Get subscription statistics
     */
    async getSubscriptionStats(req, res) {
        try {
            const stats = await paymentService.getSubscriptionStats();
            res.json({
                success: true,
                stats
            });
        } catch (error) {
            logger.error('Error in getSubscriptionStats controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch subscription statistics'
            });
        }
    }

    /**
     * Get billing plans
     */
    async getBillingPlans(req, res) {
        try {
            const plans = await paymentService.getBillingPlans();
            res.json({
                success: true,
                plans
            });
        } catch (error) {
            logger.error('Error in getBillingPlans controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch billing plans'
            });
        }
    }

    /**
     * Create billing plan
     */
    async createBillingPlan(req, res) {
        try {
            const result = await paymentService.createBillingPlan(req.body);
            if (!result.success) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in createBillingPlan controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create billing plan'
            });
        }
    }

    /**
     * Update billing plan
     */
    async updateBillingPlan(req, res) {
        try {
            const planId = parseInt(req.params.id);
            if (!planId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid plan ID'
                });
            }
            const result = await paymentService.updateBillingPlan(planId, req.body);
            if (!result.success) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in updateBillingPlan controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update billing plan'
            });
        }
    }

    /**
     * Delete billing plan
     */
    async deleteBillingPlan(req, res) {
        try {
            const planId = parseInt(req.params.id);
            if (!planId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid plan ID'
                });
            }
            const result = await paymentService.deleteBillingPlan(planId);
            if (!result.success) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in deleteBillingPlan controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete billing plan'
            });
        }
    }

    /**
     * Get discount codes
     */
    async getDiscountCodes(req, res) {
        try {
            const discounts = await paymentService.getDiscountCodes();
            res.json({
                success: true,
                discounts
            });
        } catch (error) {
            logger.error('Error in getDiscountCodes controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch discount codes'
            });
        }
    }

    /**
     * Create discount code
     */
    async createDiscountCode(req, res) {
        try {
            const result = await paymentService.createDiscountCode(req.body);
            if (!result.success) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in createDiscountCode controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create discount code'
            });
        }
    }

    /**
     * Update discount code
     */
    async updateDiscountCode(req, res) {
        try {
            const discountId = parseInt(req.params.id);
            if (!discountId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid discount ID'
                });
            }
            const result = await paymentService.updateDiscountCode(discountId, req.body);
            if (!result.success) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in updateDiscountCode controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update discount code'
            });
        }
    }

    /**
     * Delete discount code
     */
    async deleteDiscountCode(req, res) {
        try {
            const discountId = parseInt(req.params.id);
            if (!discountId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid discount ID'
                });
            }
            const result = await paymentService.deleteDiscountCode(discountId);
            if (!result.success) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            logger.error('Error in deleteDiscountCode controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete discount code'
            });
        }
    }
}

module.exports = new PaymentController();




















































