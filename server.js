#!/usr/bin/env node
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const Papa = require('papaparse')

const mongo = require('./lib/mongo')
const w = require('./lib/w')
const cache = require('./lib/cache')
const netatmo = require('./lib/netatmo')

const {computeStats, computePeriodsStats, asCsv} = require('./lib/stats')

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

  if (req.query.format === 'csv') {
    return res.type('text/csv').send(
      Papa.unparse(stats.map(s => asCsv(s)))
    )
  }

  res.send(stats)
}))

app.get('/netatmo/stations', w(async (req, res) => {
  if (!netatmo.isConfigured()) {
    return res.status(501).send({code: 501, message: 'Non disponible. Netatmo n’est pas configuré.'})
  }

  const stations = await netatmo.getStations()
  res.send(stations)
}))

const port = process.env.PORT || 5000

async function main() {
  await mongo.connect()
  await cache.load()

  app.listen(port, () => {
    console.log(`Start listening on port ${port}!`)
  })

  // Précalcul des données
  if (process.env.PRECOMPUTE_STATS === '1') {
    await Promise.all([...PERIODS_TYPES].map(periodType => computePeriodsStats(periodType)))
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
