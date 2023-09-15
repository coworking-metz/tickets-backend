const mongo = require('./util/mongo')
/**
 * @function
 * @async
 * @name ping
 * @param {Object} req - L'objet de la requête Express
 * @param {Object} res - L'objet de la réponse Express
 *
 * @description Cette fonction vérifie le statut de MongoDB.
 * Elle retourne un objet JSON indiquant si MongoDB est 'en marche' ('up') ou 'en panne' ('down').
 * Si MongoDB est en panne, la fonction retournera un code de statut HTTP 503 (Service non disponible).
 *
 * @returns {Object} Un objet JSON contenant le statut de MongoDB.
 *
 * @example
 * // Réponse réussie:
 * // HTTP/1.1 200 OK
 * // {"status": "up"}
 *
 * @example
 * // Réponse en cas d'erreur:
 * // HTTP/1.1 503 Service non disponible
 * // {"status": "down"}
 */
async function ping(req, res) {
  const payload = {status: 'down'}
  try {
    await mongo.db.command({ping: 1})
    payload.status = 'up'
    res.send(payload)
  } catch {
    res.status(503).send(payload)
  }
}

module.exports = {ping}

