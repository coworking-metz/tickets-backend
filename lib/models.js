const {add, sub} = require('date-fns')
const {range, minBy, sumBy} = require('lodash')
const mongo = require('./mongo')

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
  const oldMembershipsCount = user.profile.memberships
    .filter(m => m.purchaseDate < '2017-02-01')
    .length

  const purchasedTickets = sumBy(user.profile.tickets, 'tickets')

  const usedTickets = user.profile.presences
    .reduce((sum, presence) => {
      const isDuringAbo = isPresenceDuringAbo(presence.date, user.profile.abos)
      return isDuringAbo ? sum : sum + presence.amount
    }, 0)

  const firstPresence = minBy(user.profile.presences, 'date')
  const freeTicket = firstPresence && firstPresence.date < '2017-02-01' ? 1 : 0

  return freeTicket + oldMembershipsCount + purchasedTickets - usedTickets
}

module.exports = {
  addTickets,
  addAbo,
  addMembership,
  getUserIdByEmail,
  isPresenceDuringAbo,
  computeBalance
}
