import pMap from 'p-map'
import {maxBy, sumBy, sortBy, chain, pick} from 'lodash-es'
import {customAlphabet} from 'nanoid'
import {differenceInMinutes, isSameDay, sub} from 'date-fns'

import mongo from '../util/mongo.js'
import {buildPictureUrl, getUser as getWpUser} from '../util/wordpress.js'

import {computeSubcriptionEndDate, computeBalance, isPresenceDuringAbo} from '../calc.js'
import renderPlusDeTickets from '../emails/plus-de-tickets.js'

import * as Device from './device.js'
import * as Activity from './activity.js'
import {sendMail} from '../util/sendmail.js'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')
export const LAST_SEEN_DELAY = 10 // Since when a member is marked as attending the location, in minutes

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
  return mongo.db.collection('users').findOne({email})
}

// This function is a "high performance" way to get an user id from an email as needed by probe. To remove when probe will be able to handle user ids.
export async function getUserIdByEmail(email) {
  const user = await mongo.db.collection('users')
    .findOne({email}, {projection: {_id: 1}})

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

export async function getCurrentMembers(delayInMinutes = LAST_SEEN_DELAY) {
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

  const {email, first_name: firstName, last_name: lastName, acf: {date_naissance: birthDate}} = wpUser

  await mongo.db.collection('users').updateOne(
    {_id: memberId},
    {
      $set: {
        email,
        firstName,
        lastName,
        birthDate
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
    acf: {date_naissance: birthDate}
  } = await getWpUser(wpUserId)

  // Try to find the user with its wordpress email
  user = await getUserByEmail(email)

  // If the user exists, update its wordpress info
  if (user) {
    await mongo.db.collection('users').updateOne(
      {_id: user._id},
      {
        $set: {
          wpUserId,
          email,
          firstName,
          lastName,
          birthDate
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
    firstName,
    lastName,
    email,
    birthDate,
    profile: {
      tickets: [],
      abos: [],
      memberships: [],
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

  await Promise.all(memberIds.map(async memberId => {
    const userBeforeUpdate = await mongo.db.collection('users').findOneAndUpdate(
      {_id: memberId},
      {$set: {'profile.heartbeat': referenceDate.toISOString()}}
    )

    if (userBeforeUpdate.value) {
      notifyUserBalanceDepletionOnArrival(userBeforeUpdate.value, referenceDate)
    }
  }))
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
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate,
    email: user.email,
    balance: user.profile.balance,
    meals: user.profile.meals,
    lastSeen: user.profile.heartbeat,
    picture: buildPictureUrl(user.wpUserId),
    thumbnail: buildPictureUrl(user.wpUserId, 'thumbnail'),
    attending: differenceInMinutes(new Date(), new Date(user.profile.heartbeat)) <= LAST_SEEN_DELAY
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

/**
 * Notify if the user is arriving
 * and has no more tickets
 * and has no ongoing subscription
 */
async function notifyUserBalanceDepletionOnArrival(user, newHeartbeat) {
  const previousHeartbeat = new Date(user.profile.heartbeat)
  const isArriving = !isSameDay(previousHeartbeat, newHeartbeat)
  const isBalanceDepleted = user.profile.balance <= 0
  if (isArriving && isBalanceDepleted) {
    // Check if there is a ongoing subscription
    const newHeartbeatDate = newHeartbeat.toISOString().slice(0, 10)
    const isSubscriptionOngoing = isPresenceDuringAbo(newHeartbeatDate, user.profile.abos)

    if (!isSubscriptionOngoing) {
      // Send a notification email
      sendMail(
        renderPlusDeTickets(),
        [user.email]
      )
    }
  }
}
