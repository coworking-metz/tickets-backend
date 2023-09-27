import process from 'node:process'
import express from 'express'
import cookieParser from 'cookie-parser'
import {add} from 'date-fns'
import w from '../util/w.js'
import {getServerBaseUrl} from '../util/express.js'
import {
  buildOauth2Login,
  buildOauth2Callback,
  refreshTokens,
  retrieveUserFromAccessToken
} from '../auth.js'

const REFRESH_TOKEN_COOKIE_NAME = 'rt'

function setRefreshTokenCookie(req, res, refreshToken) {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    expires: add(new Date(), {days: 30}),
    path: `${getServerBaseUrl(req)}${req.baseUrl}/token`,
  })
}

export function webAuthRouter() {
  const router = new express.Router()

  router.get('/login', w(buildOauth2Login('/callback')))
  router.get('/callback', w(buildOauth2Callback('/callback')), w((req, res) => {
    const {refreshToken, redirectTo} = res.locals

    setRefreshTokenCookie(req, res, refreshToken)

    if (!redirectTo) {
      return res.sendStatus(204)
    }

    res.redirect(redirectTo)
  }))

  router.get('/token', w(cookieParser()), w(async (req, res) => {
    const jwtRefreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME]
    const {accessToken, refreshToken, user} = await refreshTokens(jwtRefreshToken)
    setRefreshTokenCookie(req, res, refreshToken)
    res.send({
      user,
      access_token: accessToken
    })
  }))

  router.get('/me', w(retrieveUserFromAccessToken), w(async (req, res) => {
    const {user} = res.locals
    res.send({user})
  }))

  return router
}
