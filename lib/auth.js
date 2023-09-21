import process from 'node:process'
import Buffer from 'node:buffer'
import passport from 'passport'
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

const {NODE_ENV} = process.env
const IS_DEV = NODE_ENV === 'development'

export const oauth2Login = (req, res, next) => {
  const apiBaseUrl = `${req.protocol}://${req.get('host')}`
  const callbackURL = new URL(`${apiBaseUrl}${req.baseUrl}/api/oauth/callback`)

  // Should only be allowed in development
  if (IS_DEV && req.query.redirect) {
    // Encode base64 without padding to avoid passport to reject the redirect url
    const base64redirect = Buffer.from(req.query.redirect).toString('base64').replaceAll('=', '')
    callbackURL.searchParams.append('redirect', base64redirect)
  }

  return passport.authenticate('oauth2', {callbackURL: callbackURL.toString()})(req, res, next)
}

export const oauth2Callback = (req, res, next) => {
  const apiBaseUrl = `${req.protocol}://${req.get('host')}`
  const callbackURL = new URL(`${apiBaseUrl}${req.baseUrl}/api/oauth/callback`)

  // Should only be allowed in development
  if (IS_DEV && req.query.redirect) {
    // Reapply the redirect query param to get the same callbackURL as the /login endpoint
    callbackURL.searchParams.append('redirect', req.query.redirect)
  }

  return passport.authenticate('oauth2', {callbackURL: callbackURL.toString()}, (err, user) => {
    if (err) {
      throw createError(err)
    }

    const {redirect} = req.query
    const redirectTo = redirect
      ? Buffer.from(redirect, 'base64').toString('utf8')
      : `${apiBaseUrl}${req.baseUrl}/api/ping` // Default redirect url
    const redirectUrl = new URL(redirectTo)

    redirectUrl.searchParams.append('userId', user.id)
    res.redirect(redirectUrl.toString())
  })(req, res, next)
}
