#!/usr/bin/env node
/* eslint no-await-in-loop: off */
require('dotenv').config()
const {sortBy} = require('lodash')

const mongo = require('../lib/util/mongo')
const {computeAboEnd} = require('../lib/models')

async function main() {
  await mongo.connect()
  const users = await mongo.db.collection('users').find({}, {projection: {'profile.presences': 0}}).toArray()

  for (const user of users) {
    const abos = user.profile.abos.map(a => {
      const aboEnd = computeAboEnd(a.aboStart)
      return {...a, aboEnd}
    })

    await mongo.db.collection('users').updateOne(
      {_id: user._id},
      {$set: {'profile.abos': sortBy(abos, 'aboStart')}}
    )
  }

  console.log('Completed!')
  await mongo.disconnect()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
