/**
 * Ce code est une interface pour interagir avec le service Netatmo. 
 * Il utilise les variables d'environnement pour authentifier l'application 
 * et fournit une méthode pour obtenir les données des stations.
 */

// On importe le module 'netatmo'
const Netatmo = require('netatmo')

// On initialise les variables avec les données d'environnement
const clientId = process.env.NETATMO_CLIENT_ID
const clientSecret = process.env.NETATMO_CLIENT_SECRET
const username = process.env.NETATMO_USERNAME
const password = process.env.NETATMO_PASSWORD

/**
 * On vérifie si toutes les variables nécessaires sont présentes.
 * @type {boolean}
 */
const isConfigured = Boolean(clientId && clientSecret && username && password)

let client
let isConnected = false
let getStationsCache

/**
 * Fonction de connexion au service Netatmo
 * Elle crée une nouvelle instance de Netatmo et gère les erreurs de connexion.
 */
function connect() {
  // Nouvelle instance de Netatmo avec les informations d'authentification
  client = new Netatmo({
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password
  })

  // On suppose que la connexion est réussie
  // Cette approche pourrait être améliorée si on peut attraper l'événement de connexion réelle
  isConnected = true

  // Gestion des erreurs
  client.on('error', error => {
    console.error('Connexion netatmo impossible :',error.message)
    client.removeAllListeners('error')
    isConnected = false
    connect()
  })
}

// Si toutes les variables sont présentes, on se connecte
if (isConfigured) {
  connect()
}

/**
 * Vérifie si le service Netatmo est disponible
 * @returns {boolean} Retourne true si Netatmo est configuré et connecté, sinon false
 */
function isAvailable() {
  return isConfigured && isConnected
}

module.exports = {
  isAvailable,

  /**
   * Récupère les données des stations Netatmo
   * @returns {Promise} Retourne une promesse qui résout les données des stations ou rejette une erreur
   */
  getStations() {
    // Si le cache est valide, on le retourne
    if (getStationsCache && getStationsCache.expiresAt > new Date()) {
      return getStationsCache.value
    }

    // Si le service Netatmo n'est pas disponible, on rejette une erreur
    if (!isAvailable()) {
      throw new Error('Netatmo is not available')
    }

    return new Promise((resolve, reject) => {
      client.getStationsData((err, stations) => {
        if (err) {
          return reject(err)
        }

        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + 1)

        getStationsCache = {expiresAt, value: stations}

        resolve(stations)
      })
    })
  }
}
