import pMap from 'p-map'
import {maxBy, sumBy, sortBy, chain, pick} from 'lodash-es'
import {customAlphabet} from 'nanoid'
import {sub} from 'date-fns'

import mongo from '../util/mongo.js'
import {getUser as getWpUser} from '../util/wordpress.js'

import {convertDateFormat} from '../dates.js'
import {computeSubcriptionEndDate, computeBalance} from '../calc.js'

import * as Device from './device.js'
import * as Activity from './activity.js'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export async function getAllUsers() {
  return mongo.db.collection('users').find({}).toArray()
}

export async function getAllMembers() {
  const users = await getAllUsers()
  return pMap(users, user => computeMemberFromUser(user), {concurrency: 10})
}

export async function getUserByWordpressId(wordpressId) {
  return mongo.db.collection('users').findOne({wpUserId: wordpressId})
}

export async function getUserByEmail(email) {
  return mongo.db.collection('users').findOne({
    emails: {$elemMatch: {address: email}}
  })
}

// This function is a "high performance" way to get an user id from an email as needed by probe. To remove when probe will be able to handle user ids.
export async function getUserIdByEmail(email) {
  const user = await mongo.db.collection('users')
    .findOne({emails: {$elemMatch: {address: email}}}, {projection: {_id: 1}})

  if (user) {
    return user._id
  }
}

export async function getUserById(id) {
  return mongo.db.collection('users').findOne({_id: id})
}

export async function getMemberById(memberId) {
  const user = await getUserById(memberId)
  const member = await computeMemberFromUser(user, {withAbos: true, withActivity: true})
  member.macAddresses = await Device.getMacAddressesOfMember(memberId)
  return member
}

export async function getCurrentMembers(delayInMinutes = 10) {
  const minHeartbeat = sub(new Date(), {minutes: delayInMinutes}).toISOString()

  const users = await mongo.db.collection('users')
    .find({'profile.heartbeat': {$gt: minHeartbeat}})
    .project({'profile.tickets': 0})
    .toArray()

  return pMap(users, user => computeMemberFromUser(user), {concurrency: 10})
}

export async function getVotingMembers(minActivity = 20) {
  const users = await mongo.db.collection('users').find({}).toArray()

  const members = await pMap(
    users,
    user => computeMemberFromUser(user, {withActivity: true}),
    {concurrency: 10}
  )

  return chain(members)
    .filter(member => member.activity >= minActivity)
    .map(u => pick(u, 'firstName', 'lastName', 'email', 'activity', 'lastMembership', 'balance'))
    .sortBy(u => -u.activity)
    .value()
}

export async function recomputeBalance(memberId) {
  const user = await getUserById(memberId)

  if (!user) {
    throw new Error(`User not found: ${memberId}`)
  }

  const memberActivity = await Activity.getMemberActivity(memberId)

  const balance = computeBalance(user, memberActivity)

  if (balance !== user.profile.balance) {
    await mongo.db.collection('users').updateOne(
      {_id: memberId},
      {$set: {'profile.balance': balance}}
    )
  }

  return balance
}

export async function syncWithWordpress(memberId) {
  const user = await mongo.db.collection('users').findOne({_id: memberId}, {wpUserId: 1})

  if (!user) {
    throw new Error(`User not found: ${memberId}`)
  }

  if (!user.wpUserId) {
    throw new Error(`User ${memberId} has no wordpress id`)
  }

  const wpUser = await getWpUser(user.wpUserId)

  if (!wpUser) {
    throw new Error(`Unable to sync ${memberId}: WP user ${user.wpUserId} not found`)
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

export async function syncAllWithWordpress(onProgress = () => {}) {
  const memberIds = await mongo.db.collection('users').distinct('_id', {wpUserId: {$ne: null}})

  for (const memberId of memberIds) {
    /* eslint-disable-next-line no-await-in-loop */
    await syncWithWordpress(memberId)
    onProgress(memberId)
  }
}

export async function reconcileWithWordpressId(wpUserId) {
  let user

  // First, check if a member already exists with this wordpress id
  user = await getUserByWordpressId(wpUserId)
  if (user) {
    return user._id
  }

  // Then, retrieve the wordpress user
  const {
    email,
    first_name: firstName,
    last_name: lastName,
    acf
  } = await getWpUser(wpUserId)

  const birthDate = convertDateFormat(acf.date_naissance)

  // Try to find the user with its wordpress email
  user = await getUserByEmail(email)

  // If the user exists, update its wordpress info
  if (user) {
    await mongo.db.collection('users').updateOne(
      {_id: user._id},
      {
        $set: {
          wpUserId,
          emails: [{address: email, verified: false}],
          'profile.firstName': firstName,
          'profile.lastName': lastName,
          'profile.birthDate': birthDate
        }
      }
    )
    return user._id
  }

  // Finally, create a new user
  user = await createUser({wpUserId, firstName, lastName, birthDate, email})
  return user._id
}

export async function createUser({wpUserId, firstName, lastName, birthDate, email}) {
  const user = {
    _id: nanoid(17),
    wpUserId,
    createdAt: new Date(),
    emails: [
      {address: email, verified: false}
    ],
    services: {},
    profile: {
      tickets: [],
      abos: [],
      memberships: [],
      firstName,
      lastName,
      birthDate,
      isAdmin: false,
      balance: 0,
      heartbeat: null
    }
  }

  await mongo.db.collection('users').insertOne(user)
  return user
}

export async function heartbeatMembers(memberIds, referenceDate) {
  if (!referenceDate) {
    throw new Error('Missing referenceDate')
  }

  await mongo.db.collection('users').updateMany(
    {_id: {$in: memberIds}},
    {$set: {'profile.heartbeat': referenceDate.toISOString()}}
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

export async function computeMemberFromUser(user, options = {}) {
  const {withAbos, withActivity} = options

  const today = (new Date()).toISOString().slice(0, 10)

  const member = {
    _id: user._id,
    created: user.createdAt,
    wpUserId: user.wpUserId,
    firstName: user.profile.firstName,
    lastName: user.profile.lastName,
    birthDate: user.profile.birthDate,
    email: user.emails[0].address,
    balance: user.profile.balance,
    lastSeen: user.profile.heartbeat
  }

  const lastAbo = maxBy(user.profile.abos, 'aboStart')

  if (lastAbo) {
    const lastAboEnd = computeSubcriptionEndDate(lastAbo.aboStart)

    if (today <= lastAboEnd) {
      member.lastAboEnd = lastAboEnd
    }
  }

  member.lastMembership = computeLastMembership(user.profile.memberships)
  member.membershipOk = computeMembershipOk(member.lastMembership)

  if (withActivity) {
    const memberActivity = await Activity.getMemberActivity(user._id)
    const sixMonthsAgo = sub(new Date(), {months: 6}).toISOString().slice(0, 10)

    const sixMonthsActivity = chain(memberActivity)
      .filter(p => p.date >= sixMonthsAgo)
      .sumBy('value')
      .value()

    member.activity = sixMonthsActivity
    member.activeUser = sixMonthsActivity >= 20

    const totalActivity = sumBy(memberActivity, 'value')

    member.totalActivity = totalActivity
    member.presencesConso = totalActivity
    member.presencesJours = memberActivity.length
    member.trustedUser = totalActivity >= 10
  }

  if (withAbos) {
    const abos = sortBy(user.profile.abos, 'aboStart')
      .map(abo => {
        const {aboStart, purchaseDate} = abo
        const aboEnd = computeSubcriptionEndDate(aboStart)
        const current = today >= aboStart && today <= aboEnd
        return {purchaseDate, aboStart, aboEnd, current}
      })
      .reverse()

    member.abos = abos
  }

  return member
}
