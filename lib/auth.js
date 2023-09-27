import process from 'node:process'
import Buffer from 'node:buffer'
import passport from 'passport'
import {getServerBaseUrl} from './util/express.js'
import {
  verifyAccessToken,
  verifyRefreshToken,
  createAccessToken,
  createRefreshToken
} from './util/jwt.js'
import {getUserFromOAuthAccessToken, refreshOAuthTokens} from './util/wordpress.js'
import createError from 'http-errors'

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

const {OAUTH_ALLOW_REDIRECT} = process.env

function buildOAuthCallbackUrl(req, path) {
  const callbackURL = new URL(`${getServerBaseUrl(req)}${req.baseUrl}${path}`)

  // // Should only be allowed in development
  if (OAUTH_ALLOW_REDIRECT === '1' && req.query.redirect) {
    const base64redirect = encodeBase64RedirectParam(req.query.redirect)
    callbackURL.searchParams.append('redirect', base64redirect)
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
    polaroid: picture,
  } = wordpressUser
  return {
    id,
    email,
    name,
    roles,
    picture,
  }
}

export function encodeBase64RedirectParam(redirectParam) {
  // Encode base64 without padding to avoid passport to reject the redirect url
  // @see https://github.com/ciaranj/node-oauth/pull/7/commits/dfe84f3b400969ba12676dff4ea096d04b7205c0
  return Buffer.from(redirectParam).toString('base64').replaceAll('=', '')
}

export function decodeBase64RedirectParam(base64redirect) {
  return Buffer.from(base64redirect, 'base64').toString('utf8')
}

export function buildOauth2Login(path) {
  return (req, res, next) => passport.authenticate('oauth2', {
    callbackURL: buildOAuthCallbackUrl(req, path)
  })(req, res, next)
}

export function buildOauth2Callback(path) {
  return (req, res, next) => passport.authenticate('oauth2', {
    callbackURL: buildOAuthCallbackUrl(req, path)
  }, async (err, oauthAccessToken, oauthRefreshToken) => {
    if (err) {
      next(err)
      return
    }

    const user = await getWordpressUser(oauthAccessToken)

    if (OAUTH_ALLOW_REDIRECT === '1' && req.query.redirect) {
      res.locals.redirectTo = decodeBase64RedirectParam(req.query.redirect)
    }

    const jwtRefreshToken = createRefreshToken(oauthRefreshToken)

    res.locals.user = user
    res.locals.refreshToken = jwtRefreshToken
    next()
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
  return verifyAccessToken(accessToken).then(user => {
    res.locals.user = user
    next()
  }).catch(error => {
    console.error(error)
    // Should send back a 401 whatever wrong happened
    throw createError(401)
  })
}

/**
 * Refresh the access token and the refresh token by requesting new ones from the OAuth server
 */
export async function refreshTokens(jwtRefreshToken) {
  const oauthRefreshToken = await verifyRefreshToken(jwtRefreshToken)
  const {access_token: newOauthAccessToken, refresh_token: newOauthRefreshToken} = await refreshOAuthTokens(oauthRefreshToken)

  const wordpressUser = await getWordpressUser(newOauthAccessToken)
  const {
    ID: id,
    user_email: email,
    display_name: name,
    user_roles: roles,
  } = wordpressUser

  const newAccessToken = createAccessToken(id, name, email, roles)
  const newRefreshToken = createRefreshToken(newOauthRefreshToken)

  return {
    user: wordpressUser,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  }
}
