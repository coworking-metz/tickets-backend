#!/usr/bin/env node
import 'dotenv/config.js'

import mongo from '../lib/util/mongo.js'
import * as Member from '../lib/models/member.js'

await mongo.connect()

console.log('Synchronizing members...')
await Member.syncAllWithWordpress(memberId => console.log(`${memberId} synchronized`))
console.log('Completed!')

await mongo.disconnect()
