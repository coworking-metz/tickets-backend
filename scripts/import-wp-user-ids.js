#!/usr/bin/env node
/* eslint no-await-in-loop: off */
import 'dotenv/config.js'

import {readFile} from 'node:fs/promises'

import mongo from '../lib/util/mongo.js'
import {getUserIdByWpUserId, getUserIdByEmail} from '../lib/models.js'

const wpUsers = JSON.parse(await readFile('./wp-users.json', {encoding: 'utf8'}))

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

await mongo.connect()

for (const wpUser of wpUsers) {
  await importWpUserId(wpUser)
}

console.log('Completed!')
await mongo.disconnect()
