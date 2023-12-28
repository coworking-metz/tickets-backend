#!/usr/bin/env node
import 'dotenv/config.js'

import mongo from '../lib/util/mongo.js'
import * as Member from '../lib/models/member.js'

await mongo.connect()
const userIds = await mongo.db.collection('users').distinct('_id', {wpUserId: {$ne: null}})

for (const userId of userIds) {
  /* eslint-disable-next-line no-await-in-loop */
  await Member.syncWithWordpress(userId)
  console.log(`${userId} synchronized`)
}

console.log('Completed!')
await mongo.disconnect()
