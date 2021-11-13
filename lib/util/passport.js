const passport = require('passport')
const {Strategy} = require('passport-openidconnect')
const got = require('got')

const WP_APIV2_URL = process.env.WP_APIV2_URL || 'https://www.coworking-metz.fr/wp-json/wp/v2'
const WP_AUTHORIZATION_ENDPOINT = process.env.WP_AUTHORIZATION_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/authorize'
const WP_TOKEN_ENDPOINT = process.env.WP_TOKEN_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/token'
const WP_USERINFO_ENDPOINT = process.env.WP_USERINFO_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/resource'

function config() {
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
      const response = await got(`${WP_APIV2_URL}/users/${sub}?context=edit`, {
        responseType: 'json',
        username: process.env.WP_APIV2_USERNAME,
        password: process.env.WP_APIV2_PASSWORD
      })
      const {id, username, first_name: firstName, last_name: lastName, email, is_super_admin: isAdmin} = response.body
      done(null, {id, username, firstName, lastName, email, isAdmin})
    } catch (error) {
      done(error)
    }
  }))
}

module.exports = {config}
