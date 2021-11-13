#!/usr/bin/env node
require('dotenv').config()

const mongo = require('../lib/mongo')
const {updateBalance} = require('../lib/models')

async function main() {
  await mongo.connect()
  const userIds = await mongo.db.collection('users').distinct('_id')

  for (const userId of userIds) {
    /* eslint-disable-next-line no-await-in-loop */
    const balance = await updateBalance(userId)
    console.log(`${userId} : ${balance}`)
  }

  console.log('Completed!')
  await mongo.disconnect()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
