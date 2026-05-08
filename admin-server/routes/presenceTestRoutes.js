const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const presenceTestController = require('../controllers/presenceTestController');

router.use(requireAuth);
router.use(auditLog);

router.get('/run', presenceTestController.runDiagnostics);
router.get('/', presenceTestController.listEndpoints);

module.exports = router;
