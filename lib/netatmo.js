const Netatmo = require('netatmo')

const clientId = process.env.NETATMO_CLIENT_ID
const clientSecret = process.env.NETATMO_CLIENT_SECRET
const username = process.env.NETATMO_USERNAME
const password = process.env.NETATMO_PASSWORD

const isConfigured = Boolean(clientId && clientSecret && username && password)

let client
let isConnected = false
let getStationsCache

function connect() {
  client = new Netatmo({
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password
  })

  // Can be improved if we can catch the real connection event
  isConnected = true

  client.on('error', error => {
    console.error(error)
    client.removeAllListeners('error')
    isConnected = false
    connect()
  })
}

if (isConfigured) {
  connect()
}

function isAvailable() {
  return isConfigured && isConnected
}

module.exports = {
  isAvailable,

  getStations() {
    if (getStationsCache && getStationsCache.expiresAt > new Date()) {
      return getStationsCache.value
    }

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
