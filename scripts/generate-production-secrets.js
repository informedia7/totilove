#!/usr/bin/env node
/**
 * Prints strong JWT_SECRET and SESSION_SECRET values for .env (never committed).
 * Usage: npm run secrets:generate
 */

const crypto = require('crypto');

const jwt = crypto.randomBytes(48).toString('hex');
const session = crypto.randomBytes(48).toString('hex');

console.log('# Paste into .env (keep private):\n');
console.log(`JWT_SECRET=${jwt}`);
console.log(`SESSION_SECRET=${session}`);
console.log('\n# Then set NODE_ENV=production only on servers after updating .env');
