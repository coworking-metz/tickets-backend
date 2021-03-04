#!/usr/bin/env node
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const mongo = require('./lib/mongo')
const w = require('./lib/w')

const {computeStats} = require('./lib/stats')

const app = express()

app.use(cors({origin: true}))

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.get('/stats', w(async (req, res) => {
  const stats = await computeStats()
  res.send(stats)
}))

const port = process.env.PORT || 5000

async function main() {
  await mongo.connect()
  app.listen(port, () => {
    console.log(`Start listening on port ${port}!`)
  })
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
