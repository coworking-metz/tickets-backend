import process from 'node:process'
import got from 'got'
import createHttpError from 'http-errors'
import {isNil} from 'lodash-es'

const {
  WP_APIV2_USERNAME, WP_APIV2_PASSWORD,
  WORDPRESS_BASE_URL,
  WORDPRESS_OAUTH_CLIENT_ID,
  WORDPRESS_OAUTH_CLIENT_SECRET,
  PHOTOS_BASE_URL
} = process.env

/**
 * Turn a WordPress 4xx into a proper HTTP error.
 *
 * WordPress validates what it receives (dates, allowed choices, roles) and answers
 * 4xx with an explanatory message. got's HTTPError only carries the status under
 * `response.statusCode`, so without this it reaches our error handler without a
 * `statusCode` and gets served as a bare 500 — the manager would then only show
 * "Une erreur inattendue est survenue." instead of the reason.
 *
 * @param {Error} error
 * @throws always
 */
function rethrowWordPressError(error) {
  const status = error.response?.statusCode

  if (status >= 400 && status < 500) {
    let message = error.response.body

    try {
      message = JSON.parse(error.response.body).message ?? message
    } catch {}

    throw createHttpError(status, message)
  }

  throw error
}

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

/**
 * Options owned by WordPress, editable from the manager.
 *
 * They live in WordPress and stay there: several are read live by the shop
 * (payment gateways, purchasable products) or by the exports. We only mirror
 * them on our side for display.
 *
 * Maps our camelCase names to the ACF field names, with the expected type.
 */
export const USER_OPTIONS = {
  canPayByBankTransfer: {acf: 'payer_en_virement', type: 'boolean'},
  isEligibleToReducedRate: {acf: 'tarifs_reduits_ok', type: 'boolean'},
  isBoardCandidate: {acf: 'candidat_au_ca', type: 'boolean'},
  birthDate: {acf: 'date_naissance', type: 'string'}, // YYYY-MM-DD
  polaroidName: {acf: 'polaroid_nom', type: 'string'},
  polaroidDescription: {acf: 'polaroid_description', type: 'string'},
  legalStatus: {acf: 'statut_juridique', type: 'string'},
  activityType: {acf: 'type_activite', type: 'string'}
}

/**
 * Translate an `acf` payload into our own naming.
 *
 * @param {Object} acf either the `acf` object of a WordPress user, or the
 *   `values` object returned by the cowo/v1 options endpoint
 * @returns {Object}
 */
export function formatUserOptions(acf = {}) {
  return Object.fromEntries(
    Object.entries(USER_OPTIONS).map(([name, {acf: field, type}]) => [
      name,
      type === 'boolean' ? Boolean(acf[field]) : (acf[field] ?? '')
    ])
  )
}

/**
 * Values allowed for the options backed by a select.
 * Reading them from WordPress avoids duplicating the list on our side and keeps
 * it in sync when it is edited there. Callers are expected to cache the result:
 * the list changes very rarely.
 *
 * @returns {Promise<{legalStatus: string[], activityType: string[]}>}
 */
export async function getUserOptionsChoices() {
  const choices = await got(`${WORDPRESS_BASE_URL}/api-json-wp/cowo/v1/user-options/choices`, {
    username: WP_APIV2_USERNAME,
    password: WP_APIV2_PASSWORD,
    timeout: {
      request: 10_000
    }
  }).json()

  return {
    legalStatus: Object.keys(choices?.statut_juridique ?? {}),
    activityType: Object.keys(choices?.type_activite ?? {})
  }
}

/**
 * Update the WordPress-side options of a member.
 * Only the keys actually provided are sent, so a partial update stays partial.
 *
 * @param {number} wordpressUserId
 * @param {Object} options subset of USER_OPTIONS keys
 * @returns {Promise<Object>} the resulting state, as reported by WordPress
 */
export async function updateUserOptions(wordpressUserId, options) {
  const payload = {}

  for (const [name, {acf: field, type}] of Object.entries(USER_OPTIONS)) {
    if (isNil(options[name])) {
      continue
    }

    payload[field] = type === 'boolean' ? Boolean(options[name]) : String(options[name])
  }

  const {values} = await got.post(`${WORDPRESS_BASE_URL}/api-json-wp/cowo/v1/users/${wordpressUserId}/options`, {
    username: WP_APIV2_USERNAME,
    password: WP_APIV2_PASSWORD,
    json: payload,
    timeout: {
      request: 30_000 // 30 seconds: WordPress can be slow on this endpoint
    }
  }).json().catch(error => {
    // WordPress validates the values (dates, allowed choices) and answers 4xx with
    // an explanatory message. Without this, got's HTTPError would surface as a bare
    // 500 and the manager would only show "an unexpected error occurred".
    const status = error.response?.statusCode

    if (status && status >= 400 && status < 500) {
      let message = error.response.body

      try {
        message = JSON.parse(error.response.body).message ?? message
      } catch {}

      throw createHttpError(status, message)
    }

    throw error
  })

  return formatUserOptions(values)
}

/**
 * Update the identity fields of a WordPress user.
 *
 * Unlike the attributes above, these are not ACF fields: they live in WordPress
 * core, so the standard REST endpoint is enough. It goes through wp_update_user(),
 * which fires `profile_update` and therefore our own sync webhook — harmless,
 * we refresh our copy right after anyway.
 *
 * @param {number} wordpressUserId
 * @param {{firstName?: string, lastName?: string}} profile
 * @returns {Promise<{firstName: string, lastName: string}>}
 */
export async function updateUserProfile(wordpressUserId, profile) {
  const payload = {}

  if (!isNil(profile.firstName)) {
    payload.first_name = String(profile.firstName)
  }

  if (!isNil(profile.lastName)) {
    payload.last_name = String(profile.lastName)
  }

  const updated = await got.post(`${WORDPRESS_BASE_URL}/api-json-wp/wp/v2/users/${wordpressUserId}`, {
    username: WP_APIV2_USERNAME,
    password: WP_APIV2_PASSWORD,
    json: payload,
    timeout: {
      request: 30_000
    }
  }).json().catch(rethrowWordPressError)

  return {
    firstName: updated.first_name ?? '',
    lastName: updated.last_name ?? ''
  }
}

/**
 * Replace the roles of a WordPress user.
 *
 * @param {number} wordpressUserId
 * @param {string[]} roles
 * @returns {Promise<string[]>} the resulting roles
 */
export async function updateUserRoles(wordpressUserId, roles) {
  const updated = await got.post(`${WORDPRESS_BASE_URL}/api-json-wp/wp/v2/users/${wordpressUserId}`, {
    username: WP_APIV2_USERNAME,
    password: WP_APIV2_PASSWORD,
    json: {roles},
    timeout: {
      request: 30_000
    }
  }).json().catch(rethrowWordPressError)

  return updated.roles ?? []
}

export function getUserFromOAuthAccessToken(accessToken) {
  return got.post(`${WORDPRESS_BASE_URL}/oauth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    timeout: {
      request: 20_000 // 20 seconds
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
    },
    timeout: {
      request: 5000 // 5 seconds
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

export function getAnonymousPictureUrl() {
  return new URL('/polaroid/images/default.jpg', WORDPRESS_BASE_URL).toString()
}

/**
 * Build user polaroid URL depending on the size
 *
 * @param {number} wordpressUserId
 * @param {'micro' | 'thumbnail' | 'small' | 'medium' | 'big' } size
 * @returns {string | null}
 */
export function buildPolaroidUrl(wordpressUserId, size = 'medium') {
  return isNil(wordpressUserId) ? null : new URL(`/polaroid/size/${size}/${wordpressUserId}.jpg`, PHOTOS_BASE_URL).toString()
}
