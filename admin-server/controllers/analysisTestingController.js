const logger = require('../utils/logger');

const analysisTesting = async (req, res) => {
    try {
        res.render('analysis-testing', {
            admin: req.session.admin,
            title: 'Analysis & Testing'
        });
    } catch (error) {
        logger.error('Failed to load analysis & testing page', { error: error.message });
        return res.status(500).json({
            success: false,
            error: 'Failed to load analysis & testing page'
        });
    }
};

module.exports = {
    analysisTesting
};
