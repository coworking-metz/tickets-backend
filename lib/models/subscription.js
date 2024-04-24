import {range, chain} from 'lodash-es'
import {isAfter, add} from 'date-fns'
import mongo from '../util/mongo.js'
import {computeSubcriptionEndDate} from '../calc.js'
import {customAlphabet} from 'nanoid'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export async function getMemberSubscriptions(memberId) {
  const subscriptions = await mongo.db.collection('subscriptions').find({memberId}).toArray()
  return chain(subscriptions)
    .map(subscription => ({
      _id: subscription._id,
      orderReference: subscription.orderReference,
      started: subscription.startDate,
      ended: computeSubcriptionEndDate(subscription.startDate),
      purchased: subscription.purchaseDate,
      amount: subscription.price
    }))
    .orderBy(['purchased'], ['desc'])
    .value()
}

export async function addSubscriptionsToMember(memberId, startDate, purchase, purchaseQuantity = 1) {
  const payload = {
    _id: null,
    memberId,
    startDate,
    ...purchase
  }
  const payloads = []
  while (purchaseQuantity--) {
    payload._id = nanoid(17)
    payloads.push({...payload})
  }

  if (!purchase.migratedFromUsersCollection) {
    await addSubscriptionsToMemberLegacy(memberId, purchase.purchaseDate, startDate, purchaseQuantity) // For data consistency
  }

  return Promise.all(payloads.map(async payload => {
    await mongo.db.collection('subscriptions').insertOne(payload)
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
  await mongo.db.collection('subscriptions').updateOne(
    {_id},
    {
      $set: set
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
