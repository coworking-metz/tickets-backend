import createHttpError from 'http-errors'

import mongo from '../util/mongo.js'
import {isPresenceDuringAbo} from '../calc.js'

import * as Member from './member.js'

export async function getMemberActivity(memberId) {
  const user = await Member.getUserById(memberId)

  if (!user) {
    throw createHttpError(404, 'Member not found')
  }

  // TODO: we should retrieve subscriptions from the "subscriptions" collection instead of the user profile
  const {abos} = user.profile

  const activity = await mongo.db.collection('member_activity')
    .find({member: memberId})
    .sort({date: -1})
    .toArray()

  return activity.map(item => ({
    date: item.date,
    value: item.overrideValue ?? item.value,
    type: isPresenceDuringAbo(item.date, abos) ? 'subscription' : 'ticket'
  }))
}

export async function getMemberRawActivity(memberId) {
  return mongo.db.collection('member_activity')
    .find({member: memberId})
    .sort({date: 1})
    .toArray()
}

export async function getMemberActivityByDate(memberId, date) {
  return mongo.db.collection('member_activity')
    .findOne({member: memberId, date})
}

export async function updateMemberActivity(memberId, date, value, overrideValue = null) {
  if (![0, 0.5, 1].includes(value)) {
    throw createHttpError(400, 'Invalid value')
  }

  if (!isValidDate(date)) {
    throw createHttpError(400, 'Invalid date')
  }

  if (value === 0) {
    await mongo.db.collection('member_activity').deleteOne({member: memberId, date})
    return
  }

  const set = {value}
  if (overrideValue !== null) {
    set.overrideValue = overrideValue
  }

  const updatedActivity = await mongo.db.collection('member_activity').findOneAndUpdate(
    {member: memberId, date},
    {$set: set},
    {upsert: true, returnDocument: 'after'}
  )

  return updatedActivity.value
}

export async function getActivityByDate(date) {
  return mongo.db.collection('member_activity')
    .find({date})
    .toArray()
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
}
