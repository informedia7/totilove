/**
 * WebSocket Configuration Module
 * Handles Socket.IO WebSocket setup
 */

const WebSocketHandler = require('../../utils/websocketHandler');

/**
 * Setup WebSocket handlers
 * @param {Object} io - Socket.IO instance
 * @param {Object} messageService - Message service instance
 * @param {Object} monitoringUtils - Monitoring utilities instance
 * @param {Object} db - Database pool instance
 * @param {Object} presenceService - Presence service instance
 * @param {boolean} adapterEnabled - Whether a distributed adapter is configured
 * @returns {Object} WebSocket handler instance
 */
function setupWebSocket(io, messageService, monitoringUtils, db, presenceService = null, adapterEnabled = false) {
    // Set global io for monitoring utils
    global.io = io;
    
    // Initialize WebSocket handler with database reference
    const websocketHandler = new WebSocketHandler(
        io,
        messageService,
        monitoringUtils,
        db,
        presenceService,
        adapterEnabled
    );
    
    return websocketHandler;
}

module.exports = { setupWebSocket };







