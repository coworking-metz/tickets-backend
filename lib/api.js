const {sub, add, isValid} = require('date-fns')
const {sumBy, minBy, maxBy, chain} = require('lodash')
const mongo = require('./mongo')
const {getUserIdByEmail} = require('./models')

async function coworkersNow(req, res) {
  const tenMinutesAgo = sub(new Date(), {minutes: 10}).toISOString()
  const count = await mongo.db.collection('users').count({
    'profile.heartbeat': {$gt: tenMinutesAgo}
  })
  res.json(count)
}

function getDateOneMonthBefore(date) {
  return sub(new Date(date), {months: 1}).toISOString().slice(0, 10)
}

function computeBalance(user) {
  const oldMembershipsCount = user.profile.memberships
    .filter(m => m.purchaseDate < '2017-02-01')
    .length

  const purchasedTickets = sumBy(user.profile.tickets, 'tickets')

  const usedTickets = user.profile.presences
    .reduce((sum, presence) => {
      const isDuringAbo = user.profile.abos.some(
        abo => getDateOneMonthBefore(presence.date) < abo.aboStart && abo.aboStart <= presence.date
      )

      return isDuringAbo ? sum : sum + presence.amount
    }, 0)

  const firstPresence = minBy(user.profile.presences, 'date')
  const freeTicket = firstPresence && firstPresence.date < '2017-02-01' ? 1 : 0

  return freeTicket + oldMembershipsCount + purchasedTickets - usedTickets
}

async function getUserStats(req, res) {
  const email = req.method === 'POST' ? req.body.email : req.query.email

  if (!email) {
    return res.sendStatus(400)
  }

  const user = await mongo.db.collection('users').findOne({
    emails: {$elemMatch: {address: email}}
  })

  if (!user) {
    return res.status(400).send('Invalid email address')
  }

  const balance = {}
  balance.balance = computeBalance(user)

  const lastAbo = maxBy(user.profile.abos, 'aboStart')

  if (lastAbo) {
    const lastAboEnd = sub(add(new Date(lastAbo.aboStart), {months: 1}), {days: 1})
      .toISOString().slice(0, 10)

    const today = (new Date()).toISOString().slice(0, 10)

    if (today <= lastAboEnd) {
      balance.lastAboEnd = lastAboEnd
    }
  }

  const lastMembership = maxBy(user.profile.memberships, 'membershipStart')

  if (lastMembership) {
    balance.lastMembership = lastMembership.membershipStart.slice(0, 4)
  }

  const sixMonthsAgo = sub(new Date(), {months: 6}).toISOString().slice(0, 10)

  const sixMonthsActivity = chain(user.profile.presences)
    .filter(p => p.date >= sixMonthsAgo)
    .sumBy('amount')
    .value()

  balance.activity = sixMonthsActivity
  balance.activeUser = sixMonthsActivity >= 20

  const totalActivity = sumBy(user.profile.presences, 'amount')

  balance.totalActivity = totalActivity
  balance.trustedUser = totalActivity >= 10

  res.send(balance)
}

async function getUserPresences(req, res) {
  const email = req.method === 'POST' ? req.body.email : req.query.email

  if (!email) {
    return res.sendStatus(400)
  }

  const user = await mongo.db.collection('users').findOne({
    emails: {$elemMatch: {address: email}}
  })

  if (!user) {
    return res.status(400).send('Invalid email address')
  }

  res.send(user.profile.presences || [])
}

async function heartbeat(req, res) {
  const macAddresses = req.body.macAddresses.split(',')
  const now = (new Date()).toISOString()

  // Pour le moment on garde updateMany car on n'a pas encore d'unicité dans la base.
  await mongo.db.collection('users').updateMany(
    {'profile.macAddresses': {$in: macAddresses}},
    {$set: {'profile.heartbeat': now}}
  )

  res.sendStatus(200)
}

async function getMacAddresses(req, res) {
  const users = await mongo.db.collection('users').aggregate([
    {$unwind: '$profile.macAddresses'},
    {$match: {'profile.macAddresses': {$ne: null}}},
    {$project: {'profile.firstName': 1, 'profile.lastName': 1, emails: 1, 'profile.macAddresses': 1}}
  ]).toArray()

  const rows = users.map(user => ([
    user.profile.macAddresses,
    user.emails[0].address,
    user.profile.firstName,
    user.profile.lastName
  ]))

  res.type('text/csv').send(rows.map(row => row.join('\t')).join('\n'))
}

async function getCollectionsData(req, res) {
  const users = await mongo.db.collection('users').find({}).toArray()
  res.send({users})
}

async function updatePresence(req, res) {
  if (!req.body.date || req.body.date.length !== 10 || !isValid(new Date(req.body.date))) {
    return res.sendStatus(400)
  }

  if (!['0.5', '1.0'].includes(req.body.amount)) {
    return res.sendStatus(400)
  }

  if (!req.body.email) {
    return res.sendStatus(400)
  }

  const {date, email} = req.body
  const amount = Number.parseFloat(req.body.amount)

  const userId = await getUserIdByEmail(email)

  if (!userId) {
    return res.sendStatus(400)
  }

  const {matchedCount} = await mongo.db.collection('users').updateOne(
    {_id: userId, 'profile.presences': {$elemMatch: {date}}},
    {$set: {'profile.presences.$.amount': amount}}
  )

  if (!matchedCount) {
    await mongo.db.collection('users').updateOne(
      {_id: userId},
      {
        $push: {
          'profile.presences': {date, amount}
        }
      }
    )
  }

  res.sendStatus(200)
}

module.exports = {
  coworkersNow,
  getUserStats,
  getUserPresences,
  heartbeat,
  getMacAddresses,
  getCollectionsData,
  updatePresence
}
