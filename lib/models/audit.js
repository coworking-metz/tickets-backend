import mongo from '../util/mongo.js'

export async function logAuditTrail(author, action, context) {
  if (!action) {
    throw new Error('Audit trail action is required')
  }

  await mongo.db.collection('audit').insertOne({
    author: {
      _id: author.id,
      wpUserId: author.wpUserId,
      name: author.name,
      email: author.email
    },
    action,
    context,
    occurred: new Date()
  })
}

export async function getAllAuditEvents() {
  return mongo.db.collection('audit')
    .find()
    .sort({occurred: -1})
    .toArray()
}

export async function getMemberAuditTrail(memberId) {
  return mongo.db.collection('audit')
    .find({$or: [{'context.memberId': memberId}, {'author._id': memberId}]})
    .sort({occurred: -1})
    .toArray()
}
