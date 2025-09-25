import process from 'node:process'
import got from 'got'
import createError from 'http-errors'

const {SHELLY_TOKEN, SHELLY_SERVER, SHELLY_PARKING_REMOTE_DEVICE} = process.env

export async function pressRemoteButton() {
  if (!SHELLY_TOKEN || !SHELLY_SERVER || !SHELLY_PARKING_REMOTE_DEVICE) {
    throw createError(501, 'Parking remote service not configured')
  }

  const statusResponse = await got.post('device/status', {
    prefixUrl: SHELLY_SERVER,
    form: {
      id: SHELLY_PARKING_REMOTE_DEVICE,
      auth_key: SHELLY_TOKEN
    }
  }).json()

  if (!statusResponse?.data?.online) {
    throw createError(503, 'Le dispositif d\'ouverture de la barrière ne répond pas. Vous pouvez réessayer dans quelques instants. Si le problème persiste, contactez-nous.')
  }

  return got.post('device/relay/control', {
    prefixUrl: SHELLY_SERVER,
    form: {
      id: SHELLY_PARKING_REMOTE_DEVICE,
      channel: 0,
      turn: 'on',
      auth_key: SHELLY_TOKEN
    },
    timeout: {
      request: 5000 // 5 seconds
    }
  }).json()
}
