import {uniq, maxBy, sumBy, sortBy, chain, pick} from 'lodash-es'
import {add, sub} from 'date-fns'
import createHttpError from 'http-errors'

import mongo from '../util/mongo.js'
import {getUser as getWpUser} from '../util/wordpress.js'

import {convertDateFormat} from '../dates.js'

export async function getUserByWordpressId(wordpressId) {
  return mongo.db.collection('users').findOne({wpUserId: wordpressId})
}

export async function getUserByEmail(email) {
  return mongo.db.collection('users').findOne({
    emails: {$elemMatch: {address: email}}
  })
}

export async function getUserById(id) {
  return mongo.db.collection('users').findOne({_id: id})
}

export async function getMemberById(memberId) {
  const user = await getUserById(memberId)
  return computeMemberFromUser(user, {withAbos: true, withActivity: true, withMacAddresses: true})
}

export async function getCurrentMembers(delayInMinutes = 10) {
  const minHeartbeat = sub(new Date(), {minutes: delayInMinutes}).toISOString()

  const users = await mongo.db.collection('users')
    .find({'profile.heartbeat': {$gt: minHeartbeat}})
    .project({'profile.presences': 0, 'profile.tickets': 0})
    .toArray()

  return users.map(user => computeMemberFromUser(user))
}

export async function getVotingMembers(minActivity = 20) {
  const users = await mongo.db.collection('users').find({}).toArray()

  return chain(users)
    .map(user => computeMemberFromUser(user, {withActivity: true}))
    .filter(member => member.activity >= minActivity)
    .map(u => pick(u, 'firstName', 'lastName', 'email', 'activity', 'lastMembership', 'balance'))
    .sortBy(u => -u.activity)
    .value()
}

export async function updateMemberMacAddresses(memberId, macAddresses) {
  if (!Array.isArray(macAddresses)) {
    throw createHttpError(400, 'macAddresses must be an array')
  }

  if (macAddresses.some(mac => !isMacAddress(mac))) {
    throw createHttpError(400, 'macAddresses must contain only valid mac addresses')
  }

  const cleanedMacAddresses = uniq(macAddresses.map(macAddress => macAddress.toUpperCase()))

  await mongo.db.collection('users')
    .updateOne({_id: memberId}, {$set: {'profile.macAddresses': cleanedMacAddresses}})

  return cleanedMacAddresses
}

export async function syncWithWordpress(memberId, wordpressUserId) {
  const wpUser = await getWpUser(wordpressUserId)

  if (!wpUser) {
    throw new Error(`Unable to sync ${memberId}: WP user ${wordpressUserId} not found`)
  }

  const {email, first_name: firstName, last_name: lastName} = wpUser

  const {date_naissance} = wpUser.acf

  await mongo.db.collection('users').updateOne(
    {_id: memberId},
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

/* Helpers */

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

export function computeMemberFromUser(user, options = {}) {
  const {withAbos, withActivity} = options

  const today = (new Date()).toISOString().slice(0, 10)

  const member = {
    _id: user._id,
    wpUserId: user.wpUserId,
    firstName: user.profile.firstName,
    lastName: user.profile.lastName,
    birthDate: user.profile.birthDate,
    email: user.emails[0].address,
    balance: user.profile.balance
  }

  const lastAbo = maxBy(user.profile.abos, 'aboStart')

  if (lastAbo) {
    const lastAboEnd = sub(add(new Date(lastAbo.aboStart), {months: 1}), {days: 1})
      .toISOString().slice(0, 10)

    if (today <= lastAboEnd) {
      member.lastAboEnd = lastAboEnd
    }
  }

  member.lastMembership = computeLastMembership(user.profile.memberships)
  member.membershipOk = computeMembershipOk(member.lastMembership)

  if (withActivity) {
    const sixMonthsAgo = sub(new Date(), {months: 6}).toISOString().slice(0, 10)

    const sixMonthsActivity = chain(user.profile.presences)
      .filter(p => p.date >= sixMonthsAgo)
      .sumBy('amount')
      .value()

    member.activity = sixMonthsActivity
    member.activeUser = sixMonthsActivity >= 20

    const totalActivity = sumBy(user.profile.presences, 'amount')

    member.totalActivity = totalActivity
    member.presencesConso = totalActivity
    member.presencesJours = user.profile.presences.length
    member.trustedUser = totalActivity >= 10
  }

  if (withAbos) {
    const abos = sortBy(user.profile.abos, 'aboStart')
      .map(abo => {
        const {aboStart, purchaseDate} = abo
        const aboEnd = sub(add(new Date(aboStart), {months: 1}), {days: 1}).toISOString().slice(0, 10)
        const current = today >= aboStart && today <= aboEnd
        return {purchaseDate, aboStart, aboEnd, current}
      })
      .reverse()

    member.abos = abos
  }

  if (options.withMacAddresses) {
    member.macAddresses = (user.profile.macAddresses || []).filter(mac => isMacAddress(mac)) // This filter is temporary
  }

  return member
}

function isMacAddress(string) {
  return /^([\da-f]{2}:){5}[\da-f]{2}$/i.test(string)
}