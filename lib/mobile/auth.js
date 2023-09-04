const {Buffer} = require('node:buffer')
const passport = require('passport')
const {
  verifyAccessToken,
  verifyRefreshToken,
  createAccessToken,
  createRefreshToken
} = require('../util/jwt')
const {getUserFromOAuthAccessToken, refreshOAuthTokens} = require('../util/wordpress')

const {MOBILE_APP_BASE_URL, NODE_ENV} = process.env
const IS_DEV = NODE_ENV === 'development'

const login = (req, res, next) => {
  const apiBaseUrl = `${req.protocol}://${req.get('host')}`
  const callbackURL = new URL(`${apiBaseUrl}${req.baseUrl}/auth/callback`)

  // Should only be allowed in development
  if (IS_DEV && req.query.redirect) {
    // Encode base64 without padding to avoid passport to reject the redirect url
    const base64redirect = Buffer.from(req.query.redirect).toString('base64').replaceAll('=', '')
    callbackURL.searchParams.append('redirect', base64redirect)
  }

  return passport.authenticate('oauth2', {callbackURL: callbackURL.toString()})(req, res, next)
}

const callback = (req, res, next) => {
  const apiBaseUrl = `${req.protocol}://${req.get('host')}`
  const callbackURL = new URL(`${apiBaseUrl}${req.baseUrl}/auth/callback`)

  // Should only be allowed in development
  if (IS_DEV && req.query.redirect) {
    // Reapply the redirect query param to get the same callbackURL as the /login endpoint
    callbackURL.searchParams.append('redirect', req.query.redirect)
  }

  return passport.authenticate('oauth2', {callbackURL: callbackURL.toString()}, (err, tokens) => {
    if (err) {
      throw new Error(err)
    }

    const {redirect} = req.query
    const redirectTo = redirect ? Buffer.from(redirect, 'base64').toString('utf8') : MOBILE_APP_BASE_URL
    const mobileAppUrl = new URL(redirectTo)

    const {accessToken, refreshToken} = tokens
    mobileAppUrl.searchParams.append('accessToken', accessToken)
    mobileAppUrl.searchParams.append('refreshToken', refreshToken)
    res.redirect(mobileAppUrl.toString())
  })(req, res, next)
}

/**
 * Decode the access token and add the user to the request
 */
const getUserFromAccessToken = async (req, res, next) => {
  const accessToken = req.headers.authorization.slice('Bearer '.length)
  verifyAccessToken(accessToken).then(accessTokenData => {
    req.user = {
      id: accessTokenData.id,
      email: accessTokenData.email,
      name: accessTokenData.name,
      roles: accessTokenData.roles
    }
    next()
  }).catch(error => {
    res.status(401).send({
      code: 'Unauthorized',
      detail: error
    })
  })
}

/**
 * Refresh the access token and the refresh token by requesting new ones from the OAuth server
 */
const refreshTokens = async (req, res) => {
  const {refreshToken: jwtRefreshToken} = req.body

  const oauthRefreshToken = await verifyRefreshToken(jwtRefreshToken)
  const {access_token: newOauthAccessToken, refresh_token: newOauthRefreshToken} = await refreshOAuthTokens(oauthRefreshToken)
  const wordpressUser = await getUserFromOAuthAccessToken(newOauthAccessToken)

  const {
    ID: id,
    user_email: email,
    display_name: name,
    user_roles: roles
  } = wordpressUser

  const newAccessToken = createAccessToken(id, name, email, roles)
  const newRefreshToken = createRefreshToken(newOauthRefreshToken)
  res.send({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  })
}

module.exports = {login, callback, getUserFromAccessToken, refreshTokens}
