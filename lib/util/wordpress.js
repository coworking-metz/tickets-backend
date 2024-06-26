import process from 'node:process'
import got from 'got'
import {isNil} from 'lodash-es'

const {
  WP_APIV2_USERNAME, WP_APIV2_PASSWORD,
  WORDPRESS_BASE_URL,
  WORDPRESS_OAUTH_CLIENT_ID,
  WORDPRESS_OAUTH_CLIENT_SECRET,
  PHOTOS_BASE_URL
} = process.env

export async function getOrders(year) {
  const orders = await got(`${WORDPRESS_BASE_URL}/api-json-wp/cowo/v1/commandes/${year}`, {
    username: WP_APIV2_USERNAME,
    password: WP_APIV2_PASSWORD
  }).json()
  return orders
}

export async function getUser(userId) {
  const user = await got(`${WORDPRESS_BASE_URL}/api-json-wp/wp/v2/users/${userId}?context=edit`, {
    username: process.env.WP_APIV2_USERNAME,
    password: process.env.WP_APIV2_PASSWORD
  }).json()

  return user
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

/**
 * Build user picture URL depending on the size
 *
 * @param {number} wordpressUserId
 * @param {'micro' | 'thumbnail' | 'small' | 'medium' | 'big' } size
 * @returns {string | null}
 */
export function buildPictureUrl(wordpressUserId, size = 'medium') {
  return isNil(wordpressUserId) ? null : new URL(`/photo/size/${size}/${wordpressUserId}.jpg`, PHOTOS_BASE_URL).toString()
}
