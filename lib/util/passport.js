const passport = require('passport')
const {Strategy} = require('passport-openidconnect')
const {getUser} = require('./wordpress')

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

module.exports = {config}
