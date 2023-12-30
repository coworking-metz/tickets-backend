#!/usr/bin/env node
import 'dotenv/config.js'

import mongo from '../lib/util/mongo.js'
import * as Member from '../lib/models/member.js'

await mongo.connect()
const memberIds = await mongo.db.collection('users').distinct('_id')

for (const memberId of memberIds) {
  /* eslint-disable-next-line no-await-in-loop */
  const balance = await Member.recomputeBalance(memberId)
  console.log(`${memberId} : ${balance}`)
}

console.log('Completed!')
await mongo.disconnect()
