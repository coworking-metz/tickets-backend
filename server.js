#!/usr/bin/env node
require('dotenv').config()

const crypto = require('crypto')
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const Papa = require('papaparse')
const session = require('express-session')
const {add} = require('date-fns')
const MongoStore = require('connect-mongo')
const passport = require('passport')
const got = require('got')

const mongo = require('./lib/util/mongo')
const w = require('./lib/util/w')
const errorHandler = require('./lib/util/error-handler')
const cache = require('./lib/cache')
const netatmo = require('./lib/netatmo')
const {coworkersNow, resolveUser, getUserStats, getUserPresences, heartbeat, getMacAddresses, getMacAddressesLegacy, getCollectionsData, updatePresence, notify, purchaseWebhook, getUsersStats, getCurrentUsers, getVotingCoworkers} = require('./lib/api')
const {checkToken} = require('./lib/auth')

const {parseFromTo} = require('./lib/dates')
const {computeIncomes} = require('./lib/models')
const {computeStats, computePeriodsStats, asCsv} = require('./lib/stats')

const adminTokens = process.env.ADMIN_TOKENS ? process.env.ADMIN_TOKENS.split(',').filter(Boolean) : undefined

async function main() {
  await mongo.connect()
  await cache.load()
  require('./lib/util/passport').config()

  const app = express()

  app.use(cors({origin: true}))

  const sessionOptions = {
    cookie: {
      expires: add(new Date(), {days: 14}),
      httpOnly: false
    },
    resave: false,
    saveUninitialized: false,
    secret: process.env.SESSION_SECRET,
    store: MongoStore.create({client: mongo.client})
  }

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
  }

  if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'))
  }

  app.use(session(sessionOptions))
  app.use(passport.initialize())
  app.use(passport.session())

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

  app.get('/netatmo/stations', w(async (req, res) => {
    if (!netatmo.isAvailable()) {
      return res.status(500).send({code: 500, message: 'Non disponible. Netatmo n’est pas configuré.'})
    }

    const stations = await netatmo.getStations()
    res.send(stations)
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
      const computedSignature = crypto.createHmac('sha256', process.env.WP_WC_WEBHOOK_SECRET)
        .update(buf, 'utf8')
        .digest('base64')

      if (req.get('x-wc-webhook-signature') !== computedSignature) {
        throw new Error('Webhook signature mismatch')
      }
    }
  })
  app.post('/api/purchase-webhook', validateAndParseJson, w(purchaseWebhook))

  app.get('/api/login', passport.authenticate('wordpress'))
  app.get('/api/login/return', passport.authenticate('wordpress', {
    successRedirect: '/api/me',
    failureRedirect: '/'
  }))

  app.get('/api/me', (req, res) => {
    if (!req.user) {
      return res.sendStatus(401)
    }

    res.send(req.user)
  })

  app.get('/api/token', checkToken(adminTokens), (req, res) => {
    res.send({status: 'ok'})
  })

  app.post('/api/interphone', checkToken(adminTokens), w(async (req, res) => {
    await got.post(process.env.INTERPHONE_URL)
    res.status(202).send({message: 'Ouverture du portail demandée'})
  }))

  app.use(errorHandler)

  const port = process.env.PORT || 5000

  app.listen(port, () => {
    console.log(`Start listening on port ${port}!`)
  })

  // Précalcul des données
  if (process.env.PRECOMPUTE_STATS === '1') {
    await Promise.all([...PERIODS_TYPES].map(periodType => computePeriodsStats(periodType)))
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
