const {sub, add, isValid} = require('date-fns')
const {sumBy, maxBy, chain, sortBy} = require('lodash')
const mongo = require('./util/mongo')
const {sendMail} = require('./util/sendmail')
const renderFinAbonnement = require('./emails/fin-abonnement')
const renderPlusDeTickets = require('./emails/plus-de-tickets')
const {addTickets, addAbo, addMembership, getUserIdByEmail, getOrCreateUserIdByEmail, isPresenceDuringAbo, updateBalance} = require('./models')

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
    const lastAboEnd = sub(add(new Date(lastAbo.aboStart), {months: 1}), {days: 1})
      .toISOString().slice(0, 10)

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

  const abos = sortBy(user.profile.abos, 'aboStart')
    .map(abo => {
      const {aboStart, purchaseDate} = abo
      const aboEnd = sub(add(new Date(aboStart), {months: 1}), {days: 1}).toISOString().slice(0, 10)
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
  // On commence par déterminer les utilisateurs en fin d'abonnement
  const expiringAboStartDate = add(sub(new Date(), {months: 1}), {days: 1}).toISOString().slice(0, 10)
  const candidateEndOfAboUsers = await mongo.db.collection('users')
    .find({'profile.abos': {$elemMatch: {aboStart: expiringAboStartDate}}})
    .project({_id: 0, 'emails.address': 1, 'profile.abos': 1})
    .toArray()
  const tomorrow = add(new Date(), {days: 1}).toISOString().slice(0, 10)
  const oneMonthBeforeTomorrow = sub(new Date(tomorrow), {months: 1}).toISOString().slice(0, 10)
  const endOfAboUsers = candidateEndOfAboUsers.filter(user => {
    const hasAboForTomorrow = user.profile.abos.some(
      abo => oneMonthBeforeTomorrow < abo.aboStart && abo.aboStart <= tomorrow
    )
    return !hasAboForTomorrow
  })
  const endOfAboEmails = chain(endOfAboUsers).map('emails').flatten().value()
  await Promise.all(endOfAboEmails.map(async email => sendMail(
    renderFinAbonnement(),
    [email]
  )))

  // Ensuite on s'occupe des utilisateurs qui n'ont plus de tickets
  const yesterday = sub(new Date(), {days: 1}).toISOString().slice(0, 10)
  const todayUsers = await mongo.db.collection('users')
    .find({'profile.heartbeat': {$gt: yesterday}})
    .project({_id: 0, 'emails.address': 1, profile: 1})
    .toArray()
  const today = (new Date()).toISOString().slice(0, 10)
  const oneMonthAgo = sub(new Date(), {months: 1}).toISOString().slice(0, 10)
  const outOfTicketsUsers = todayUsers.filter(user => {
    const isDuringAbo = user.profile.abos.some(abo => oneMonthAgo < abo.aboStart && abo.aboStart <= today)
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
  const {order} = req.body

  if (order.status !== 'completed') {
    return res.sendStatus(200)
  }

  const items = order.line_items
  const purchaseDate = order.completed_at.slice(0, 10)
  const {email} = order.customer

  const userId = await getOrCreateUserIdByEmail(email)

  await Promise.all(items.map(async item => {
    const {quantity} = item

    if (item.product_id === 3021) {
      await addTickets(userId, purchaseDate, quantity)
      await updateBalance(userId)
      return
    }

    if (item.product_id === 3022) {
      await addTickets(userId, purchaseDate, quantity * 10)
      await updateBalance(userId)
      return
    }

    if (item.product_id === 3023) {
      const startDateMeta = item.meta.find(m => m.label === 'Date de début')
      const startDate = startDateMeta ? convertDate(startDateMeta.value) : purchaseDate
      await addAbo(userId, purchaseDate, startDate, quantity)
      await updateBalance(userId)
      return
    }

    if (item.product_id === 3063) {
      await addMembership(userId, purchaseDate)
    }
  }))

  res.sendStatus(200)
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
  purchaseWebhook
}
