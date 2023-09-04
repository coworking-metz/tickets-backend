const passport = require('passport')
const {Strategy} = require('passport-openidconnect')
const {Strategy: OAuth2Strategy} = require('passport-oauth2')
const jwt = require('../util/jwt')
const {getUser, getUserFromOAuthAccessToken} = require('./wordpress')

const WP_AUTHORIZATION_ENDPOINT = process.env.WP_AUTHORIZATION_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/authorize'
const WP_TOKEN_ENDPOINT = process.env.WP_TOKEN_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/token'
const WP_USERINFO_ENDPOINT = process.env.WP_USERINFO_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/resource'

const {WORDPRESS_BASE_URL, WORDPRESS_OAUTH_CLIENT_ID, WORDPRESS_OAUTH_CLIENT_SECRET} = process.env

function openidconnectConfig() {
  passport.serializeUser((user, done) => {
    done(null, user)
  })

  passport.deserializeUser((user, done) => {
    done(null, user)
  })

  passport.use('wordpress', new Strategy({
    issuer: 'https://www.coworking-metz.fr/wp-json/moserver',
    authorizationURL: WP_AUTHORIZATION_ENDPOINT,
    tokenURL: WP_TOKEN_ENDPOINT,
    userInfoURL: WP_USERINFO_ENDPOINT,
    clientID: process.env.WP_CLIENT_ID,
    clientSecret: process.env.WP_CLIENT_SECRET,
    scope: 'email profile openid'
  },
  async (issuer, sub, done) => {
    try {
      const {
        id,
        username,
        first_name: firstName,
        last_name: lastName,
        email,
        is_super_admin: isAdmin
      } = await getUser(sub)

      done(null, {id, username, firstName, lastName, email, isAdmin})
    } catch (error) {
      done(error)
    }
  }))
}

function oauth2Config() {
  passport.use('oauth2', new OAuth2Strategy({
    authorizationURL: `${WORDPRESS_BASE_URL}/oauth/authorize`,
    tokenURL: `${WORDPRESS_BASE_URL}/oauth/token`,
    clientID: WORDPRESS_OAUTH_CLIENT_ID,
    clientSecret: WORDPRESS_OAUTH_CLIENT_SECRET,
  },
  (oauthAccessToken, oauthRefreshToken, _profile, done) => {
    getUserFromOAuthAccessToken(oauthAccessToken).then(wordpressUser => {
      const {
        ID: id,
        user_email: email,
        display_name: name,
        user_roles: roles
      } = wordpressUser

      const accessToken = jwt.createAccessToken(id, name, email, roles)
      const refreshToken = jwt.createRefreshToken(oauthRefreshToken)
      done(null, {
        accessToken,
        refreshToken
      })
    }).catch(error => {
      done(error)
    })
  }))
}

module.exports = {openidconnectConfig, oauth2Config}
