/**
 * True when the full request path is under /api (not router-relative req.path).
 */
function isApiRequest(req) {
    const path = (req.originalUrl || req.url || '').split('?')[0] || '';
    return path.startsWith('/api/');
}

module.exports = { isApiRequest };
