const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const paymentController = require('../controllers/paymentController');

// All payment routes require authentication
router.use(requireAuth);
router.use(auditLog);

// Payment routes - specific routes must come before parameterized routes
router.get('/', paymentController.getPayments.bind(paymentController));
router.get('/stats', paymentController.getPaymentStats.bind(paymentController));

// Billing Plans routes - must come before /:id
router.get('/plans', paymentController.getBillingPlans.bind(paymentController));
router.post('/plans', paymentController.createBillingPlan.bind(paymentController));
router.put('/plans/:id', paymentController.updateBillingPlan.bind(paymentController));
router.delete('/plans/:id', paymentController.deleteBillingPlan.bind(paymentController));

// Discount Codes routes - must come before /:id
router.get('/discounts', paymentController.getDiscountCodes.bind(paymentController));
router.post('/discounts', paymentController.createDiscountCode.bind(paymentController));
router.put('/discounts/:id', paymentController.updateDiscountCode.bind(paymentController));
router.delete('/discounts/:id', paymentController.deleteDiscountCode.bind(paymentController));

// Subscription routes - must come before /:id
router.get('/subscriptions', paymentController.getSubscriptions.bind(paymentController));
router.get('/subscriptions/stats', paymentController.getSubscriptionStats.bind(paymentController));
router.get('/subscriptions/:id', paymentController.getSubscriptionById.bind(paymentController));
router.put('/subscriptions/:id', paymentController.updateSubscription.bind(paymentController));
router.post('/subscriptions/:id/cancel', paymentController.cancelSubscription.bind(paymentController));
router.post('/subscriptions/:id/extend', paymentController.extendSubscription.bind(paymentController));

// Payment routes with ID - must come last
router.get('/:id', paymentController.getPaymentById.bind(paymentController));
router.put('/:id', paymentController.updatePayment.bind(paymentController));

module.exports = router;




















































