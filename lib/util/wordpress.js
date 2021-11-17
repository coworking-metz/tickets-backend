const got = require('got')

const WP_APIV2_URL = process.env.WP_APIV2_URL || 'https://www.coworking-metz.fr/wp-json/wp/v2'

async function getUser(userId) {
  const response = await got(`${WP_APIV2_URL}/users/${userId}?context=edit`, {
    responseType: 'json',
    username: process.env.WP_APIV2_USERNAME,
    password: process.env.WP_APIV2_PASSWORD,
  })

  return response.body
}

module.exports = {getUser}
