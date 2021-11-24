const {sub, add, isValid} = require('date-fns')
const {sumBy, maxBy, chain, sortBy, pick} = require('lodash')
const mongo = require('./util/mongo')
const {sendMail} = require('./util/sendmail')
const renderFinAbonnement = require('./emails/fin-abonnement')
const renderPlusDeTickets = require('./emails/plus-de-tickets')
const {addTickets, addAbo, addMembership, getUserIdByEmail, findOrCreateRelatedUserId, isPresenceDuringAbo, updateBalance} = require('./models')

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

async function coworkersNow(req, res) {
  const tenMinutesAgo = sub(new Date(), {minutes: 10}).toISOString()
  const count = await mongo.db.collection('users').count({
    'profile.heartbeat': {$gt: tenMinutesAgo}
  })
  res.json(count)
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

  const today = (new Date()).toISOString().slice(0, 10)

  const balance = {}
  balance.balance = user.profile.balance

  const lastAbo = maxBy(user.profile.abos, 'aboStart')

  if (lastAbo) {
    if (today <= lastAbo.aboEnd) {
      balance.lastAboEnd = lastAbo.aboEnd
    }
  }

  const lastMembership = chain(user.profile.memberships)
    .map('membershipYear')
    .compact()
    .max()

  if (lastMembership) {
    balance.lastMembership = lastMembership
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
  balance.presencesConso = totalActivity
  balance.presencesJours = user.profile.presences.length
  balance.trustedUser = totalActivity >= 10

  const abos = sortBy(user.profile.abos, 'aboStart')
    .map(abo => {
      const {aboStart, aboEnd, purchaseDate} = abo
      const current = today >= aboStart && today <= aboEnd
      return {purchaseDate, aboStart, aboEnd, current}
    })
    .reverse()

  balance.abos = abos

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

  const presences = sortBy(user.profile.presences || [], 'date')
    .reverse()
    .map(p => ({
      ...p,
      type: isPresenceDuringAbo(p.date, user.profile.abos) ? 'A' : 'T'
    }))

  res.send(presences)
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

  // Mise à jour de la balance de tickets
  await updateBalance(userId)

  res.sendStatus(200)
}

async function notify(req, res) {
  const today = (new Date()).toISOString().slice(0, 10)
  const tomorrow = add(new Date(), {days: 1}).toISOString().slice(0, 10)
  const yesterday = sub(new Date(), {days: 1}).toISOString().slice(0, 10)

  // On commence par déterminer les utilisateurs en fin d'abonnement
  const candidateEndOfAboUsers = await mongo.db.collection('users')
    .find({'profile.abos': {$elemMatch: {aboEnd: today}}})
    .project({_id: 0, 'emails.address': 1, 'profile.abos': 1})
    .toArray()
  const endOfAboUsers = candidateEndOfAboUsers.filter(
    user => !isPresenceDuringAbo(tomorrow, user.profile.abos)
  )
  const endOfAboEmails = chain(endOfAboUsers).map('emails').flatten().value()
  await Promise.all(endOfAboEmails.map(async email => sendMail(
    renderFinAbonnement(),
    [email]
  )))

  // Ensuite on s'occupe des utilisateurs qui n'ont plus de tickets
  const todayUsers = await mongo.db.collection('users')
    .find({'profile.heartbeat': {$gt: yesterday}})
    .project({_id: 0, 'emails.address': 1, profile: 1})
    .toArray()
  const outOfTicketsUsers = todayUsers.filter(user => {
    const isDuringAbo = isPresenceDuringAbo(today, user.profile.abos)
    return !isDuringAbo && user.profile.balance <= 0
  })
  const outOfTicketsEmails = chain(outOfTicketsUsers).map('emails').flatten().value()
  await Promise.all(outOfTicketsEmails.map(async email => sendMail(
    renderPlusDeTickets(),
    [email]
  )))

  res.sendStatus(200)
}

async function purchaseWebhook(req, res) {
  if (req.body.status !== 'completed') {
    return res.sendStatus(200)
  }

  const items = req.body.line_items
  const purchaseDate = req.body.date_completed.slice(0, 10)

  const wpUserId = req.body.customer_id
  const userId = await findOrCreateRelatedUserId(wpUserId)

  await Promise.all(items.map(async item => {
    const {quantity, product_id: productId} = item

    if (productId === 3021) {
      await addTickets(userId, purchaseDate, quantity)
      await updateBalance(userId)
      return
    }

    if (productId === 3022) {
      await addTickets(userId, purchaseDate, quantity * 10)
      await updateBalance(userId)
      return
    }

    if (productId === 3023) {
      const startDateMeta = item.meta_data.find(m => m.key === 'Date de début')
      const startDate = startDateMeta ? convertDate(startDateMeta.value) : purchaseDate
      await addAbo(userId, purchaseDate, startDate, quantity)
      await updateBalance(userId)
      return
    }

    if (productId === 3063) {
      const meta = item.meta_data.find(m => m.key === 'purchase_membership')
      const membershipYear = meta ? meta.value : null
      await addMembership(userId, purchaseDate, membershipYear)
    }
  }))

  res.sendStatus(200)
}

async function getUsersStats(req, res) {
  const sort = ['presencesJours', 'presencesConso'].includes(req.query.sort)
    ? req.query.sort
    : 'presencesJours'

  const period = ['all-time', 'last-30-days', 'last-90-days', 'last-180-days'].includes(req.query.period)
    ? req.query.period
    : 'all-time'

  const aggregateSteps = [
    {$unwind: '$profile.presences'}
  ]

  if (req.query.from || req.query.to) {
    const dateQuery = {}

    if (req.query.from) {
      dateQuery.$gt = req.query.from
    }

    if (req.query.to) {
      dateQuery.$lt = req.query.to
    }

    aggregateSteps.push({
      $match: {
        'profile.presences.date': dateQuery
      }
    })
  }

  if (period !== 'all-time') {
    const numDays = Number.parseInt(period.split('-')[1], 10)
    aggregateSteps.push({
      $match: {
        'profile.presences.date': {$gt: formatDate(sub(new Date(), {days: numDays}))}
      }
    })
  }

  aggregateSteps.push(
    {
      $group: {
        _id: '$_id',
        emails: {$first: '$emails'},
        firstName: {$first: '$profile.firstName'},
        lastName: {$first: '$profile.lastName'},
        presencesConso: {$sum: '$profile.presences.amount'},
        presencesJours: {$sum: 1}
      }
    },
    {
      $sort: {[sort]: -1}
    }
  )

  const aggregateResult = await mongo.db.collection('users').aggregate(aggregateSteps).toArray()

  let currentRanking
  let currentRankingValue

  function computeRanking(value, index) {
    if (value === currentRankingValue) {
      return currentRanking
    }

    currentRanking = index + 1
    currentRankingValue = value
    return currentRanking
  }

  res.send(aggregateResult.map((r, i) => ({
    ...pick(r, '_id', 'firstName', 'lastName', 'presencesConso', 'presencesJours'),
    presences: r.presencesConso,
    ranking: computeRanking(r[sort], i)
  })))
}

async function getCurrentUsers(req, res) {
  const userDefinedDelay = Number.parseInt(req.query.delay, 10)

  if ('delay' in req.query && (!userDefinedDelay || userDefinedDelay < 0)) {
    return res.sendStatus(400)
  }

  const delay = userDefinedDelay || 10
  const dateToCompare = sub(new Date(), {minutes: delay}).toISOString()

  const users = await mongo.db.collection('users')
    .find({'profile.heartbeat': {$gt: dateToCompare}})
    .project({'profile.presences': 0, 'profile.tickets': 0})
    .toArray()

  res.send(users.map(user => ({
    _id: user._id,
    wpUserId: user.wpUserId,
    firstName: user.profile.firstName,
    lastName: user.profile.lastName,
    balance: user.profile.balance
  })))
}

function convertDate(frDate) {
  return `${frDate.slice(6, 10)}-${frDate.slice(3, 5)}-${frDate.slice(0, 2)}`
}

module.exports = {
  coworkersNow,
  getUserStats,
  getUserPresences,
  heartbeat,
  getMacAddresses,
  getCollectionsData,
  updatePresence,
  notify,
  purchaseWebhook,
  getUsersStats,
  getCurrentUsers
}
