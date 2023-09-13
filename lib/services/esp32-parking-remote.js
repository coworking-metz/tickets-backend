const got = require('got')

const {ESP32_PARKING_REMOTE_BASE_URL} = process.env

function pressRemoteButton() {
  return got.post(`${ESP32_PARKING_REMOTE_BASE_URL}/button/gate_remote/press`, {
    responseType: 'json',
  }).then(({body}) => body)
}

module.exports = {pressRemoteButton}
