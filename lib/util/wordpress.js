import process from 'node:process'
import got from 'got'

const WP_APIV2_URL = process.env.WP_APIV2_URL || 'https://www.coworking-metz.fr/wp-json/wp/v2'
const {
  WORDPRESS_BASE_URL,
  WORDPRESS_OAUTH_CLIENT_ID,
  WORDPRESS_OAUTH_CLIENT_SECRET
} = process.env

export async function getUser(userId) {
  const response = await got(`${WP_APIV2_URL}/users/${userId}?context=edit`, {
    responseType: 'json',
    username: process.env.WP_APIV2_USERNAME,
    password: process.env.WP_APIV2_PASSWORD,
  })

  return response.body
}

export function getUserFromOAuthAccessToken(accessToken) {
  return got.post(`${WORDPRESS_BASE_URL}/oauth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
  }).json()
}

export function refreshOAuthTokens(refreshToken) {
  return got.post(`${WORDPRESS_BASE_URL}/oauth/token`, {
    responseType: 'json',
    json: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: WORDPRESS_OAUTH_CLIENT_ID,
      client_secret: WORDPRESS_OAUTH_CLIENT_SECRET,
    }
  }).then(({body}) => body)
}
