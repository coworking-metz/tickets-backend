#!/usr/bin/env node
import 'dotenv/config.js'

import process from 'node:process'

import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import {add} from 'date-fns'
import createHttpError from 'http-errors'

import mongo from './lib/util/mongo.js'
import w from './lib/util/w.js'
import errorHandler from './lib/util/error-handler.js'
import {setupPassport} from './lib/util/passport.js'
import {validateAndParseJson} from './lib/util/woocommerce.js'

import statsRoutes from './lib/routes/stats.js'
import onPremiseRoutes from './lib/routes/on-premise.js'

import * as Member from './lib/models/member.js'

import cache from './lib/util/cache.js'

import {
  coworkersNow,
  getAllMembers,
  getMemberInfos,
  getMemberActivity,
  getMemberTickets,
  getMemberSubscriptions,
  getMemberMemberships,
  heartbeat,
  getMacAddressesLegacy,
  updatePresence,
  getFlag,
  purchaseWebhook,
  presenceWebhook,
  syncUserWebhook,
  forceWordpressSync,
  getUsersStats,
  getCurrentMembers,
  getVotingMembers,
  getMemberMacAddressesDetails,
  updateMemberMacAddresses,
  updateMemberSubscription,
  getMemberAuditTrail,
  getAllAuditEvents,
  updateMemberTicket,
  updateMemberCapabilities,
  getMemberCapabilities,
  updateMemberActivity,
  updateMemberMembership,
  addMemberMembership
} from './lib/api.js'

import {ensureToken, ensureAdmin, multiAuth, authRouter, ensureAccess} from './lib/auth.js'
import {ping} from './lib/ping.js'
import {precomputeStats} from './lib/stats.js'
import {pressRemoteButton} from './lib/services/shelly-parking-remote.js'
import {getOpenSpaceSensorsFormattedAsNetatmo, pressIntercomButton} from './lib/services/home-assistant.js'
import {getAllEvents} from './lib/services/calendar.js'
import {logAuditTrail} from './lib/models/audit.js'

await mongo.connect()
await cache.load()

const app = express()

app.use(cors({origin: true}))

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.param('userId', w(async (req, res, next) => {
  const {userId} = req.params

  req.rawUser = await Member.getUserById(userId)

  // Not all users have a wordpressId
  if (!req.rawUser && /^\d+$/.test(userId)) {
    const wordpressId = Number.parseInt(userId, 10)
    req.rawUser = await Member.getUserByWordpressId(wordpressId)
  }

  if (!req.rawUser) {
    throw createHttpError(404, 'User not found')
  }

  next()
}))

/* Public access */

app.use('/stats', statsRoutes)
app.get('/coworkersNow', w(coworkersNow)) // Legacy

/* General purpose */

app.get('/api/members', w(multiAuth), w(ensureAdmin), w(getAllMembers))
app.get('/api/members/:userId', w(multiAuth), w(ensureAccess), w(getMemberInfos))
app.get('/api/members/:userId/audit', w(multiAuth), w(ensureAdmin), w(getMemberAuditTrail))
app.get('/api/members/:userId/activity', w(multiAuth), w(ensureAccess), w(getMemberActivity))
app.put('/api/members/:userId/activity/:date', express.json(), w(multiAuth), w(ensureAdmin), w(updateMemberActivity))
app.get('/api/members/:userId/tickets', w(multiAuth), w(ensureAccess), w(getMemberTickets))
app.put('/api/members/:userId/tickets/:ticketId', express.json(), w(multiAuth), w(ensureAdmin), w(updateMemberTicket))
app.get('/api/members/:userId/subscriptions', w(multiAuth), w(ensureAccess), w(getMemberSubscriptions))
app.put('/api/members/:userId/subscriptions/:subscriptionId', express.json(), w(multiAuth), w(ensureAdmin), w(updateMemberSubscription))
app.get('/api/members/:userId/memberships', w(multiAuth), w(ensureAccess), w(getMemberMemberships))
app.post('/api/members/:userId/memberships', express.json(), w(multiAuth), w(ensureAdmin), w(addMemberMembership))
app.put('/api/members/:userId/memberships/:membershipId', express.json(), w(multiAuth), w(ensureAdmin), w(updateMemberMembership))
app.put('/api/members/:userId/mac-addresses', express.json(), w(multiAuth), w(ensureAccess), w(updateMemberMacAddresses))
app.get('/api/members/:userId/capabilities', w(multiAuth), w(ensureAdmin), w(getMemberCapabilities))
app.put('/api/members/:userId/capabilities', express.json(), w(multiAuth), w(ensureAdmin), w(updateMemberCapabilities))
app.post('/api/members/:userId/sync-wordpress', w(multiAuth), w(ensureAccess), w(forceWordpressSync))
app.get('/api/members/:userId/mac-addresses', express.json(), w(multiAuth), w(ensureAccess), w(getMemberMacAddressesDetails))

app.get('/api/voting-members', w(multiAuth), w(ensureAdmin), w(getVotingMembers))
app.get('/api/users-stats', w(multiAuth), w(ensureAdmin), w(getUsersStats))
app.get('/api/current-members', w(multiAuth), w(getCurrentMembers))

/* Audit */
app.get('/api/audit', w(multiAuth), w(ensureAdmin), w(getAllAuditEvents))

/* Presences */

app.post('/api/heartbeat', express.urlencoded({extended: false}), w(ensureToken), w(heartbeat))
app.post('/api/mac', express.urlencoded({extended: false}), w(ensureToken), w(getMacAddressesLegacy))
app.post('/api/presence', express.urlencoded({extended: false}), w(ensureToken), w(updatePresence))

/* Webhooks */

app.get('/api/flags/:flagId', express.urlencoded({extended: false}), w(multiAuth), w(ensureAdmin), w(getFlag))
app.post('/api/presence-webhook', express.json(), w(multiAuth), w(ensureAdmin), w(presenceWebhook))
app.post('/api/purchase-webhook', validateAndParseJson, w(purchaseWebhook))
app.post('/api/sync-user-webhook', validateAndParseJson, w(syncUserWebhook))

/* Services */

app.post('/api/interphone', w(multiAuth), w(ensureAccess), w(async (req, res) => {
  if (!req.isAdmin && !req.user?.capabilities.includes('UNLOCK_GATE')) {
    throw createHttpError(403, 'Forbidden')
  }

  // At least log who is pressing intercom button
  console.log(`${req.user?.email || 'Someone'} is pressing intercom button`)

  await pressIntercomButton()

  logAuditTrail(req.user, 'UNLOCK_GATE')

  const now = new Date()
  res.send({
    triggered: now.toISOString(),
    locked: add(now, {seconds: 3}).toISOString(),
    timeout: 'PT3S'
  })
}))

app.post('/api/parking', w(multiAuth), w(ensureAccess), w(async (req, res) => {
  if (!req.isAdmin && !req.user?.capabilities.includes('PARKING_ACCESS')) {
    throw createHttpError(403, 'Forbidden')
  }

  // At least log who is opening parking gate
  console.log(`${req.user?.email || 'Someone'} is opening parking gate`)

  await pressRemoteButton()

  logAuditTrail(req.user, 'PARKING_ACCESS')

  const now = new Date()
  res.send({
    triggered: now.toISOString(),
    closed: add(now, {seconds: 60}).toISOString(),
    timeout: 'PT60S' // Didn't count yet but I suspect a 60 seconds period
  })
}))

app.get('/netatmo/stations', w(async (req, res) => {
  const sensors = await getOpenSpaceSensorsFormattedAsNetatmo()
  res.send(sensors)
}))

app.use('/api/on-premise', w(multiAuth), onPremiseRoutes)

app.get('/api/calendar/events', w(multiAuth), w(getAllEvents))

/* Util */

app.get('/api/ping', w(ping))

/* Auth */

if (process.env.OAUTH_ENABLED === '1') {
  setupPassport()
  app.use('/api/auth', authRouter())
} else {
  console.warn('Warning: OAuth is disabled. Users will not be to login by themself.')
}

app.use(errorHandler)

const port = process.env.PORT || 8000

app.listen(port, () => {
  console.log(`Start listening on port ${port}!`)
})

// Précalcul des données
if (process.env.PRECOMPUTE_STATS === '1') {
  await precomputeStats()
}
