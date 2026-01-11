import {differenceInMinutes, isSameDay, isWithinInterval, parseISO, setYear, sub} from 'date-fns'
import {chain, maxBy, pick, sortBy, sumBy} from 'lodash-es'
import {customAlphabet} from 'nanoid'
import pMap from 'p-map'

import cache from '../util/cache.js'
import mongo from '../util/mongo.js'
import {buildPictureUrl, buildPolaroidUrl, getAnonymousPictureUrl, getUser as getWpUser} from '../util/wordpress.js'

import {computeBalance, computeSubscriptionEndDate, isPresenceDuringAbo} from '../calc.js'
import renderDepletedBalance from '../emails/depleted-balance.js'
import renderMissingMembership from '../emails/missing-membership.js'

import createHttpError from 'http-errors'
import {formatDate} from '../dates.js'
import {notifyOnSignal} from '../services/home-assistant.js'
import {getRandomFirstname, getRandomLastname} from '../util/name.js'
import {sendMail} from '../util/sendmail.js'
import * as Activity from './activity.js'
import * as Device from './device.js'
import {computeMembershipEndDate} from './membership.js'
import * as Subscription from './subscription.js'
import * as Ticket from './ticket.js'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export async function getMemberByBadgeId(badgeId) {
  const user = await mongo.db.collection('users').findOne(
    {
      badgeId: {$regex: `^${badgeId}$`, $options: 'i'}}
  )

  if (!user) {
    return
  }

  const member = computeMemberFromUser(user)

  return member
}

export async function updateMemberBadge(memberId, badgeId) {
  if (badgeId) {
    const existing = await mongo.db.collection('users').findOne(
      {
        badgeId: {$regex: `^${badgeId}$`, $options: 'i'},
        _id: {$ne: memberId}
      }
    )

    if (existing) {
      throw createHttpError(
        409,
        `This badge ID is already attached to ${[
          existing.firstName,
          existing.lastName,
          existing.email && `<${existing.email}>`
        ].filter(Boolean).join(' ')}`
      )
    }
  }

  return mongo.db.collection('users').updateOne(
    {_id: memberId},
    {$set: {badgeId: badgeId?.toUpperCase()}}
  )
}

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

export async function getCurrentMembers(delayInMinutes = Device.LAST_SEEN_DELAY_IN_MIN) {
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

  const balance = await computeBalance(user, memberActivity)

  if (balance !== user.profile.balance) {
    await mongo.db.collection('users').updateOne(
      {_id: memberId},
      {$set: {'profile.balance': balance}}
    )
  }

  // Ensure activity coverage is recomputed and cached
  await computeMemberActivityCoverage(memberId)

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

  const {
    email,
    first_name: firstName,
    last_name: lastName,
    trialDay,
    acf: {
      date_naissance: dateNaissance
    },
    roles
  } = wpUser

  await mongo.db.collection('users').updateOne(
    {_id: memberId},
    {
      $set: {
        email,
        firstName,
        lastName,
        ...(dateNaissance && {birthDate: new Date(dateNaissance).toISOString().slice(0, 10)}),
        trialDay,
        'profile.isAdmin': roles.includes('administrator')
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
    trialDay,
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
          birthDate,
          trialDay
        }
      }
    )
    return user._id
  }

  // Finally, create a new user
  user = await createUser({wpUserId, firstName, lastName, email, birthDate, trialDay})
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

export async function heartbeatMembers(memberIds, referenceDate, location = null) {
  if (!referenceDate) {
    throw new Error('Missing referenceDate')
  }

  const set = {'profile.heartbeat': referenceDate.toISOString()}

  if (location) {
    set['profile.heartbeatLocation'] = location
  }

  await Promise.all(memberIds.map(async memberId => {
    const userBeforeUpdate = await mongo.db.collection('users').findOneAndUpdate(
      {_id: memberId},
      {$set: set}
    )

    if (userBeforeUpdate.value) {
      notifyUserOnArrival(userBeforeUpdate.value, referenceDate)
    }
  }))
}

/* Helpers */

export function computeLastMembership(memberships) {
  const lastMembership = maxBy(memberships, 'membershipStart')

  if (lastMembership) {
    const endDate = computeMembershipEndDate(lastMembership.membershipStart)
    return endDate.slice(0, 4)
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
    badgeId: user.badgeId,
    isAdmin: user.profile.isAdmin,
    balance: user.profile.balance,
    lastSeen: user.profile.heartbeat,
    location: user.profile.heartbeatLocation,
    picture: buildPictureUrl(user.wpUserId),
    thumbnail: buildPictureUrl(user.wpUserId, 'thumbnail'),
    polaroid: buildPolaroidUrl(user.wpUserId, 'big'),
    attending: differenceInMinutes(new Date(), new Date(user.profile.heartbeat)) <= Device.LAST_SEEN_DELAY_IN_MIN
  }

  const activeSubscriptions = await Subscription.findActiveSubscriptionsByDate(today, user._id)
  member.activeSubscriptions = activeSubscriptions.map(s => Subscription.formatSubscription(s))
  member.hasActiveSubscription = activeSubscriptions.length > 0

  // Deprecated: prefer using activeSubscriptions
  const lastAbo = maxBy(user.profile.abos, 'aboStart')
  if (lastAbo) {
    const lastAboEnd = computeSubscriptionEndDate(lastAbo.aboStart)

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
        const aboEnd = computeSubscriptionEndDate(aboStart)
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
 * and is missing a membership
 */
async function notifyUserOnArrival(user, newHeartbeat) {
  const previousHeartbeat = new Date(user.profile.heartbeat)
  const isArriving = !isSameDay(previousHeartbeat, newHeartbeat)

  if (isArriving) {
    // Verify and notify if the user balance is depleted
    notifyDepletedBalance(user, newHeartbeat).catch(error => {
      notifyOnSignal(`Impossible de notifier ${user.email} pour son solde insuffisant :\n${error.message}`)
        .catch(notifyError => {
          // Don't throw an error if the notification failed
          console.error('Unable to notify about missing membership email notification', notifyError)
        })
    })

    // Verify and notify if the user is missing a membership
    notifyMissingMembership(user).catch(error => {
      notifyOnSignal(`Impossible de notifier ${user.email} pour son adhésion manquante :\n${error.message}`)
        .catch(notifyError => {
          // Don't throw an error if the notification failed
          console.error('Unable to notify about missing membership email notification', notifyError)
        })
    })
  }
}

async function notifyDepletedBalance(user, newHeartbeat) {
  const isBalanceDepleted = user.profile.balance <= 0
  if (isBalanceDepleted) {
    // Check if there is a ongoing subscription
    const newHeartbeatDate = new Date(newHeartbeat).toISOString().slice(0, 10)
    const isSubscriptionOngoing = isPresenceDuringAbo(newHeartbeatDate, user.profile.abos)

    if (!isSubscriptionOngoing) {
      const depletedBalanceEmail = await renderDepletedBalance(user)
      // Send a notification email
      sendMail(
        depletedBalanceEmail,
        [user.email]
      )
    }
  }
}

async function notifyMissingMembership(user) {
  const lastMembership = computeLastMembership(user.profile.memberships)
  const membershipOk = computeMembershipOk(lastMembership)
  if (!membershipOk) {
    const missingMembershipEmail = await renderMissingMembership(user)
    // Send a notification email
    sendMail(
      missingMembershipEmail,
      [user.email]
    )
  }
}

export function computeMemberCapabilitiesFromUser(member, user) {
  const defaultCapabilities = ['UNLOCK_GATE', 'PARKING_ACCESS', 'WIFI_CREDENTIALS_ACCESS']

  if (member.trustedUser) {
    defaultCapabilities.push('UNLOCK_DECK_DOOR', 'KEYS_ACCESS')
  }

  if (member.isAdmin) {
    defaultCapabilities.push('STORAGE_KEYS_ACCESS')
  }

  return {
    ...Object.fromEntries(defaultCapabilities.map(cap => [cap, true])),
    ...user.capabilities
  }
}

export async function updateMemberCapabilities(memberId, capabilities) {
  return mongo.db.collection('users').updateOne(
    {_id: memberId},
    {
      $set: {
        capabilities
      }
    }
  )
}

/**
 * Expose member fields to other non-admin members
 */
export function exposeMemberToOthers(member) {
  return {
    _id: member._id,
    firstName: member.firstName,
    lastName: member.lastName,
    created: member.created,
    picture: member.picture,
    thumbnail: member.thumbnail,
    polaroid: member.polaroid,
    lastSeen: member.lastSeen,
    location: member.location,
    attending: member.attending,

    // TODO: remove once most of users have updated their mobile app
    balance: 1,
    membershipOk: true
  }
}

/**
 * Anonymise member fields to be used in public API
 */
export function anonymizeMember(member) {
  const today = formatDate(new Date())

  return {
    lastSeen: member.lastSeen,
    location: member.location,
    attending: member.attending,
    // Randomize names each day
    firstName: getRandomFirstname(member.firstName + today),
    lastName: getRandomLastname(member.lastName + today),
    // Only expose the year
    created: setYear(new Date('1970-01-02'), member.created.getFullYear()).toISOString(),
    // Default picture as polaroid
    polaroid: getAnonymousPictureUrl(),

    // TODO: remove once most of users have updated their mobile app
    balance: 1,
    membershipOk: true
  }
}

const getActivityCacheKey = memberId => `member-${memberId}-activity`

export async function computeMemberActivityCoverage(memberId) {
  console.log(`Computing activity coverage for member ${memberId}`)
  const rawActivity = await Activity.getMemberRawActivity(memberId)
  const subscriptions = await Subscription.getMemberSubscriptions(memberId)
  const ticketsOrders = await Ticket.getMemberTickets(memberId)

  // Sort tickets and activity to get the older ones first
  // to be in line with FIFO consumption
  const sortedTicketsOrders = ticketsOrders.sort((a, b) => new Date(a.purchased) - new Date(b.purchased))
  const sortedActivity = rawActivity.sort((a, b) => new Date(a.date) - new Date(b.date))

  const activityWithCoverage = sortedActivity.map(a => {
    const duration = a.overrideValue ?? a.value

    // Find a subscription that covers this date
    const coveredBySubscriptions = subscriptions.filter(s => isWithinInterval(parseISO(a.date), {
      start: parseISO(s.started),
      end: parseISO(s.ended)
    }))
    if (coveredBySubscriptions.length > 0) {
      const subscriptionActivity = {
        type: 'subscription',
        date: a.date,
        value: duration,
        coverage: {
          subscriptions: coveredBySubscriptions
        }
      }
      return subscriptionActivity
    }

    // Otherwise consume tickets
    const ticketActivity = consumeTicketsByActivity(sortedTicketsOrders, {
      type: 'ticket',
      date: a.date,
      value: duration,
      coverage: {
        tickets: {
          count: 0,
          amount: 0
        },
        debt: {
          value: duration,
          amount: duration * Ticket.MISSING_TICKET_PRICE_IN_EUR
        }
      }
    })

    return ticketActivity
  })

  await cache.set(getActivityCacheKey(memberId), activityWithCoverage)

  return activityWithCoverage
}

export async function getMemberActivityCoverage(memberId) {
  const cacheKey = getActivityCacheKey(memberId)

  if (await cache.has(cacheKey)) {
    const cachedActivity = await cache.get(cacheKey)
    return cachedActivity
  }

  return computeMemberActivityCoverage(memberId)
}

export async function getComputedMemberActivityAt(memberId, date) {
  const memberActivity = await getMemberActivityCoverage(memberId)
  const activity = memberActivity.find(a => a.date === date)

  if (!activity) {
    const computedMemberActivity = await computeMemberActivityCoverage(memberId)
    return computedMemberActivity.find(a => a.date === date)
  }

  return activity
}

/**
 * Recursively consume ticket orders
 * with the given activity.
 *
 * @param {Array} tickets Array of tickets, each with unitAmount and any count value. The array will be mutated (tickets are consumed and may be modified).
 * @param {Object} activity Single activity to consume tickets for, with a debt to pay.
 * @returns the activity with coverage updated.
 */
function consumeTicketsByActivity(tickets, activity) {
  if (tickets.length === 0) {
    return activity
  }

  const remainingDebt = activity.coverage.debt?.value
  if (!remainingDebt) {
    return {
      ...activity,
      coverage: {
        ...activity.coverage,
        debt: null // Clear debt
      }
    }
  }

  const ticket = tickets.shift()
  if (ticket.count >= remainingDebt) {
    // Ticket can cover the full activity
    if (ticket.count > remainingDebt) {
      // Put back the remaining part of the ticket
      tickets.unshift({
        ...ticket,
        count: ticket.count - remainingDebt
      })
    }

    return {
      ...activity,
      coverage: {
        ...activity.coverage,
        tickets: {
          count: (activity.coverage.tickets.count ?? 0) + remainingDebt,
          amount: (activity.coverage.tickets.amount ?? 0) + (remainingDebt * ticket.unitAmount)
        },
        debt: null // Clear debt
      }
    }
  }

  // Ticket can only cover part of the activity
  const remainingActivity = {
    ...activity,
    coverage: {
      ...activity.coverage,
      tickets: {
        count: (activity.coverage.tickets.count ?? 0) + ticket.count,
        amount: (activity.coverage.tickets.amount ?? 0) + (ticket.count * ticket.unitAmount)
      },
      // Reduce the remaining debt
      debt: {
        value: remainingDebt - ticket.count,
        amount: (remainingDebt - ticket.count) * Ticket.MISSING_TICKET_PRICE_IN_EUR
      }
    }
  }

  return consumeTicketsByActivity(tickets, remainingActivity)
}
