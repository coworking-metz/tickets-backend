const {sub, add} = require('date-fns')
const {sumBy, minBy, maxBy, chain} = require('lodash')
const mongo = require('./mongo')

async function coworkersNow(req, res) {
  const tenMinutesAgo = sub(new Date(), {minutes: 10}).toISOString()
  const count = await mongo.db.collection('users').count({
    'profile.heartbeat': {$gt: tenMinutesAgo}
  })
  res.send(200, count)
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
  const freeTicket = firstPresence < '2017-02-01' ? 1 : 0

  return freeTicket + oldMembershipsCount + purchasedTickets - usedTickets
}

async function getBalance(req, res) {
  const email = req.method === 'POST' ? req.body.email : req.query.email

  if (!email) {
    res.sendStatus(400)
  }

  const user = await mongo.db.collection('users').findOne({
    emails: {$elemMatch: {address: email}}
  })

  if (!user) {
    return res.send(400).send('Invalid email address')
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
    balance.lastMembership = lastMembership.slice(0, 4)
  }

  const sixMonthsAgo = sub(new Date(), {months: 6}).toISOString.slice(0, 10)

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

module.exports = {coworkersNow, getBalance}
