const crypto = require('node:crypto')
const {Buffer} = require('node:buffer')
const jwt = require('jsonwebtoken')

const {
  JWT_ACCESS_TOKEN_PRIVATE_KEY,
  JWT_ACCESS_TOKEN_EXPIRATION_TIME,
  JWT_REFRESH_TOKEN_PRIVATE_KEY,
  JWT_REFRESH_TOKEN_EXPIRATION_TIME,
  JWT_REFRESH_TOKEN_SECRET_KEY,
} = process.env
const ENCRYPTION_ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16 // For AES, this is always 16

const createAccessToken = (userId, userName, userEmail, userRoles) => {
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

const verifyAccessToken = jwtAccessToken => new Promise((resolve, reject) => {
  jwt.verify(jwtAccessToken, JWT_ACCESS_TOKEN_PRIVATE_KEY, (err, jwtDetails) => {
    if (err) {
      return reject(err)
    }

    resolve(jwtDetails)
  })
})

const createRefreshToken = oauthRefreshToken => {
  // Encrypt the oauth refresh token
  const initializationVector = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(JWT_REFRESH_TOKEN_SECRET_KEY), initializationVector)
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

const verifyRefreshToken = jwtRefreshToken => new Promise((resolve, reject) => {
  jwt.verify(jwtRefreshToken, JWT_REFRESH_TOKEN_PRIVATE_KEY, (err, jwtDetails) => {
    if (err) {
      return reject(new Error('Invalid refresh token'))
    }

    // Decrypt the oauth refresh token from the JWT
    const initializationVector = Buffer.from(jwtDetails.iv, 'hex')
    const encrypted = Buffer.from(jwtDetails.rt, 'hex')
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(JWT_REFRESH_TOKEN_SECRET_KEY), initializationVector)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString()

    resolve(decrypted)
  })
})

module.exports = {
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  verifyRefreshToken,
}
