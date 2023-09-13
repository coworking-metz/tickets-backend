import process from 'node:process'
import got from 'got'

const {ESP32_PARKING_REMOTE_BASE_URL} = process.env

export const pressRemoteButton = () => got.post(`${ESP32_PARKING_REMOTE_BASE_URL}/button/gate_remote/press`, {
  responseType: 'json',
}).then(({body}) => body)
