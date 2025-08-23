import crypto from 'node:crypto'
import {Buffer} from 'node:buffer'
import process from 'node:process'
import jwt from 'jsonwebtoken'
import {buildPictureUrl} from './wordpress.js'
import {computeMemberFromUser, computeMemberCapabilitiesFromUser} from '../models/member.js'
import {zonedTimeToUtc} from 'date-fns-tz'

const {
  JWT_ACCESS_TOKEN_PRIVATE_KEY,
  JWT_ACCESS_TOKEN_EXPIRATION_TIME,
  JWT_REFRESH_TOKEN_PRIVATE_KEY,
  JWT_REFRESH_TOKEN_EXPIRATION_TIME,
  JWT_REFRESH_TOKEN_SECRET_KEY
} = process.env
const ENCRYPTION_ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16 // For AES, this is always 16

if (!JWT_REFRESH_TOKEN_SECRET_KEY || JWT_REFRESH_TOKEN_SECRET_KEY.length < 32) {
  throw new Error('JWT_REFRESH_TOKEN_SECRET_KEY must be defined with at least 32 characters')
}

export async function createAccessToken(user, wordpressUser, impersonatedBy = null) {
  const payload = {
    id: user?._id ?? null,
    wpUserId: wordpressUser.id,
    email: user?.email ?? wordpressUser.user_email,
    name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || wordpressUser.display_name,
    roles: wordpressUser.roles,
    picture: buildPictureUrl(wordpressUser.id),
    capabilities: []
  }

  let isUserOnboardingToday = false
  if (wordpressUser.visite?.date) {
    // Set date to the correct timezone until wordpress does it
    // Don't look close enough, it's a hack
    const onboardingDate = zonedTimeToUtc(wordpressUser.visite.date, 'Europe/Paris')

    payload.onboarding = {
      date: onboardingDate.toISOString()
    }
    isUserOnboardingToday = onboardingDate.toDateString() === new Date().toDateString()
  }

  if (user) {
    const member = await computeMemberFromUser(user, {withAbos: true, withActivity: true})
    const memberCapabilities = computeMemberCapabilitiesFromUser(member, user)
    const enabledCapabilities = Object.keys(memberCapabilities)
      .filter(capability => Boolean(memberCapabilities[capability]))
    payload.capabilities = enabledCapabilities
  } else if (wordpressUser.roles.includes('external') || isUserOnboardingToday) {
    const externalCapabilities = ['UNLOCK_GATE', 'PARKING_ACCESS']
    payload.capabilities = externalCapabilities
  }

  if (impersonatedBy) {
    payload.impersonatedBy = {
      id: impersonatedBy.id,
      wpUserId: impersonatedBy.wpUserId,
      email: impersonatedBy.email,
      name: impersonatedBy.name
    }
  }

  const accessToken = jwt.sign(
    payload,
    JWT_ACCESS_TOKEN_PRIVATE_KEY,
    {expiresIn: JWT_ACCESS_TOKEN_EXPIRATION_TIME}
  )

  return accessToken
}

export function verifyAccessToken(jwtAccessToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(jwtAccessToken, JWT_ACCESS_TOKEN_PRIVATE_KEY, (err, jwtDetails) => {
      if (err) {
        return reject(err)
      }

      resolve({
        id: jwtDetails.id,
        wpUserId: jwtDetails.wpUserId,
        email: jwtDetails.email,
        name: jwtDetails.name,
        roles: jwtDetails.roles || [],
        capabilities: jwtDetails.capabilities,
        onboarding: jwtDetails.onboarding,
        impersonatedBy: jwtDetails.impersonatedBy || null
      })
    })
  })
}

export function createRefreshToken(oauthRefreshToken) {
  // Encrypt the oauth refresh token
  const initializationVector = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(JWT_REFRESH_TOKEN_SECRET_KEY.slice(0, 32)),
    initializationVector
  )
  const encrypted = Buffer.concat([cipher.update(oauthRefreshToken), cipher.final()])

  // Include it in a JWT
  const refreshToken = jwt.sign(
    {
      iv: initializationVector.toString('hex'),
      rt: encrypted.toString('hex')
    },
    JWT_REFRESH_TOKEN_PRIVATE_KEY,
    {expiresIn: JWT_REFRESH_TOKEN_EXPIRATION_TIME}
  )

  return refreshToken
}

export function verifyRefreshToken(jwtRefreshToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(jwtRefreshToken, JWT_REFRESH_TOKEN_PRIVATE_KEY, (err, jwtDetails) => {
      try {
        if (err) {
          throw err
        }

        // Decrypt the oauth refresh token from the JWT
        const initializationVector = Buffer.from(jwtDetails.iv, 'hex')
        const encrypted = Buffer.from(jwtDetails.rt, 'hex')
        const decipher = crypto.createDecipheriv(
          ENCRYPTION_ALGORITHM,
          Buffer.from(JWT_REFRESH_TOKEN_SECRET_KEY.slice(0, 32)),
          initializationVector
        )
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString()

        resolve(decrypted)
      } catch (error) {
        reject(error)
      }
    })
  })
}
