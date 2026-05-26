import createHttpError from 'http-errors'
import {nanoid} from 'nanoid'

import mongo from '../util/mongo.js'

export async function upsertPushToken(memberId, token, platform) {
  const now = new Date()
  const upsertedPushToken = await mongo.db.collection('push_tokens').findOneAndUpdate(
    {memberId, token},
    {
      $set: {updatedAt: now, active: true},
      $setOnInsert: {_id: nanoid(17), memberId, token, platform, createdAt: now}
    },
    {upsert: true, returnDocument: 'after'}
  )

  return formatPushToken(upsertedPushToken.value)
}

export async function getMemberPushTokens(memberId) {
  const memberTokens = await mongo.db.collection('push_tokens').find({memberId, active: true})
    .sort({updatedAt: -1})
    .toArray()
  return memberTokens.map(t => formatPushToken(t))
}

export async function deletePushToken(memberId, token) {
  const result = await mongo.db.collection('push_tokens').deleteOne({token, memberId})
  if (result.deletedCount === 0) {
    throw createHttpError(404, 'Push token introuvable pour ce membre')
  }
}

export async function deactivatePushToken(token) {
  await mongo.db.collection('push_tokens').updateOne(
    {token},
    {$set: {active: false, updatedAt: new Date()}}
  )
}

const formatPushToken = rawToken => ({
  _id: rawToken._id,
  memberId: rawToken.memberId,
  token: rawToken.token,
  platform: rawToken.platform,
  active: rawToken.active,
  createdAt: rawToken.createdAt,
  updatedAt: rawToken.updatedAt
})
