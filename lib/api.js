import {sub, add, isValid} from 'date-fns'
import {chain, sortBy, pick} from 'lodash-es'

import mongo from './util/mongo.js'
import {sendMail} from './util/sendmail.js'
import renderFinAbonnement from './emails/fin-abonnement.js'
import renderPlusDeTickets from './emails/plus-de-tickets.js'
import {addTickets, addAbo, addMembership, getUserIdByEmail, findOrCreateRelatedUserId, isPresenceDuringAbo, updateBalance, computeUserStats, computeMembershipOk, computeLastMembership} from './models.js'

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

export async function coworkersNow(req, res) {
  const userDefinedDelay = Number.parseInt(req.query.delay, 10)

  if ('delay' in req.query && (!userDefinedDelay || userDefinedDelay < 0)) {
    return res.sendStatus(400)
  }

  const delay = userDefinedDelay || 10
  const dateToCompare = sub(new Date(), {minutes: delay}).toISOString()

  const count = await mongo.db.collection('users').count({
    'profile.heartbeat': {$gt: dateToCompare}
  })
  res.json(count)
}

export async function resolveUser(req, res, next) {
  if (req.params.userId) {
    req.user = await mongo.db.collection('users').findOne({wpUserId: req.params.userId})
    next()
  }

  const email = req.method === 'POST' ? req.body.email : req.query.email
  if (!email) {
    return res.sendStatus(400)
  }

  req.user = await mongo.db.collection('users').findOne({
    emails: {$elemMatch: {address: email}}
  })

  if (!req.user) {
    return res.status(400).send('Invalid email address')
  }

  next()
}

export async function getUserStats(req, res) {
  const userStats = computeUserStats(req.user)
  res.send(userStats)
}

export async function getUserPresences(req, res) {
  const presences = sortBy(req.user.profile.presences || [], 'date')
    .reverse()
    .map(p => ({
      ...p,
      type: isPresenceDuringAbo(p.date, req.user.profile.abos) ? 'A' : 'T'
    }))

  res.send(presences)
}

export async function heartbeat(req, res) {
  const macAddresses = req.body.macAddresses.split(',')
  const now = (new Date()).toISOString()

  // Pour le moment on garde updateMany car on n'a pas encore d'unicité dans la base.
  await mongo.db.collection('users').updateMany(
    {'profile.macAddresses': {$in: macAddresses}},
    {$set: {'profile.heartbeat': now}}
  )

  res.sendStatus(200)
}

export async function getMacAddressesLegacy(req, res) {
  const users = await mongo.db.collection('users').aggregate([
    {$unwind: '$profile.macAddresses'},
    {$match: {'profile.macAddresses': {$ne: null}}},
    {$project: {'profile.firstName': 1, 'profile.lastName': 1, emails: 1, 'profile.macAddresses': 1}}
  ]).toArray()

  const rows = users.map(user => ([
    user.profile.macAddresses.toUpperCase(),
    user.emails[0].address,
    user.profile.firstName,
    user.profile.lastName
  ]))

  res.type('text/csv').send(rows.map(row => row.join('\t')).join('\n'))
}

export async function getMacAddresses(req, res) {
  const rows = await mongo.db.collection('users').aggregate([
    {$unwind: '$profile.macAddresses'},
    {$match: {'profile.macAddresses': {$ne: null}}},
    {$project: {_id: 1, 'profile.macAddresses': 1}}
  ]).toArray()

  res.send(rows.map(row => ({
    userId: row._id,
    macAddress: row.profile.macAddresses.toUpperCase()
  })))
}

export async function getCollectionsData(req, res) {
  const users = await mongo.db.collection('users').find({}).toArray()
  res.send({users})
}

export async function updatePresence(req, res) {
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

export async function notify(req, res) {
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

export async function purchaseWebhook(req, res) {
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
      const startDate = extractDateDebutAbonnement(item)
      await addAbo(userId, purchaseDate, startDate || purchaseDate, quantity)
      await updateBalance(userId)
      return
    }

    if (productId === 3063) {
      const membershipStart = purchaseDate
      await addMembership(userId, purchaseDate, membershipStart)
    }
  }))

  res.sendStatus(200)
}

export function extractDateDebutAbonnement(product) {
  const tmCartEPOData = product.meta_data.find(m => m.key === '_tmcartepo_data')

  if (!tmCartEPOData) {
    return
  }

  const fieldData = tmCartEPOData.value.find(e => e.name === 'Date de début')

  if (fieldData) {
    return convertDate(fieldData.value)
  }
}

export async function getUsersStats(req, res) {
  const sort = ['presencesJours', 'presencesConso', 'createdAt'].includes(req.query.sort)
    ? req.query.sort
    : 'presencesJours'
  console.log(sort)

  const sortOrder = sort === 'createdAt' ? 1 : -1
  const period = ['all-time', 'last-30-days', 'last-90-days', 'last-180-days', 'last-365-days'].includes(req.query.period)
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
        createdAt: {$first: '$createdAt'},
        wpUserId: {$first: '$wpUserId'},
        firstName: {$first: '$profile.firstName'},
        lastName: {$first: '$profile.lastName'},
        presencesConso: {$sum: '$profile.presences.amount'},
        presencesJours: {$sum: 1}
      }
    },
    {
      $sort: {[sort]: sortOrder}
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
    ...pick(r, '_id', 'firstName', 'lastName', 'presencesConso', 'presencesJours', 'createdAt', 'wpUserId'),
    email: r.emails.length > 0 ? r.emails?.[0].address || '' : '',
    presences: r.presencesConso,
    ranking: computeRanking(r[sort], i)
  })))
}

export async function getCurrentUsers(req, res) {
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

  res.send(users.map(user => {
    const lastMembership = computeLastMembership(user.profile.memberships)
    const membershipOk = computeMembershipOk(lastMembership)

    return {
      _id: user._id,
      wpUserId: user.wpUserId,
      firstName: user.profile.firstName,
      lastName: user.profile.lastName,
      balance: user.profile.balance,
      lastMembership,
      membershipOk
    }
  }))
}

export async function getVotingCoworkers(req, res) {
  if (req.query.minActivity) {
    const parsedMinActivity = Number.parseFloat(req.query.minActivity, 10)

    if (Number.isNaN(parsedMinActivity) || parsedMinActivity < 10 || parsedMinActivity > 100) {
      return res.status(400).send({code: 400, message: 'minActivity doit être un entier compris entre 10 et 100'})
    }

    req.minActivity = parsedMinActivity
  }

  const minActivity = req.minActivity || 20

  const users = await mongo.db.collection('users').find({}).toArray()
  res.send(chain(users)
    .map(u => computeUserStats(u))
    .filter(u => u.activity >= minActivity)
    .map(u => pick(u, 'firstName', 'lastName', 'email', 'activity', 'lastMembership', 'balance'))
    .sortBy(u => -u.activity)
    .value()
  )
}

export function convertDate(frDate) {
  return `${frDate.slice(6, 10)}-${frDate.slice(3, 5)}-${frDate.slice(0, 2)}`
}
