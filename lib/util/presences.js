const { sub } = require('date-fns');
const mongo = require('./mongo');

/**
 * Fetches the users that are currently active (based on a heartbeat timestamp being updated periodically).
 *
 * @param {number} delay - The timeframe in minutes to be considered for users' activity. Defaults to 15 minutes.
 * @returns {Promise<Array<Object>>} - Returns an array of users that have been active within the given timeframe.
 */
async function getPresences(delay = 15) {
    const dateToCompare = sub(new Date(), { minutes: delay }).toISOString();

    const users = await mongo.db.collection('users')
        .find({ 'profile.heartbeat': { $gt: dateToCompare } })
        .project({ 'profile.presences': 0, 'profile.tickets': 0 })
        .toArray();
    return users;
}

module.exports = { getPresences };
