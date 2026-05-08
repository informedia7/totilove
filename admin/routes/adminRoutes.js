const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
    res
        .status(200)
        .type('html')
        .send(
            [
                '<!doctype html>',
                '<html>',
                '<head><meta charset="utf-8"><title>Totilove Admin</title></head>',
                '<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px;">',
                '<h1>Totilove Admin</h1>',
                '<p>Admin routes module is installed.</p>',
                '<ul>',
                '<li><a href="/admin/health">/admin/health</a></li>',
                '</ul>',
                '</body>',
                '</html>'
            ].join('')
        );
});

router.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'admin' });
});

module.exports = router;

