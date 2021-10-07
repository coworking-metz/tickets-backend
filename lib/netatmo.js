const Netatmo = require('netatmo')

const clientId = process.env.NETATMO_CLIENT_ID
const clientSecret = process.env.NETATMO_CLIENT_SECRET
const username = process.env.NETATMO_USERNAME
const password = process.env.NETATMO_PASSWORD

const isConfigured = Boolean(clientId && clientSecret && username && password)

let client
let getStationsCache

if (isConfigured) {
  client = new Netatmo({
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password
  })
}

module.exports = {
  isConfigured() {
    return isConfigured
  },

  getStations() {
    if (getStationsCache && getStationsCache.expiresAt > new Date()) {
      return getStationsCache.value
    }

    if (!isConfigured) {
      throw new Error('Netatmo is not configured')
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
