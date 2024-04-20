import mongo from '../util/mongo.js'
import {customAlphabet} from 'nanoid'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export async function addMembershipToMember(memberId, membershipStart, purchase, purchaseQuantity = 1) {
  const payload = {
    _id: null,
    memberId,
    membershipStart, ...purchase
  }

  const payloads = []
  while (purchaseQuantity--) {
    payload._id = nanoid(17)
    payloads.push({...payload})
  }

  if (!purchase.legacy) {
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
