import express from 'express'
import createError from 'http-errors'
import jwt from 'jsonwebtoken'
import {Buffer} from 'node:buffer'
import process from 'node:process'
import passport from 'passport'
import {getUserByWordpressId} from './models/member.js'
import {notifyOnSignal} from './services/home-assistant.js'
import {getServerBaseUrl} from './util/express.js'
import {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from './util/jwt.js'
import w from './util/w.js'
import * as Member from './models/member.js'
import {getUser, getUserFromOAuthAccessToken, refreshOAuthTokens} from './util/wordpress.js'
import {sample} from 'lodash-es'

const WORDPRESS_BASE_URL = process.env.WORDPRESS_BASE_URL || 'https://www.coworking-metz.fr'

const adminTokens = process.env.ADMIN_TOKENS
  ? process.env.ADMIN_TOKENS.split(',').filter(Boolean)
  : undefined

if (!adminTokens || adminTokens.length === 0) {
  throw new Error('Admin tokens not defined')
}

function authToken(req) {
  const authHeader = req.get('Authorization')

  if (authHeader && authHeader.startsWith('Token')) {
    return adminTokens.some(token => authHeader === `Token ${token}`)
  }

  if (req.method === 'POST' && req.body?.key) {
    return adminTokens.includes(req.body.key)
  }

  if (req.query.key) {
    return adminTokens.includes(req.query.key)
  }
}

export function ensureToken(req, res, next) {
  const tokenAuthentication = authToken(req)

  if (!tokenAuthentication) {
    throw createError(401, 'Invalid API key')
  }

  req.isAdmin = true
  return next()
}

export async function ensureAccess(req, res, next) {
  if (req.isAdmin) {
    return next()
  }

  if (!req.user) {
    throw createError(401, 'Authentication required')
  }

  if (req.rawUser && req.rawUser._id !== req.user.id) {
    throw createError(403, 'You are not allowed to access this content')
  }

  return next()
}

export function ensureAdmin(req, res, next) {
  if (!req.isAdmin) {
    throw createError(403, 'Admin only')
  }

  return next()
}

export async function multiAuth(req, res, next) {
  const tokenAuthentication = authToken(req)

  if (tokenAuthentication === true) {
    req.isAdmin = true
    return next()
  }

  if (tokenAuthentication === false) {
    throw createError(401, 'Invalid API key')
  }

  await retrieveUserFromAccessToken(req, res)

  return next()
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
  if (process.env.OAUTH_FOLLOW_ANY === '1') {
    return true
  }

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

/**
 * Retrieve informations about a user on Wordpress
 * using its OAuth access token
 *
 * @param string oauthAccessToken
 * @returns {
 *  id: number,
 *  user_login: string,
 *  user_email: string,
 *  user_registered: string,
 *  display_name: string,
 *  photos: {
 *    polaroid: string,
 *    photo: string
 *  },
 *  roles: string[],
 *  droits: {
 *    ouvrir_portail: boolean,
 *    ouvrir_parking: boolean
 *  },
 *  visite: {
 *    date: string
 *  }
 * }
 */
async function getWordpressUser(oauthAccessToken) {
  const {ID, ...otherProps} = await getUserFromOAuthAccessToken(oauthAccessToken)
  return {
    ...otherProps,
    id: Number.parseInt(ID, 10)
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

        const wordpressUser = await getWordpressUser(oauthAccessToken)
        const user = await getUserByWordpressId(wordpressUser.id)

        const jwtAccessToken = await createAccessToken(user, wordpressUser)
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
export async function retrieveUserFromAccessToken(req) {
  const authorizationHeader = req.get('Authorization')
  if (!authorizationHeader) {
    return
  }

  const accessToken = authorizationHeader.slice('Bearer '.length)
  const user = await verifyAccessToken(accessToken)
    .catch(error => {
      if (error instanceof jwt.TokenExpiredError) {
        const httpError = createError(401, 'Le jeton est expiré')
        httpError.code = 'EXPIRED_ACCESS_TOKEN'
        throw httpError
      }

      // Should send back a 401 whatever wrong happened
      throw createError(401, 'Le jeton est invalide')
    })
  req.user = user
  req.isAdmin = user.roles.includes('admin')
}

/**
 * Refresh JWT access and refresh tokens
 * by requesting new ones from the OAuth server
 * and validating the user
 */
export async function refreshTokens(jwtRefreshToken, jwtAccessToken) {
  const oauthRefreshToken = await verifyRefreshToken(jwtRefreshToken)

  return refreshOAuthTokens(oauthRefreshToken).then(async ({
    access_token: newOauthAccessToken,
    refresh_token: newOauthRefreshToken
  }) => {
    const wordpressUser = await getWordpressUser(newOauthAccessToken)
    const user = await getUserByWordpressId(wordpressUser.id)

    const newAccessToken = await createAccessToken(user, wordpressUser)
    const newRefreshToken = createRefreshToken(newOauthRefreshToken)

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  }).catch(async error => {
    // Gracefully fallback when wordpress cannot respond in time
    // by returning new access token with existing refresh token
    if (error.code === 'ETIMEDOUT' || (error.code === 'ERR_NON_2XX_3XX_RESPONSE' && error.response.statusCode === 500)) {
      const userFromAccessToken = jwt.decode(jwtAccessToken)
      if (userFromAccessToken) {
        const user = await getUserByWordpressId(userFromAccessToken.wpUserId)
        const wordpressUser = {id: userFromAccessToken.wpUserId, roles: userFromAccessToken.roles}

        const newAccessToken = await createAccessToken(user, wordpressUser)

        return {
          accessToken: newAccessToken,
          refreshToken: jwtRefreshToken
        }
      }
    }

    throw error
  })
}

// Make it a little bit more fun
const errorMessages = [
  'Allô Houston ? On n\'a pas réussir à rafraîchir des accès :',
  'Arf, on a un problème pour rafraîchir des accès :',
  'Oups, on a un souci pour rafraîchir des accès :',
  'Mince, quelque chose est cassé lors du rafraîchissement des accès :',
  'Zut, rien ne va plus pour rafraîchir des accès :',
  'Oula, on a un problème pour rafraîchir des accès :',
  'Ah mince, on a un souci pour rafraîchir des accès :',
  'Oh la la, on a un problème lors du rafraîchissement des accès :',
  'Oh non, on a un souci pour rafraîchir des accès :',
  'Saperlipopette, on a un problème à rafraîchir des accès :',
  'Sapristi, on a un souci pour rafraîchir des accès :'
]

export function authRouter() {
  const router = new express.Router()

  router.get('/login', w(buildOauth2Login('/callback')))
  router.get('/callback', w(buildOauth2Callback('/callback')))
  router.post('/tokens', express.json(), w(async (req, res) => {
    const jwtRefreshToken = req.body.refreshToken
    const jwtAccessToken = req.body.accessToken
    const {accessToken, refreshToken, user} = await refreshTokens(jwtRefreshToken, jwtAccessToken)
      .catch(error => {
        if (error instanceof jwt.TokenExpiredError
          || error instanceof jwt.JsonWebTokenError
          || error instanceof jwt.NotBeforeError) {
          throw createError(401)
        }

        if (error.code === 'ERR_NON_2XX_3XX_RESPONSE' && error.response.statusCode === 400) {
          const parsedBody = JSON.parse(error.response.body)
          if (parsedBody.error === 'invalid_grant') {
            throw createError(401)
          }
        }

        if (error.message) {
          notifyOnSignal(`${sample(errorMessages)}\n${error.message}`).catch(notifyError => {
            // Don't throw an error if the notification failed
            console.error('Unable to notify about /tokens error', notifyError)
          })
        }

        console.error(error)
        throw createError(500)
      })

    res.send({
      user,
      accessToken,
      refreshToken
    })
  }))
  router.get('/logout', w((req, res) => {
    const logoutUrl = new URL('/mon-compte', WORDPRESS_BASE_URL)
    logoutUrl.searchParams.append('logout', 'true')

    const {
      [OAUTH_FOLLOW_PARAM_NAME]: follow,
      ...otherQueryParams
    } = req.query

    const followTo = follow || req.get('Referer') // Get Referer by default to ease integration
    if (isFollowAllowed(followTo)) {
      // Will redirect to this url once user is logged out
      const redirectUrl = new URL(followTo)
      for (const [key, value] of Object.entries(otherQueryParams)) {
        redirectUrl.searchParams.append(key, value)
      }

      logoutUrl.searchParams.append('redirect_to', redirectUrl.toString())
    }

    res.redirect(logoutUrl)
  }))

  /**
   * Impersonate a member (admin only)
   * by generating its access token and admin refresh token
   * and redirecting to the mobile app with both of them
   */
  router.get('/impersonate/:userId', w(async (req, res) => {
    const {accessToken} = req.query
    const user = await verifyAccessToken(accessToken)
      .catch(error => {
        if (error instanceof jwt.TokenExpiredError) {
          const httpError = createError(401, 'Le jeton est expiré')
          httpError.code = 'EXPIRED_ACCESS_TOKEN'
          throw httpError
        }

        // Should send back a 401 whatever wrong happened
        throw createError(401, 'Le jeton est invalide')
      })

    if (!user.roles.includes('admin')) {
      throw createError(403, 'Admin only')
    }

    const jwtRefreshToken = req.query.refreshToken
    if (!jwtRefreshToken) {
      throw createError(400, 'Missing refreshToken')
    }

    const member = await Member.getUserById(req.params.userId)
    const wordpressMember = await getUser(member.wpUserId)

    const impersonatedMemberAccessToken = await createAccessToken(member, wordpressMember, user)
    const oauthRefreshToken = await verifyRefreshToken(jwtRefreshToken)
    const freshRefreshToken = createRefreshToken(oauthRefreshToken)

    const redirectUrl = new URL('/home', 'poulailler:///')
    redirectUrl.searchParams.append('accessToken', impersonatedMemberAccessToken)
    redirectUrl.searchParams.append('refreshToken', freshRefreshToken)

    res.redirect(redirectUrl)
  }))

  /**
   * Read and verify the access token to return user information.
   */
  router.get('/me', w(async (req, res) => {
    await retrieveUserFromAccessToken(req)

    if (!req.user) {
      throw createError(401, 'Authentication required')
    }

    if (req.user.impersonatedBy) {
      throw createError(403, 'Forbidden')
    }

    res.send(req.user)
  }))

  return router
}
