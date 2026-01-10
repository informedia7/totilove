const express = require('express');
const router = express.Router();
const adminMessageRoutes = require('./adminMessageRoutes');

// Mount admin message routes
router.use('/messages', adminMessageRoutes);

// Admin dashboard route
router.get('/dashboard', (req, res) => {
    res.sendFile('admin/views/messages-dashboard.html', { root: __dirname + '/../..' });
});

// Root admin route - redirect to dashboard
router.get('/', (req, res) => {
    res.redirect('/admin/dashboard');
});

module.exports = router;
