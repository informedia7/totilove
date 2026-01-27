function normalizeUserId(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

function defaultIdSelector(record) {
    if (!record || typeof record !== 'object') {
        return null;
    }
    if (record.user_id !== undefined) {
        return record.user_id;
    }
    if (record.userId !== undefined) {
        return record.userId;
    }
    if (record.id !== undefined) {
        return record.id;
    }
    return null;
}

function defaultAssign(record, status) {
    if (!record || typeof record !== 'object') {
        return;
    }
    record.is_online = Boolean(status?.isOnline);
    if (status?.lastSeen) {
        record.last_seen_at = normalizeLastSeen(status.lastSeen);
        return;
    }
    if (record.last_seen_at) {
        record.last_seen_at = normalizeLastSeen(record.last_seen_at);
    } else if (!('last_seen_at' in record)) {
        record.last_seen_at = null;
    }
}

function normalizeLastSeen(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'number') {
        return new Date(value).toISOString();
    }
    const dateValue = new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
        return null;
    }
    return dateValue.toISOString();
}

async function hydratePresenceStatuses(presenceService, records, options = {}) {
    if (!presenceService || typeof presenceService.getStatuses !== 'function') {
        return;
    }
    if (!Array.isArray(records) || records.length === 0) {
        return;
    }

    const idSelector = typeof options.idSelector === 'function' ? options.idSelector : defaultIdSelector;
    const assign = typeof options.assign === 'function' ? options.assign : defaultAssign;

    const ids = [];
    const seen = new Set();
    for (const record of records) {
        const candidate = normalizeUserId(idSelector(record));
        if (candidate === null || seen.has(candidate)) {
            continue;
        }
        seen.add(candidate);
        ids.push(candidate);
    }

    if (ids.length === 0) {
        return;
    }

    let presenceMap = null;
    try {
        presenceMap = await presenceService.getStatuses(ids);
    } catch (error) {
        if (typeof presenceService.logError === 'function') {
            presenceService.logError('hydratePresenceStatuses', error);
        }
        return;
    }

    if (!presenceMap || typeof presenceMap !== 'object') {
        presenceMap = {};
    }

    records.forEach((record) => {
        const id = normalizeUserId(idSelector(record));
        if (id === null) {
            assign(record, null);
            return;
        }
        const keyed = presenceMap[id] || presenceMap[id.toString()] || null;
        assign(record, keyed);
    });
}

module.exports = {
    hydratePresenceStatuses,
    normalizeLastSeen
};
