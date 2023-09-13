const {add} = require('date-fns')
const {pressRemoteButton} = require('../services/esp32-parking-remote')

const openParkingBarrier = async (req, res) => {
  await pressRemoteButton()
  const now = new Date()
  res.send({
    triggered: now.toISOString(),
    closed: add(now, {seconds: 60}).toISOString(),
    timeout: 'PT60S' // Didn't count yet but I suspect a 60 seconds period
  })
}

module.exports = {openParkingBarrier}
