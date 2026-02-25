import process from 'node:process'
import got from 'got'
import createError from 'http-errors'

const {MD_PROXY_BASE_URL, MD_PROXY_TOKEN} = process.env

export async function openSDIS1() {
  if (!MD_PROXY_BASE_URL || !MD_PROXY_TOKEN) {
    throw createError(501, 'MD proxy service not configured')
  }

  await got.post('api/services/open-sdis1', {
    prefixUrl: MD_PROXY_BASE_URL,
    timeout: {
      request: 5000
    },
    headers: {
      authorization: `Token ${MD_PROXY_TOKEN}`
    }
  })
}
