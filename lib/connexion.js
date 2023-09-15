// Importe le module 'presences'
const {getPresences} = require('./util/presences')

/**
 * Supprime la session en cours
 *
 * @param {object} req - Requête entrante
 * @param {object} res - Réponse sortante
 */
function deleteSession(req, res) {
  const session_id = req.get('Token')
  res.status(200).json({message: 'Session is deleted.'})
  req.sessionStore.destroy(session_id, async err => {
    console.error(err)
  })
}

/**
 * Vérifie la validité de la session en cours
 *
 * @param {object} req - Requête entrante
 * @param {object} res - Réponse sortante
 * @async
 */
async function checkSession(req, res) {
  const session_id = req.get('Token')
  req.sessionStore.get(session_id, (err, session) => {
    if (err || !session) {
      res.status(401).json({error: 'Session is not valid.'})
    } else if (session.user) {
      res.status(200).json({session: session_id, user: session.user})
    }
  })
}

/**
 * Gère la connexion utilisateur
 *
 * @param {object} req - Requête entrante
 * @param {object} res - Réponse sortante
 * @async
 */
async function connexion(req, res) {
  const got = require('got')
  const {identifiant, password} = req.body
  try {
    const response = await got.post(`${process.env.WP_COWO_API_URL}/app-auth`, {
      json: {
        email: identifiant,
        password
      },
      headers: {
        Authorization: process.env.WP_COWO_API_TOKEN
      },
      responseType: 'json'
    })

    const body = response.body
    body.token = req.sessionID
    req.session.user = body.user
    req.session.reglages = body.reglages

    const users = await getPresences()
    body.reglages.settings.occupation.presents = users.length

    res.json(body)
  } catch (error) {
    console.error(error)
    res.status(500).json({error: 'An error occurred while processing your request.'})
  }
}

module.exports = {connexion, checkSession, deleteSession}
