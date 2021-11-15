#!/usr/bin/env node
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const Papa = require('papaparse')
const session = require('express-session')
const {add} = require('date-fns')
const MongoStore = require('connect-mongo')
const passport = require('passport')

const mongo = require('./lib/util/mongo')
const w = require('./lib/util/w')
const cache = require('./lib/cache')
const netatmo = require('./lib/netatmo')
const {coworkersNow, getUserStats, getUserPresences, heartbeat, getMacAddresses, getCollectionsData, updatePresence, notify, purchaseWebhook, getUsersStats} = require('./lib/api')
const {checkKey} = require('./lib/auth')

const {computeStats, computePeriodsStats, asCsv} = require('./lib/stats')

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

    const stats = await computePeriodsStats(periodType)

    if (req.query.format === 'csv') {
      return res.type('text/csv').send(
        Papa.unparse(stats.map(s => asCsv(s)))
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

  app.get('/api/user-stats', checkKey(process.env.PURCHASE_API_KEY), w(getUserStats))
  app.post('/api/user-stats', checkKey(process.env.PURCHASE_API_KEY), express.urlencoded({extended: false}), w(getUserStats))

  app.get('/api/user-presences', checkKey(process.env.PURCHASE_API_KEY), w(getUserPresences))
  app.post('/api/user-presences', checkKey(process.env.PURCHASE_API_KEY), express.urlencoded({extended: false}), w(getUserPresences))

  app.get('/api/users-stats', checkKey(process.env.PURCHASE_API_KEY), w(getUsersStats))
  app.post('/api/users-stats', express.urlencoded({extended: false}), checkKey(process.env.PURCHASE_API_KEY), w(getUsersStats))

  app.post('/api/heartbeat', checkKey(process.env.PRESENCE_API_KEY), express.urlencoded({extended: false}), w(heartbeat))
  app.post('/api/mac', checkKey(process.env.PRESENCE_API_KEY), express.urlencoded({extended: false}), w(getMacAddresses))
  app.post('/api/presence', checkKey(process.env.PRESENCE_API_KEY), express.urlencoded({extended: false}), w(updatePresence))
  app.post('/api/collections-data', checkKey(process.env.PRESENCE_API_KEY), express.urlencoded({extended: false}), w(getCollectionsData))
  app.post('/api/notify', checkKey(process.env.PRESENCE_API_KEY), express.urlencoded({extended: false}), w(notify))

  app.post('/api/purchase-webhook', express.json(), w(purchaseWebhook))
  app.post('/wook', express.json(), w(purchaseWebhook))

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
