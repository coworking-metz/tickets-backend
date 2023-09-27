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
    path: `${getServerBaseUrl(req)}${req.baseUrl}/auth/token`,
  })
}

export function managerRouter() {
  const router = new express.Router()

  router.get('/auth/login', w(buildOauth2Login('/auth/callback')))
  router.get('/auth/callback', w(buildOauth2Callback('/auth/callback')), w((req, res) => {
    const {refreshToken, redirectTo} = res.locals

    setRefreshTokenCookie(req, res, refreshToken)

    const redirectUrl = new URL(redirectTo || process.env.MANAGER_WEB_BASE_URL)
    res.redirect(redirectUrl.toString())
  }))

  router.get('/auth/token', w(cookieParser()), w(async (req, res) => {
    const {[REFRESH_TOKEN_COOKIE_NAME]: jwtRefreshToken} = req.cookies
    const {accessToken, refreshToken, user} = await refreshTokens(jwtRefreshToken)
    setRefreshTokenCookie(req, res, refreshToken)
    res.send({
      user,
      access_token: accessToken
    })
  }))

  router.get('/auth/me', w(retrieveUserFromAccessToken), w(async (req, res) => {
    const {user} = res.locals
    res.send({user})
  }))

  return router
}
