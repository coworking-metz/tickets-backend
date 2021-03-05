#!/usr/bin/env node
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const mongo = require('./lib/mongo')
const w = require('./lib/w')
const cache = require('./lib/cache')

const {computeStats, computePeriodsStats} = require('./lib/stats')

const app = express()

app.use(cors({origin: true}))

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.get('/stats', w(async (req, res) => {
  const stats = await computeStats()
  res.send(stats)
}))

const PERIODS_TYPES = new Set(['day', 'week', 'month', 'year'])

app.get('/stats/:periodType', w(async (req, res) => {
  const {periodType} = req.params

  if (!PERIODS_TYPES.has(periodType)) {
    return res.sendStatus(404)
  }

  const stats = await computePeriodsStats(periodType)
  res.send(stats)
}))

const port = process.env.PORT || 5000

async function main() {
  await mongo.connect()
  await cache.load()

  app.listen(port, () => {
    console.log(`Start listening on port ${port}!`)
  })

  // Précalcul des données
  await Promise.all([...PERIODS_TYPES].map(periodType => computePeriodsStats(periodType)))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
