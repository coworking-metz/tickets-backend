#!/usr/bin/env node
/* eslint no-await-in-loop: off */
require('dotenv').config()
const {sortBy} = require('lodash')

const mongo = require('../lib/util/mongo')

async function main() {
  await mongo.connect()
  const users = await mongo.db.collection('users').find({}, {projection: {'profile.presences': 0}}).toArray()

  for (const user of users) {
    const memberships = user.profile.memberships.map(m => {
      if (m.membershipStart < '2018-01-01') {
        return m
      }

      const membershipStart = new Date(m.membershipStart)
      const membershipYear = membershipStart.getMonth() === 11 ? membershipStart.getFullYear() + 1 : membershipStart.getFullYear()

      return {
        ...m,
        membershipYear: String(membershipYear)
      }
    })

    await mongo.db.collection('users').updateOne(
      {_id: user._id},
      {$set: {'profile.memberships': sortBy(memberships, 'membershipStart')}}
    )
  }

  console.log('Completed!')
  await mongo.disconnect()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
