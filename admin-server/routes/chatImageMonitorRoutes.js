const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const chatImageMonitorController = require('../controllers/chatImageMonitorController');

router.use(requireAuth);
router.use(auditLog);

router.get('/stats', chatImageMonitorController.stats.bind(chatImageMonitorController));
router.get('/', chatImageMonitorController.list.bind(chatImageMonitorController));
router.post('/:id/reject', chatImageMonitorController.reject.bind(chatImageMonitorController));

module.exports = router;
