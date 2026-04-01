#!/usr/bin/env node
const MatchesController = require('../database/controllers/matchesController');
const { setupDatabase } = require('../server/config/database');

async function main() {
    const userIdArg = process.argv[2];
    if (!userIdArg) {
        console.error('Usage: node scripts/debugMatchesQuery.js <userId> [limit] [page]');
        process.exit(1);
    }

    const userId = parseInt(userIdArg, 10);
    if (Number.isNaN(userId)) {
        console.error('User ID must be a number');
        process.exit(1);
    }

    const limitArg = process.argv[3];
    const pageArg = process.argv[4];

    const db = await setupDatabase();
    const controller = new MatchesController(db, null, undefined, null);

    const originalQuery = controller.db.query.bind(controller.db);
    controller.db.query = async (...args) => {
        try {
            return await originalQuery(...args);
        } catch (error) {
            console.error('Database query failed', {
                sql: typeof args[0] === 'string' ? args[0].slice(0, 300) : 'non-text query',
                params: args[1],
                code: error.code,
                detail: error.detail,
                message: error.message
            });
            throw error;
        }
    };

    const req = {
        params: { userId: String(userId) },
        query: {},
        headers: {}
    };
    if (limitArg) {
        req.query.limit = limitArg;
    }
    if (pageArg) {
        req.query.page = pageArg;
    }

    await new Promise((resolve, reject) => {
        const res = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                console.log('--- MatchesController response ---');
                console.dir({ status: this.statusCode, body: payload }, { depth: 5 });
                resolve();
            }
        };

        controller.getMatches(req, res).catch(reject);
    });

    await db.end();
}

main().catch((error) => {
    console.error('Matches debugger failed', error);
    process.exit(1);
});
