#!/usr/bin/env node
import 'dotenv/config.js'

import mongo from '../lib/util/mongo.js'
import {updateBalance} from '../lib/models.js'

await mongo.connect()
const userIds = await mongo.db.collection('users').distinct('_id')

for (const userId of userIds) {
  /* eslint-disable-next-line no-await-in-loop */
  const balance = await updateBalance(userId)
  console.log(`${userId} : ${balance}`)
}

console.log('Completed!')
await mongo.disconnect()
