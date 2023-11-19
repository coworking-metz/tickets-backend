import {add, sub} from 'date-fns'
import {chain, range, minBy, maxBy, sumBy, sortBy} from 'lodash-es'

import mongo from './util/mongo.js'
import {generateBase62String} from './util/base62.js'
import {getUser as getWpUser} from './util/wordpress.js'
import {getPeriods, getDays, convertDateFormat} from './dates.js'

export async function addTickets(userId, purchaseDate, quantity) {
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

export async function addAbo(userId, purchaseDate, startDate, quantity) {
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

export async function addMembership(userId, purchaseDate, membershipStart) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.memberships': {
          purchaseDate,
          membershipStart
        }
      }
    }
  )
}

export async function getUserIdByEmail(email) {
  const user = await mongo.db.collection('users')
    .findOne({emails: {$elemMatch: {address: email}}}, {projection: {_id: 1}})

  if (user) {
    return user._id
  }
}

export async function createUser({wpUserId, firstName, lastName, email}) {
  const user = {
    _id: generateBase62String(17),
    wpUserId,
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
      firstName,
      lastName,
      isAdmin: false,
      balance: 0,
      heartbeat: null,
    }
  }

  await mongo.db.collection('users').insertOne(user)
  return user
}

export async function getUserIdByWpUserId(wpUserId) {
  const user = await mongo.db.collection('users').findOne({wpUserId}, {projection: {_id: 1}})

  if (user) {
    return user._id
  }
}

export async function findOrCreateRelatedUserId(wpUserId) {
  const {email, first_name: firstName, last_name: lastName} = await getWpUser(wpUserId)
  const userId = await getUserIdByWpUserId(wpUserId) || await getUserIdByEmail(email)

  if (userId) {
    await mongo.db.collection('users').updateOne(
      {_id: userId},
      {
        $set: {
          wpUserId,
          emails: [{address: email, verified: false}],
          'profile.firstName': firstName,
          'profile.lastName': lastName
        }
      }
    )
    return userId
  }

  const user = await createUser({wpUserId, firstName, lastName, email})
  return user._id
}

export async function syncUser(userId, wpUserData) {
  const user = await mongo.db.collection('users').findOne({_id: userId}, {projection: {wpUserId: 1}})

  if (!user) {
    throw new Error(`Unable to sync ${userId}: user not found`)
  }

  const {wpUserId} = user

  if (!wpUserId) {
    throw new Error(`Unable to sync ${userId}: no related wpUserId`)
  }

  const wpUser = wpUserData || await getWpUser(wpUserId)

  if (!wpUser) {
    throw new Error(`Unable to sync ${userId}: WP user ${wpUserId} not found`)
  }

  const {email, first_name: firstName, last_name: lastName} = wpUser

  const {date_naissance} = wpUser.acf

  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $set: {
        emails: [{address: email, verified: false}],
        'profile.firstName': firstName,
        'profile.lastName': lastName,
        'profile.birthDate': convertDateFormat(date_naissance)
      }
    }
  )
}

export function getDateOneMonthBefore(date) {
  return sub(new Date(date), {months: 1}).toISOString().slice(0, 10)
}

export function isPresenceDuringAbo(presenceDate, abos) {
  const oneMonthBefore = getDateOneMonthBefore(presenceDate)

  return abos.some(
    abo => oneMonthBefore < abo.aboStart && abo.aboStart <= presenceDate
  )
}

export function computeBalance(user) {
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

export async function updateBalance(userId) {
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

export function computeLastMembership(memberships) {
  const lastMembership = maxBy(memberships, 'purchaseDate')

  if (lastMembership) {
    const purchaseMonth = Number.parseInt(lastMembership.purchaseDate.slice(5, 7), 10)
    const purchaseYear = Number.parseInt(lastMembership.purchaseDate.slice(0, 4), 10)
    return String(purchaseMonth >= 11 ? purchaseYear + 1 : purchaseYear)
  }
}

export function computeMembershipOk(lastMembership) {
  const now = new Date()
  const currentYear = now.toISOString().slice(0, 4)

  return lastMembership && lastMembership >= currentYear
}

export function computeUserStats(user) {
  const today = (new Date()).toISOString().slice(0, 10)

  const userStats = {
    firstName: user.profile.firstName,
    lastName: user.profile.lastName,
    email: user.emails[0].address
  }
  userStats.balance = user.profile.balance

  const lastAbo = maxBy(user.profile.abos, 'aboStart')

  if (lastAbo) {
    const lastAboEnd = sub(add(new Date(lastAbo.aboStart), {months: 1}), {days: 1})
      .toISOString().slice(0, 10)

    if (today <= lastAboEnd) {
      userStats.lastAboEnd = lastAboEnd
    }
  }

  userStats.lastMembership = computeLastMembership(user.profile.memberships)
  userStats.membershipOk = computeMembershipOk(userStats.lastMembership)

  const sixMonthsAgo = sub(new Date(), {months: 6}).toISOString().slice(0, 10)

  const sixMonthsActivity = chain(user.profile.presences)
    .filter(p => p.date >= sixMonthsAgo)
    .sumBy('amount')
    .value()

  userStats.activity = sixMonthsActivity
  userStats.activeUser = sixMonthsActivity >= 20

  const totalActivity = sumBy(user.profile.presences, 'amount')

  userStats.totalActivity = totalActivity
  userStats.presencesConso = totalActivity
  userStats.presencesJours = user.profile.presences.length
  userStats.trustedUser = totalActivity >= 10

  const abos = sortBy(user.profile.abos, 'aboStart')
    .map(abo => {
      const {aboStart, purchaseDate} = abo
      const aboEnd = sub(add(new Date(aboStart), {months: 1}), {days: 1}).toISOString().slice(0, 10)
      const current = today >= aboStart && today <= aboEnd
      return {purchaseDate, aboStart, aboEnd, current}
    })
    .reverse()

  userStats.abos = abos
  return userStats
}

export async function getUsers() {
  const users = await mongo.db.collection('users').find({}).toArray()
  return users
}

export async function computeIncomes(periodType, from, to) {
  const users = await getUsers()

  const datesIndex = {}

  for (const user of users) {
    for (const p of user.profile.presences) {
      const {date, amount} = p

      if (!datesIndex[date]) {
        datesIndex[date] = []
      }

      datesIndex[date].push({
        user,
        date,
        amount,
        abo: isPresenceDuringAbo(date, user.profile.abos)
      })
    }
  }

  const periods = getPeriods(periodType, from, to)

  return periods.map(period => {
    const days = getDays(new Date(period[0]), new Date(period[1]))
    const {usedTickets, daysAbo} = days.reduce((dataObj, dayPeriod) => {
      const day = dayPeriod[0]
      const dateEntries = datesIndex[day] || []
      const tickets = dateEntries.filter(e => !e.abo).reduce(
        (ticketsSum, e) => ticketsSum + e.amount,
        0
      )
      const activeAbo = users.filter(u => isPresenceDuringAbo(day, u.profile.abos)).length
      dataObj.usedTickets += tickets
      dataObj.daysAbo += activeAbo
      return dataObj
    }, {usedTickets: 0, daysAbo: 0})

    return {
      date: period[0],
      type: periodType,
      data: {usedTickets, daysAbo, incomes: (6 * usedTickets) + (2 * daysAbo)}}
  })
}
