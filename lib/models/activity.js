import createHttpError from 'http-errors'

import mongo from '../util/mongo.js'

import * as Member from './member.js'
import * as Subscription from './subscription.js'

export async function getMemberActivity(memberId) {
  const user = await Member.getUserById(memberId)

  if (!user) {
    throw createHttpError(404, 'Member not found')
  }

  const activity = await mongo.db.collection('member_activity')
    .find({member: memberId})
    .sort({date: -1})
    .toArray()

  const subscriptions = await Subscription.getMemberSubscriptions(memberId)

  return Promise.all(activity.map(async item => {
    const activeSubscription = subscriptions.some(s => s.started <= item.date && item.date <= s.ended)

    return {
      date: item.date,
      value: item.value,
      type: activeSubscription ? 'subscription' : 'ticket'
    }
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

export async function getActivityByDate(date) {
  return mongo.db.collection('member_activity')
    .find({date})
    .toArray()
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
}
