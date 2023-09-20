#!/usr/bin/env node
import 'dotenv/config.js'

import mongo from '../lib/util/mongo.js'
import {syncUser} from '../lib/models.js'

await mongo.connect()
const userIds = await mongo.db.collection('users').distinct('_id', {wpUserId: {$ne: null}})

for (const userId of userIds) {
  /* eslint-disable-next-line no-await-in-loop */
  await syncUser(userId)
  console.log(`${userId} synchronized`)
}

console.log('Completed!')
await mongo.disconnect()
