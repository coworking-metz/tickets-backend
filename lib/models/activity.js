import createHttpError from 'http-errors'

import mongo from '../util/mongo.js'
import {isPresenceDuringAbo} from '../calc.js'

import * as Member from './member.js'

export async function getMemberActivity(memberId) {
  const user = await Member.getUserById(memberId)

  if (!user) {
    throw createHttpError(404, 'Member not found')
  }

  const {abos} = user.profile

  const activity = await mongo.db.collection('member_activity')
    .find({member: memberId})
    .sort({date: -1})
    .toArray()

  return activity.map(item => ({
    date: item.date,
    value: item.value,
    type: isPresenceDuringAbo(item.date, abos) ? 'subscription' : 'ticket'
  }))
}

export async function updateMemberActivity(memberId, date, value) {
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

  await mongo.db.collection('member_activity').updateOne(
    {member: memberId, date},
    {$set: {value}},
    {upsert: true}
  )
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
}
