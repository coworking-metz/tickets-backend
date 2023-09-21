import process from 'node:process'
import passport from 'passport'
import {Strategy} from 'passport-openidconnect'
import {Strategy as OAuth2Strategy} from 'passport-oauth2'

import {getUser, getUserFromOAuthAccessToken} from './wordpress.js'

const WP_AUTHORIZATION_ENDPOINT = process.env.WP_AUTHORIZATION_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/authorize'
const WP_TOKEN_ENDPOINT = process.env.WP_TOKEN_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/token'
const WP_USERINFO_ENDPOINT = process.env.WP_USERINFO_ENDPOINT || 'https://www.coworking-metz.fr/wp-json/moserver/resource'
const {WORDPRESS_BASE_URL, WORDPRESS_OAUTH_CLIENT_ID, WORDPRESS_OAUTH_CLIENT_SECRET} = process.env

export function config() {
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

  passport.use('oauth2', new OAuth2Strategy({
    authorizationURL: `${WORDPRESS_BASE_URL}/oauth/authorize`,
    tokenURL: `${WORDPRESS_BASE_URL}/oauth/token`,
    clientID: WORDPRESS_OAUTH_CLIENT_ID,
    clientSecret: WORDPRESS_OAUTH_CLIENT_SECRET,
  },
  async (oauthAccessToken, oauthRefreshToken, _profile, done) => {
    console.log('User authenticated from wordpress')
    try {
      const wordpressUser = await getUserFromOAuthAccessToken(oauthAccessToken)
      const {
        ID: id,
        user_email: email,
        display_name: name,
        user_roles: roles
      } = wordpressUser

      const user = {
        id,
        email,
        name,
        roles,
      }

      console.log('Retrieved user info from wordpress', user)
      done(null, user)
    } catch (error) {
      done(error)
    }
  }))
}
