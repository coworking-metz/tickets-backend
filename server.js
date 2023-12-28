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

import * as Member from './lib/models/member.js'

import cache from './lib/util/cache.js'
import {coworkersNow, getMemberInfos, getMemberPresences, heartbeat, getMacAddresses, getMacAddressesLegacy, updatePresence, notify, purchaseWebhook, syncUserWebhook, getUsersStats, getCurrentMembers, getVotingMembers} from './lib/api.js'
import {ensureToken, multiAuth, authRouter} from './lib/auth.js'
import {ping} from './lib/ping.js'
import {pressRemoteButton} from './lib/services/shelly-parking-remote.js'
import {getOpenSpaceSensorsFormattedAsNetatmo, pressIntercomButton} from './lib/services/home-assistant.js'

await mongo.connect()
await cache.load()
setupPassport()

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

/* Public access */

app.use('/stats', statsRoutes)
app.get('/coworkersNow', w(coworkersNow)) // Legacy

/* General purpose */

app.get('/api/users/:userId/stats', multiAuth, w(getMemberInfos))
app.get('/api/users/:userId/presences', multiAuth, w(getMemberPresences))

app.get('/api/voting-coworkers', multiAuth, w(getVotingMembers))
app.get('/api/users-stats', multiAuth, w(getUsersStats))
app.get('/api/current-users', multiAuth, w(getCurrentMembers))

/* General purpose (legacy) */

app.get('/api/user-stats', ensureToken, w(resolveUserUsingEmail), w(getMemberInfos))
app.post('/api/user-stats', express.urlencoded({extended: false}), ensureToken, w(resolveUserUsingEmail), w(getMemberInfos))
app.get('/api/user-presences', ensureToken, w(resolveUserUsingEmail), w(getMemberPresences))

/* Presences */

app.post('/api/heartbeat', express.urlencoded({extended: false}), ensureToken, w(heartbeat))
app.get('/api/mac', multiAuth, w(getMacAddresses))
app.post('/api/mac', express.urlencoded({extended: false}), ensureToken, w(getMacAddressesLegacy))
app.post('/api/presence', express.urlencoded({extended: false}), ensureToken, w(updatePresence))
app.post('/api/notify', express.urlencoded({extended: false}), ensureToken, w(notify))

/* Webhooks */

app.post('/api/purchase-webhook', validateAndParseJson, w(purchaseWebhook))
app.post('/api/sync-user-webhook', ensureToken, w(syncUserWebhook))

/* Services */

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

app.get('/netatmo/stations', w(async (req, res) => {
  const sensors = await getOpenSpaceSensorsFormattedAsNetatmo()
  res.send(sensors)
}))

/* Util */

app.get('/api/ping', w(ping))

/* Auth */

app.use('/api/auth', authRouter())

app.use(errorHandler)

const port = process.env.PORT || 8000

app.listen(port, () => {
  console.log(`Start listening on port ${port}!`)
})
