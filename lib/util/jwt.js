import crypto from 'node:crypto'
import {Buffer} from 'node:buffer'
import process from 'node:process'
import jwt from 'jsonwebtoken'

const {
  JWT_ACCESS_TOKEN_PRIVATE_KEY,
  JWT_ACCESS_TOKEN_EXPIRATION_TIME,
  JWT_REFRESH_TOKEN_PRIVATE_KEY,
  JWT_REFRESH_TOKEN_EXPIRATION_TIME,
  JWT_REFRESH_TOKEN_SECRET_KEY,
} = process.env
const ENCRYPTION_ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16 // For AES, this is always 16

if (!JWT_REFRESH_TOKEN_SECRET_KEY || JWT_REFRESH_TOKEN_SECRET_KEY.length < 32) {
  throw new Error('JWT_REFRESH_TOKEN_SECRET_KEY must be defined with at least 32 characters')
}

export function createAccessToken(userId, userName, userEmail, userRoles) {
  const payload = {
    id: userId,
    email: userEmail,
    name: userName,
    roles: userRoles,
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
        email: jwtDetails.email,
        name: jwtDetails.name,
        roles: jwtDetails.roles
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
    initializationVector,
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
          throw new Error(err)
        }

        // Decrypt the oauth refresh token from the JWT
        const initializationVector = Buffer.from(jwtDetails.iv, 'hex')
        const encrypted = Buffer.from(jwtDetails.rt, 'hex')
        const decipher = crypto.createDecipheriv(
          ENCRYPTION_ALGORITHM,
          Buffer.from(JWT_REFRESH_TOKEN_SECRET_KEY.slice(0, 32)),
          initializationVector,
        )
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString()

        resolve(decrypted)
      } catch (error) {
        reject(error)
      }
    })
  })
}
