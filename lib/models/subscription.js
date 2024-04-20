import {range, chain} from 'lodash-es'
import {isAfter, add} from 'date-fns'
import mongo from '../util/mongo.js'
import {computeSubcriptionEndDate} from '../calc.js'
import {customAlphabet} from 'nanoid'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

const SUBSCRIPTION_UNIT_COST_IN_EUR = 60 // As of 2017-02-01

export async function getMemberSubscriptions(memberId) {
  const user = await mongo.db.collection('users')
    .findOne({_id: memberId}, {projection: {'profile.abos': 1}})

  return chain(user.profile.abos)
    .map(abo => ({
      _id: abo.purchaseDate, // Until there is a unique id
      purchased: abo.purchaseDate,
      started: abo.aboStart,
      ended: computeSubcriptionEndDate(abo.aboStart),
      amount: isAfter(new Date(abo.purchaseDate), new Date('2017-02-01'))
        ? SUBSCRIPTION_UNIT_COST_IN_EUR
        : 0
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

  if (!purchase.legacy) {
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
  if (isAfter(new Date(date), new Date('2017-02-01'))) {
    return 60
  }

  return 0
}

