#!/usr/bin/env node
/* eslint no-await-in-loop: off */
require('dotenv').config()

const mongo = require('../lib/util/mongo')
const {getUserIdByWpUserId, getUserIdByEmail} = require('../lib/models')
const wpUsers = require('../wp-users.json')

async function importWpUserId(wpUser) {
  if (!wpUser.ID || !wpUser.user_email) {
    return
  }

  const email = wpUser.user_email
  const wpUserId = Number.parseInt(wpUser.ID, 10)

  const userId = await getUserIdByWpUserId(wpUserId) || await getUserIdByEmail(email)

  if (!userId) {
    return
  }

  const {modifiedCount} = await mongo.db.collection('users').updateOne(
    {_id: userId, wpUserId: null},
    {$set: {wpUserId}}
  )

  if (modifiedCount === 0) {
    console.log(`WP User ${wpUserId} => already associated to ${userId}`)
  } else {
    console.log(`WP User ${wpUserId} => associated to ${userId}`)
  }
}

async function main() {
  await mongo.connect()

  for (const wpUser of wpUsers) {
    await importWpUserId(wpUser)
  }

  console.log('Completed!')
  await mongo.disconnect()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
