import process from 'node:process'
import {Buffer} from 'node:buffer'
import passport from 'passport'
import {getServerBaseUrl} from './util/express.js'
import {
  verifyAccessToken,
  verifyRefreshToken,
  createAccessToken,
  createRefreshToken
} from './util/jwt.js'
import w from './util/w.js'
import {getUserFromOAuthAccessToken, refreshOAuthTokens} from './util/wordpress.js'
import createError from 'http-errors'
import express from 'express'

export function checkToken(adminTokens) {
  if (!adminTokens || adminTokens.length === 0) {
    throw new Error('Admin tokens not defined')
  }

  return (req, res, next) => {
    const authHeader = req.get('Authorization')

    if (authHeader) {
      if (adminTokens.some(token => authHeader === `Token ${token}`)) {
        next()
      } else {
        res.status(403).send('Invalid API key')
      }

      return
    }

    if (req.method === 'POST' && req.body) {
      if (adminTokens.includes(req.body.key)) {
        next()
      } else {
        res.status(403).send('Invalid API key')
      }

      return
    }

    if (req.query.key) {
      if (adminTokens.includes(req.query.key)) {
        next()
      } else {
        res.status(403).send('Invalid API key')
      }

      return
    }

    res.status(401).send('Missing API key')
  }
}

export function ensureAdmin(req, res, next) {
  if (!req.user) {
    return res.sendStatus(401)
  }

  if (!req.user.isAdmin) {
    return res.sendStatus(403)
  }

  next()
}

const {OAUTH_FOLLOW_WHITELIST} = process.env
const OAUTH_FOLLOW_PARAM_NAME = 'follow'
const OAUTH_FOLLOW_PARAM_NAME_ENCODED = 'follow_encoded'

function encodeBase64RedirectParam(redirectParam) {
  // Encode base64 without padding to avoid passport to reject the redirect url
  // @see https://github.com/ciaranj/node-oauth/pull/7/commits/dfe84f3b400969ba12676dff4ea096d04b7205c0
  return Buffer.from(redirectParam).toString('base64').replaceAll('=', '')
}

function decodeBase64RedirectParam(base64redirect) {
  return Buffer.from(base64redirect, 'base64').toString('utf8')
}

function isFollowAllowed(followUrl) {
  if (!OAUTH_FOLLOW_WHITELIST) {
    return false
  }

  const whitelist = OAUTH_FOLLOW_WHITELIST.split(',')
  return whitelist.includes(followUrl)
}

function buildOAuthCallbackUrl(req, shouldEncode = false, path) {
  const callbackURL = new URL(`${getServerBaseUrl(req)}${req.baseUrl}${path}`)
  const {
    [OAUTH_FOLLOW_PARAM_NAME]: follow,
    // Strip the following query params from the callback url
    [OAUTH_FOLLOW_PARAM_NAME_ENCODED]: followEncoded,
    code,
    iframe,
    // Get all other query params
    ...otherQueryParams
  } = req.query

  if (followEncoded) {
    callbackURL.searchParams.append(OAUTH_FOLLOW_PARAM_NAME_ENCODED, followEncoded)
  } else {
    // Will redirect to this url once the callback is made
    const redirect = follow || req.get('Referer') // Get Referer by default to ease integration
    if (redirect && isFollowAllowed(redirect)) {
      const base64redirect = encodeBase64RedirectParam(redirect)
      callbackURL.searchParams.append(OAUTH_FOLLOW_PARAM_NAME_ENCODED, base64redirect)
    }
  }

  for (const [key, value] of Object.entries(otherQueryParams)) {
    callbackURL.searchParams.append(key, shouldEncode ? encodeBase64RedirectParam(value) : value)
  }

  return callbackURL.toString()
}

async function getWordpressUser(oauthAccessToken) {
  const wordpressUser = await getUserFromOAuthAccessToken(oauthAccessToken)

  const {
    ID: id,
    user_email: email,
    display_name: name,
    user_roles: roles,
    polaroid: picture
  } = wordpressUser
  return {
    id,
    email,
    name,
    roles,
    picture
  }
}

export function buildOauth2Login(path) {
  return (req, res, next) => passport.authenticate('oauth2', {
    callbackURL: buildOAuthCallbackUrl(req, true, path)
  })(req, res, next)
}

export function buildOauth2Callback(path) {
  return (req, res, next) => passport.authenticate('oauth2', {
    callbackURL: buildOAuthCallbackUrl(req, false, path)
  }, async (err, oauthAccessToken, oauthRefreshToken) => {
    if (err) {
      // TODO: should redirect to a proper error page explaining to the user what went wrong
      next(err)
      return
    }

    const user = await getWordpressUser(oauthAccessToken)

    const {
      [OAUTH_FOLLOW_PARAM_NAME_ENCODED]: followEncoded,
      code,
      iframe,
      ...otherQueryParams
    } = req.query

    if (followEncoded) {
      const follow = decodeBase64RedirectParam(followEncoded)
      if (isFollowAllowed(follow)) {
        const redirectUrl = new URL(follow)
        for (const [key, value] of Object.entries(otherQueryParams)) {
          redirectUrl.searchParams.append(key, decodeBase64RedirectParam(value))
        }

        const jwtAccessToken = createAccessToken(user.id, user.name, user.email, user.roles)
        redirectUrl.searchParams.append('accessToken', jwtAccessToken)
        const jwtRefreshToken = createRefreshToken(oauthRefreshToken)
        redirectUrl.searchParams.append('refreshToken', jwtRefreshToken)

        res.redirect(redirectUrl.toString())
        return next()
      }
    }

    // TODO: should log that no follow url was provided or it isn't allowed
    next(createError(403))
  })(req, res, next)
}

/**
 * Decode the access token and add the user to the request
 */
export async function retrieveUserFromAccessToken(req, res, next) {
  if (!req.headers.authorization) {
    throw createError(401)
  }

  const accessToken = req.headers.authorization.slice('Bearer '.length)
  const user = await verifyAccessToken(accessToken)
    .catch(error => {
      console.error(error)
      // Should send back a 401 whatever wrong happened
      throw createError(401)
    })
  res.locals.user = user
  next()
}

/**
 * Refresh JWT access and refresh tokens
 * by requesting new ones from the OAuth server
 * and validating the user
 */
export async function refreshTokens(jwtRefreshToken) {
  const oauthRefreshToken = await verifyRefreshToken(jwtRefreshToken)
  const {access_token: newOauthAccessToken, refresh_token: newOauthRefreshToken} = await refreshOAuthTokens(oauthRefreshToken)

  const user = await getWordpressUser(newOauthAccessToken)

  const newAccessToken = createAccessToken(user.id, user.name, user.email, user.roles)
  const newRefreshToken = createRefreshToken(newOauthRefreshToken)

  return {
    user,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  }
}

export function authRouter() {
  const router = new express.Router()

  router.get('/login', w(buildOauth2Login('/callback')))
  router.get('/callback', w(buildOauth2Callback('/callback')))
  router.post('/tokens', express.json(), w(async (req, res) => {
    const jwtRefreshToken = req.body.refreshToken
    const {accessToken, refreshToken, user} = await refreshTokens(jwtRefreshToken)
      .catch(error => {
        console.error(error)
        throw createError(401)
      })

    res.send({
      user,
      accessToken,
      refreshToken
    })
  }))

  return router
}
