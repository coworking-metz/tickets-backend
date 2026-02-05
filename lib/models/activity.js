import createHttpError from 'http-errors'

import mongo from '../util/mongo.js'

import * as Member from './member.js'

/**
 * @deprecated prefer getMemberRawActivity or getMemberActivityCoverage
 */
export async function getMemberActivity(memberId) {
  const user = await Member.getUserById(memberId)

  if (!user) {
    throw createHttpError(404, 'Member not found')
  }

  const activity = await mongo.db.collection('member_activity').aggregate([
    {
      $match: {member: memberId}
    },
    {
      $sort: {date: 1}
    },
    {
      $lookup: {
        from: 'subscriptions',
        let: {activityDate: '$date', activityMemberId: '$member'},
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {$eq: ['$memberId', '$$activityMemberId']},
                  {$lte: ['$startDate', '$$activityDate']},
                  {$gte: ['$endDate', '$$activityDate']}
                ]
              }
            }
          },
          {$limit: 1}
        ],
        as: 'subscription'
      }
    },
    {
      $project: {
        date: 1,
        value: {$ifNull: ['$overrideValue', '$value']},
        type: {$cond: [{$gt: [{$size: '$subscription'}, 0]}, 'subscription', 'ticket']}
      }
    }
  ]).toArray()

  return activity
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
  const dateActivity = await mongo.db.collection('member_activity').aggregate([
    {
      $match: {date}
    },
    {
      $addFields: {
        value: {$ifNull: ['$overrideValue', '$value']}
      }
    },
    {
      $match: {
        value: {$gt: 0}
      }
    }
  ]).toArray()

  return dateActivity
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))
}
