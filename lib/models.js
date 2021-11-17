const {add, sub} = require('date-fns')
const {range, minBy, sumBy} = require('lodash')
const mongo = require('./util/mongo')
const {generateBase62String} = require('./util/base62')

async function addTickets(userId, purchaseDate, quantity) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.tickets': {
          purchaseDate,
          tickets: quantity
        }
      }
    }
  )
}

async function addAbo(userId, purchaseDate, startDate, quantity) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.abos': {
          $each: range(quantity).map(i => ({
            purchaseDate,
            aboStart: add(new Date(startDate), {months: i}).toISOString().slice(0, 10)
          }))
        }
      }
    }
  )
}

async function addMembership(userId, purchaseDate) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.memberships': {
          purchaseDate,
          membershipStart: purchaseDate
        }
      }
    }
  )
}

async function getUserIdByEmail(email) {
  const user = await mongo.db.collection('users')
    .findOne({emails: {$elemMatch: {address: email}}}, {projection: {_id: 1}})

  if (user) {
    return user._id
  }
}

async function createUserByEmail(email) {
  const user = {
    _id: generateBase62String(17),
    createdAt: new Date(),
    emails: [
      {address: email, verified: false}
    ],
    services: {},
    profile: {
      tickets: [],
      presences: [],
      abos: [],
      memberships: [],
      macAddresses: [],
      firstName: null,
      lastName: null,
      isAdmin: false,
      balance: 0,
      heartbeat: null,
    }
  }

  await mongo.db.collection('users').insertOne(user)
  return user
}

async function getOrCreateUserIdByEmail(email) {
  const userId = await getUserIdByEmail(email)

  if (userId) {
    return userId
  }

  const user = await createUserByEmail(email)
  return user._id
}

function getDateOneMonthBefore(date) {
  return sub(new Date(date), {months: 1}).toISOString().slice(0, 10)
}

function isPresenceDuringAbo(presenceDate, abos) {
  const oneMonthBefore = getDateOneMonthBefore(presenceDate)

  return abos.some(
    abo => oneMonthBefore < abo.aboStart && abo.aboStart <= presenceDate
  )
}

function computeBalance(user) {
  const {memberships, abos, tickets, presences} = user.profile

  const oldMembershipsCount = memberships
    .filter(m => m.purchaseDate < '2017-02-01')
    .length

  const purchasedTickets = sumBy(tickets, 'tickets')

  const usedTickets = presences
    .reduce((sum, presence) => {
      const isDuringAbo = isPresenceDuringAbo(presence.date, abos)
      return isDuringAbo ? sum : sum + presence.amount
    }, 0)

  const firstPresence = minBy(presences, 'date')
  const freeTicket = firstPresence && firstPresence.date < '2017-02-01' ? 1 : 0

  return freeTicket + oldMembershipsCount + purchasedTickets - usedTickets
}

async function updateBalance(userId) {
  const user = await mongo.db.collection('users').findOne({_id: userId})

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  const balance = computeBalance(user)

  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {$set: {'profile.balance': balance}}
  )

  return balance
}

module.exports = {
  addTickets,
  addAbo,
  addMembership,
  getUserIdByEmail,
  createUserByEmail,
  getOrCreateUserIdByEmail,
  isPresenceDuringAbo,
  computeBalance,
  updateBalance
}
