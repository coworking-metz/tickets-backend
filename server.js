#!/usr/bin/env node
import 'dotenv/config.js'

import process from 'node:process'

import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import Papa from 'papaparse'
import {add} from 'date-fns'
import createHttpError from 'http-errors'

import mongo from './lib/util/mongo.js'
import w from './lib/util/w.js'
import errorHandler from './lib/util/error-handler.js'
import cache from './lib/cache.js'
import {coworkersNow, getUserStats, getUserPresences, heartbeat, getMacAddresses, getMacAddressesLegacy, updatePresence, notify, purchaseWebhook, syncUserWebhook, getUsersStats, getCurrentUsers, getVotingCoworkers} from './lib/api.js'
import {ensureToken, multiAuth, authRouter} from './lib/auth.js'
import {parseFromTo} from './lib/dates.js'
import {computeIncomes} from './lib/models.js'
import {computeStats, computePeriodsStats, asCsv} from './lib/stats.js'
import {ping} from './lib/ping.js'
import {pressRemoteButton} from './lib/services/shelly-parking-remote.js'
import {getOpenSpaceSensorsFormattedAsNetatmo, pressIntercomButton} from './lib/services/home-assistant.js'
import {setupPassport} from './lib/util/passport.js'
import {validateAndParseJson} from './lib/util/woocommerce.js'

import * as Member from './lib/models/member.js'

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

app.get('/stats', w(async (req, res) => {
  const stats = await computeStats()
  res.send(stats)
}))

const PERIODS_TYPES = new Set(['day', 'week', 'month', 'year'])

app.get('/stats/:periodType', w(async (req, res) => {
  const {periodType} = req.params

  if (!PERIODS_TYPES.has(periodType)) {
    return res.sendStatus(404)
  }

  const {from, to} = parseFromTo(req.query.from, req.query.to)

  const stats = await computePeriodsStats(periodType, {
    includesCurrent: req.query.includesCurrent === '1',
    from,
    to
  })

  if (req.query.format === 'csv') {
    return res.type('text/csv').send(
      Papa.unparse(stats.map(s => asCsv(s)))
    )
  }

  res.send(stats)
}))

app.get('/stats/incomes/:periodType', w(async (req, res) => {
  const {periodType} = req.params

  if (!PERIODS_TYPES.has(periodType)) {
    return res.sendStatus(404)
  }

  const {from, to} = parseFromTo(req.query.from, req.query.to)

  const stats = await computeIncomes(periodType, from, to)

  if (req.query.format === 'csv') {
    return res.type('text/csv').send(
      Papa.unparse(stats.map(s => ({
        date: s.date,
        type: s.type,
        used_tickets: s.data.usedTickets,
        days_abos: s.data.daysAbo,
        incomes: s.data.incomes
      })))
    )
  }

  res.send(stats)
}))

app.param('userId', w(async (req, res, next) => {
  const {userId} = req.params

  req.rawUser = await Member.findById(userId)

  if (!req.rawUser && /^\d+$/.test(userId)) {
    const wordpressId = Number.parseInt(userId, 10)
    req.rawUser = await Member.getUserByWordpressId({wpUserId: wordpressId})
  }

  if (!req.rawUser) {
    throw createHttpError(404, 'User not found')
  }

  next()
}))

async function resolveUserUsingEmail(req, res, next) {
  if (req.rawUser) {
    return next()
  }

  const email = req.method === 'POST' ? req.body.email : req.query.email
  if (!email) {
    throw createHttpError(400, 'Missing email')
  }

  req.rawUser = await Member.getUserByEmail({email})

  if (!req.rawUser) {
    throw createHttpError(404, 'User not found')
  }

  next()
}

app.get('/coworkersNow', w(coworkersNow))

app.get('/api/user-stats', ensureToken, w(resolveUserUsingEmail), w(getUserStats))
app.post('/api/user-stats', express.urlencoded({extended: false}), ensureToken, w(resolveUserUsingEmail), w(getUserStats))
app.get('/api/users/:userId/stats', multiAuth, w(getUserStats))

app.get('/api/user-presences', ensureToken, w(resolveUserUsingEmail), w(getUserPresences))
app.get('/api/users/:userId/presences', multiAuth, w(getUserPresences))

app.get('/api/voting-coworkers', multiAuth, w(getVotingCoworkers))
app.get('/api/users-stats', multiAuth, w(getUsersStats))
app.get('/api/current-users', multiAuth, w(getCurrentUsers))

app.post('/api/heartbeat', express.urlencoded({extended: false}), ensureToken, w(heartbeat))
app.get('/api/mac', multiAuth, w(getMacAddresses))
app.post('/api/mac', express.urlencoded({extended: false}), ensureToken, w(getMacAddressesLegacy))
app.post('/api/presence', express.urlencoded({extended: false}), ensureToken, w(updatePresence))
app.post('/api/notify', express.urlencoded({extended: false}), ensureToken, w(notify))

app.post('/api/purchase-webhook', validateAndParseJson, w(purchaseWebhook))
app.post('/api/sync-user-webhook', ensureToken, w(syncUserWebhook))

app.post('/api/interphone', multiAuth, w(async (req, res) => {
  await pressIntercomButton()
  const now = new Date()
  res.send({
    triggered: now.toISOString(),
    locked: add(now, {seconds: 3}).toISOString(),
    timeout: 'PT3S'
  })
}))

app.post('/api/parking', multiAuth, w(async (req, res) => {
  await pressRemoteButton()
  const now = new Date()
  res.send({
    triggered: now.toISOString(),
    closed: add(now, {seconds: 60}).toISOString(),
    timeout: 'PT60S' // Didn't count yet but I suspect a 60 seconds period
  })
}))

app.get('/api/ping', w(ping))

app.get('/netatmo/stations', w(async (req, res) => {
  const sensors = await getOpenSpaceSensorsFormattedAsNetatmo()
  res.send(sensors)
}))

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
  await Promise.all([...PERIODS_TYPES].map(periodType => computePeriodsStats(periodType)))
}
