const config = require('../config/server');

const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const currentLevel = logLevels[config.logging.level] || logLevels.info;

const formatMessage = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [Admin Server]`;
    
    if (data) {
        return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
};

const logger = {
    error: (message, data = null) => {
        if (currentLevel >= logLevels.error) {
            console.error(formatMessage('error', message, data));
        }
    },
    
    warn: (message, data = null) => {
        if (currentLevel >= logLevels.warn) {
            console.warn(formatMessage('warn', message, data));
        }
    },
    
    info: (message, data = null) => {
        if (currentLevel >= logLevels.info) {
            console.log(formatMessage('info', message, data));
        }
    },
    
    debug: (message, data = null) => {
        if (currentLevel >= logLevels.debug) {
            console.log(formatMessage('debug', message, data));
        }
    }
};

module.exports = logger;




















































