import {range, chain} from 'lodash-es'
import {isAfter, add} from 'date-fns'
import mongo from '../util/mongo.js'
import {computeEarliestSubscriptionStartingDateForDate, computeSubscriptionEndDate} from '../calc.js'
import {customAlphabet} from 'nanoid'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export function formatSubscription(subscriptionFromDatabase) {
  return {
    _id: subscriptionFromDatabase._id,
    orderReference: subscriptionFromDatabase.orderReference,
    started: subscriptionFromDatabase.startDate,
    ended: computeSubscriptionEndDate(subscriptionFromDatabase.startDate),
    purchased: subscriptionFromDatabase.purchaseDate,
    amount: subscriptionFromDatabase.price
  }
}

export async function getMemberSubscriptions(memberId) {
  const subscriptions = await mongo.db.collection('subscriptions').find({memberId}).toArray()
  return chain(subscriptions)
    .map(s => formatSubscription(s))
    .orderBy(['purchased', 'started'], ['desc', 'desc'])
    .value()
}

export async function addSubscriptionsToMember(memberId, startDate, purchase, purchaseQuantity = 1) {
  const allNewSubscriptions = []
  for (let i = 0; i < purchaseQuantity; i++) {
    allNewSubscriptions.push({
      ...purchase,
      _id: nanoid(17),
      startDate: add(new Date(startDate), {months: i}).toISOString().slice(0, 10),
      memberId
    })
  }

  if (!purchase.migratedFromUsersCollection) {
    await addSubscriptionsToMemberLegacy(memberId, purchase.purchaseDate, startDate, purchaseQuantity) // For data consistency
  }

  return Promise.all(allNewSubscriptions.map(async s => {
    await mongo.db.collection('subscriptions').insertOne(s)
    return s
  }))
}

export async function addSubscriptionsToMemberLegacy(memberId, purchaseDate, startDate, quantity) {
  await mongo.db.collection('users').updateOne(
    {_id: memberId},
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

export async function updateSubscription(_id, set) {
  const updatedSubscription = await mongo.db.collection('subscriptions').findOneAndUpdate(
    {_id},
    {$set: set},
    {returnDocument: 'after'}
  )

  return updatedSubscription.value
}

/**
 * Update profile.abos array in the users collection
 * @deprecated
 */
export async function updateAboStartDateInUserLegacy(memberId, previousStartDate, newStartDate) {
  await mongo.db.collection('users').updateOne(
    {
      _id: memberId,
      'profile.abos.aboStart': previousStartDate
    },
    {
      $set: {
        'profile.abos.$.aboStart': newStartDate
      }
    }
  )
}

/**
 * Calculate the unit price of a subscription based on its date.
 *
 * @param {Date} date - The date the subscription was purchased.
 * @returns {number} The unit price of the subscription. If the date is after February 1, 2017, the price is 60; otherwise it's 0.
 */
export function subscriptionUnitPriceByDate(date) {
  let price = 0

  if (isAfter(new Date(date), new Date('2024-04-31'))) {
    price = 80
  } else if (isAfter(new Date(date), new Date('2014-01-01'))) {
    price = 60
  }

  return price
}

export async function findActiveSubscriptionsByDate(date, memberId) {
  return mongo.db.collection('subscriptions')
    .find({
      startDate: {
        $gte: computeEarliestSubscriptionStartingDateForDate(date),
        $lte: new Date(date).toISOString().slice(0, 10)
      },
      ...(memberId && {memberId})
    })
    .toArray()
}

export async function removeSubscription(_id) {
  const removedSubscription = await mongo.db.collection('subscriptions').findOneAndDelete(
    {_id},
    {returnDocument: 'before'}
  )

  // DEPRECATED - we should avoid updating the users collection directly
  await mongo.db.collection('users').updateOne(
    {
      _id: removedSubscription.value.memberId,
      'profile.abos.aboStart': removedSubscription.value.startDate
    },
    {
      $pull: {
        'profile.abos': {
          aboStart: removedSubscription.value.startDate
        }
      }
    }
  )

  return removedSubscription.value
}
