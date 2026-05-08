const userService = require('../services/userManagementService');
const logger = require('../utils/logger');

class UserController {
    /**
     * Get users list with filters
     */
    async getUsers(req, res) {
        try {
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                search: req.query.search || '',
                status: req.query.status || '',
                gender: req.query.gender || '',
                ageMin: req.query.ageMin ? parseInt(req.query.ageMin) : null,
                ageMax: req.query.ageMax ? parseInt(req.query.ageMax) : null,
                countryId: req.query.countryId ? parseInt(req.query.countryId) : null,
                stateId: req.query.stateId ? parseInt(req.query.stateId) : null,
                cityId: req.query.cityId ? parseInt(req.query.cityId) : null,
                dateJoinedFrom: req.query.dateJoinedFrom || null,
                dateJoinedTo: req.query.dateJoinedTo || null,
                lastLoginFrom: req.query.lastLoginFrom || null,
                lastLoginTo: req.query.lastLoginTo || null,
                hasImages: req.query.hasImages !== undefined ? req.query.hasImages === 'true' : null,
                emailVerified: req.query.emailVerified !== undefined ? req.query.emailVerified === 'true' : null,
                profileVerified: req.query.profileVerified !== undefined ? req.query.profileVerified === 'true' : null,
                blacklisted: req.query.blacklisted === 'true',
                sortBy: req.query.sortBy || 'date_joined',
                sortOrder: req.query.sortOrder || 'DESC'
            };

            const result = await userService.getUsers(options);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error('Error in getUsers controller:', error);
            logger.error('Error stack:', error.stack);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch users',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get users summary breakdown
     */
    async getUserSummary(req, res) {
        try {
            const summary = await userService.getUserSummary();
            res.json({
                success: true,
                summary
            });
        } catch (error) {
            logger.error('Error in getUserSummary controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user summary'
            });
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const user = await userService.getUserById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.json({
                success: true,
                user
            });
        } catch (error) {
            logger.error('Error in getUserById controller:', error);
            logger.error('Error stack:', error.stack);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Update user
     */
    async updateUser(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const result = await userService.updateUser(userId, req.body);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in updateUser controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update user'
            });
        }
    }

    /**
     * Suspend user
     */
    async suspendUser(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
            if (!reason) {
                return res.status(400).json({
                    success: false,
                    error: 'Suspension reason is required'
                });
            }

            const result = await userService.suspendUser(userId, reason);
            
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in suspendUser controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to suspend user'
            });
        }
    }

    /**
     * Unsuspend user
     */
    async unsuspendUser(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const result = await userService.unsuspendUser(userId);
            
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in unsuspendUser controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to unsuspend user'
            });
        }
    }

    /**
     * Delete user
     */
    async deleteUser(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const result = await userService.deleteUser(userId);
            
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in deleteUser controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete user'
            });
        }
    }

    /**
     * Blacklist user
     */
    async blacklistUser(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const adminId = req.admin?.id;
            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin authentication required'
                });
            }

            const { reason = '', notes = '', stop_this_ip } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.get('user-agent');
            const stopThisIp = !(
                stop_this_ip === false ||
                stop_this_ip === 'false' ||
                stop_this_ip === 0 ||
                stop_this_ip === '0'
            );

            const result = await userService.blacklistUser(
                userId,
                adminId,
                reason,
                notes,
                ipAddress,
                userAgent,
                stopThisIp
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in blacklistUser controller:', error);
            const status = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
            res.status(status).json({
                success: false,
                error: error.message || 'Failed to blacklist user'
            });
        }
    }

    /**
     * Remove admin blacklist row by admin_blacklisted_users.id (blacklisted tab only).
     */
    async unblacklistByBlacklistEntryId(req, res) {
        try {
            const entryId = parseInt(req.params.entryId, 10);
            if (!entryId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid blacklist entry id'
                });
            }

            const adminId = req.admin?.id;
            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin authentication required'
                });
            }

            const result = await userService.unblacklistByEntryId(entryId, adminId);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in unblacklistByBlacklistEntryId controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to remove blacklist entry'
            });
        }
    }

    /**
     * Create admin_blacklisted_users row (blacklisted tab — manual add).
     */
    async addBlacklistEntry(req, res) {
        try {
            const adminId = req.admin?.id;
            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin authentication required'
                });
            }

            const result = await userService.insertBlacklistEntry(req.body || {}, adminId);
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.message || 'Failed to add blacklist entry'
                });
            }

            res.status(201).json({
                success: true,
                message: result.message || 'Blacklist entry created.',
                entry: result.entry
            });
        } catch (error) {
            logger.error('Error in addBlacklistEntry controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to add blacklist entry'
            });
        }
    }

    /**
     * Update admin_blacklisted_users row (blacklisted tab).
     */
    async updateBlacklistEntry(req, res) {
        try {
            const entryId = parseInt(req.params.entryId, 10);
            if (!entryId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid blacklist entry id'
                });
            }

            const adminId = req.admin?.id;
            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin authentication required'
                });
            }

            const result = await userService.updateBlacklistEntry(entryId, req.body || {}, adminId);
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.message || 'Failed to update blacklist entry'
                });
            }

            res.json({
                success: true,
                message: result.message || 'Blacklist entry updated.',
                entry: result.entry
            });
        } catch (error) {
            logger.error('Error in updateBlacklistEntry controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update blacklist entry'
            });
        }
    }

    /**
     * Verify email
     */
    async verifyEmail(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const result = await userService.verifyEmail(userId);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in verifyEmail controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify email'
            });
        }
    }

    /**
     * Unverify email
     */
    async unverifyEmail(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const result = await userService.unverifyEmail(userId);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in unverifyEmail controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to unverify email'
            });
        }
    }

    /**
     * Verify profile
     */
    async verifyProfile(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const result = await userService.verifyProfile(userId);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in verifyProfile controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify profile'
            });
        }
    }

    /**
     * Unverify profile
     */
    async unverifyProfile(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const result = await userService.unverifyProfile(userId);
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in unverifyProfile controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to unverify profile'
            });
        }
    }

    /**
     * Bulk operations
     */
    async bulkOperation(req, res) {
        try {
            const { userIds, operation, data = {} } = req.body;

            if (!Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'User IDs array is required'
                });
            }

            if (!operation) {
                return res.status(400).json({
                    success: false,
                    error: 'Operation is required'
                });
            }

            if (operation === 'suspend') {
                data.reason = typeof data.reason === 'string' ? data.reason.trim() : '';
                if (!data.reason) {
                    return res.status(400).json({
                        success: false,
                        error: 'Suspension reason is required for bulk suspend'
                    });
                }
            }

            // For blacklist operation, add adminId to data
            if (operation === 'blacklist') {
                const adminId = req.admin?.id;
                if (!adminId) {
                    return res.status(401).json({
                        success: false,
                        error: 'Admin authentication required'
                    });
                }
                data.adminId = adminId;
                data.reason = data.reason || '';
                data.notes = data.notes || '';
            }

            const result = await userService.bulkOperation(userIds, operation, data);
            res.json(result);
        } catch (error) {
            logger.error('Error in bulkOperation controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to perform bulk operation'
            });
        }
    }
}

module.exports = new UserController();





















































