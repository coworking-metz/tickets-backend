import process from 'node:process'
import passport from 'passport'
import {Strategy as OAuth2Strategy} from 'passport-oauth2'

const {
  WORDPRESS_BASE_URL,
  WORDPRESS_OAUTH_CLIENT_ID,
  WORDPRESS_OAUTH_CLIENT_SECRET
} = process.env

export function setupPassport() {
  if (!WORDPRESS_BASE_URL) {
    throw new Error('WORDPRESS_BASE_URL must be defined')
  }

  if (!WORDPRESS_OAUTH_CLIENT_ID) {
    throw new Error('WORDPRESS_OAUTH_CLIENT_ID must be defined')
  }

  if (!WORDPRESS_OAUTH_CLIENT_SECRET) {
    throw new Error('WORDPRESS_OAUTH_CLIENT_SECRET must be defined')
  }

  passport.use('oauth2', new OAuth2Strategy({
    authorizationURL: `${WORDPRESS_BASE_URL}/oauth/authorize`,
    tokenURL: `${WORDPRESS_BASE_URL}/oauth/token`,
    clientID: WORDPRESS_OAUTH_CLIENT_ID,
    clientSecret: WORDPRESS_OAUTH_CLIENT_SECRET,
  }, async (oauthAccessToken, oauthRefreshToken, _profile, done) => {
    done(null, oauthAccessToken, oauthRefreshToken)
  }))
}
