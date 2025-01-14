#!/usr/bin/env node

/**
 * This script recalculates the balances of members
 * If the `--membersIds` argument is provided, the script will use the specified member IDs.
 * Otherwise, it retrieves all unique member IDs from the database. After processing,
 * it logs each member's ID and balance
 *
 * Usage:
 *   node script.js [--membersIds=id1,id2,id3]
 *
 */

import 'dotenv/config.js'
import process from 'node:process'

import mongo from '../lib/util/mongo.js'
import * as Member from '../lib/models/member.js'

await mongo.connect()

const args = process.argv.slice(2)

const memberIdsArg = args.find(arg => arg.startsWith('--membersIds='))
let memberIds = false
// eslint-disable-next-line unicorn/prefer-ternary
if (memberIdsArg) {
  memberIds = memberIdsArg.split('=')[1].split(',').map(id => id.trim())
} else {
  memberIds = await mongo.db.collection('users').distinct('_id')
}

if (memberIds) {
// Process each member ID
  for (const memberId of memberIds) {
  /* eslint-disable-next-line no-await-in-loop */
    const balance = await Member.recomputeBalance(memberId)
    console.log(`${memberId} : ${balance}`)
  }
}

console.log('Completed!')
await mongo.disconnect()
