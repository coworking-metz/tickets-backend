import process from 'node:process'
import got from 'got'
import createError from 'http-errors'

const {ESP32_PARKING_REMOTE_BASE_URL} = process.env

export const pressRemoteButton = () => {
  if (!ESP32_PARKING_REMOTE_BASE_URL) {
    throw createError(501, 'Parking remote service not configured')
  }

  got.post(`${ESP32_PARKING_REMOTE_BASE_URL}/button/gate_remote/press`, {
    responseType: 'json',
  }).then(({body}) => body)
}
