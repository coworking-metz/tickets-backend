const {sub} = require('date-fns')
const mongo = require('./mongo')

async function coworkersNow(req, res) {
  const tenMinutesAgo = sub(new Date(), {minutes: 10}).toISOString()
  const count = await mongo.db.collection('users').count({
    'profile.heartbeat': {$gt: tenMinutesAgo}
  })
  res.send(200, count)
}

module.exports = {coworkersNow}
