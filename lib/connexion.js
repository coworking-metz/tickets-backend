const { getPresences } = require('./util/presences');

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
        
        // Retrieve present users count
        const users = await getPresences();
        body.reglages.settings.occupation.presents = users.length;

        // Send response
        res.json(body);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
}

module.exports = { connexion }
