import mongo from '../util/mongo.js'

export async function addMembershipToMember(memberId, purchaseDate, membershipStart) {
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
