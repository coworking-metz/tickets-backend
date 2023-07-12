#!/usr/bin/env node
require('dotenv').config()

const crypto = require('crypto')
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const Papa = require('papaparse')
const session = require('express-session')
const { add } = require('date-fns')
const MongoStore = require('connect-mongo')
const passport = require('passport')
const got = require('got')
const path = require('path');
const mongo = require('./lib/util/mongo')
const w = require('./lib/util/w')
const { ip } = require('./lib/util/network')
const errorHandler = require('./lib/util/error-handler')
const cache = require('./lib/cache')
const netatmo = require('./lib/netatmo')
const { coworkersNow, resolveUser, getUserStats, getUserPresences, heartbeat, getMacAddresses, getMacAddressesLegacy, getCollectionsData, updatePresence, notify, purchaseWebhook, getUsersStats, getCurrentUsers, getVotingCoworkers } = require('./lib/api')
const { checkToken } = require('./lib/auth')
const { connexion, checkSession, deleteSession } = require('./lib/connexion')
const { ouvrirPortail } = require('./lib/portail');
const { parseFromTo } = require('./lib/dates')
const { computeIncomes } = require('./lib/models')
const { computeStats, computePeriodsStats, asCsv } = require('./lib/stats')

const adminTokens = process.env.ADMIN_TOKENS ? process.env.ADMIN_TOKENS.split(',').filter(Boolean) : undefined

async function main() {
  await mongo.connect()
  await cache.load()
  require('./lib/util/passport').config()

  const app = express()

  app.use('/doc', express.static(path.join(__dirname, 'doc')));

  app.use(cors({ origin: true }))

  const sessionOptions = {
    cookie: {
      expires: add(new Date(), { days: 14 }),
      httpOnly: false
    },
    resave: false,
    saveUninitialized: true,
    secret: process.env.SESSION_SECRET,
    store: MongoStore.create({ client: mongo.client })
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

  /**
   * @apiDefine netatmo Netatmo
   * These endpoints relate to the Netatmo weather stations
   */

  /**
   * @api {get} /netatmo/stations Request weather station data
   * @apiGroup netatmo
   * @apiSuccess {Object[]} stations The list of weather stations
   */
  app.get('/netatmo/stations', w(async (req, res) => {
    if (!netatmo.isAvailable()) {
      return res.status(500).send({ code: 500, message: 'Non disponible. Netatmo n’est pas configuré.' })
    }

    const stations = await netatmo.getStations()
    res.send(stations)
  }))


  /**
   * @apiDefine stats Stats
   * Endpoints for accessing statistics
   */
  const PERIODS_TYPES = new Set(['day', 'week', 'month', 'year'])


  /**
   * @api {get} /stats Request global stats
   * @apiGroup stats
   * @apiSuccess {Object} stats The global stats
   */

  /**
   * @api {get} /stats/:periodType Request stats for a specific period
   * @apiGroup stats
   * @apiParam {String} periodType The type of period (day, week, month, year)
   * @apiSuccess {Object} stats The stats for the specified period
   */
  app.get('/stats/:periodType', w(async (req, res) => {
    const { periodType } = req.params

    if (!PERIODS_TYPES.has(periodType)) {
      return res.sendStatus(404)
    }

    const { from, to } = parseFromTo(req.query.from, req.query.to)

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

  /**
 * @api {get} /stats/incomes/:periodType Request income stats for a specific period
 * @apiGroup stats
 * @apiParam {String} periodType The type of period (day, week, month, year)
 * @apiSuccess {Object} stats The income stats for the specified period
 */
  app.get('/stats/incomes/:periodType', w(async (req, res) => {
    const { periodType } = req.params

    if (!PERIODS_TYPES.has(periodType)) {
      return res.sendStatus(404)
    }

    const { from, to } = parseFromTo(req.query.from, req.query.to)

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


  /**
   * @apiDefine coworkers Coworkers & Presences
   * Endpoints for managing coworkers and their presences
   */

  /**
   * @api {get} /coworkers-now Request current coworkers
   * @apiGroup coworkers
   * @apiSuccess {Object[]} coworkers The list of current coworkers
   */
  app.get('/coworkersNow', w(coworkersNow))
  app.post('/coworkersNow', w(coworkersNow))
  app.get('/api/coworkers-now', w(coworkersNow))
  app.post('/api/coworkers-now', w(coworkersNow))


  /**
   * @api {get} /api/user-stats Get User Statistics
   * @apiGroup User
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {Object} User statistics.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.get('/api/user-stats', checkToken(adminTokens), w(resolveUser), w(getUserStats))
  app.post('/api/user-stats', express.urlencoded({ extended: false }), checkToken(adminTokens), w(resolveUser), w(getUserStats))

  /**
   * @api {get} /api/users/:userId/stats Get Specific User's Statistics
   * @apiGroup User
   * @apiHeader {String} Authorization Admin's token.
   * @apiParam {String} userId User's unique ID.
   * @apiSuccess {Object} User statistics.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.get('/api/users/:userId/stats', checkToken(adminTokens), w(resolveUser), w(getUserStats))


  /**
   * @api {get} /api/user-presences Get User Presences
   * @apiGroup User
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {Object} User presences.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.get('/api/user-presences', checkToken(adminTokens), w(resolveUser), w(getUserPresences))
  app.post('/api/user-presences', express.urlencoded({ extended: false }), checkToken(adminTokens), w(resolveUser), w(getUserPresences))

  /**
   * @api {get} /api/users/:userId/presences Get Specific User's Presences
   * @apiGroup User
   * @apiHeader {String} Authorization Admin's token.
   * @apiParam {String} userId User's unique ID.
   * @apiSuccess {Object} User presences.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.get('/api/users/:userId/presences', checkToken(adminTokens), w(resolveUser), w(getUserPresences))

  /**
   * @api {get} /api/voting-coworkers Get Voting Coworkers
   * @apiGroup User
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {Object} Voting coworkers data.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.get('/api/voting-coworkers', checkToken(adminTokens), w(getVotingCoworkers))

  /**
   * @api {post} /api/users-stats Get All Users' Stats
   * @apiGroup User
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {Object} Users' statistics data.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.get('/api/users-stats', checkToken(adminTokens), w(getUsersStats))
  app.post('/api/users-stats', express.urlencoded({ extended: false }), checkToken(adminTokens), w(getUsersStats))

  /**
   * @api {get} /api/current-users Get Current Users
   * @apiGroup User
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {Object} Current users data.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.get('/api/current-users', checkToken(adminTokens), w(getCurrentUsers))
  app.post('/api/current-users', express.urlencoded({ extended: false }), checkToken(adminTokens), w(getCurrentUsers))
  /**
   * @api {post} /api/heartbeat Post Heartbeat
   * @apiGroup System
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {String} Success message.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.post('/api/heartbeat', express.urlencoded({ extended: false }), checkToken(adminTokens), w(heartbeat))

  /**
   * @api {post} /api/presence Update Presence
   * @apiGroup User
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {String} Success message.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.post('/api/presence', express.urlencoded({ extended: false }), checkToken(adminTokens), w(updatePresence))

  /**
   * @api {post} /api/collections-data Get Collections Data
   * @apiGroup Data
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {Object} Collections data.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.post('/api/collections-data', express.urlencoded({ extended: false }), checkToken(adminTokens), w(getCollectionsData))

  /**
   * @api {post} /api/notify Post Notify
   * @apiGroup Notifications
   * @apiHeader {String} Authorization Admin's token.
   * @apiSuccess {String} Success message.
   * @apiError {String} 401 Unauthorized Invalid token.
   */
  app.post('/api/notify', express.urlencoded({ extended: false }), checkToken(adminTokens), w(notify))

  /**
 * @api {post} /api/purchase-webhook Post Purchase Webhook
 * @apiGroup Webhook
 * @apiDescription This API endpoint validates and parses JSON data. It computes a signature using 'sha256' algorithm and compares it with the 'x-wc-webhook-signature' from the request header. If they do not match, it throws an error.
 *
 * @apiHeader {String} x-wc-webhook-signature Signature of the webhook, needed for verification.
 *
 * @apiError (Error 400) {String} WebhookSignatureMismatch Error message when the computed signature does not match the provided webhook signature.
 *
 * @apiSuccess {String} success Success message upon successful validation and parsing.
 */
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
  /**
   * @apiDefine mac Adresses MAC
   * Endpoints for managing coworkers mac addresses
   */
  app.get('/api/mac', checkToken(adminTokens), w(getMacAddresses))
  app.post('/api/mac', express.urlencoded({ extended: false }), checkToken(adminTokens), w(getMacAddressesLegacy))


  /**
   * @apiDefine cowo Cowo APi
   * Endpoints for managing all coworking related data (login, sessions, etc.)
   */
  app.post('/api/connexion', express.urlencoded({ extended: false }), checkToken(adminTokens), connexion)
  app.post('/api/session', express.urlencoded({ extended: false }), checkToken(adminTokens), checkSession)
  app.delete('/api/session', express.urlencoded({ extended: false }), checkToken(adminTokens), deleteSession)


  /**
   * DEPRECATED  (?)
   */
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
    res.send({ status: 'ok' })
  })

  /**
   * @apiDefine portail Portail
   * Endpoints for managing the front door
   */
  /**
   * @api {post} /api/interphone Request to Open the Gate
   * @apiName OpenGate
   * @apiGroup Interphone
   * 
   * @apiHeader {String} Authorization Admin's token.
   * 
   */
  app.post('/api/interphone', checkToken(adminTokens), w(async (req, res) => {
    ouvrirPortail(req);
    res.status(202).send({ message: 'Ouverture du portail demandée' })
  }))


  app.use(errorHandler)

  const port = process.env.PORT || 5000

  app.listen(port, () => {
    console.log(`Server démarré sur http://localhost:${port}`)
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
