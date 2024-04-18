import process from 'node:process'
import got from 'got'

const {
  WORDPRESS_BASE_URL,
  WORDPRESS_OAUTH_CLIENT_ID,
  WORDPRESS_OAUTH_CLIENT_SECRET
} = process.env

export async function getUser(userId) {
  try {
    const response = await got(`${WORDPRESS_BASE_URL}/api-json-wp/wp/v2/users/${userId}?context=edit`, {
      responseType: 'json',
      username: process.env.WP_APIV2_USERNAME,
      password: process.env.WP_APIV2_PASSWORD
    })
    return response.body
  } catch (error) {
    if (error.response && error.response.statusCode === 404) {
      return false
    }

    throw error
  }
}

export function getUserFromOAuthAccessToken(accessToken) {
  return got.post(`${WORDPRESS_BASE_URL}/oauth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }).json()
}

export function refreshOAuthTokens(refreshToken) {
  return got.post(`${WORDPRESS_BASE_URL}/oauth/token`, {
    json: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: WORDPRESS_OAUTH_CLIENT_ID,
      client_secret: WORDPRESS_OAUTH_CLIENT_SECRET
    }
  }).json()
}

export function buildPictureUrl(wordpressUserId) {
  return new URL(`/polaroid/${wordpressUserId}-raw.jpg`, WORDPRESS_BASE_URL).toString()
}
