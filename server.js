#!/usr/bin/env node
import 'dotenv/config.js'

import process from 'node:process'
import {createHmac} from 'node:crypto'

import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import Papa from 'papaparse'
import {add} from 'date-fns'
import got from 'got'

import mongo from './lib/util/mongo.js'
import w from './lib/util/w.js'
import errorHandler from './lib/util/error-handler.js'
import cache from './lib/cache.js'
import {coworkersNow, resolveUser, getUserStats, getUserPresences, heartbeat, getMacAddresses, getMacAddressesLegacy, getCollectionsData, updatePresence, notify, purchaseWebhook, getUsersStats, getCurrentUsers, getVotingCoworkers} from './lib/api.js'
import {checkToken} from './lib/auth.js'
import {parseFromTo} from './lib/dates.js'
import {computeIncomes} from './lib/models.js'
import {computeStats, computePeriodsStats, asCsv} from './lib/stats.js'
import {ping} from './lib/ping.js'
import {pressRemoteButton} from './lib/services/esp32-parking-remote.js'
import {
  isEnabled as netatmoIsEnabled,
  startNetatmoRefreshTokenLoop,
  getStations
} from './lib/services/netatmo.js'

const adminTokens = process.env.ADMIN_TOKENS ? process.env.ADMIN_TOKENS.split(',').filter(Boolean) : undefined

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

app.get('/coworkersNow', w(coworkersNow))
app.post('/coworkersNow', w(coworkersNow))

app.get('/api/coworkers-now', w(coworkersNow))
app.post('/api/coworkers-now', w(coworkersNow))

app.get('/api/user-stats', checkToken(adminTokens), w(resolveUser), w(getUserStats))
app.post('/api/user-stats', express.urlencoded({extended: false}), checkToken(adminTokens), w(resolveUser), w(getUserStats))
app.get('/api/users/:userId/stats', checkToken(adminTokens), w(resolveUser), w(getUserStats))

app.get('/api/user-presences', checkToken(adminTokens), w(resolveUser), w(getUserPresences))
app.post('/api/user-presences', express.urlencoded({extended: false}), checkToken(adminTokens), w(resolveUser), w(getUserPresences))
app.get('/api/users/:userId/presences', checkToken(adminTokens), w(resolveUser), w(getUserPresences))

app.get('/api/voting-coworkers', checkToken(adminTokens), w(getVotingCoworkers))

app.get('/api/users-stats', checkToken(adminTokens), w(getUsersStats))
app.post('/api/users-stats', express.urlencoded({extended: false}), checkToken(adminTokens), w(getUsersStats))

app.get('/api/current-users', checkToken(adminTokens), w(getCurrentUsers))
app.post('/api/current-users', express.urlencoded({extended: false}), checkToken(adminTokens), w(getCurrentUsers))

app.post('/api/heartbeat', express.urlencoded({extended: false}), checkToken(adminTokens), w(heartbeat))
app.get('/api/mac', checkToken(adminTokens), w(getMacAddresses))
app.post('/api/mac', express.urlencoded({extended: false}), checkToken(adminTokens), w(getMacAddressesLegacy))
app.post('/api/presence', express.urlencoded({extended: false}), checkToken(adminTokens), w(updatePresence))
app.post('/api/collections-data', express.urlencoded({extended: false}), checkToken(adminTokens), w(getCollectionsData))
app.post('/api/notify', express.urlencoded({extended: false}), checkToken(adminTokens), w(notify))

const validateAndParseJson = express.json({
  verify(req, res, buf) {
    const computedSignature = createHmac('sha256', process.env.WP_WC_WEBHOOK_SECRET)
      .update(buf, 'utf8')
      .digest('base64')

    if (req.get('x-wc-webhook-signature') !== computedSignature) {
      throw new Error('Webhook signature mismatch')
    }
  }
})
app.post('/api/purchase-webhook', validateAndParseJson, w(purchaseWebhook))

app.get('/api/token', checkToken(adminTokens), (req, res) => {
  res.send({status: 'ok'})
})

app.post('/api/interphone', checkToken(adminTokens), w(async (req, res) => {
  await got.post(process.env.INTERPHONE_URL)
  res.status(202).send({message: 'Ouverture du portail demandée'})
}))

app.post('/api/parking', checkToken(adminTokens), w(async (req, res) => {
  await pressRemoteButton()
  const now = new Date()
  res.send({
    triggered: now.toISOString(),
    closed: add(now, {seconds: 60}).toISOString(),
    timeout: 'PT60S' // Didn't count yet but I suspect a 60 seconds period
  })
}))

app.get('/api/ping', w(ping))

if (netatmoIsEnabled()) {
  startNetatmoRefreshTokenLoop()

  app.get('/netatmo/stations', w(async (req, res) => {
    const stations = await getStations()
    res.send(stations)
  }))
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
