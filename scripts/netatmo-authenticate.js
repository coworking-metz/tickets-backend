#!/usr/bin/env node
import 'dotenv/config.js'
import process from 'node:process'
import {authenticateWithRefreshToken} from '../lib/services/netatmo.js'

const refreshToken = process.argv[2]

if (!refreshToken) {
  throw new Error('Netatmo refresh token must be provided as first parameter')
}

await authenticateWithRefreshToken(refreshToken)
console.log('Authentication successful')
