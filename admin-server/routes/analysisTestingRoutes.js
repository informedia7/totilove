const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const analysisTestingController = require('../controllers/analysisTestingController');

router.use(requireAuth);
router.use(auditLog);

router.get('/', analysisTestingController.analysisTesting);

module.exports = router;
