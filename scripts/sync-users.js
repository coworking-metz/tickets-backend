#!/usr/bin/env node
require('dotenv').config()

const mongo = require('../lib/util/mongo')
const {syncUser} = require('../lib/models')

async function main() {
  await mongo.connect()
  const userIds = await mongo.db.collection('users').distinct('_id', {wpUserId: {$ne: null}})

  for (const userId of userIds) {
    /* eslint-disable-next-line no-await-in-loop */
    await syncUser(userId)
    console.log(`${userId} synchronized`)
  }

  console.log('Completed!')
  await mongo.disconnect()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
