import process from 'node:process'
import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {add} from 'date-fns'
import got from 'got'

const {NETATMO_CLIENT_ID, NETATMO_CLIENT_SECRET} = process.env
const NETATMO_API_BASE_URL = 'https://api.netatmo.com'

/* Auth */

async function writeAuthContext(context) {
  await mkdir('./data', {recursive: true})
  await writeFile('./data/netatmo.json', JSON.stringify(context))
}

async function readAuthContext() {
  try {
    const authContextData = await readFile('./data/netatmo.json')
    const authContext = JSON.parse(authContextData)

    if (authContext.expiresAt < Date.now()) {
      throw new Error('Netatmo auth context is expired')
    }

    return authContext
  } catch {
    throw new Error('Netatmo auth context is not set')
  }
}

export async function refreshTokens(currentRefreshToken) {
  try {
    const formData = new FormData()
    formData.set('client_id', NETATMO_CLIENT_ID)
    formData.set('client_secret', NETATMO_CLIENT_SECRET)
    formData.set('grant_type', 'refresh_token')
    formData.set('refresh_token', currentRefreshToken)

    const {access_token, expires_in, refresh_token} = await got.post(
      `${NETATMO_API_BASE_URL}/oauth2/token`,
      {body: formData}
    ).json()

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: (add(new Date(), {seconds: expires_in})).getTime()
    }
  } catch {
    throw new Error('Tokens refresh failed')
  }
}

async function getAccessToken() {
  const {accessToken} = await readAuthContext()
  return accessToken
}

export async function authenticateWithRefreshToken(refreshToken) {
  const authContext = await refreshTokens(refreshToken)
  await writeAuthContext(authContext)
}

async function refreshTokenLoop() {
  try {
    const {refreshToken} = await readAuthContext()
    await authenticateWithRefreshToken(refreshToken)
  } catch (error) {
    console.error(error.message)
  } finally {
    setTimeout(refreshTokenLoop, 5 * 1000) // 10 minutes
  }
}

export async function startNetatmoRefreshTokenLoop() {
  await refreshTokenLoop()
}

/* GetStations */

export async function getStations() {
  const accessToken = await getAccessToken()

  let body

  try {
    body = await got(
      `${NETATMO_API_BASE_URL}/api/getstationsdata`,
      {headers: {authorization: `Bearer ${accessToken}`}}
    ).json()
  } catch {
    throw new Error('Unable to get stations data')
  }

  return body.body.devices
}
