const express = require('express')
const w = require('../util/w')
const {oauth2Config} = require('../util/passport')
const auth = require('./auth')
const profile = require('./profile')
const gates = require('./gates')

const mobileRouter = () => {
  oauth2Config()
  const router = new express.Router()

  router.get('/auth/login', w(auth.login))
  router.get('/auth/callback', w(auth.callback))
  router.post('/auth/token', express.json(), w(auth.refreshTokens))

  router.get('/profile', w(auth.getUserFromAccessToken), w(profile.getUserProfile))
  router.post('/gates/parking/open', w(auth.getUserFromAccessToken), w(gates.openParkingBarrier))

  return router
}

module.exports = mobileRouter
