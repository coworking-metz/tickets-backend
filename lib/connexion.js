const { getPresences } = require('./util/presences');

/**
 * Async function to delete a session.
 *
 * @async
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} req.session - The session object.
 * @param {Object} res - Express response object.
 * @param {function} next - Callback to the next piece of middleware.
 * @returns {Object} - The express response object, with a JSON body containing a success message and status 200.
 * @throws {Error} If there is an error while deleting the session.
 */
async function deleteSession(req, res, next) {
    const response = await req.session.destroy();
    res.status(200).json({ message: 'Session is deleted.' });
}
/**
 * Async function to check if a session is valid based on the existence of user_id in the session.
 *
 * @async
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} req.session - The session object.
 * @param {number} req.session.user_id - The user's ID in the session.
 * @param {Object} res - Express response object.
 * @param {function} next - Callback to the next piece of middleware.
 * @returns {Object} - The express response object, with a JSON body containing either a success message and status 200, or an error message and status 401.
 */
async function checkSession(req, res, next) {
    if (req.session.user) {
        res.status(200).json({ message: 'Session is valid.' });
    } else {
        res.status(401).json({ error: 'Session is not valid.' });
    }
}
/**
 * Handles user connection and provides data relevant to the user.
 * 
 * @param {Object} req - Express request object, should contain 'identifiant' and 'password' in its body
 * @param {Object} res - Express response object used to send the data back to client
 * @returns {Promise<void>}
 */
async function connexion(req, res) {
    const got = require('got');
    const { identifiant, password } = req.body;

    try {
        // Request authentication from external API
        const response = await got.post(`${process.env.WP_COWO_API_URL}/app-auth`, {
            json: {
                email: identifiant,
                password: password
            },
            headers: {
                Authorization: process.env.WP_COWO_API_TOKEN
            },
            responseType: 'json'
        });

        let body = response.body;

        body.user.session_id = req.sessionID;

        req.session.user = body.user;

        const users = await getPresences();
        body.reglages.settings.occupation.presents = users.length;

        // Send response
        res.json(body);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
}

module.exports = { connexion, checkSession, deleteSession }
