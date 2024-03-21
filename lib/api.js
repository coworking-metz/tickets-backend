import {sub} from 'date-fns'
import {keyBy, groupBy, chain} from 'lodash-es'

import mongo from './util/mongo.js'

import * as Member from './models/member.js'
import * as Ticket from './models/ticket.js'
import * as Subscription from './models/subscription.js'
import * as Membership from './models/membership.js'
import * as Device from './models/device.js'
import * as Activity from './models/activity.js'
import createHttpError from 'http-errors'

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

export async function getMemberPresences(req, res) {
  const activity = await Activity.getMemberActivity(req.rawUser._id)
  res.send(activity.map(item => ({
    date: item.date,
    amount: item.value,
    type: item.type === 'subscription' ? 'A' : 'T'
  })))
}

export async function getMemberSubscriptions(req, res) {
  const subscriptions = await Subscription.getMemberSubscriptions(req.rawUser._id)
  res.send(subscriptions)
}

export async function getMemberTickets(req, res) {
  const tickets = await Ticket.getMemberTickets(req.rawUser._id)
  res.send(tickets)
}

export async function updateMemberMacAddresses(req, res) {
  const macAddresses = await Device.assignMacAddressesToMember(req.rawUser._id, req.body)
  res.send(macAddresses)
}

export async function forceWordpressSync(req, res) {
  await Member.syncWithWordpress(req.rawUser._id)
  const member = await Member.getMemberById(req.rawUser._id)
  res.send(member)
}

export async function heartbeat(req, res) {
  const macAddresses = req.body.macAddresses.split(',')
  await Device.heartbeatDevicesByMacAddresses(macAddresses)
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

  await Activity.updateMemberActivity(userId, date, value)

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
    return res.sendStatus(403)
  }

  await Member.syncWithWordpress(user._id)

  res.sendStatus(200)
}

export async function purchaseWebhook(req, res) {
  if (req.body.status !== 'completed') {
    return res.sendStatus(200)
  }

  const items = req.body.line_items
  const purchaseDate = req.body.date_completed.slice(0, 10)

  const wpUserId = req.body.customer_id
  const userId = await Member.reconcileWithWordpressId(wpUserId)

  await Promise.all(items.map(async item => {
    const {quantity, product_id: productId} = item

    if (productId === 3021) {
      await Ticket.addTicketsToMember(userId, purchaseDate, quantity)
      return
    }

    if (productId === 3022) {
      await Ticket.addTicketsToMember(userId, purchaseDate, quantity * 10)
      return
    }

    if (productId === 3023) {
      const startDate = extractDateDebutAbonnement(item)
      await Subscription.addSubscriptionsToMember(userId, purchaseDate, startDate || purchaseDate, quantity)
      return
    }

    if (productId === 3063) {
      const membershipStart = purchaseDate
      await Membership.addMembershipToMember(userId, purchaseDate, membershipStart)
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

  const delay = userDefinedDelay || 10
  const currentMembers = await Member.getCurrentMembers(delay)

  if (req.isAdmin) {
    res.send(currentMembers)
  } else {
    res.send(currentMembers.map(({lastSeen}) => ({
      lastSeen
    })))
  }
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
