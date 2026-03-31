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
     * Ban user
     */
    async banUser(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const reason = req.body.reason || '';
            const result = await userService.banUser(userId, reason);
            
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in banUser controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to ban user'
            });
        }
    }

    /**
     * Unban user
     */
    async unbanUser(req, res) {
        try {
            const userId = parseInt(req.params.id);
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid user ID'
                });
            }

            const result = await userService.unbanUser(userId);
            
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in unbanUser controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to unban user'
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

            const { reason = '', notes = '' } = req.body;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.get('user-agent');

            const result = await userService.blacklistUser(
                userId,
                adminId,
                reason,
                notes,
                ipAddress,
                userAgent
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Error in blacklistUser controller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to blacklist user'
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





















































