#!/usr/bin/env node

/**
 * Periodically sends a deterministic set of MAC addresses to the API
 * to simulate a fake scanner device locally, for contributing purposes.
 */

import got from 'got'
import process from 'node:process'
import crypto from 'node:crypto'

const adminTokens = process.env.ADMIN_TOKENS
  ? process.env.ADMIN_TOKENS.split(',').filter(Boolean)
  : []
const PORT = process.env.PORT || 8000
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`

// Function to parse MAC addresses from the received format
const parseDevices = data => data.split('\n').map(line => {
  const [mac, email, firstName, lastName] = line.split('\t')
  return {mac, email, firstName, lastName}
})

// Function to fetch the list of MAC addresses from the API
const fetchDevices = async () => {
  const [token] = adminTokens
  const devices = await got.post('api/mac', {
    prefixUrl: API_BASE_URL,
    headers: {
      Authorization: `Token ${token}`
    }
  }).text()
  return parseDevices(devices)
}

// Function to generate a deterministic random number based on a seed
const seededRandom = (seed, min, max) => {
  const hash = crypto.createHash('sha256').update(seed).digest('hex')
  const num = Number.parseInt(hash.slice(0, 8), 16) / 0xFF_FF_FF_FF
  return Math.floor(num * (max - min + 1)) + min
}

// Function to extract a deterministic set of devices based on the hour
const getHourlyDevices = (devices, date) => {
  const seed = date.toISOString().split(':')[0] // Use the date and hour as a seed
  const count = seededRandom(seed, 5, 15) // Deterministic count between 5 and 15
  return devices.sort(() => 0.5 - seededRandom(seed, 0, 1)).slice(0, count)
}

// Function to shuffle an array
const shuffleArray = array => array.sort(() => Math.random() - 0.5)

// Function to send MAC addresses to the API
const sendMacAddresses = async () => {
  try {
    const allDevices = await fetchDevices()
    const now = new Date()
    const someDevices = getHourlyDevices(allDevices, now)
    const shuffledDevices = shuffleArray(someDevices)
    const macAddresses = shuffledDevices.map(({mac}) => mac).join(',')
    console.log('Sending MAC addresses:', macAddresses)

    const [token] = adminTokens
    const result = await got.post('api/heartbeat', {
      prefixUrl: API_BASE_URL,
      headers: {
        Authorization: `Token ${token}`
      },
      form: {macAddresses}
    }).text()

    if (result === 'OK') {
      console.log('MAC addresses sent successfully')
    }
  } catch {}
}

// Periodically send MAC addresses every minute
setInterval(sendMacAddresses, 60 * 1000)

// Send immediately on startup
await sendMacAddresses()
