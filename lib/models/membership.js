import mongo from '../util/mongo.js'
import {customAlphabet} from 'nanoid'
import {isAfter} from 'date-fns'
import {chain} from 'lodash-es'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export async function getMemberMemberships(memberId) {
  const memberships = await mongo.db.collection('memberships').find({memberId}).toArray()
  return chain(memberships)
    .map(membership => ({
      _id: membership._id,
      orderReference: membership.orderReference,
      membershipStart: membership.membershipStart,
      purchased: membership.purchaseDate,
      amount: membership.price
    }))
    .orderBy(['purchased'], ['desc'])
    .value()
}

export async function addMembershipToMember(memberId, membershipStart, purchase, purchaseQuantity = 1) {
  const payload = {
    _id: null,
    memberId,
    membershipStart, ...purchase
  }

  const payloads = []
  for (let i = 0; i < purchaseQuantity; i++) {
    payload._id = nanoid(17)
    payloads.push({...payload})
  }

  if (!purchase.migratedFromUsersCollection) {
    await addMembershipToMemberLegacy(memberId, purchase.purchaseDate, membershipStart) // For data consistency
  }

  return Promise.all(payloads.map(async payload => {
    await mongo.db.collection('memberships').insertOne(payload)
  }))
}

export async function addMembershipToMemberLegacy(memberId, purchaseDate, membershipStart) {
  await mongo.db.collection('users').updateOne(
    {_id: memberId},
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

export async function updateMembership(_id, set) {
  await mongo.db.collection('memberships').updateOne(
    {_id},
    {
      $set: set
    }
  )
}

/**
 * Calculate the unit price of a membership based on its date.
 *
 * @param {Date} date - The date the membership was purchased.
 * @returns {number} The unit price of the membership. If the date is after January 1, 2014, the price is 10; otherwise it's 0.
 */
export function membershipUnitPriceByDate(date) {
  let price = 0
  if (isAfter(new Date(date), new Date('2014-01-01'))) {
    price = 10
  }

  return price
}
