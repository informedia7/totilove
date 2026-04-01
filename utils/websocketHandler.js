const { performance } = require('perf_hooks');

const redisManager = require('../config/redis');

class WebSocketHandler {
    constructor(io, messageService, monitoringUtils, db, presenceService = null, adapterEnabled = false) {
        this.io = io;
        this.messageService = messageService;
        this.monitoring = monitoringUtils;
        this.db = db;
        this.redis = redisManager;
        this.presenceService = presenceService;
        this.adapterEnabled = adapterEnabled;
        this.presenceInstanceId = this.presenceService?.getInstanceId?.() || null;
        this.presenceEventListener = null;
        if (!this.redis.isConnected) {
            this.redis.connect().catch(error => {
                console.error('[WebSocketHandler] Redis connection failed:', error.message);
            });
        }

        if (this.isPresenceAvailable() && typeof this.presenceService.on === 'function') {
            this.presenceEventListener = (payload) => this.broadcastPresenceUpdate(payload);
            this.presenceService.on('presence:update', this.presenceEventListener);
        }
        this.setupWebSocket();
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            const startTime = performance.now();
            this.monitoring.trackConnection(socket.id);

            // Track connection latency
            const connectionLatency = performance.now() - startTime;
            this.monitoring.performanceMetrics.connectionLatency.push({
                timestamp: Date.now(),
                latency: connectionLatency
            });

            // Lightning-fast authentication with adaptive rate limiting
            socket.on('authenticate', async (data) => {
                try {
                    socket.userId = data.userId;
                    socket.real_name = data.real_name;
                    socket.join(`user_${data.userId}`);
                    await this.touchPresence(socket.userId, 'socket-auth');
                    socket.emit('authenticated', { 
                        status: 'success',
                        serverLoad: this.monitoring.isHighLoad ? 'high' : 'normal',
                        activeUsers: this.monitoring.connectionCount
                    });
                } catch (error) {
                    socket.emit('auth_error', { message: 'Authentication failed' });
                }
            });

            // Alternative authentication method for compatibility
            socket.on('join_user_room', async (userId) => {
                try {
                    socket.userId = userId;
                    socket.join(`user_${userId}`);
                    await this.touchPresence(socket.userId, 'socket-join-room');
                    socket.emit('authenticated', { 
                        status: 'success',
                        serverLoad: this.monitoring.isHighLoad ? 'high' : 'normal',
                        activeUsers: this.monitoring.connectionCount
                    });
                } catch (error) {
                    socket.emit('auth_error', { message: 'Authentication failed' });
                }
            });

            // ADAPTIVE message handling based on server load
            socket.on('send_message', async (data) => {
                const messageStartTime = performance.now();
                
                try {
                    const { receiverId, content } = data;
                    const senderId = socket.userId;
                    
                    if (!senderId || !receiverId || !content) {
                        socket.emit('error', { message: 'Invalid message data' });
                        return;
                    }

                    // Prevent users from sending messages to themselves
                    if (parseInt(senderId) === parseInt(receiverId)) {
                        socket.emit('error', { message: 'You cannot send messages to yourself' });
                        return;
                    }
                    
                    // Redis-based rate limiting
                    const userKey = `msg_rate_${senderId}`;
                    const rateLimit = this.monitoring.isHighLoad ? 10 : 25; // 10/min under high load, 25/min normal
                    let userCount = 0;
                    try {
                        userCount = await this.redis.getClient().incr(userKey);
                        if (userCount === 1) {
                            // Set expiry for 60 seconds on first increment
                            await this.redis.getClient().expire(userKey, 60);
                        }
                    } catch (err) {
                        console.error('Redis rate limit error:', err);
                    }
                    if (userCount > rateLimit) {
                        socket.emit('error', {
                            message: `Message rate limit exceeded (${rateLimit}/min)`,
                            serverLoad: this.monitoring.isHighLoad ? 'high' : 'normal'
                        });
                        // Log violation in database
                        try {
                            await this.db.query(
                                `INSERT INTO admin_rate_limiter_violations (user_id, violation_type, details, occurred_at, ip_address, user_agent)
                                 VALUES ($1, $2, $3, NOW(), $4, $5)`,
                                [
                                    senderId,
                                    'chat_message_rate_limit',
                                    `Count: ${userCount}, Limit: ${rateLimit}`,
                                    socket.handshake?.address || null,
                                    socket.handshake?.headers['user-agent'] || null
                                ]
                            );
                        } catch (dbErr) {
                            console.error('Failed to log rate limiter violation:', dbErr);
                        }
                        return;
                    }
                    
                    // INSTANT delivery (optimistic) - but only if not under extreme load
                    const tempId = `temp_${Date.now()}_${Math.random()}`;
                    const tempMessage = {
                        id: tempId,
                        senderId: parseInt(senderId),
                        senderUsername: socket.real_name,
                        receiverId: parseInt(receiverId),
                        content: content,
                        timestamp: new Date().toISOString(),
                        status: 'sending',
                        serverLoad: this.monitoring.isHighLoad ? 'high' : 'normal',
                        source: 'websocket' // Add source to prevent duplicates
                    };
                    
                    // Under high load, reduce immediate broadcasts to preserve performance
                    if (this.monitoring.connectionCount < 15000) {
                        // Send IMMEDIATELY ONLY to the specific receiver - no global broadcasts
                        this.io.to(`user_${receiverId}`).emit('new_message', tempMessage);
                        socket.emit('message_sent', { ...tempMessage, source: 'instant' });
                        
                        // Track message for monitoring
                        this.monitoring.trackMessage();
                    }
                    
                    // Save to database (non-blocking)
                    this.messageService.sendMessage(senderId, receiverId, content)
                        .then(result => {
                            if (result.success) {
                                this.handleMessageSuccess(socket, result, tempId, tempMessage);
                            } else {
                                this.handleMessageError(socket, result.error || 'Failed to save message', tempId);
                            }
                        })
                        .catch(error => {
                            this.handleMessageError(socket, error, tempId);
                        });
                    
                    // Track message latency
                    const messageLatency = performance.now() - messageStartTime;
                    this.monitoring.performanceMetrics.messageLatency.push({
                        timestamp: Date.now(),
                        latency: messageLatency
                    });
                    
                } catch (error) {
                    console.error('Error handling message:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Handle user status updates
            socket.on('heartbeat', async (data) => {
                if (socket.userId) {
                    try {
                        await this.legacyHeartbeatPersist(socket.userId);
                        
                        const handledInPresence = await this.touchPresence(socket.userId, 'socket-heartbeat');
                        if (!handledInPresence) {
                            this.handleUserStatusChange(socket.userId, true);
                        }
                        
                        // Heartbeat from user - status updated
                    } catch (error) {
                        console.warn('⚠️ Heartbeat update failed:', error.message);
                    }
                }
            });

            // Video Call Signaling Events
            socket.on('video-call-offer', (data) => {
                try {
                    const { targetUserId, callerName, callerAvatar, callerId } = data;
                    
                    // Video call offer
                    
                    // Send call offer to target user
                    this.io.to(`user_${targetUserId}`).emit('video-call-offer', {
                        callerId: callerId || socket.userId,
                        callerName: callerName || socket.real_name,
                        callerAvatar: callerAvatar
                    });
                    
                    // Update caller status
                    socket.emit('user-video-call-status', { userId: socket.userId, inCall: true });
                    
                } catch (error) {
                    console.error('Error handling video call offer:', error);
                    socket.emit('error', { message: 'Failed to initiate call' });
                }
            });

            socket.on('video-call-answer', (data) => {
                try {
                    const { callerId, accepted } = data;
                    
                    if (accepted) {
                        // Video call accepted
                        
                        // Notify caller that call was accepted
                        this.io.to(`user_${callerId}`).emit('video-call-answer', {
                            accepted: true,
                            userName: socket.real_name,
                            userAvatar: socket.userAvatar
                        });
                        
                        // Update both users' call status
                        socket.emit('user-video-call-status', { userId: socket.userId, inCall: true });
                        this.io.to(`user_${callerId}`).emit('user-video-call-status', { userId: callerId, inCall: true });
                        
                    } else {
                        // Video call declined
                        
                        // Notify caller that call was declined
                        this.io.to(`user_${callerId}`).emit('video-call-declined', {
                            userName: socket.real_name
                        });
                    }
                    
                } catch (error) {
                    console.error('Error handling video call answer:', error);
                }
            });

            socket.on('video-call-declined', (data) => {
                try {
                    const { callerId } = data;
                    
                    // Video call declined, notifying caller
                    
                    // Notify caller
                    this.io.to(`user_${callerId}`).emit('video-call-declined', {
                        userName: socket.real_name
                    });
                    
                } catch (error) {
                    console.error('Error handling video call decline:', error);
                }
            });

            socket.on('video-call-ended', (data) => {
                try {
                const { targetUserId } = data;
                    
                    // Video call ended
                    
                    // Notify other participant
                    if (targetUserId) {
                        this.io.to(`user_${targetUserId}`).emit('video-call-ended', {
                            endedBy: socket.real_name
                        });
                        
                        // Update call status for both users
                        this.io.to(`user_${targetUserId}`).emit('user-video-call-status', { userId: targetUserId, inCall: false });
                    }
                    
                    socket.emit('user-video-call-status', { userId: socket.userId, inCall: false });
                    
                } catch (error) {
                    console.error('Error handling video call end:', error);
                }
            });

            socket.on('video-call-signal', (data) => {
                try {
                    const { signal, targetUserId } = data;
                    
                    // Forward WebRTC signaling data to target user
                    this.io.to(`user_${targetUserId}`).emit('video-call-signal', {
                        signal: signal,
                        fromUserId: socket.userId
                    });
                    
                } catch (error) {
                    console.error('Error handling video call signal:', error);
                }
            });

            socket.on('video-call-ice-candidate', (data) => {
                try {
                    const { candidate, targetUserId } = data;
                    
                    // Forward ICE candidate to target user
                    this.io.to(`user_${targetUserId}`).emit('video-call-ice-candidate', {
                        candidate: candidate,
                        fromUserId: socket.userId
                    });
                    
                } catch (error) {
                    console.error('Error handling ICE candidate:', error);
                }
            });

            // Handle typing indicators
            socket.on('typing', (data) => {
                try {
                    if (data.receiverId && socket.userId) {
                        this.io.to(`user_${data.receiverId}`).emit('user_typing', {
                            userId: socket.userId,
                            real_name: socket.real_name,
                            isTyping: data.isTyping
                        });
                        
                        // Typing activity tracking
                        if (data.isTyping) {
                            // User is typing
                        }
                    }
                } catch (error) {
                    console.error('❌ Error handling typing indicator:', error);
                }
            });

            socket.on('disconnect', async () => {
                // Client disconnected
                
                if (socket.userId) {
                    const handledInPresence = await this.setPresenceOffline(socket.userId, 'socket-disconnect');
                    if (!handledInPresence) {
                        // Mark user as offline immediately
                        this.handleUserStatusChange(socket.userId, false);
                    }
                    
                    // Update the most recent user_sessions record to mark as inactive
                    this.db.query(
                        `UPDATE user_sessions 
                         SET is_active = false, last_activity = NOW() 
                         WHERE user_id = $1 
                         AND id = (
                             SELECT id FROM user_sessions 
                             WHERE user_id = $1 
                             ORDER BY last_activity DESC 
                             LIMIT 1
                         )`,
                        [socket.userId]
                    ).catch(err => {
                        console.warn('⚠️ Failed to update session status on disconnect:', err.message);
                    });
                    
                    // Also update users.last_login for backward compatibility
                    const offlineTime = new Date();
                    this.db.query(
                        'UPDATE users SET last_login = $1 WHERE id = $2',
                        [offlineTime, socket.userId]
                    ).catch(err => {
                        console.warn('⚠️ Failed to update last_login on disconnect:', err.message);
                    });
                    
                    // User disconnected - marked offline
                }
                
                // Track disconnection in monitoring
                this.monitoring.trackDisconnection();
            });
        });
    }

    // Handle user status changes and broadcast to all connected users
    handleUserStatusChange(userId, isOnline) {
        const statusEvent = {
            userId: userId,
            isOnline: isOnline,
            timestamp: Date.now()
        };

        // Broadcast to all connected users with both event types for compatibility
        this.io.emit('user_status_change', statusEvent);
        
        // Emit specific events that the frontend expects
        if (isOnline) {
            this.io.emit('userOnline', { userId: userId, timestamp: Date.now() });
            this.io.emit('user_online', { userId: userId, timestamp: Date.now() });
        } else {
            this.io.emit('userOffline', { userId: userId, timestamp: Date.now() });
            this.io.emit('user_offline', { userId: userId, timestamp: Date.now() });
        }
        
        // Broadcast to specific user's room
        this.io.to(`user_${userId}`).emit('status_updated', {
            isOnline: isOnline,
            timestamp: Date.now()
        });

        // User status change - Broadcasting
    }

    broadcastPresenceUpdate(payload) {
        if (!payload || typeof payload.userId === 'undefined') {
            return;
        }

        const userId = parseInt(payload.userId, 10);
        if (!Number.isInteger(userId)) {
            return;
        }

        const origin = payload.origin;
        const shouldBroadcast = !this.adapterEnabled || !this.presenceInstanceId || !origin || origin === this.presenceInstanceId;
        if (!shouldBroadcast) {
            return;
        }

        const isOnline = Boolean(payload.isOnline ?? (payload.status === 'online'));
        const normalizedPayload = {
            userId,
            status: payload.status || (isOnline ? 'online' : 'offline'),
            isOnline,
            lastSeen: payload.lastSeen || null,
            lastHeartbeat: payload.lastHeartbeat || null,
            source: payload.source || 'redis',
            meta: payload.meta || null,
            timestamp: payload.timestamp || Date.now(),
            origin: origin || null
        };

        this.handleUserStatusChange(userId, isOnline);
        this.io.emit('presence:update', normalizedPayload);
    }

    // Update user's last seen timestamp in database
    async updateUserLastSeen(userId) {
        try {
            await this.db.query(
                'UPDATE users SET last_login = NOW() WHERE id = $1',
                [userId]
            );
        } catch (error) {
            console.error('❌ Failed to update user last seen:', error);
        }
    }

    handleMessageSuccess(socket, result, tempId, tempMessage) {
        const confirmedMessage = {
            id: result.messageId,
            senderId: tempMessage.senderId,
            senderUsername: tempMessage.senderUsername,
            receiverId: tempMessage.receiverId,
            content: tempMessage.content,
            timestamp: result.message.timestamp,
            status: 'sent',
            performance: result.performance,
            tempId: tempId,
            serverLoad: this.monitoring.isHighLoad ? 'high' : 'normal'
        };
        
        // Send new_message event for notifications (frontend expects this)
        const notificationMessage = {
            id: result.messageId,
            senderId: parseInt(tempMessage.senderId),
            receiverId: parseInt(tempMessage.receiverId),
            content: tempMessage.content,
            timestamp: Date.now(),
            sender_real_name: tempMessage.senderUsername,
            is_read: false,
            source: 'websocket'
        };
        
        // Notify ONLY the specific receiver via new_message event
        this.io.to(`user_${tempMessage.receiverId}`).emit('new_message', notificationMessage);
        
        // Also send message_confirmed for compatibility
        this.io.to(`user_${tempMessage.receiverId}`).emit('message_confirmed', confirmedMessage);
        socket.emit('message_confirmed', confirmedMessage);
        
        // Notify sender to update sent folder count
        socket.emit('message_sent_update', {
            messageId: result.messageId,
            senderId: tempMessage.senderId,
            receiverId: tempMessage.receiverId
        });
    }

    handleMessageError(socket, error, tempId) {
        console.error('Message save failed:', error);
        this.io.emit('message_error', { tempId, error: 'Failed to save', serverLoad: this.monitoring.isHighLoad ? 'high' : 'normal' });
        socket.emit('message_error', { tempId, error: 'Failed to save' });
    }

    async legacyHeartbeatPersist(userId) {
        await this.db.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [userId]
        );

        await this.db.query(
            'UPDATE user_sessions SET is_active = true, last_activity = NOW() WHERE user_id = $1',
            [userId]
        );
    }

    async touchPresence(userId, context = 'socket-event') {
        if (!this.isPresenceAvailable()) {
            return false;
        }

        const normalizedId = parseInt(userId, 10);
        if (!Number.isInteger(normalizedId)) {
            return false;
        }

        try {
            await this.presenceService.markOnline(normalizedId, {
                source: 'socket',
                meta: { context }
            });
            return true;
        } catch (error) {
            console.warn('[WebSocketHandler] Presence online update failed:', error.message);
            return false;
        }
    }

    async setPresenceOffline(userId, context = 'socket-event') {
        if (!this.isPresenceAvailable()) {
            return false;
        }

        const normalizedId = parseInt(userId, 10);
        if (!Number.isInteger(normalizedId)) {
            return false;
        }

        try {
            await this.presenceService.markOffline(normalizedId, {
                source: 'socket',
                meta: { context }
            });
            return true;
        } catch (error) {
            console.warn('[WebSocketHandler] Presence offline update failed:', error.message);
            return false;
        }
    }

    isPresenceAvailable() {
        return Boolean(
            this.presenceService &&
            typeof this.presenceService.isEnabled === 'function' &&
            this.presenceService.isEnabled()
        );
    }
}

module.exports = WebSocketHandler; 