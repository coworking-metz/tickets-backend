import {isValid, isWithinInterval, parseISO, sub} from 'date-fns'
import {chain, groupBy, isEqual, isNil, keyBy, xor} from 'lodash-es'

import {createFlag, getFlagResponse} from './util/flags.js'
import mongo from './util/mongo.js'

import createHttpError from 'http-errors'
import {parseFromTo} from './dates.js'
import * as Activity from './models/activity.js'
import * as Audit from './models/audit.js'
import * as Device from './models/device.js'
import * as Member from './models/member.js'
import * as Membership from './models/membership.js'
import * as Purchase from './models/purchase.js'
import * as Subscription from './models/subscription.js'
import * as Ticket from './models/ticket.js'
import {isMacAddress, isValidDateOrPeriod} from './util/tools.js'

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

export async function getAllMembers(req, res) {
  const members = await Member.getAllMembers()
  res.send(members)
}

export async function getMemberInfos(req, res) {
  const member = await Member.getMemberById(req.rawUser._id)
  res.send(member)
}

export async function getMemberActivity(req, res) {
  const activity = await Activity.getMemberActivity(req.rawUser._id)
  res.send(activity)
}

export async function getMemberActivityCoverage(req, res) {
  const activityWithCoverage = await Member.computeMemberActivityCoverage(req.rawUser._id)
  res.send(activityWithCoverage)
}

export async function addMemberActivity(req, res) {
  const {userId} = req.params
  const {value, comment, date} = req.body

  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  const previousActivity = await Activity.getMemberActivityByDate(userId, date)
  if (previousActivity) {
    throw createHttpError(409, `Activity for this date ${date} already exists`)
  }

  const createdActivity = await Activity.updateMemberActivity(userId, date, value)

  Audit.logAuditTrail(req.user, 'MEMBER_ACTIVITY_ADD', {
    memberId: userId,
    activity: createdActivity,
    comment
  })

  // Mise à jour de la balance de tickets
  await Member.recomputeBalance(userId)

  res.send(createdActivity)
}

export async function updateMemberActivity(req, res) {
  const {date, userId} = req.params
  const {value: overrideValue, comment} = req.body

  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  const previousActivity = await Activity.getMemberActivityByDate(userId, date)
  if (!previousActivity) {
    throw createHttpError(404, `No activity for this date ${date}`)
  }

  const updatedActivity = await Activity.updateMemberActivity(userId, date, previousActivity.value, overrideValue)

  Audit.logAuditTrail(req.user, 'MEMBER_ACTIVITY_UPDATE', {
    memberId: userId,
    activity: updatedActivity,
    previousActivity,
    comment
  })

  // Mise à jour de la balance de tickets
  await Member.recomputeBalance(userId)

  res.send(updatedActivity)
}

export async function getMemberSubscriptions(req, res) {
  const subscriptions = await Subscription.getMemberSubscriptions(req.rawUser._id)
  const memberActivity = await Activity.getMemberActivity(req.rawUser._id)
  const allSubscriptionActivities = memberActivity.filter(a => a.type === 'subscription')
  const subscriptionsWithActivity = subscriptions.map(subscription => {
    const activitiesWithinSubscription = allSubscriptionActivities
      .filter(a => isWithinInterval(parseISO(a.date), {
        start: parseISO(subscription.started),
        end: parseISO(subscription.ended)
      }))

    const totalActivityWithinSubscription = activitiesWithinSubscription
      .reduce((acc, a) => acc + a.value, 0)

    // Member could have spent 10 tickets for the same amount IN THEORY
    const savingsOverTickets = (totalActivityWithinSubscription - 10) * (subscription.amount / 10)

    return {
      ...subscription,
      activityCount: totalActivityWithinSubscription,
      // Number of times the member attended the working space
      attendanceCount: activitiesWithinSubscription.length,
      savingsOverTickets
    }
  })

  res.send(subscriptionsWithActivity)
}

export async function addMemberSubscription(req, res) {
  const memberId = req.rawUser._id
  const {started, orderReference, comment, amount, purchased} = req.body
  const startDate = new Date(started)
  if (!isValid(new Date(startDate))) {
    throw createHttpError(400, `Invalid startDate ${startDate}`)
  }

  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  if (!purchased) {
    throw createHttpError(400, 'Missing purchase date')
  }

  if (isNil(amount) || amount < 0) {
    throw createHttpError(400, 'Invalid amount')
  }

  const [insertedSubscription] = await Subscription.addSubscriptionsToMember(
    memberId,
    startDate.toISOString().slice(0, 10),
    {
      price: amount,
      orderReference,
      productType: 'subscription',
      purchaseDate: purchased
    },
    1
  )

  // TODO: remove this legacy update once "abos" has been removed from the users collection
  await Subscription.addSubscriptionsToMemberLegacy(
    memberId,
    purchased,
    insertedSubscription.started,
    1
  ).catch(() => {
    // Ignore errors here - this is just for legacy data consistency
  })

  const formattedSubscription = Subscription.formatSubscription(insertedSubscription)

  Audit.logAuditTrail(req.user, 'MEMBER_SUBSCRIPTION_ADD', {
    memberId,
    subscriptionId: insertedSubscription._id,
    startDate: insertedSubscription.startDate,
    subscription: formattedSubscription,
    comment
  })

  res.send(formattedSubscription)
}

export async function updateMemberSubscription(req, res) {
  const memberId = req.rawUser._id
  const subscriptions = await Subscription.getMemberSubscriptions(memberId)

  const {subscriptionId} = req.params
  const subscription = subscriptions.find(subscription => subscription._id === subscriptionId)

  if (!subscription) {
    throw createHttpError(404, `Subscription ${subscriptionId} not found`)
  }

  const startDate = new Date(req.body.started)
  if (!isValid(new Date(startDate))) {
    throw createHttpError(400, `Invalid startDate ${startDate}`)
  }

  const {comment, amount, orderReference, purchased} = req.body
  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  if (!purchased) {
    throw createHttpError(400, 'Missing purchase date')
  }

  if (isNil(amount) || amount < 0) {
    throw createHttpError(400, 'Invalid amount')
  }

  const updatedSubscription = await Subscription.updateSubscription(subscriptionId, {
    startDate: startDate.toISOString().slice(0, 10),
    price: amount,
    orderReference,
    purchaseDate: purchased
  })
  const formattedSubscription = Subscription.formatSubscription(updatedSubscription)

  // TODO: remove this legacy update once "abos" has been removed from the users collection
  await Subscription.updateAboStartDateInUserLegacy(
    memberId,
    subscription.started,
    updatedSubscription.startDate
  ).catch(() => {
    // Ignore errors here - this is just for legacy data consistency
  })

  Audit.logAuditTrail(req.user, 'MEMBER_SUBSCRIPTION_UPDATE', {
    memberId,
    subscriptionId,
    startDate: updatedSubscription.startDate,
    previousStartDate: subscription.started,
    subscription: formattedSubscription,
    previousSubscription: subscription,
    comment
  })

  await Member.recomputeBalance(memberId)

  res.send(formattedSubscription)
}

export async function removeMemberSubscription(req, res) {
  const memberId = req.rawUser._id
  const subscriptions = await Subscription.getMemberSubscriptions(memberId)

  const {subscriptionId} = req.params
  const subscription = subscriptions.find(subscription => subscription._id === subscriptionId)

  if (!subscription) {
    throw createHttpError(404, `Subscription ${subscriptionId} not found`)
  }

  const {comment} = req.body
  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  await Subscription.removeSubscription(subscriptionId)
  Audit.logAuditTrail(req.user, 'MEMBER_SUBSCRIPTION_REMOVE', {
    memberId,
    subscriptionId,
    subscription,
    comment
  })

  await Member.recomputeBalance(memberId)
  res.status(204).send()
}

export async function getMemberTicketsOrders(req, res) {
  const tickets = await Ticket.getMemberTickets(req.rawUser._id)
  res.send(tickets)
}

export async function addMemberTicketsOrder(req, res) {
  const memberId = req.rawUser._id
  const {count, comment} = req.body

  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  const [insertedTicketOrder] = await Ticket.addTicketsToMember(memberId, count, {
    price: 0,
    orderReference: null,
    productType: 'ticketsFromManager',
    purchaseDate: formatDate(new Date())
  })

  Audit.logAuditTrail(req.user, 'MEMBER_TICKET_ADD', {
    memberId,
    ticketId: insertedTicketOrder._id,
    count,
    comment
  })

  await Member.recomputeBalance(memberId)

  res.send(insertedTicketOrder)
}

export async function updateMemberTicketsOrder(req, res) {
  const memberId = req.rawUser._id
  const tickets = await Ticket.getMemberTickets(memberId)

  const {ticketId} = req.params
  const ticket = tickets.find(ticket => ticket._id === ticketId)

  if (!ticket) {
    throw createHttpError(404, `Ticket ${ticketId} not found`)
  }

  const {count, amount, orderReference, comment, purchased} = req.body
  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  if (!purchased) {
    throw createHttpError(400, 'Missing purchase date')
  }

  if (isNil(amount) || amount < 0) {
    throw createHttpError(400, 'Invalid amount')
  }

  const updatedTicket = await Ticket.updateTicket(ticketId, {
    ticketsQuantity: count,
    price: amount,
    orderReference,
    purchaseDate: purchased
  })
  const formattedTicket = Ticket.formatTicket(updatedTicket)

  Audit.logAuditTrail(req.user, 'MEMBER_TICKET_UPDATE', {
    memberId,
    ticketId,
    count: formattedTicket.count,
    previousCount: ticket.count,
    ticket: formattedTicket,
    previousTicket: ticket,
    comment
  })

  await Member.recomputeBalance(memberId)

  res.send(formattedTicket)
}

export async function removeMemberTicketsOrder(req, res) {
  const memberId = req.rawUser._id
  const ticketsOrders = await Ticket.getMemberTickets(memberId)

  const {ticketId} = req.params
  const ticketsOrder = ticketsOrders.find(ticket => ticket._id === ticketId)

  if (!ticketsOrder) {
    throw createHttpError(404, `Tickets order ${ticketId} not found`)
  }

  const {comment} = req.body
  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  await Ticket.removeTicket(ticketId)
  Audit.logAuditTrail(req.user, 'MEMBER_TICKET_REMOVE', {
    memberId,
    ticketId,
    ticketsOrder,
    comment
  })

  await Member.recomputeBalance(memberId)
  res.status(204).send()
}

export async function getMemberMemberships(req, res) {
  const memberships = await Membership.getMemberMemberships(req.rawUser._id)
  res.send(memberships)
}

export async function addMemberMembership(req, res) {
  const memberId = req.rawUser._id
  const {membershipStart, orderReference, comment, amount, purchased} = req.body

  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  if (!purchased) {
    throw createHttpError(400, 'Missing purchase date')
  }

  if (isNil(amount) || amount < 0) {
    throw createHttpError(400, 'Invalid amount')
  }

  const newMembershipYear = new Date(membershipStart).getFullYear()
  const memberships = await Membership.getMemberMemberships(memberId)
  const existingMembership = memberships
    .find(m => new Date(m.membershipStart).getFullYear() === newMembershipYear)

  if (existingMembership) {
    throw createHttpError(400, `Membership already exists for year ${newMembershipYear}`)
  }

  const [insertedMembership] = await Membership.addMembershipToMember(memberId, membershipStart, {
    price: amount,
    orderReference,
    productType: 'membership',
    purchaseDate: purchased
  })
  const formattedMembership = Membership.formatMembership(insertedMembership)

  Audit.logAuditTrail(req.user, 'MEMBER_MEMBERSHIP_ADD', {
    memberId,
    membershipId: insertedMembership._id,
    orderReference,
    membershipStart,
    membership: formattedMembership,
    comment
  })

  res.send(formattedMembership)
}

export async function updateMemberMembership(req, res) {
  const memberId = req.rawUser._id
  const memberships = await Membership.getMemberMemberships(memberId)

  const {membershipId} = req.params
  const membership = memberships.find(m => m._id === membershipId)

  if (!membership) {
    throw createHttpError(404, `Membership ${membershipId} not found`)
  }

  const {membershipStart, comment, amount, orderReference, purchased} = req.body
  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  if (!purchased) {
    throw createHttpError(400, 'Missing purchase date')
  }

  if (isNil(amount) || amount < 0) {
    throw createHttpError(400, 'Invalid amount')
  }

  const newMembershipYear = new Date(membershipStart).getFullYear()
  const existingMembership = memberships
    .filter(m => m._id !== membershipId)
    .find(m => new Date(m.membershipStart).getFullYear() === newMembershipYear)
  if (existingMembership) {
    throw createHttpError(400, `Membership already exists for year ${newMembershipYear}`)
  }

  const updatedMembership = await Membership.updateMembership(membershipId, {
    membershipStart,
    price: amount,
    orderReference,
    purchaseDate: purchased
  })
  const formattedMembership = Membership.formatMembership(updatedMembership)

  Audit.logAuditTrail(req.user, 'MEMBER_MEMBERSHIP_UPDATE', {
    memberId,
    membershipId,
    membershipStart: formattedMembership.membershipStart,
    previousMembershipStart: membership.membershipStart,
    membership: formattedMembership,
    previousMembership: membership,
    comment
  })

  res.send(formattedMembership)
}

export async function removeMemberMembership(req, res) {
  const memberId = req.rawUser._id
  const memberships = await Membership.getMemberMemberships(memberId)

  const {membershipId} = req.params
  const membership = memberships.find(m => m._id === membershipId)
  if (!membership) {
    throw createHttpError(404, `Membership ${membershipId} not found`)
  }

  const {comment} = req.body
  if (!comment) {
    throw createHttpError(400, 'Missing comment')
  }

  await Membership.removeMembership(membershipId)
  Audit.logAuditTrail(req.user, 'MEMBER_MEMBERSHIP_REMOVE', {
    memberId,
    membershipId,
    membership,
    comment
  })

  res.status(204).send()
}

export async function updateMemberMacAddresses(req, res) {
  const memberId = req.rawUser._id
  const previousMacAddresses = await Device.getMacAddressesOfMember(memberId)
  const macAddresses = await Device.assignMacAddressesToMember(memberId, req.body)

  if (xor(previousMacAddresses, macAddresses).length > 0) {
    Audit.logAuditTrail(req.user, 'MEMBER_MAC_ADDRESSES_UPDATE', {
      memberId,
      previousMacAddresses,
      macAddresses
    })
  }

  res.send(macAddresses)
}

export async function getMemberDevices(req, res) {
  const devices = await Device.getMemberDevices(req.rawUser._id)
  res.send(devices)
}

export async function forceWordpressSync(req, res) {
  await Member.syncWithWordpress(req.rawUser._id)
  const member = await Member.getMemberById(req.rawUser._id)
  res.send(member)
}

export async function heartbeat(req, res) {
  const macAddresses = req.body.macAddresses.split(',')
  const {location} = req.body
  await Device.heartbeatDevicesByMacAddresses(macAddresses, location)
  res.sendStatus(200)
}

export async function getMacAddressesLegacy(req, res) {
  const assignedDevices = await Device.getAssignedDevices()
  const indexedDevices = groupBy(assignedDevices, 'member')

  const members = await mongo.db.collection('users')
    .find()
    .project({firstName: 1, lastName: 1, email: 1})
    .toArray()

  const rows = []

  for (const member of members) {
    const memberDevices = indexedDevices[member._id]

    if (memberDevices) {
      for (const device of memberDevices) {
        rows.push([
          device.macAddress.toUpperCase(),
          member.email,
          member.firstName,
          member.lastName
        ])
      }
    }
  }

  res.type('text/csv').send(rows.map(row => row.join('\t')).join('\n'))
}

export async function updatePresence(req, res) {
  if (!req.body.email) {
    throw createHttpError(400, 'Missing email')
  }

  const {date, email} = req.body
  const value = Number.parseFloat(req.body.amount)

  const userId = await Member.getUserIdByEmail(email)

  if (!userId) {
    throw createHttpError(404, 'Member not found')
  }

  const user = await Member.getUserById(userId)
  const {trialDay} = user
  const overrideValue = trialDay && trialDay === date ? 0 : value

  await Activity.updateMemberActivity(userId, date, value, overrideValue)

  // Mise à jour de la balance de tickets
  await Member.recomputeBalance(userId)

  res.sendStatus(200)
}

export async function syncUserWebhook(req, res) {
  const wpUserId = Number(req.body?.wpUserId || req.query?.wpUserId)
  if (!wpUserId) {
    throw createHttpError(400, 'Missing "wpUserId" parameter')
  }

  const user = await mongo.db.collection('users').findOne({wpUserId}, {projection: {_id: 1}})

  if (!user?._id) {
    throw createHttpError(404, `User ${wpUserId} not found`)
  }

  await Member.syncWithWordpress(user._id)

  res.sendStatus(200)
}

export async function getFlag(req, res) {
  const {flagId} = req.params

  const response = await getFlagResponse(flagId)
  res.send(response)
}

export async function presenceWebhook(req, res) {
  const {action} = req.body
  let flag = false
  // We want to trigger the reupload of presences for the given MAC Address
  if (action === 'mac') {
    let {mac, period} = req.body

    // Si period est null ou non défini, définir period à l'année en cours
    period = period ?? new Date().getFullYear()

    if (!isMacAddress(mac)) {
      throw createHttpError(400, 'Invalid MAC ' + mac)
    }

    if (!isValidDateOrPeriod(period)) {
      throw createHttpError(400, 'Invalid period ' + period)
    }

    flag = await createFlag('presences-mac', {mac, period}, req)
  }

  // We want to trigger the reupload of presences for the given date range
  if (action === 'daterange') {
    const {start, end} = req.body
    if (!isValidDateOrPeriod(start) || !isValidDateOrPeriod(end)) {
      throw createHttpError(400, 'Invalid date range ' + start + ' => ' + end)
    }

    flag = await createFlag('presences-daterange', {start, end}, req)
  }

  // We want to trigger the (re)upload of presences of the current day
  if (action === 'day') {
    flag = await createFlag('presences-day', {}, req)
  }

  if (flag) {
    return res.send(flag)
  }

  throw createHttpError(400, 'Unknown action ' + action)
}

export async function purchaseWebhook(req, res) {
  if (req.body.status !== 'completed') {
    return res.sendStatus(200)
  }

  const items = req.body.line_items
  const orderReference = req.body.number
  const purchaseDate = req.body.date_completed.slice(0, 10)

  const wpUserId = req.body.customer_id
  const userId = await Member.reconcileWithWordpressId(wpUserId)

  await Promise.all(items.map(async item => {
    const {quantity, productType} = item
    const purchase = Purchase.formatPurchase(orderReference, purchaseDate, item)

    if (productType === 'singleTicket') {
      await Ticket.addTicketsToMember(userId, 1, purchase, quantity)
    }

    if (productType === 'ticketsBook') {
      await Ticket.addTicketsToMember(userId, 10, purchase, quantity)
    }

    if (productType === 'subscription') {
      const startDate = extractDateDebutAbonnement(item)
      await Subscription.addSubscriptionsToMember(userId, startDate || purchaseDate, purchase, quantity)
    }

    if (productType === 'membership') {
      const membershipStart = purchaseDate
      await Membership.addMembershipToMember(userId, membershipStart, purchase, quantity)
    }
  }))

  await Member.recomputeBalance(userId)

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

  const sortOrder = sort === 'createdAt' ? 1 : -1
  const period = ['all-time', 'last-30-days', 'last-90-days', 'last-180-days', 'last-365-days'].includes(req.query.period)
    ? req.query.period
    : 'all-time'

  const aggregateSteps = [
  ]

  if (req.query.from || req.query.to) {
    const dateQuery = {}

    if (req.query.from) {
      dateQuery.$gte = req.query.from
    }

    if (req.query.to) {
      dateQuery.$lte = req.query.to
    }

    aggregateSteps.push({
      $match: {date: dateQuery}
    })
  }

  if (period !== 'all-time') {
    const numDays = Number.parseInt(period.split('-')[1], 10)
    aggregateSteps.push({
      $match: {date: {$gte: formatDate(sub(new Date(), {days: numDays}))}}
    })
  }

  aggregateSteps.push(
    {
      $group: {
        _id: '$member',
        presencesConso: {$sum: '$value'},
        presencesJours: {$sum: 1}
      }
    }
  )

  const aggregateResult = await mongo.db.collection('member_activity').aggregate(aggregateSteps).toArray()
  const indexedUserStats = keyBy(aggregateResult, '_id')

  const users = await Member.getAllUsers()

  res.send(chain(users)
    .map(user => {
      const item = {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
        wpUserId: user.wpUserId,
        email: user.email
      }

      const memberStats = indexedUserStats[user._id]

      if (memberStats) {
        item.presencesConso = memberStats.presencesConso
        item.presencesJours = memberStats.presencesJours
      } else {
        item.presencesConso = 0
        item.presencesJours = 0
      }

      return item
    })
    .sortBy(member => sortOrder * member[sort])
    .value()
  )
}

export async function getCurrentMembers(req, res) {
  const userDefinedDelay = Number.parseInt(req.query.delay, 10)

  if ('delay' in req.query && (!userDefinedDelay || userDefinedDelay < 0)) {
    return res.sendStatus(400)
  }

  const delay = userDefinedDelay || Device.LAST_SEEN_DELAY_IN_MIN
  const currentMembers = await Member.getCurrentMembers(delay)

  if (req.isAdmin) {
    return res.send(currentMembers)
  }

  const isUserAttending = req.user && currentMembers.some(m => m._id === req.user.id && m.attending)
  if (isUserAttending) {
    return res.send(currentMembers.map(m => Member.exposeMemberToOthers(m)))
  }

  const anonymousMembers = currentMembers.map(m => Member.anonymizeMember(m))
  res.send(anonymousMembers)
}

export async function getVotingMembers(req, res) {
  if (req.query.minActivity) {
    const parsedMinActivity = Number.parseFloat(req.query.minActivity, 10)

    if (Number.isNaN(parsedMinActivity) || parsedMinActivity < 10 || parsedMinActivity > 100) {
      return res.status(400).send({code: 400, message: 'minActivity doit être un entier compris entre 10 et 100'})
    }

    req.minActivity = parsedMinActivity
  }

  const minActivity = req.minActivity || 20

  const votingMembers = await Member.getVotingMembers(minActivity)
  res.send(votingMembers)
}

export function convertDate(frDate) {
  return `${frDate.slice(6, 10)}-${frDate.slice(3, 5)}-${frDate.slice(0, 2)}`
}

export async function getAllAuditEvents(req, res) {
  const {from, to} = parseFromTo(req.query.from, req.query.to)
  const events = await Audit.getAllAuditEvents(from, to)

  res.send(events)
}

export async function getMemberAuditTrail(req, res) {
  const {userId} = req.params

  if (!userId) {
    throw createHttpError(400, 'Missing userId')
  }

  const memberEvents = await Audit.getMemberAuditTrail(userId)

  res.send(memberEvents)
}

export async function getMemberCapabilities(req, res) {
  const member = await Member.computeMemberFromUser(req.rawUser, {withAbos: true, withActivity: true})
  const capabilities = Member.computeMemberCapabilitiesFromUser(member, req.rawUser)
  res.send(capabilities)
}

export async function updateMemberCapabilities(req, res) {
  const capabilities = req.body

  if (!capabilities) {
    throw createHttpError(400, 'Missing capabilities')
  }

  const user = req.rawUser
  const member = await Member.computeMemberFromUser(user, {withAbos: true, withActivity: true})
  const previousCapabilities = Member.computeMemberCapabilitiesFromUser(member, user)
  await Member.updateMemberCapabilities(user._id, capabilities)

  if (!isEqual(previousCapabilities, capabilities)) {
    Audit.logAuditTrail(req.user, 'MEMBER_CAPABILITIES_UPDATE', {
      memberId: user._id,
      previousCapabilities,
      capabilities
    })
  }

  res.send(capabilities)
}

export async function updateMemberBadge(req, res) {
  const memberId = req.rawUser._id
  const member = await Member.getMemberById(memberId)
  const previousBadgeId = member.badgeId

  const {badgeId} = req.body

  await Member.updateMemberBadge(memberId, badgeId)

  if (badgeId !== previousBadgeId) {
    Audit.logAuditTrail(req.user, 'MEMBER_BADGE_ID_UPDATE', {
      memberId,
      previousBadgeId,
      badgeId
    })
  }

  res.send({memberId, badgeId})
}

