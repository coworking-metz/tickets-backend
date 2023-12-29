import {add} from 'date-fns'
import {range} from 'lodash-es'
import {customAlphabet} from 'nanoid'

import mongo from './util/mongo.js'
import {getUser as getWpUser} from './util/wordpress.js'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export async function addTickets(userId, purchaseDate, quantity) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.tickets': {
          purchaseDate,
          tickets: quantity
        }
      }
    }
  )
}

export async function addAbo(userId, purchaseDate, startDate, quantity) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.abos': {
          $each: range(quantity).map(i => ({
            purchaseDate,
            aboStart: add(new Date(startDate), {months: i}).toISOString().slice(0, 10)
          }))
        }
      }
    }
  )
}

export async function addMembership(userId, purchaseDate, membershipStart) {
  await mongo.db.collection('users').updateOne(
    {_id: userId},
    {
      $push: {
        'profile.memberships': {
          purchaseDate,
          membershipStart
        }
      }
    }
  )
}

export async function getUserIdByEmail(email) {
  const user = await mongo.db.collection('users')
    .findOne({emails: {$elemMatch: {address: email}}}, {projection: {_id: 1}})

  if (user) {
    return user._id
  }
}

export async function createUser({wpUserId, firstName, lastName, email}) {
  const user = {
    _id: nanoid(17),
    wpUserId,
    createdAt: new Date(),
    emails: [
      {address: email, verified: false}
    ],
    services: {},
    profile: {
      tickets: [],
      presences: [],
      abos: [],
      memberships: [],
      macAddresses: [],
      firstName,
      lastName,
      isAdmin: false,
      balance: 0,
      heartbeat: null
    }
  }

  await mongo.db.collection('users').insertOne(user)
  return user
}

export async function getUserIdByWpUserId(wpUserId) {
  const user = await mongo.db.collection('users').findOne({wpUserId}, {projection: {_id: 1}})

  if (user) {
    return user._id
  }
}

export async function findOrCreateRelatedUserId(wpUserId) {
  const {email, first_name: firstName, last_name: lastName} = await getWpUser(wpUserId)
  const userId = await getUserIdByWpUserId(wpUserId) || await getUserIdByEmail(email)

  if (userId) {
    await mongo.db.collection('users').updateOne(
      {_id: userId},
      {
        $set: {
          wpUserId,
          emails: [{address: email, verified: false}],
          'profile.firstName': firstName,
          'profile.lastName': lastName
        }
      }
    )
    return userId
  }

  const user = await createUser({wpUserId, firstName, lastName, email})
  return user._id
}
