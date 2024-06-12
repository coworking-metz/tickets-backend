import mongo from '../util/mongo.js'

export async function logAuditTrail(authorUserId, action, context) {
  if (!action) {
    throw new Error('Audit trail action is required')
  }

  await mongo.db.collection('audit').insertOne({
    userId: authorUserId,
    action,
    context,
    occured: new Date()
  })
}

export async function getUserAuditTrail(authorUserId) {
  return mongo.db.collection('audit')
    .find({userId: authorUserId})
    .sort({occured: -1})
    .toArray()
}

export async function getMemberAuditTrail(memberId) {
  return mongo.db.collection('audit')
    .find({context: {memberId}})
    .sort({occured: -1})
    .toArray()
}
