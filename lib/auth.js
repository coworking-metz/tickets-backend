import process from 'node:process'
import Buffer from 'node:buffer'
import passport from 'passport'

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

function buildOAuthCallbackUrl(req) {
  const apiBaseUrl = `${req.protocol}://${req.get('host')}`
  const callbackURL = new URL(`${apiBaseUrl}${req.baseUrl}/api/oauth/callback`)

  // // Should only be allowed in development
  if (OAUTH_ALLOW_REDIRECT === '1' && req.query.redirect) {
    const base64redirect = encodeBase64RedirectParam(req.query.redirect)
    callbackURL.searchParams.append('redirect', base64redirect)
  }

  return callbackURL.toString()
}

function encodeBase64RedirectParam(redirectParam) {
  // Encode base64 without padding to avoid passport to reject the redirect url
  // @see https://github.com/ciaranj/node-oauth/pull/7/commits/dfe84f3b400969ba12676dff4ea096d04b7205c0
  return Buffer.from(redirectParam).toString('base64').replaceAll('=', '')
}

function decodeBase64RedirectParam(base64redirect) {
  return Buffer.from(base64redirect, 'base64').toString('utf8')
}

export function oauth2Login(req, res, next) {
  return passport.authenticate('oauth2', {callbackURL: buildOAuthCallbackUrl(req)})(req, res, next)
}

export function oauth2Callback(req, res, next) {
  return passport.authenticate('oauth2', {callbackURL: buildOAuthCallbackUrl(req)}, (err, user) => {
    if (err) {
      next(err)
      return
    }

    const apiBaseUrl = `${req.protocol}://${req.get('host')}`
    let redirectTo = `${apiBaseUrl}${req.baseUrl}/api/ping` // Default redirect url

    if (OAUTH_ALLOW_REDIRECT === '1' && req.query.redirect) {
      redirectTo = decodeBase64RedirectParam(req.query.redirect)
    }

    const redirectUrl = new URL(redirectTo)
    redirectUrl.searchParams.append('userId', user.id)
    res.redirect(redirectUrl.toString())
  })(req, res, next)
}
